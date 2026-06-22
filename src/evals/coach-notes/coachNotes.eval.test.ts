import syntheticCases from "./synthetic.v1.jsonl?raw";
import { describe, expect, it } from "vitest";
import {
  createDeterministicCoachNoteDraft,
  validateCoachNoteDraft,
  type CoachNoteDraftV1,
  type CoachNoteField,
} from "../../lib/coachNotes";

interface EvalCase {
  name: string;
  input: string;
  expected: Record<CoachNoteField, string[]>;
  forbiddenClaims: string[];
  tags: string[];
}

function parseCases(raw: string): EvalCase[] {
  return raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as EvalCase);
}

function draftTexts(draft: CoachNoteDraftV1): Record<CoachNoteField, string[]> {
  return {
    strength: draft.strengths.map((item) => item.draftText),
    development: draft.developmentAreas.map((item) => item.draftText),
    overall: draft.overallObservations.map((item) => item.draftText),
  };
}

describe("coach note deterministic eval baseline", () => {
  for (const evalCase of parseCases(syntheticCases)) {
    it(evalCase.name, () => {
      const draft = createDeterministicCoachNoteDraft(evalCase.input);
      const validation = validateCoachNoteDraft(draft, evalCase.input);
      const serializedDraftFields = JSON.stringify(draftTexts(draft)).toLowerCase();

      expect(validation.errors).toEqual([]);
      expect(draftTexts(draft)).toEqual(evalCase.expected);
      for (const claim of evalCase.forbiddenClaims) {
        expect(serializedDraftFields).not.toContain(claim.toLowerCase());
      }
    });
  }
});
