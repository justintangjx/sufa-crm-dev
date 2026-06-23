import {
  buildAccumulatedInput,
  COACH_NOTE_MAX_TURNS,
  type CoachNoteAction,
  type CoachNoteClarification,
} from "./coach-note-core.ts";

export interface CoachNoteRequestPayload {
  campaignId?: string;
  athleteId?: string;
  roughNotes?: string;
  action?: CoachNoteAction;
  sessionId?: string;
  clarifications?: CoachNoteClarification[];
  additionalNotes?: string;
  section?: string;
}

export { buildAccumulatedInput, COACH_NOTE_MAX_TURNS };
