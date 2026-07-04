-- U24 campaign management pivot: live player/coach matrix, audit trail, and NPS.

create table public.player_matrix_submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  submitted_by uuid references public.profiles (id),
  skill_score int check (skill_score between 1 and 5),
  growth_score int check (growth_score between 1 and 5),
  readiness_score int check (readiness_score between 1 and 5),
  confidence_score int check (confidence_score between 1 and 5),
  strengths text,
  development_focus text,
  support_needed text,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, athlete_id)
);

create table public.coach_matrix_assessments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  coach_profile_id uuid not null references public.profiles (id) on delete cascade,
  skill_score int check (skill_score between 1 and 5),
  growth_score int check (growth_score between 1 and 5),
  readiness_score int check (readiness_score between 1 and 5),
  tactical_score int check (tactical_score between 1 and 5),
  strengths text,
  development_focus text,
  coach_notes text,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, athlete_id, coach_profile_id)
);

create table public.evaluation_audit_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id),
  actor_role text not null check (actor_role in ('player', 'admin', 'coach')),
  event_type text not null check (event_type in ('created', 'updated', 'submitted')),
  entity_type text not null check (
    entity_type in ('player_matrix_submission', 'coach_matrix_assessment')
  ),
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.campaign_nps_surveys (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  title text not null,
  survey_window text not null check (survey_window in ('mid_season', 'post_season')),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opens_at timestamptz,
  closes_at timestamptz,
  min_response_count int not null default 3 check (min_response_count >= 1),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_nps_assignments (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.campaign_nps_surveys (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (survey_id, athlete_id)
);

create table public.campaign_nps_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.campaign_nps_surveys (id) on delete cascade,
  assignment_id uuid not null references public.campaign_nps_assignments (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  target_coach_profile_id uuid not null references public.profiles (id) on delete cascade,
  score int not null check (score between 0 and 10),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (survey_id, athlete_id, target_coach_profile_id)
);

create index player_matrix_submissions_campaign_idx
  on public.player_matrix_submissions (campaign_id);
create index coach_matrix_assessments_campaign_idx
  on public.coach_matrix_assessments (campaign_id);
create index evaluation_audit_events_campaign_idx
  on public.evaluation_audit_events (campaign_id, created_at desc);
create index campaign_nps_surveys_campaign_idx
  on public.campaign_nps_surveys (campaign_id);
create index campaign_nps_assignments_survey_idx
  on public.campaign_nps_assignments (survey_id);
create index campaign_nps_responses_survey_idx
  on public.campaign_nps_responses (survey_id, target_coach_profile_id);

create trigger player_matrix_submissions_set_updated_at before update
  on public.player_matrix_submissions
  for each row execute function public.set_updated_at();

create trigger coach_matrix_assessments_set_updated_at before update
  on public.coach_matrix_assessments
  for each row execute function public.set_updated_at();

create trigger campaign_nps_surveys_set_updated_at before update
  on public.campaign_nps_surveys
  for each row execute function public.set_updated_at();

create trigger campaign_nps_responses_set_updated_at before update
  on public.campaign_nps_responses
  for each row execute function public.set_updated_at();

alter table public.player_matrix_submissions enable row level security;
alter table public.coach_matrix_assessments enable row level security;
alter table public.evaluation_audit_events enable row level security;
alter table public.campaign_nps_surveys enable row level security;
alter table public.campaign_nps_assignments enable row level security;
alter table public.campaign_nps_responses enable row level security;

grant select, insert, update on public.player_matrix_submissions to authenticated, service_role;
grant select, insert, update on public.coach_matrix_assessments to authenticated, service_role;
grant select, insert on public.evaluation_audit_events to authenticated, service_role;
grant select, insert, update on public.campaign_nps_surveys to authenticated, service_role;
grant select, insert, update on public.campaign_nps_assignments to authenticated, service_role;
grant select, insert, update on public.campaign_nps_responses to authenticated, service_role;

create policy player_matrix_select on public.player_matrix_submissions
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.athletes a
      where a.id = player_matrix_submissions.athlete_id and a.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.campaign_coaches cc
      where cc.campaign_id = player_matrix_submissions.campaign_id
        and cc.coach_profile_id = auth.uid()
    )
  );

create policy player_matrix_insert on public.player_matrix_submissions
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.athletes a
      where a.id = player_matrix_submissions.athlete_id and a.profile_id = auth.uid()
    )
  );

create policy player_matrix_update on public.player_matrix_submissions
  for update to authenticated
  using (
    exists (
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

create policy coach_matrix_select on public.coach_matrix_assessments
  for select to authenticated
  using (
    public.is_admin()
    or coach_profile_id = auth.uid()
    or exists (
      select 1 from public.athletes a
      where a.id = coach_matrix_assessments.athlete_id and a.profile_id = auth.uid()
    )
  );

create policy coach_matrix_insert on public.coach_matrix_assessments
  for insert to authenticated
  with check (
    coach_profile_id = auth.uid()
    and exists (
      select 1 from public.campaign_coaches cc
      where cc.campaign_id = coach_matrix_assessments.campaign_id
        and cc.coach_profile_id = auth.uid()
    )
  );

create policy coach_matrix_update on public.coach_matrix_assessments
  for update to authenticated
  using (coach_profile_id = auth.uid() or public.is_admin())
  with check (coach_profile_id = auth.uid() or public.is_admin());

create policy evaluation_audit_select on public.evaluation_audit_events
  for select to authenticated
  using (
    public.is_admin()
    or actor_profile_id = auth.uid()
    or exists (
      select 1 from public.campaign_coaches cc
      where cc.campaign_id = evaluation_audit_events.campaign_id
        and cc.coach_profile_id = auth.uid()
    )
  );

create policy evaluation_audit_insert on public.evaluation_audit_events
  for insert to authenticated
  with check (actor_profile_id = auth.uid() or public.is_admin());

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
  );

create policy nps_surveys_write on public.campaign_nps_surveys
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy nps_assignments_select on public.campaign_nps_assignments
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.athletes a
      where a.id = campaign_nps_assignments.athlete_id and a.profile_id = auth.uid()
    )
  );

create policy nps_assignments_write on public.campaign_nps_assignments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy nps_responses_select on public.campaign_nps_responses
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.athletes a
      where a.id = campaign_nps_responses.athlete_id and a.profile_id = auth.uid()
    )
  );

create policy nps_responses_insert on public.campaign_nps_responses
  for insert to authenticated
  with check (
    exists (
      select 1 from public.athletes a
      where a.id = campaign_nps_responses.athlete_id and a.profile_id = auth.uid()
    )
  );

create policy nps_responses_update on public.campaign_nps_responses
  for update to authenticated
  using (
    exists (
      select 1 from public.athletes a
      where a.id = campaign_nps_responses.athlete_id and a.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.athletes a
      where a.id = campaign_nps_responses.athlete_id and a.profile_id = auth.uid()
    )
  );
