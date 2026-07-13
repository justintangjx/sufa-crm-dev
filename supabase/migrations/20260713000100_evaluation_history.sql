-- Evaluation history: submissions become an append-only evidence log.
-- At most one open draft per tuple; submitted rows are immutable.

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.player_matrix_submissions'::regclass and contype = 'u';
  if cname is not null then
    execute format('alter table public.player_matrix_submissions drop constraint %I', cname);
  end if;

  select conname into cname
  from pg_constraint
  where conrelid = 'public.coach_matrix_assessments'::regclass and contype = 'u';
  if cname is not null then
    execute format('alter table public.coach_matrix_assessments drop constraint %I', cname);
  end if;
end $$;

create unique index player_matrix_one_draft_idx
  on public.player_matrix_submissions (campaign_id, athlete_id)
  where status = 'draft';

create unique index coach_matrix_one_draft_idx
  on public.coach_matrix_assessments (campaign_id, athlete_id, coach_profile_id)
  where status = 'draft';

create index player_matrix_submissions_timeline_idx
  on public.player_matrix_submissions (campaign_id, athlete_id, submitted_at desc);

create index coach_matrix_assessments_timeline_idx
  on public.coach_matrix_assessments (campaign_id, athlete_id, submitted_at desc);

-- Drafts are private to their owner: coaches only see submitted self-evaluations
-- and players only see submitted coach assessments.
drop policy player_matrix_select on public.player_matrix_submissions;
create policy player_matrix_select on public.player_matrix_submissions
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.athletes a
      where a.id = player_matrix_submissions.athlete_id and a.profile_id = auth.uid()
    )
    or (
      status = 'submitted'
      and exists (
        select 1 from public.campaign_coaches cc
        where cc.campaign_id = player_matrix_submissions.campaign_id
          and cc.coach_profile_id = auth.uid()
      )
    )
  );

drop policy coach_matrix_select on public.coach_matrix_assessments;
create policy coach_matrix_select on public.coach_matrix_assessments
  for select to authenticated
  using (
    public.is_admin()
    or coach_profile_id = auth.uid()
    or (
      status = 'submitted'
      and exists (
        select 1 from public.athletes a
        where a.id = coach_matrix_assessments.athlete_id and a.profile_id = auth.uid()
      )
    )
  );

-- Drafts are editable by their owner; submitted rows are frozen for everyone.
drop policy player_matrix_update on public.player_matrix_submissions;
create policy player_matrix_update on public.player_matrix_submissions
  for update to authenticated
  using (
    status = 'draft'
    and exists (
      select 1 from public.athletes a
      where a.id = player_matrix_submissions.athlete_id and a.profile_id = auth.uid()
    )
  )
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.athletes a
      where a.id = player_matrix_submissions.athlete_id and a.profile_id = auth.uid()
    )
  );

drop policy coach_matrix_update on public.coach_matrix_assessments;
create policy coach_matrix_update on public.coach_matrix_assessments
  for update to authenticated
  using (status = 'draft' and coach_profile_id = auth.uid())
  with check (coach_profile_id = auth.uid());
