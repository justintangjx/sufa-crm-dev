import type { CoachMatrixInput, PlayerMatrixInput } from "../types";
import type { MatrixSubmissionStatus } from "../../types/database";

export function playerMatrixFieldsFromInput(input: PlayerMatrixInput) {
  return {
    campaign_id: input.campaignId,
    athlete_id: input.athleteId,
    submitted_by: input.submittedBy,
    skill_score: input.skillScore ?? null,
    growth_score: input.growthScore ?? null,
    readiness_score: input.readinessScore ?? null,
    confidence_score: input.confidenceScore ?? null,
    strengths: input.strengths ?? null,
    development_focus: input.developmentFocus ?? null,
    support_needed: input.supportNeeded ?? null,
    status: input.status,
  };
}

export function coachMatrixFieldsFromInput(input: CoachMatrixInput) {
  return {
    campaign_id: input.campaignId,
    athlete_id: input.athleteId,
    coach_profile_id: input.coachProfileId,
    skill_score: input.skillScore ?? null,
    growth_score: input.growthScore ?? null,
    readiness_score: input.readinessScore ?? null,
    tactical_score: input.tacticalScore ?? null,
    strengths: input.strengths ?? null,
    development_focus: input.developmentFocus ?? null,
    coach_notes: input.coachNotes ?? null,
    status: input.status,
  };
}

export function matrixSubmittedAt(
  status: MatrixSubmissionStatus,
  existingSubmittedAt?: string | null,
  timestamp?: string,
): string | null {
  if (status === "submitted") {
    return existingSubmittedAt ?? timestamp ?? new Date().toISOString();
  }
  return existingSubmittedAt ?? null;
}

export function matrixSubmittedAtForUpsert(status: MatrixSubmissionStatus): string | null {
  return status === "submitted" ? new Date().toISOString() : null;
}
