import type { MatrixQuadrant, PlayerGrowthReview, PlayerGrowthSignoff } from "../types/database";

export interface QuadrantInfo {
  quadrant: MatrixQuadrant;
  label: string;
  gameTimeGuidance: string;
}

const HIGH_SCORE_THRESHOLD = 4;

export function calculateMatrixQuadrant(
  skillScore: number,
  growthPotentialScore: number,
): MatrixQuadrant {
  const highSkill = skillScore >= HIGH_SCORE_THRESHOLD;
  const highGrowth = growthPotentialScore >= HIGH_SCORE_THRESHOLD;

  if (highSkill && highGrowth) {
    return "core_minutes";
  }
  if (highSkill) {
    return "reliable_contributor";
  }
  if (highGrowth) {
    return "development_priority";
  }
  return "foundation_builder";
}

export function getQuadrantInfo(quadrant: MatrixQuadrant): QuadrantInfo {
  switch (quadrant) {
    case "core_minutes":
      return {
        quadrant,
        label: "Core minutes",
        gameTimeGuidance: "High current skill and high growth potential.",
      };
    case "reliable_contributor":
      return {
        quadrant,
        label: "Reliable contributor",
        gameTimeGuidance: "High current skill with steadier growth trajectory.",
      };
    case "development_priority":
      return {
        quadrant,
        label: "Development priority",
        gameTimeGuidance: "Lower current skill with strong trainability and upside.",
      };
    case "foundation_builder":
      return {
        quadrant,
        label: "Foundation builder",
        gameTimeGuidance: "Foundational skill and growth areas need clear support.",
      };
  }
}

export function distinctCoachSignoffCount(
  signoffs: readonly Pick<PlayerGrowthSignoff, "coach_profile_id">[],
): number {
  return new Set(signoffs.map((signoff) => signoff.coach_profile_id)).size;
}

export function hasTwoCoachSignoff(
  signoffs: readonly Pick<PlayerGrowthSignoff, "coach_profile_id">[],
): boolean {
  return distinctCoachSignoffCount(signoffs) >= 2;
}

export function nextGrowthReviewStatus(
  review: Pick<PlayerGrowthReview, "status">,
  signoffs: readonly Pick<PlayerGrowthSignoff, "coach_profile_id">[],
): PlayerGrowthReview["status"] {
  if (review.status === "shared" || review.status === "disputed" || review.status === "closed") {
    return review.status;
  }
  return distinctCoachSignoffCount(signoffs) > 0 ? "awaiting_second_signoff" : "draft";
}

export function canShareGrowthReview(
  review: Pick<PlayerGrowthReview, "status">,
  signoffs: readonly Pick<PlayerGrowthSignoff, "coach_profile_id">[],
): boolean {
  return review.status === "awaiting_second_signoff" && hasTwoCoachSignoff(signoffs);
}
