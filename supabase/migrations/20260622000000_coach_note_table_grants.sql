-- Coach-note copilot tables were created with RLS policies but without matching
-- PostgREST table grants. Inserts/updates fail with SQLSTATE 42501 (session_write_failed).

grant select, insert, update on public.coach_note_sessions to authenticated, service_role;

grant select, insert on public.coach_note_turns to authenticated, service_role;

grant select, insert on public.coach_note_generation_runs to authenticated, service_role;

grant update (
  feedback,
  feedback_at,
  field_edit_count,
  normalized_edit_distance
) on public.coach_note_generation_runs to authenticated;
