-- Auth helpers, new-user provisioning, and the coach-safe athlete view.

-- Returns the app role for the current auth user. SECURITY DEFINER so RLS policies
-- can call it without recursing into profiles' own policies.
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'admin', false);
$$;

-- Auto-create a profile (and athlete shell for players) on signup so magic-link
-- logins always resolve to a profile row. Admins can change role afterwards.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_role text;
begin
  resolved_role := coalesce(new.raw_user_meta_data ->> 'role', 'player');
  if resolved_role not in ('player', 'admin', 'coach') then
    resolved_role := 'player';
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, resolved_role)
  on conflict (id) do nothing;

  if resolved_role = 'player' then
    insert into public.athletes (profile_id)
    values (new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Coach-safe athlete view: exposes only non-sensitive fields and only for athletes
-- in campaigns the current coach is assigned to. Runs as the view owner so it can
-- read athletes regardless of the (restrictive) athletes RLS, while the WHERE clause
-- scopes rows to the coach. Passport/admin-sensitive fields are intentionally omitted.
create or replace view public.coach_athlete_view
with (security_invoker = off) as
select distinct
  a.id,
  a.legal_name,
  a.preferred_name,
  a.phone,
  a.profile_status,
  a.created_at,
  a.updated_at,
  cm.campaign_id
from public.athletes a
join public.campaign_members cm on cm.athlete_id = a.id
join public.campaign_coaches cc on cc.campaign_id = cm.campaign_id
where cc.coach_profile_id = auth.uid();

grant select on public.coach_athlete_view to authenticated;
