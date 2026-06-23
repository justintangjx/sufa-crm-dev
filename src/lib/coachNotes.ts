import {
  buildAccumulatedInput,
  COACH_NOTE_MAX_TURNS,
  DECISION_PATTERNS,
  formatClarificationBlock,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  validateCoachNoteDraftErrors,
  type CoachNoteAction,
  type CoachNoteAmbiguity,
  type CoachNoteClarification,
  type CoachNoteConfidence,
  type EvidenceItem,
} from "../shared/coach-note-core.ts";

export {
  buildAccumulatedInput,
  COACH_NOTE_MAX_TURNS,
  formatClarificationBlock,
  SCHEMA_VERSION as COACH_NOTE_SCHEMA_VERSION,
  PROMPT_VERSION as COACH_NOTE_PROMPT_VERSION,
};
export type {
  CoachNoteAction,
  CoachNoteAmbiguity,
  CoachNoteClarification,
  CoachNoteConfidence,
  EvidenceItem,
};

export type CoachNoteField = "strength" | "development" | "overall";
export type CoachNoteFeedback = "useful" | "incorrect" | "missing_context";
export type CoachNoteSection = "strengths" | "development_areas" | "overall_observations";

export interface CoachNoteDraftV1 {
  schemaVersion: typeof SCHEMA_VERSION;
  strengths: EvidenceItem[];
  developmentAreas: EvidenceItem[];
  overallObservations: EvidenceItem[];
  ambiguities: CoachNoteAmbiguity[];
}

export interface CoachNoteGenerationRequest {
  campaignId: string;
  athleteId: string;
  roughNotes: string;
}

export interface CoachNoteActionRequest extends CoachNoteGenerationRequest {
  action: CoachNoteAction;
  sessionId?: string;
  clarifications?: CoachNoteClarification[];
  additionalNotes?: string;
  section?: CoachNoteSection;
}

export interface CoachNoteGenerationResult {
  runId: string;
  source: "llm" | "deterministic";
  promptVersion: string;
  model: string;
  latencyMs: number;
  estimatedCostUsd: number | null;
  repairCount: number;
  redactedNotes: string;
  draft: CoachNoteDraftV1;
  ambiguityCount: number;
  sessionId: string;
  turnIndex: number;
  accumulatedInput: string;
}

export interface CoachNoteFeedbackInput {
  runId: string;
  feedback: CoachNoteFeedback;
}

export interface CoachNoteEditMetricsInput {
  runId: string;
  fieldEditCount: number;
  normalizedEditDistance: number;
}

export interface CoachNoteValidationResult {
  valid: boolean;
  errors: string[];
}

const STRENGTH_KEYWORDS = [
  "strong",
  "great",
  "good",
  "excellent",
  "solid",
  "reliable",
  "fast",
  "accurate",
  "confident",
  "calm",
] as const;

const DEVELOPMENT_KEYWORDS = [
  "needs",
  "improve",
  "work on",
  "weak",
  "struggle",
  "inconsistent",
  "lacks",
  "should",
  "more",
  "not ready",
] as const;

export function countAmbiguities(draft: CoachNoteDraftV1): number {
  return draft.ambiguities.length;
}

export function suggestedAmbiguityOptions(sourceQuote: string): string[] {
  const lower = sourceQuote.toLowerCase();
  if (/\bselected\b|\bselect\b/.test(lower)) {
    return [
      "Observed skill only — not a roster decision",
      "Factual training note only",
      "Skip — I will set recommendation manually",
    ];
  }
  if (/\brecommend\b/.test(lower)) {
    return ["Observational note only", "Skip — I will set recommendation manually"];
  }
  return ["Clarify as observational fact", "Skip — I will edit the form manually"];
}

export function validateCoachNoteDraft(
  value: unknown,
  sourceNotes: string,
): CoachNoteValidationResult {
  const errors = validateCoachNoteDraftErrors(value, sourceNotes);
  return { valid: errors.length === 0, errors };
}

function splitNotes(notes: string): string[] {
  return notes
    .split(/[\n.!;]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function evidenceItem(sentence: string): EvidenceItem {
  return {
    draftText: sentence,
    evidenceQuotes: [sentence],
    confidence: "high",
  };
}

// Offline fallback only. The coach must explicitly choose it after remote generation
// fails; it is never presented as an LLM result.
export function createDeterministicCoachNoteDraft(notes: string): CoachNoteDraftV1 {
  const strengths: EvidenceItem[] = [];
  const developmentAreas: EvidenceItem[] = [];
  const overallObservations: EvidenceItem[] = [];
  const ambiguities: CoachNoteAmbiguity[] = [];

  for (const sentence of splitNotes(notes)) {
    const lower = sentence.toLowerCase();
    if (DECISION_PATTERNS.some((pattern) => pattern.test(sentence))) {
      ambiguities.push({
        sourceQuote: sentence,
        question:
          "Review this decision-oriented note directly; the assistant does not make decisions.",
      });
    } else if (includesAny(lower, DEVELOPMENT_KEYWORDS) || /\bnot\s+\w+/.test(lower)) {
      developmentAreas.push(evidenceItem(sentence));
    } else if (includesAny(lower, STRENGTH_KEYWORDS)) {
      strengths.push(evidenceItem(sentence));
    } else {
      overallObservations.push(evidenceItem(sentence));
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    strengths,
    developmentAreas,
    overallObservations,
    ambiguities,
  };
}

function joinDraftText(items: readonly EvidenceItem[]): string {
  return items
    .map((item) => item.draftText.trim())
    .filter(Boolean)
    .join("\n");
}

export function coachNoteDraftToFormText(draft: CoachNoteDraftV1): {
  strengths: string;
  developmentAreas: string;
  overallNotes: string;
} {
  return {
    strengths: joinDraftText(draft.strengths),
    developmentAreas: joinDraftText(draft.developmentAreas),
    overallNotes: joinDraftText(draft.overallObservations),
  };
}

function editDistance(left: readonly string[], right: readonly string[]): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

export function calculateCoachNoteEditMetrics(
  generated: ReturnType<typeof coachNoteDraftToFormText>,
  final: ReturnType<typeof coachNoteDraftToFormText>,
): Omit<CoachNoteEditMetricsInput, "runId"> {
  const fields = ["strengths", "developmentAreas", "overallNotes"] as const;
  const fieldEditCount = fields.filter((field) => generated[field] !== final[field]).length;
  const generatedText = fields.map((field) => generated[field]).join("\n");
  const finalText = fields.map((field) => final[field]).join("\n");
  const generatedTokens = generatedText.split(/\s+/).filter(Boolean);
  const finalTokens = finalText.split(/\s+/).filter(Boolean);
  const denominator = Math.max(generatedTokens.length, finalTokens.length, 1);
  return {
    fieldEditCount,
    normalizedEditDistance: editDistance(generatedTokens, finalTokens) / denominator,
  };
}
