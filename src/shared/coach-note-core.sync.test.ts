import { describe, expect, it } from "vitest";
import {
  buildAccumulatedInput,
  COACH_NOTE_MAX_TURNS,
  normalizeCoachNoteDraft,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  validateCoachNoteDraftErrors,
} from "./coach-note-core.ts";

describe("coach note core (synced copy)", () => {
  it("re-exports the canonical contract constants", () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(PROMPT_VERSION).toBe("coach-notes-v1");
    expect(COACH_NOTE_MAX_TURNS).toBe(5);
  });

  it("validates and accumulates using the shared contract", () => {
    const notes = "Strong hucks. Selected for the squad.";
    const accumulated = buildAccumulatedInput(notes, [
      { sourceQuote: "Selected for the squad.", answer: "Observed skill only" },
    ]);
    const draft = {
      schemaVersion: 1,
      strengths: [
        { draftText: "Strong hucks", evidenceQuotes: ["Strong hucks"], confidence: "high" },
      ],
      developmentAreas: [],
      overallObservations: [],
      ambiguities: [],
    };
    expect(validateCoachNoteDraftErrors(draft, notes)).toEqual([]);
    expect(accumulated).toContain("Coach clarifications");
  });

  it("normalizes snake_case and string-list provider output", () => {
    const notes =
      "Strong hucks on the break side. Reset defense is loose under pressure. Coach note says selected for the squad.";
    const normalized = normalizeCoachNoteDraft(
      {
        schema_version: "1",
        strengths: ["Strong hucks on the break side"],
        development_areas: ["Reset defense is loose under pressure"],
        overall_observations: [],
        ambiguities: [
          {
            source_quote: "selected for the squad",
            question: "",
          },
        ],
      },
      notes,
    );
    expect(normalized.schemaVersion).toBe(1);
    expect(validateCoachNoteDraftErrors(normalized, notes)).toEqual([]);
  });
});
