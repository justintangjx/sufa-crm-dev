import { beforeEach, describe, expect, it } from "vitest";
import { api, resetData } from ".";
import { getData } from "./store";

describe("coach note Api", () => {
  beforeEach(() => {
    resetData();
  });

  it("generates an assigned coach draft without decisions and records feedback", async () => {
    await api.signIn("coach@sufa.test");
    const result = await api.coachNoteAction({
      campaignId: "c-sea",
      athleteId: "a-alice",
      roughNotes: "Strong hucks. Selected for the squad.",
      action: "structure",
    });

    expect(result.draft.strengths[0]?.draftText).toBe("Strong hucks");
    expect(JSON.stringify(result.draft)).not.toContain("recommendation");
    expect(result.draft.ambiguities[0]?.sourceQuote).toContain("Selected");
    expect(result.ambiguityCount).toBe(1);
    expect(result.sessionId).toBeTruthy();
    expect(result.turnIndex).toBe(0);

    await api.submitCoachNoteFeedback({ runId: result.runId, feedback: "useful" });
    await api.recordCoachNoteEditMetrics({
      runId: result.runId,
      fieldEditCount: 1,
      normalizedEditDistance: 0.25,
    });
    expect(getData().coachNoteGenerationRuns[0]?.feedback).toBe("useful");
    expect(getData().coachNoteGenerationRuns[0]?.field_edit_count).toBe(1);
    expect(getData().coachNoteGenerationRuns[0]?.ambiguity_count).toBe(1);
    expect(getData().coachNoteSessions).toHaveLength(1);
    expect(getData().coachNoteTurns).toHaveLength(1);
  });

  it("records a clarify turn on an existing session", async () => {
    await api.signIn("coach@sufa.test");
    const first = await api.coachNoteAction({
      campaignId: "c-sea",
      athleteId: "a-alice",
      roughNotes: "Strong hucks. Selected for the squad.",
      action: "structure",
    });
    const second = await api.coachNoteAction({
      campaignId: "c-sea",
      athleteId: "a-alice",
      roughNotes: "Strong hucks. Selected for the squad.",
      action: "clarify",
      sessionId: first.sessionId,
      clarifications: [
        {
          sourceQuote: "Selected for the squad.",
          answer: "Observed skill only — not a roster decision",
        },
      ],
    });

    expect(second.sessionId).toBe(first.sessionId);
    expect(second.turnIndex).toBe(1);
    expect(getData().coachNoteTurns).toHaveLength(2);
  });

  it("lists prior submitted evaluations for the same athlete", async () => {
    await api.signIn("coach@sufa.test");
    const prior = await api.listOwnSubmittedEvaluations("p-coach", "a-alice", 3);
    expect(prior).toHaveLength(1);
    expect(prior[0]?.campaignName).toBe("U24 Nationals 2025");
    expect(prior[0]?.strengths).toContain("downfield speed");
  });

  it("denies players and unassigned athletes", async () => {
    await api.signIn("alice@sufa.test");
    await expect(
      api.generateCoachNoteDraft({
        campaignId: "c-sea",
        athleteId: "a-alice",
        roughNotes: "Strong hucks.",
      }),
    ).rejects.toThrow(/not assigned/i);

    await api.signIn("coach@sufa.test");
    await expect(
      api.generateCoachNoteDraft({
        campaignId: "c-sea",
        athleteId: "missing-athlete",
        roughNotes: "Strong hucks.",
      }),
    ).rejects.toThrow(/not assigned/i);
  });
});
