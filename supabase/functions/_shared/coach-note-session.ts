export const COACH_NOTE_MAX_TURNS = 5;

export interface CoachNoteClarification {
  sourceQuote: string;
  answer: string;
}

const CLARIFICATION_HEADER =
  "--- Coach clarifications (ground only when supported by original notes) ---";

export function formatClarificationBlock(clarifications: CoachNoteClarification[]): string {
  if (clarifications.length === 0) {
    return "";
  }
  const lines = clarifications.map(
    (clarification) => `Regarding "${clarification.sourceQuote}": ${clarification.answer}`,
  );
  return `${CLARIFICATION_HEADER}\n${lines.join("\n")}`;
}

export function buildAccumulatedInput(
  roughNotes: string,
  clarifications: CoachNoteClarification[] = [],
  additionalNotes = "",
): string {
  const parts = [roughNotes.trim()];
  const clarificationBlock = formatClarificationBlock(clarifications);
  if (clarificationBlock) {
    parts.push(clarificationBlock);
  }
  if (additionalNotes.trim()) {
    parts.push(`--- Additional notes ---\n${additionalNotes.trim()}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

export type CoachNoteAction = "structure" | "clarify" | "add_notes" | "regenerate_section";

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
