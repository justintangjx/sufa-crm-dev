export const COACH_NOTE_SCHEMA_VERSION = 1 as const;
export const COACH_NOTE_PROMPT_VERSION = "coach-notes-v1";

export type CoachNoteConfidence = "high" | "medium" | "low";
export type CoachNoteField = "strength" | "development" | "overall";
export type CoachNoteFeedback = "useful" | "incorrect" | "missing_context";

export interface EvidenceItem {
  draftText: string;
  evidenceQuotes: string[];
  confidence: CoachNoteConfidence;
}

export interface CoachNoteAmbiguity {
  sourceQuote: string;
  question: string;
}

export interface CoachNoteDraftV1 {
  schemaVersion: typeof COACH_NOTE_SCHEMA_VERSION;
  strengths: EvidenceItem[];
  developmentAreas: EvidenceItem[];
  overallObservations: EvidenceItem[];
  ambiguities: CoachNoteAmbiguity[];
}

export type CoachNoteAction = "structure" | "clarify" | "add_notes" | "regenerate_section";
export type CoachNoteSection = "strengths" | "development_areas" | "overall_observations";

export const COACH_NOTE_MAX_TURNS = 5;

export interface CoachNoteClarification {
  sourceQuote: string;
  answer: string;
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
  source: "llm";
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

const CLARIFICATION_HEADER =
  "--- Coach clarifications (ground only when supported by original notes) ---";

export function formatClarificationBlock(
  clarifications: readonly CoachNoteClarification[],
): string {
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
  clarifications: readonly CoachNoteClarification[] = [],
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

const DECISION_PATTERNS = [
  /\bnot[_ -]?selected\b/i,
  /\bselected\b/i,
  /\bselect\b/i,
  /\breserve\b/i,
  /\brecommend(?:ation|ed)?\b/i,
  /\brating\b/i,
  /\b[1-5]\s*\/\s*5\b/i,
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConfidence(value: unknown): value is CoachNoteConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function validateEvidenceItems(
  value: unknown,
  field: string,
  sourceNotes: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return;
  }

  value.forEach((item, index) => {
    const path = `${field}[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path} must be an object`);
      return;
    }
    const draftText = item.draftText;
    if (typeof draftText !== "string" || draftText.trim().length === 0) {
      errors.push(`${path}.draftText must be non-empty`);
    } else if (DECISION_PATTERNS.some((pattern) => pattern.test(draftText))) {
      errors.push(`${path}.draftText contains a rating or selection decision`);
    }
    if (!Array.isArray(item.evidenceQuotes) || item.evidenceQuotes.length === 0) {
      errors.push(`${path}.evidenceQuotes must contain at least one quote`);
    } else {
      item.evidenceQuotes.forEach((quote, quoteIndex) => {
        if (typeof quote !== "string" || quote.length === 0) {
          errors.push(`${path}.evidenceQuotes[${quoteIndex}] must be non-empty`);
        } else if (!sourceNotes.includes(quote)) {
          errors.push(`${path}.evidenceQuotes[${quoteIndex}] is not grounded in the notes`);
        }
      });
    }
    if (!isConfidence(item.confidence)) {
      errors.push(`${path}.confidence is invalid`);
    }
  });
}

export function validateCoachNoteDraft(
  value: unknown,
  sourceNotes: string,
): CoachNoteValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ["draft must be an object"] };
  }

  const allowedKeys = new Set([
    "schemaVersion",
    "strengths",
    "developmentAreas",
    "overallObservations",
    "ambiguities",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(`unexpected field: ${key}`);
    }
  }

  if (value.schemaVersion !== COACH_NOTE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${COACH_NOTE_SCHEMA_VERSION}`);
  }
  validateEvidenceItems(value.strengths, "strengths", sourceNotes, errors);
  validateEvidenceItems(value.developmentAreas, "developmentAreas", sourceNotes, errors);
  validateEvidenceItems(value.overallObservations, "overallObservations", sourceNotes, errors);

  if (!Array.isArray(value.ambiguities)) {
    errors.push("ambiguities must be an array");
  } else {
    value.ambiguities.forEach((ambiguity, index) => {
      const path = `ambiguities[${index}]`;
      if (!isRecord(ambiguity)) {
        errors.push(`${path} must be an object`);
        return;
      }
      if (
        typeof ambiguity.sourceQuote !== "string" ||
        !sourceNotes.includes(ambiguity.sourceQuote)
      ) {
        errors.push(`${path}.sourceQuote is not grounded in the notes`);
      }
      if (typeof ambiguity.question !== "string" || ambiguity.question.trim().length === 0) {
        errors.push(`${path}.question must be non-empty`);
      }
    });
  }

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
    schemaVersion: COACH_NOTE_SCHEMA_VERSION,
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
