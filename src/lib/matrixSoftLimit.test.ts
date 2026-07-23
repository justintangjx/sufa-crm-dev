import { describe, expect, it } from "vitest";
import {
  SOFT_COACH_ASSESSMENT_TARGET,
  countOwnSubmittedAssessments,
  requiresSoftLimitConfirm,
  softLimitCopy,
  softLimitPhase,
} from "./matrixSoftLimit";

const coachId = "p-coach";

function row(status: "draft" | "submitted", coach = coachId) {
  return { status, coach_profile_id: coach };
}

describe("matrixSoftLimit", () => {
  it("counts only this coach's submitted rows", () => {
    expect(
      countOwnSubmittedAssessments(
        [row("submitted"), row("draft"), row("submitted", "other"), row("submitted")],
        coachId,
      ),
    ).toBe(2);
  });

  it("phases none / under / at_target / over around the soft max of 2", () => {
    expect(softLimitPhase(0)).toBe("none");
    expect(softLimitPhase(1)).toBe("under");
    expect(softLimitPhase(SOFT_COACH_ASSESSMENT_TARGET)).toBe("at_target");
    expect(softLimitPhase(3)).toBe("over");
  });

  it("requires confirm at or above the soft max", () => {
    expect(requiresSoftLimitConfirm(0)).toBe(false);
    expect(requiresSoftLimitConfirm(1)).toBe(false);
    expect(requiresSoftLimitConfirm(2)).toBe(true);
    expect(requiresSoftLimitConfirm(4)).toBe(true);
  });

  it("nudges coaches who have not submitted yet", () => {
    const copy = softLimitCopy("none", 0);
    expect(copy.badge).toBe("0 / 2 submitted");
    expect(copy.nudge).toMatch(/have not submitted/i);
    expect(copy.nudge).toMatch(/up to 2/i);
  });
});
