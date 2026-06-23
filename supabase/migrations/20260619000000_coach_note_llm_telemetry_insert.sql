-- Let assigned coaches record LLM copilot telemetry via their JWT (Edge Function uses
-- the caller session for writes; service role is not required for happy-path telemetry).

create policy coach_note_generation_runs_insert_llm
  on public.coach_note_generation_runs
  for insert to authenticated
  with check (
    coach_profile_id = auth.uid()
    and source = 'llm'
    and exists (
      select 1
      from public.campaign_coaches cc
      where cc.campaign_id = coach_note_generation_runs.campaign_id
        and cc.coach_profile_id = auth.uid()
    )
  );
