export const SCHEMA_VERSION = 1;
export const PROMPT_VERSION = "coach-notes-v1";

export interface EvidenceItem {
  draftText: string;
  evidenceQuotes: string[];
  confidence: "high" | "medium" | "low";
}

export interface CoachNoteDraft {
  schemaVersion: 1;
  strengths: EvidenceItem[];
  developmentAreas: EvidenceItem[];
  overallObservations: EvidenceItem[];
  ambiguities: { sourceQuote: string; question: string }[];
}

const decisionPatterns = [
  /\bnot[_ -]?selected\b/i,
  /\bselected\b/i,
  /\bselect\b/i,
  /\breserve\b/i,
  /\brecommend(?:ation|ed)?\b/i,
  /\brating\b/i,
  /\b[1-5]\s*\/\s*5\b/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateItems(value: unknown, field: string, source: string, errors: string[]): void {
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
    if (typeof item.draftText !== "string" || item.draftText.trim().length === 0) {
      errors.push(`${path}.draftText must be non-empty`);
    } else if (decisionPatterns.some((pattern) => pattern.test(item.draftText))) {
      errors.push(`${path}.draftText contains a rating or selection decision`);
    }
    if (!Array.isArray(item.evidenceQuotes) || item.evidenceQuotes.length === 0) {
      errors.push(`${path}.evidenceQuotes must contain evidence`);
    } else {
      item.evidenceQuotes.forEach((quote, quoteIndex) => {
        if (typeof quote !== "string" || !source.includes(quote)) {
          errors.push(`${path}.evidenceQuotes[${quoteIndex}] is not grounded`);
        }
      });
    }
    if (!["high", "medium", "low"].includes(String(item.confidence))) {
      errors.push(`${path}.confidence is invalid`);
    }
  });
}

export function validateDraft(value: unknown, source: string): string[] {
  if (!isRecord(value)) {
    return ["draft must be an object"];
  }
  const errors: string[] = [];
  const allowed = new Set([
    "schemaVersion",
    "strengths",
    "developmentAreas",
    "overallObservations",
    "ambiguities",
  ]);
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) {
      errors.push(`unexpected field: ${key}`);
    }
  });
  if (value.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }
  validateItems(value.strengths, "strengths", source, errors);
  validateItems(value.developmentAreas, "developmentAreas", source, errors);
  validateItems(value.overallObservations, "overallObservations", source, errors);

  if (!Array.isArray(value.ambiguities)) {
    errors.push("ambiguities must be an array");
  } else {
    value.ambiguities.forEach((item, index) => {
      if (!isRecord(item)) {
        errors.push(`ambiguities[${index}] must be an object`);
        return;
      }
      if (typeof item.sourceQuote !== "string" || !source.includes(item.sourceQuote)) {
        errors.push(`ambiguities[${index}].sourceQuote is not grounded`);
      }
      if (typeof item.question !== "string" || item.question.trim().length === 0) {
        errors.push(`ambiguities[${index}].question must be non-empty`);
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
