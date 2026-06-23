import { describe, expect, it } from "vitest";
import {
  buildAccumulatedInput,
  COACH_NOTE_MAX_TURNS,
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
});
