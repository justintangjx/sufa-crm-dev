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

function normalizeConfidence(value: unknown): CoachNoteConfidence {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "high" || lower === "medium" || lower === "low") {
      return lower;
    }
  }
  return "medium";
}

function findGroundedQuote(text: string, sourceNotes: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (sourceNotes.includes(trimmed)) {
    return trimmed;
  }
  const sentences = sourceNotes.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const candidate = sentence.trim();
    if (candidate && (candidate.includes(trimmed) || trimmed.includes(candidate))) {
      if (sourceNotes.includes(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function normalizeEvidenceItem(item: unknown, sourceNotes: string): EvidenceItem | null {
  if (typeof item === "string") {
    const quote = findGroundedQuote(item, sourceNotes);
    if (!quote) {
      return null;
    }
    return {
      draftText: quote,
      evidenceQuotes: [quote],
      confidence: "medium",
    };
  }
  if (!isRecord(item)) {
    return null;
  }
  const draftTextRaw =
    item.draftText ?? item.draft_text ?? item.text ?? item.summary ?? item.observation;
  const quotesRaw = item.evidenceQuotes ?? item.evidence_quotes ?? item.quotes ?? item.evidence;
  let draftText = typeof draftTextRaw === "string" ? draftTextRaw.trim() : "";
  let evidenceQuotes = Array.isArray(quotesRaw)
    ? quotesRaw.filter(
        (quote): quote is string => typeof quote === "string" && quote.trim().length > 0,
      )
    : [];
  if (!draftText && evidenceQuotes.length > 0) {
    draftText = evidenceQuotes[0]!.trim();
  }
  if (draftText && evidenceQuotes.length === 0) {
    const grounded = findGroundedQuote(draftText, sourceNotes);
    if (grounded) {
      evidenceQuotes = [grounded];
      draftText = grounded;
    }
  }
  if (!draftText || evidenceQuotes.length === 0) {
    return null;
  }
  return {
    draftText,
    evidenceQuotes,
    confidence: normalizeConfidence(item.confidence),
  };
}

function normalizeEvidenceArray(value: unknown, sourceNotes: string): EvidenceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeEvidenceItem(item, sourceNotes))
    .filter((item): item is EvidenceItem => item !== null);
}

function normalizeAmbiguity(item: unknown, sourceNotes: string): CoachNoteAmbiguity | null {
  if (!isRecord(item)) {
    if (typeof item === "string") {
      const quote = findGroundedQuote(item, sourceNotes);
      if (!quote) {
        return null;
      }
      return {
        sourceQuote: quote,
        question: `What did you mean by "${quote}"?`,
      };
    }
    return null;
  }
  const sourceQuoteRaw = item.sourceQuote ?? item.source_quote ?? item.quote ?? item.text;
  const questionRaw = item.question ?? item.clarification ?? item.prompt;
  const sourceQuote =
    typeof sourceQuoteRaw === "string" ? findGroundedQuote(sourceQuoteRaw, sourceNotes) : null;
  const question = typeof questionRaw === "string" ? questionRaw.trim() : "";
  if (!sourceQuote) {
    return null;
  }
  return {
    sourceQuote,
    question: question || `What did you mean by "${sourceQuote}"?`,
  };
}

function normalizeAmbiguityArray(value: unknown, sourceNotes: string): CoachNoteAmbiguity[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeAmbiguity(item, sourceNotes))
    .filter((item): item is CoachNoteAmbiguity => item !== null);
}

function coerceSchemaVersion(value: unknown): typeof SCHEMA_VERSION {
  if (value === SCHEMA_VERSION || value === String(SCHEMA_VERSION)) {
    return SCHEMA_VERSION;
  }
  const parsed = Number(value);
  return parsed === SCHEMA_VERSION ? SCHEMA_VERSION : SCHEMA_VERSION;
}

export function normalizeCoachNoteDraft(value: unknown, sourceNotes: string): CoachNoteDraft {
  if (!isRecord(value)) {
    return {
      schemaVersion: SCHEMA_VERSION,
      strengths: [],
      developmentAreas: [],
      overallObservations: [],
      ambiguities: [],
    };
  }

  return {
    schemaVersion: coerceSchemaVersion(value.schemaVersion ?? value.schema_version),
    strengths: normalizeEvidenceArray(value.strengths ?? value.strength, sourceNotes),
    developmentAreas: normalizeEvidenceArray(
      value.developmentAreas ?? value.development_areas ?? value.development,
      sourceNotes,
    ),
    overallObservations: normalizeEvidenceArray(
      value.overallObservations ?? value.overall_observations ?? value.overall,
      sourceNotes,
    ),
    ambiguities: normalizeAmbiguityArray(value.ambiguities ?? value.ambiguity, sourceNotes),
  };
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
