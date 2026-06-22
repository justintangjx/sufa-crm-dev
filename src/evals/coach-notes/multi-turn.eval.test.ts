import { describe, expect, it } from "vitest";
import {
  buildAccumulatedInput,
  createDeterministicCoachNoteDraft,
  validateCoachNoteDraft,
} from "../../lib/coachNotes";

describe("coach note multi-turn deterministic eval", () => {
  it("re-structures after a clarification turn", () => {
    const roughNotes = "Strong hucks. Selected for the squad.";
    const firstDraft = createDeterministicCoachNoteDraft(roughNotes);
    expect(firstDraft.ambiguities).toHaveLength(1);

    const accumulated = buildAccumulatedInput(roughNotes, [
      {
        sourceQuote: "Selected for the squad.",
        answer: "Observed skill only — not a roster decision",
      },
    ]);
    const secondDraft = createDeterministicCoachNoteDraft(accumulated);
    const validation = validateCoachNoteDraft(secondDraft, accumulated);

    expect(validation.valid).toBe(true);
    expect(secondDraft.strengths[0]?.draftText).toBe("Strong hucks");
    expect(JSON.stringify(secondDraft)).not.toContain("recommendation");
  });

  it("includes appended notes in grounding source", () => {
    const accumulated = buildAccumulatedInput("Strong hucks.", [], "Needs tighter reset defense.");
    const draft = createDeterministicCoachNoteDraft(accumulated);
    const validation = validateCoachNoteDraft(draft, accumulated);

    expect(validation.valid).toBe(true);
    expect(draft.developmentAreas[0]?.draftText).toBe("Needs tighter reset defense");
  });
});
