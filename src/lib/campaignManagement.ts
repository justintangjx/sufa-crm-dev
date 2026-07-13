import type {
  CampaignNpsResponse,
  CoachMatrixAssessment,
  EvaluationAuditEventType,
  MatrixSubmissionStatus,
  PlayerMatrixSubmission,
} from "../types/database";

// Direction-specific reporting thresholds: many players rate each coach, but
// only a couple of coaches rate each player, so player aggregates need a lower
// minimum or they would always be withheld.
export const DEFAULT_NPS_MIN_PLAYER_RATER_COUNT = 3;
export const DEFAULT_NPS_MIN_COACH_RATER_COUNT = 2;

export type LiveMatrixScoreKey =
  | "skill_score"
  | "growth_score"
  | "readiness_score"
  | "confidence_score";

export type CoachMatrixScoreKey =
  | "skill_score"
  | "growth_score"
  | "readiness_score"
  | "tactical_score";

export function isSubmitted(status: MatrixSubmissionStatus | null | undefined): boolean {
  return status === "submitted";
}

export function isPlayerMatrixComplete(
  submission: Pick<
    PlayerMatrixSubmission,
    "confidence_score" | "growth_score" | "readiness_score" | "skill_score" | "strengths"
  > | null,
): boolean {
  return Boolean(
    submission?.skill_score &&
    submission.growth_score &&
    submission.readiness_score &&
    submission.confidence_score &&
    submission.strengths?.trim(),
  );
}

export function isCoachMatrixComplete(
  assessment: Pick<
    CoachMatrixAssessment,
    | "coach_notes"
    | "growth_score"
    | "readiness_score"
    | "skill_score"
    | "strengths"
    | "tactical_score"
  > | null,
): boolean {
  return Boolean(
    assessment?.skill_score &&
    assessment.growth_score &&
    assessment.readiness_score &&
    assessment.tactical_score &&
    assessment.strengths?.trim() &&
    assessment.coach_notes?.trim(),
  );
}

export function matrixAverage(scores: readonly (number | null)[]): number | null {
  const valid = scores.filter((score): score is number => typeof score === "number");
  if (valid.length === 0) {
    return null;
  }
  return Math.round((valid.reduce((total, score) => total + score, 0) / valid.length) * 10) / 10;
}

export function auditEventForSave(
  existing: { status: MatrixSubmissionStatus } | null,
  nextStatus: MatrixSubmissionStatus,
): EvaluationAuditEventType {
  if (!existing) {
    return nextStatus === "submitted" ? "submitted" : "created";
  }
  if (existing.status !== "submitted" && nextStatus === "submitted") {
    return "submitted";
  }
  return "updated";
}

export interface NpsAggregate {
  responseCount: number;
  averageScore: number | null;
  promoterCount: number;
  passiveCount: number;
  detractorCount: number;
  nps: number | null;
  withheld: boolean;
}

export function aggregateNps(
  responses: readonly Pick<CampaignNpsResponse, "score">[],
  minResponseCount = DEFAULT_NPS_MIN_PLAYER_RATER_COUNT,
): NpsAggregate {
  const responseCount = responses.length;
  if (responseCount < minResponseCount) {
    return {
      responseCount,
      averageScore: null,
      promoterCount: 0,
      passiveCount: 0,
      detractorCount: 0,
      nps: null,
      withheld: true,
    };
  }

  const promoterCount = responses.filter((response) => response.score >= 9).length;
  const passiveCount = responses.filter(
    (response) => response.score >= 7 && response.score <= 8,
  ).length;
  const detractorCount = responses.filter((response) => response.score <= 6).length;
  const averageScore =
    Math.round(
      (responses.reduce((total, response) => total + response.score, 0) / responseCount) * 10,
    ) / 10;
  const nps = Math.round(((promoterCount - detractorCount) / responseCount) * 100);

  return {
    responseCount,
    averageScore,
    promoterCount,
    passiveCount,
    detractorCount,
    nps,
    withheld: false,
  };
}
