-- Assignment gate for structure-coach-notes: SECURITY DEFINER avoids PostgREST 42501
-- when core tables lack SELECT grants for authenticated (common on hosted projects).

create or replace function public.coach_can_structure_notes(
  p_campaign_id uuid,
  p_athlete_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaign_coaches cc
    inner join public.campaign_members cm
      on cm.campaign_id = cc.campaign_id
     and cm.athlete_id = p_athlete_id
    where cc.campaign_id = p_campaign_id
      and cc.coach_profile_id = auth.uid()
  );
$$;

grant execute on function public.coach_can_structure_notes(uuid, uuid) to authenticated, service_role;

-- Idempotent: ensure table grants exist if the prior migration was skipped or partial.
grant select on public.campaign_members to authenticated, service_role;
grant select on public.campaign_coaches to authenticated, service_role;
