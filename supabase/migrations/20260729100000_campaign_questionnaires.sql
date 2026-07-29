-- End-of-campaign questionnaire (Likert / NPS / text). Stakeholder-facing "NPS";
-- distinct from peer-rating campaign_nps_* tables.

-- Assumes campaigns and profiles already exist. New empty tables only.
-- Pre-flight (read-only): none required for greenfield apply.

create table public.campaign_survey_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  audience text not null check (audience in ('player', 'coach')),
  survey_window text not null default 'post_season'
    check (survey_window in ('mid_season', 'post_season')),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  version int not null default 1 check (version >= 1),
  source_kind text check (source_kind in ('csv', 'manual')),
  created_by uuid references public.profiles (id),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_survey_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.campaign_survey_templates (id) on delete cascade,
  title text not null,
  sort_order int not null check (sort_order >= 1),
  created_at timestamptz not null default now(),
  unique (template_id, sort_order)
);

create table public.campaign_survey_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.campaign_survey_sections (id) on delete cascade,
  sort_order int not null check (sort_order >= 1),
  prompt text not null,
  answer_type text not null check (answer_type in ('likert', 'nps', 'text')),
  scale_min int,
  scale_max int,
  scale_low_label text,
  scale_high_label text,
  subject_kind text check (
    subject_kind in ('coaches', 'captains', 'spirit_captain', 'team', 'program')
  ),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (section_id, sort_order)
);

create table public.campaign_survey_instances (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  template_id uuid not null references public.campaign_survey_templates (id),
  audience text not null check (audience in ('player', 'coach')),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opens_at timestamptz,
  closes_at timestamptz,
  min_response_count int not null default 3 check (min_response_count >= 1),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, audience, template_id)
);

create table public.campaign_survey_assignments (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.campaign_survey_instances (id) on delete cascade,
  rater_profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, rater_profile_id)
);

create table public.campaign_survey_answers (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.campaign_survey_assignments (id) on delete cascade,
  question_id uuid not null references public.campaign_survey_questions (id) on delete cascade,
  numeric_value int,
  text_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, question_id)
);

create index campaign_survey_templates_campaign_idx
  on public.campaign_survey_templates (campaign_id, audience, status);
create index campaign_survey_instances_campaign_idx
  on public.campaign_survey_instances (campaign_id, audience, status);
create index campaign_survey_assignments_instance_idx
  on public.campaign_survey_assignments (instance_id, status);
create index campaign_survey_answers_assignment_idx
  on public.campaign_survey_answers (assignment_id);

create trigger campaign_survey_templates_set_updated_at before update
  on public.campaign_survey_templates
  for each row execute function public.set_updated_at();

create trigger campaign_survey_instances_set_updated_at before update
  on public.campaign_survey_instances
  for each row execute function public.set_updated_at();

create trigger campaign_survey_assignments_set_updated_at before update
  on public.campaign_survey_assignments
  for each row execute function public.set_updated_at();

create trigger campaign_survey_answers_set_updated_at before update
  on public.campaign_survey_answers
  for each row execute function public.set_updated_at();

alter table public.campaign_survey_templates enable row level security;
alter table public.campaign_survey_sections enable row level security;
alter table public.campaign_survey_questions enable row level security;
alter table public.campaign_survey_instances enable row level security;
alter table public.campaign_survey_assignments enable row level security;
alter table public.campaign_survey_answers enable row level security;

grant select, insert, update on public.campaign_survey_templates to authenticated, service_role;
grant select, insert, update on public.campaign_survey_sections to authenticated, service_role;
grant select, insert, update on public.campaign_survey_questions to authenticated, service_role;
grant select, insert, update on public.campaign_survey_instances to authenticated, service_role;
grant select, insert, update on public.campaign_survey_assignments to authenticated, service_role;
grant select, insert, update, delete on public.campaign_survey_answers to authenticated, service_role;

-- Templates: admin write; raters read published templates for open instances they belong to.
create policy survey_templates_select on public.campaign_survey_templates
  for select to authenticated
  using (
    public.is_admin()
    or (
      status = 'published'
      and exists (
        select 1 from public.campaign_survey_instances i
        join public.campaign_survey_assignments a on a.instance_id = i.id
        where i.template_id = campaign_survey_templates.id
          and i.status = 'open'
          and a.rater_profile_id = auth.uid()
      )
    )
  );

create policy survey_templates_write on public.campaign_survey_templates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy survey_sections_select on public.campaign_survey_sections
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.campaign_survey_templates t
      join public.campaign_survey_instances i on i.template_id = t.id
      join public.campaign_survey_assignments a on a.instance_id = i.id
      where t.id = campaign_survey_sections.template_id
        and t.status = 'published'
        and i.status = 'open'
        and a.rater_profile_id = auth.uid()
    )
  );

create policy survey_sections_write on public.campaign_survey_sections
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy survey_questions_select on public.campaign_survey_questions
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.campaign_survey_sections s
      join public.campaign_survey_templates t on t.id = s.template_id
      join public.campaign_survey_instances i on i.template_id = t.id
      join public.campaign_survey_assignments a on a.instance_id = i.id
      where s.id = campaign_survey_questions.section_id
        and t.status = 'published'
        and i.status = 'open'
        and a.rater_profile_id = auth.uid()
    )
  );

create policy survey_questions_write on public.campaign_survey_questions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy survey_instances_select on public.campaign_survey_instances
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.campaign_survey_assignments a
      where a.instance_id = campaign_survey_instances.id
        and a.rater_profile_id = auth.uid()
    )
  );

create policy survey_instances_write on public.campaign_survey_instances
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy survey_assignments_select on public.campaign_survey_assignments
  for select to authenticated
  using (public.is_admin() or rater_profile_id = auth.uid());

create policy survey_assignments_update_own on public.campaign_survey_assignments
  for update to authenticated
  using (rater_profile_id = auth.uid() and status <> 'submitted')
  with check (rater_profile_id = auth.uid());

create policy survey_assignments_write on public.campaign_survey_assignments
  for insert to authenticated
  with check (public.is_admin());

create policy survey_answers_select on public.campaign_survey_answers
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.campaign_survey_assignments a
      where a.id = campaign_survey_answers.assignment_id
        and a.rater_profile_id = auth.uid()
    )
  );

create policy survey_answers_insert on public.campaign_survey_answers
  for insert to authenticated
  with check (
    exists (
      select 1 from public.campaign_survey_assignments a
      where a.id = campaign_survey_answers.assignment_id
        and a.rater_profile_id = auth.uid()
        and a.status <> 'submitted'
    )
  );

create policy survey_answers_update on public.campaign_survey_answers
  for update to authenticated
  using (
    exists (
      select 1 from public.campaign_survey_assignments a
      where a.id = campaign_survey_answers.assignment_id
        and a.rater_profile_id = auth.uid()
        and a.status <> 'submitted'
    )
  )
  with check (
    exists (
      select 1 from public.campaign_survey_assignments a
      where a.id = campaign_survey_answers.assignment_id
        and a.rater_profile_id = auth.uid()
        and a.status <> 'submitted'
    )
  );
