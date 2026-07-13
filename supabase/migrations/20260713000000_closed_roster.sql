-- Closed roster: admin-created players with email/gender/positions, link-by-email login.
-- Players can only sign in when an admin has added their email to the roster.
--
-- Assumed invariants: one athlete per profile (enforced below after de-dup) and one
-- profile per email. Pre-flight audit (run read-only against production first):
--
--   select profile_id, count(*) from public.athletes
--   where profile_id is not null group by profile_id having count(*) > 1;
--   -- rows here are handled by the de-dup step, unless both duplicates hold child data
--
--   select lower(email), count(*) from public.profiles
--   group by lower(email) having count(*) > 1;
--   -- rows here need manual cleanup before running this migration

alter table public.athletes
  add column email text,
  add column gender text check (gender in ('female', 'male', 'other')),
  add column positions text[] not null default '{}';

-- Collapse duplicate athlete rows left by the old auto-shell signup trigger.
-- Keep one athlete per profile; delete only shells with no child data.
with referenced as (
  select athlete_id from public.campaign_members
  union select athlete_id from public.coach_evaluations
  union select athlete_id from public.change_requests
  union select athlete_id from public.player_growth_reviews
  union select athlete_id from public.player_growth_replies
  union select athlete_id from public.player_matrix_submissions
  union select athlete_id from public.coach_matrix_assessments
  union select athlete_id from public.evaluation_audit_events
  union select athlete_id from public.campaign_nps_assignments
  union select athlete_id from public.campaign_nps_responses
  union select athlete_id from public.coach_note_sessions
  union select athlete_id from public.coach_note_generation_runs
),
ranked as (
  select
    a.id,
    (a.id in (select athlete_id from referenced)) as has_refs,
    row_number() over (
      partition by a.profile_id
      order by (a.id in (select athlete_id from referenced)) desc, a.created_at asc, a.id asc
    ) as rn
  from public.athletes a
  where a.profile_id is not null
)
delete from public.athletes
where id in (select id from ranked where rn > 1 and has_refs = false);

create unique index athletes_profile_id_unique_idx
  on public.athletes (profile_id)
  where profile_id is not null;

create unique index athletes_email_unique_idx
  on public.athletes (lower(email))
  where email is not null;

-- Backfill emails for athletes already linked to a login profile.
update public.athletes a
set email = p.email
from public.profiles p
where p.id = a.profile_id and a.email is null;

-- Pre-auth gate: called from the SPA before requesting a magic link so unknown
-- emails are rejected without sending an OTP. Returns a boolean only (no roster
-- details leak). SECURITY DEFINER so anon can check without table access.
create or replace function public.can_request_player_magic_link(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where lower(email) = lower(trim(p_email))
  ) or exists (
    select 1 from public.athletes where lower(email) = lower(trim(p_email))
  );
$$;

grant execute on function public.can_request_player_magic_link(text) to anon, authenticated;

-- Closed-roster provisioning: players must match a roster athlete by email.
-- Admin/coach signups (role in user metadata) behave as before. The magic-link
-- request is already gated client-side via can_request_player_magic_link; this
-- trigger is the backstop that links athletes.profile_id on first login.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_role text;
  roster_athlete_id uuid;
begin
  resolved_role := new.raw_user_meta_data ->> 'role';

  if resolved_role in ('admin', 'coach') then
    insert into public.profiles (id, email, role)
    values (new.id, new.email, resolved_role)
    on conflict (id) do nothing;
    return new;
  end if;

  select id into roster_athlete_id
  from public.athletes
  where lower(email) = lower(new.email)
  limit 1;

  if roster_athlete_id is null then
    raise exception 'No roster player found for email %', new.email;
  end if;

  if exists (
    select 1 from public.athletes
    where id = roster_athlete_id
      and profile_id is not null
      and profile_id <> new.id
  ) then
    raise exception 'Roster player for email % is already linked to another account', new.email;
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'player')
  on conflict (id) do nothing;

  update public.athletes
  set profile_id = new.id
  where id = roster_athlete_id and profile_id is null;

  -- First successful login moves invited memberships to registered.
  update public.campaign_members
  set status = 'registered'
  where athlete_id = roster_athlete_id and status = 'invited';

  return new;
end;
$$;

-- Coach-safe roster context: coaches now also see gender, positions, and DOB.
-- Passport, NRIC, emergency contact, and consent fields remain excluded.
-- Drop + recreate: create-or-replace cannot insert columns mid-view.
drop view if exists public.coach_athlete_view;
create view public.coach_athlete_view
with (security_invoker = off) as
select distinct
  a.id,
  a.legal_name,
  a.preferred_name,
  a.phone,
  a.gender,
  a.positions,
  a.date_of_birth,
  a.profile_status,
  a.created_at,
  a.updated_at,
  cm.campaign_id
from public.athletes a
join public.campaign_members cm on cm.athlete_id = a.id
join public.campaign_coaches cc on cc.campaign_id = cm.campaign_id
where cc.coach_profile_id = auth.uid();

grant select on public.coach_athlete_view to authenticated;
