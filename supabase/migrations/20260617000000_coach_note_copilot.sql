-- Evaluation copilot: session turns, ambiguity telemetry, and run linkage.

alter table public.coach_note_generation_runs
  add column if not exists ambiguity_count integer
    check (ambiguity_count is null or ambiguity_count >= 0),
  add column if not exists session_id uuid,
  add column if not exists turn_index integer
    check (turn_index is null or turn_index >= 0);

create table public.coach_note_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  coach_profile_id uuid not null references public.profiles (id) on delete cascade,
  accumulated_input text not null,
  turn_count integer not null default 0 check (turn_count >= 0),
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_note_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coach_note_sessions (id) on delete cascade,
  turn_index integer not null check (turn_index >= 0),
  action text not null check (
    action in ('structure', 'clarify', 'add_notes', 'regenerate_section')
  ),
  payload jsonb not null default '{}'::jsonb,
  draft_snapshot jsonb,
  run_id uuid references public.coach_note_generation_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, turn_index)
);

create index coach_note_sessions_coach_idx
  on public.coach_note_sessions (coach_profile_id, created_at desc);
create index coach_note_turns_session_idx
  on public.coach_note_turns (session_id, turn_index);

alter table public.coach_note_sessions enable row level security;
alter table public.coach_note_turns enable row level security;

create policy coach_note_sessions_select
  on public.coach_note_sessions
  for select to authenticated
  using (coach_profile_id = auth.uid() or public.is_admin());

create policy coach_note_sessions_insert
  on public.coach_note_sessions
  for insert to authenticated
  with check (coach_profile_id = auth.uid());

create policy coach_note_sessions_update
  on public.coach_note_sessions
  for update to authenticated
  using (coach_profile_id = auth.uid())
  with check (coach_profile_id = auth.uid());

create policy coach_note_turns_select
  on public.coach_note_turns
  for select to authenticated
  using (
    exists (
      select 1
      from public.coach_note_sessions s
      where s.id = session_id
        and (s.coach_profile_id = auth.uid() or public.is_admin())
    )
  );

revoke insert, update, delete on public.coach_note_turns from authenticated;
grant select on public.coach_note_turns to authenticated;
