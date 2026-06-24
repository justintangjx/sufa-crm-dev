import { describe, expect, it } from "vitest";
import {
  calculateMatrixQuadrant,
  canShareGrowthReview,
  distinctCoachSignoffCount,
  hasTwoCoachSignoff,
  nextGrowthReviewStatus,
} from "./playerGrowth";

describe("player growth matrix", () => {
  it("places athletes into the four matrix quadrants", () => {
    expect(calculateMatrixQuadrant(4, 4)).toBe("core_minutes");
    expect(calculateMatrixQuadrant(5, 2)).toBe("reliable_contributor");
    expect(calculateMatrixQuadrant(2, 5)).toBe("development_priority");
    expect(calculateMatrixQuadrant(3, 3)).toBe("foundation_builder");
  });

  it("requires two distinct coach sign-offs before sharing", () => {
    const oneCoachTwice = [{ coach_profile_id: "p-coach" }, { coach_profile_id: "p-coach" }];
    const twoCoaches = [{ coach_profile_id: "p-coach" }, { coach_profile_id: "p-coach-2" }];

    expect(distinctCoachSignoffCount(oneCoachTwice)).toBe(1);
    expect(hasTwoCoachSignoff(oneCoachTwice)).toBe(false);
    expect(hasTwoCoachSignoff(twoCoaches)).toBe(true);
    expect(nextGrowthReviewStatus({ status: "draft" }, oneCoachTwice)).toBe(
      "awaiting_second_signoff",
    );
    expect(canShareGrowthReview({ status: "awaiting_second_signoff" }, twoCoaches)).toBe(true);
  });
});
