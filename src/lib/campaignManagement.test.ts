import { describe, expect, it } from "vitest";
import {
  aggregateNps,
  auditEventForSave,
  isCoachMatrixComplete,
  isPlayerMatrixComplete,
  matrixAverage,
} from "./campaignManagement";

describe("campaign management helpers", () => {
  it("detects complete player and coach matrix records", () => {
    expect(
      isPlayerMatrixComplete({
        skill_score: 4,
        growth_score: 4,
        readiness_score: 3,
        confidence_score: 5,
        strengths: "Defensive pressure",
      }),
    ).toBe(true);
    expect(
      isCoachMatrixComplete({
        skill_score: 4,
        growth_score: 4,
        readiness_score: 3,
        tactical_score: 4,
        strengths: "Reset timing",
        coach_notes: "Ready for higher tempo reps",
      }),
    ).toBe(true);
    expect(
      isPlayerMatrixComplete({
        skill_score: 4,
        growth_score: 4,
        readiness_score: 3,
        confidence_score: null,
        strengths: "Defensive pressure",
      }),
    ).toBe(false);
  });

  it("classifies audit events for creates, updates, and submissions", () => {
    expect(auditEventForSave(null, "draft")).toBe("created");
    expect(auditEventForSave({ status: "draft" }, "draft")).toBe("updated");
    expect(auditEventForSave({ status: "draft" }, "submitted")).toBe("submitted");
    expect(auditEventForSave({ status: "submitted" }, "submitted")).toBe("updated");
  });

  it("aggregates NPS only after the anonymity threshold is met", () => {
    expect(aggregateNps([{ score: 10 }, { score: 4 }], 3)).toMatchObject({
      responseCount: 2,
      withheld: true,
      nps: null,
    });

    expect(aggregateNps([{ score: 10 }, { score: 9 }, { score: 6 }], 3)).toMatchObject({
      responseCount: 3,
      withheld: false,
      promoterCount: 2,
      detractorCount: 1,
      nps: 33,
    });
  });

  it("averages matrix scores without counting blanks", () => {
    expect(matrixAverage([4, null, 5, 3])).toBe(4);
    expect(matrixAverage([null])).toBeNull();
  });
});
