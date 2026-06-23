/**
 * Canonical coach-note contract shared by the client and Supabase Edge Functions.
 * Edit this file only, then run `pnpm sync:coach-note-core`.
 */

export const SCHEMA_VERSION = 1 as const;
export const PROMPT_VERSION = "coach-notes-v1";
export const COACH_NOTE_MAX_TURNS = 5;

export type CoachNoteConfidence = "high" | "medium" | "low";

export interface EvidenceItem {
  draftText: string;
  evidenceQuotes: string[];
  confidence: CoachNoteConfidence;
}

export interface CoachNoteAmbiguity {
  sourceQuote: string;
  question: string;
}

export interface CoachNoteDraft {
  schemaVersion: typeof SCHEMA_VERSION;
  strengths: EvidenceItem[];
  developmentAreas: EvidenceItem[];
  overallObservations: EvidenceItem[];
  ambiguities: CoachNoteAmbiguity[];
}

export interface CoachNoteClarification {
  sourceQuote: string;
  answer: string;
}

export type CoachNoteAction = "structure" | "clarify" | "add_notes" | "regenerate_section";

const CLARIFICATION_HEADER =
  "--- Coach clarifications (ground only when supported by original notes) ---";

export const DECISION_PATTERNS = [
  /\bnot[_ -]?selected\b/i,
  /\bselected\b/i,
  /\bselect\b/i,
  /\breserve\b/i,
  /\brecommend(?:ation|ed)?\b/i,
  /\brating\b/i,
  /\b[1-5]\s*\/\s*5\b/i,
] as const;

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

export function validateCoachNoteDraftErrors(value: unknown, sourceNotes: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ["draft must be an object"];
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

  if (value.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
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

  return errors;
}

export const coachNoteJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "strengths",
    "developmentAreas",
    "overallObservations",
    "ambiguities",
  ],
  properties: {
    schemaVersion: { type: "integer", const: SCHEMA_VERSION },
    strengths: { type: "array", items: { $ref: "#/$defs/evidenceItem" } },
    developmentAreas: { type: "array", items: { $ref: "#/$defs/evidenceItem" } },
    overallObservations: { type: "array", items: { $ref: "#/$defs/evidenceItem" } },
    ambiguities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceQuote", "question"],
        properties: {
          sourceQuote: { type: "string", minLength: 1 },
          question: { type: "string", minLength: 1 },
        },
      },
    },
  },
  $defs: {
    evidenceItem: {
      type: "object",
      additionalProperties: false,
      required: ["draftText", "evidenceQuotes", "confidence"],
      properties: {
        draftText: { type: "string", minLength: 1 },
        evidenceQuotes: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
        },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
    },
  },
} as const;
