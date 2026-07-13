-- Bidirectional NPS: players rate coaches and coaches rate players within the
-- same admin-initiated survey window. Raw responses remain admin-only.
--
-- Assumes every existing NPS response was written by a roster athlete linked to a login
-- profile. Responses whose athlete never linked a profile cannot be attributed to a rater
-- and are deleted below. Pre-flight audit (run read-only against production first):
--
--   select count(*) from public.campaign_nps_responses r
--   left join public.athletes a on a.id = r.athlete_id
--   where a.profile_id is null;
--   -- non-zero means rows will be deleted; confirm that is acceptable before running

-- Surveys: direction-specific reporting thresholds. Coach pools are small
-- (often 2), so per-player aggregates need a lower minimum than per-coach ones.
alter table public.campaign_nps_surveys
  rename column min_response_count to min_player_rater_count;

alter table public.campaign_nps_surveys
  add column min_coach_rater_count int not null default 2 check (min_coach_rater_count >= 1);

-- Assignments: generalized to player and coach raters. Player assignments stay
-- keyed by athlete (players may not have logged in yet); coach assignments key
-- by profile.
alter table public.campaign_nps_assignments
  add column rater_kind text not null default 'player' check (rater_kind in ('player', 'coach')),
  add column coach_profile_id uuid references public.profiles (id) on delete cascade,
  alter column athlete_id drop not null;

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.campaign_nps_assignments'::regclass and contype = 'u';
  if cname is not null then
    execute format('alter table public.campaign_nps_assignments drop constraint %I', cname);
  end if;
end $$;

alter table public.campaign_nps_assignments
  add constraint nps_assignments_rater_check check (
    (rater_kind = 'player' and athlete_id is not null and coach_profile_id is null)
    or (rater_kind = 'coach' and coach_profile_id is not null and athlete_id is null)
  );

create unique index nps_assignments_player_idx
  on public.campaign_nps_assignments (survey_id, athlete_id)
  where athlete_id is not null;

create unique index nps_assignments_coach_idx
  on public.campaign_nps_assignments (survey_id, coach_profile_id)
  where coach_profile_id is not null;

-- Responses: generalized rater/subject shape. The rater is always an auth
-- profile; the subject is exactly one of athlete (coach-rates-player) or coach
-- profile (player-rates-coach).
alter table public.campaign_nps_responses
  add column rater_profile_id uuid references public.profiles (id) on delete cascade,
  add column subject_athlete_id uuid references public.athletes (id) on delete cascade,
  add column subject_coach_profile_id uuid references public.profiles (id) on delete cascade;

update public.campaign_nps_responses r
set rater_profile_id = a.profile_id,
    subject_coach_profile_id = r.target_coach_profile_id
from public.athletes a
where a.id = r.athlete_id;

-- Responses from roster athletes that never linked a login cannot be attributed
-- to a rater profile; remove them (none expected in practice).
delete from public.campaign_nps_responses where rater_profile_id is null;

-- Recreate response RLS before dropping the legacy columns. The old policies reference
-- athlete_id, so Postgres blocks the column drop until they are replaced with the new
-- rater_profile_id-based policies.
drop policy nps_responses_select on public.campaign_nps_responses;
create policy nps_responses_select on public.campaign_nps_responses
  for select to authenticated
  using (public.is_admin() or rater_profile_id = auth.uid());

drop policy nps_responses_insert on public.campaign_nps_responses;
create policy nps_responses_insert on public.campaign_nps_responses
  for insert to authenticated
  with check (
    rater_profile_id = auth.uid()
    and exists (
      select 1 from public.campaign_nps_assignments a
      where a.id = campaign_nps_responses.assignment_id
        and a.survey_id = campaign_nps_responses.survey_id
        and (
          a.coach_profile_id = auth.uid()
          or exists (
            select 1 from public.athletes ath
            where ath.id = a.athlete_id and ath.profile_id = auth.uid()
          )
        )
    )
  );

drop policy nps_responses_update on public.campaign_nps_responses;
create policy nps_responses_update on public.campaign_nps_responses
  for update to authenticated
  using (rater_profile_id = auth.uid())
  with check (rater_profile_id = auth.uid());

alter table public.campaign_nps_responses
  drop column athlete_id,
  drop column target_coach_profile_id;

alter table public.campaign_nps_responses
  alter column rater_profile_id set not null,
  add constraint nps_responses_subject_check check (
    (subject_athlete_id is null) <> (subject_coach_profile_id is null)
  );

create unique index nps_responses_coach_subject_idx
  on public.campaign_nps_responses (survey_id, rater_profile_id, subject_coach_profile_id)
  where subject_coach_profile_id is not null;

create unique index nps_responses_player_subject_idx
  on public.campaign_nps_responses (survey_id, rater_profile_id, subject_athlete_id)
  where subject_athlete_id is not null;

-- Survey/assignment RLS: assigned player and coach raters can see the survey and their
-- own assignment. (Response RLS is recreated above, before the legacy column drop.)
drop policy nps_surveys_select on public.campaign_nps_surveys;
create policy nps_surveys_select on public.campaign_nps_surveys
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.campaign_nps_assignments a
      join public.athletes athlete on athlete.id = a.athlete_id
      where a.survey_id = campaign_nps_surveys.id and athlete.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.campaign_nps_assignments a
      where a.survey_id = campaign_nps_surveys.id and a.coach_profile_id = auth.uid()
    )
  );

drop policy nps_assignments_select on public.campaign_nps_assignments;
create policy nps_assignments_select on public.campaign_nps_assignments
  for select to authenticated
  using (
    public.is_admin()
    or coach_profile_id = auth.uid()
    or exists (
      select 1 from public.athletes a
      where a.id = campaign_nps_assignments.athlete_id and a.profile_id = auth.uid()
    )
  );

-- Raters mark their own assignment completed once all targets are scored.
create policy nps_assignments_update_own on public.campaign_nps_assignments
  for update to authenticated
  using (
    coach_profile_id = auth.uid()
    or exists (
      select 1 from public.athletes a
      where a.id = campaign_nps_assignments.athlete_id and a.profile_id = auth.uid()
    )
  )
  with check (
    coach_profile_id = auth.uid()
    or exists (
      select 1 from public.athletes a
      where a.id = campaign_nps_assignments.athlete_id and a.profile_id = auth.uid()
    )
  );
