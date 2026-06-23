-- Allow coaches to record deterministic copilot telemetry before the LLM Edge Function ships.

create policy coach_note_generation_runs_insert_deterministic
  on public.coach_note_generation_runs
  for insert to authenticated
  with check (
    coach_profile_id = auth.uid()
    and source = 'deterministic'
  );

create policy coach_note_turns_insert
  on public.coach_note_turns
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.coach_note_sessions s
      where s.id = session_id
        and s.coach_profile_id = auth.uid()
    )
  );

grant insert on public.coach_note_generation_runs to authenticated;
grant insert on public.coach_note_turns to authenticated;
