export {
  SCHEMA_VERSION,
  PROMPT_VERSION,
  COACH_NOTE_MAX_TURNS,
  buildAccumulatedInput,
  coachNoteJsonSchema,
  normalizeCoachNoteDraft,
  validateCoachNoteDraftErrors,
  type CoachNoteAction,
  type CoachNoteAmbiguity,
  type CoachNoteClarification,
  type CoachNoteDraft,
  type EvidenceItem,
} from "./coach-note-core.ts";

import { validateCoachNoteDraftErrors } from "./coach-note-core.ts";

export function validateDraft(value: unknown, source: string): string[] {
  return validateCoachNoteDraftErrors(value, source);
}
