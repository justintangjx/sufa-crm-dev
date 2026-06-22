-- Auditable, redacted telemetry for coach note structuring.

create table public.coach_note_generation_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  coach_profile_id uuid not null references public.profiles (id) on delete cascade,
  schema_version integer not null,
  prompt_version text not null,
  provider text not null,
  model text not null,
  source text not null check (source in ('llm', 'deterministic')),
  status text not null check (status in ('succeeded', 'failed')),
  redacted_input text not null,
  redacted_output jsonb,
  validation_errors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(validation_errors) = 'array'),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd numeric(10, 6)
    check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  repair_count integer not null default 0 check (repair_count between 0 and 1),
  error_code text,
  feedback text check (feedback in ('useful', 'incorrect', 'missing_context')),
  feedback_at timestamptz,
  field_edit_count integer check (field_edit_count is null or field_edit_count between 0 and 3),
  normalized_edit_distance numeric(6, 5)
    check (
      normalized_edit_distance is null
      or normalized_edit_distance between 0 and 1
    ),
  created_at timestamptz not null default now()
);

create index coach_note_generation_runs_coach_idx
  on public.coach_note_generation_runs (coach_profile_id, created_at desc);
create index coach_note_generation_runs_athlete_idx
  on public.coach_note_generation_runs (athlete_id, created_at desc);

alter table public.coach_note_generation_runs enable row level security;

create policy coach_note_generation_runs_select
  on public.coach_note_generation_runs
  for select to authenticated
  using (coach_profile_id = auth.uid() or public.is_admin());

create policy coach_note_generation_runs_feedback
  on public.coach_note_generation_runs
  for update to authenticated
  using (coach_profile_id = auth.uid())
  with check (coach_profile_id = auth.uid());

revoke insert, delete on public.coach_note_generation_runs from authenticated;
revoke update on public.coach_note_generation_runs from authenticated;
grant select on public.coach_note_generation_runs to authenticated;
grant update (
  feedback,
  feedback_at,
  field_edit_count,
  normalized_edit_distance
) on public.coach_note_generation_runs to authenticated;
