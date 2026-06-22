import { describe, expect, it } from "vitest";
import {
  buildAccumulatedInput,
  calculateCoachNoteEditMetrics,
  coachNoteDraftToFormText,
  countAmbiguities,
  createDeterministicCoachNoteDraft,
  validateCoachNoteDraft,
} from "./coachNotes";

describe("validateCoachNoteDraft", () => {
  it("accepts exact evidence spans", () => {
    const notes = "Strong hucks. Needs tighter reset defense.";
    const draft = createDeterministicCoachNoteDraft(notes);
    expect(validateCoachNoteDraft(draft, notes)).toEqual({ valid: true, errors: [] });
  });

  it("rejects invented evidence and decision fields", () => {
    const result = validateCoachNoteDraft(
      {
        schemaVersion: 1,
        strengths: [
          {
            draftText: "Selected because of elite speed",
            evidenceQuotes: ["Elite speed"],
            confidence: "high",
          },
        ],
        developmentAreas: [],
        overallObservations: [],
        ambiguities: [],
        recommendation: "selected",
      },
      "Quick first steps.",
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "unexpected field: recommendation",
        "strengths[0].draftText contains a rating or selection decision",
        "strengths[0].evidenceQuotes[0] is not grounded in the notes",
      ]),
    );
  });
});

describe("calculateCoachNoteEditMetrics", () => {
  it("counts edited fields and normalizes character distance", () => {
    expect(
      calculateCoachNoteEditMetrics(
        { strengths: "Strong hucks", developmentAreas: "Reset defense", overallNotes: "" },
        {
          strengths: "Strong hucks",
          developmentAreas: "Improve reset defense",
          overallNotes: "",
        },
      ),
    ).toEqual({
      fieldEditCount: 1,
      normalizedEditDistance: expect.any(Number),
    });
  });
});

describe("buildAccumulatedInput", () => {
  it("appends clarification and additional note blocks", () => {
    const accumulated = buildAccumulatedInput(
      "Selected for the squad.",
      [{ sourceQuote: "Selected for the squad.", answer: "Observed skill only" }],
      "Strong downfield defense.",
    );
    expect(accumulated).toContain("Selected for the squad.");
    expect(accumulated).toContain("Coach clarifications");
    expect(accumulated).toContain("Observed skill only");
    expect(accumulated).toContain("Additional notes");
    expect(accumulated).toContain("Strong downfield defense.");
  });
});

describe("countAmbiguities", () => {
  it("counts ambiguity items on a draft", () => {
    const draft = createDeterministicCoachNoteDraft("Selected for the squad. Strong hucks.");
    expect(countAmbiguities(draft)).toBe(1);
  });
});

describe("createDeterministicCoachNoteDraft", () => {
  it("preserves evidence while classifying notes", () => {
    const draft = createDeterministicCoachNoteDraft(
      "Strong hucks. Needs tighter reset defense. Played handler.",
    );
    expect(draft.strengths[0]?.evidenceQuotes).toEqual(["Strong hucks"]);
    expect(draft.developmentAreas[0]?.draftText).toBe("Needs tighter reset defense");
    expect(draft.overallObservations[0]?.draftText).toBe("Played handler");
    expect(coachNoteDraftToFormText(draft)).toEqual({
      strengths: "Strong hucks",
      developmentAreas: "Needs tighter reset defense",
      overallNotes: "Played handler",
    });
  });
});
