import type { CoachMatrixInput } from "../../data/types";
import { optionalText, ratingValue } from "../../lib/form";
import type { CoachMatrixAssessment, MatrixSubmissionStatus } from "../../types/database";

export interface CoachMatrixFormState {
  id?: string;
  athleteId: string;
  skillScore: string;
  growthScore: string;
  readinessScore: string;
  tacticalScore: string;
  strengths: string;
  developmentFocus: string;
  coachNotes: string;
  status: MatrixSubmissionStatus;
}

export const emptyCoachMatrixForm: CoachMatrixFormState = {
  athleteId: "",
  skillScore: "3",
  growthScore: "3",
  readinessScore: "3",
  tacticalScore: "3",
  strengths: "",
  developmentFocus: "",
  coachNotes: "",
  status: "draft",
};

export function coachMatrixFormFromAssessment(
  assessment: CoachMatrixAssessment | null,
  athleteId: string,
): CoachMatrixFormState {
  return {
    id: assessment?.id,
    athleteId,
    skillScore: assessment?.skill_score ? String(assessment.skill_score) : "3",
    growthScore: assessment?.growth_score ? String(assessment.growth_score) : "3",
    readinessScore: assessment?.readiness_score ? String(assessment.readiness_score) : "3",
    tacticalScore: assessment?.tactical_score ? String(assessment.tactical_score) : "3",
    strengths: assessment?.strengths ?? "",
    developmentFocus: assessment?.development_focus ?? "",
    coachNotes: assessment?.coach_notes ?? "",
    status: assessment?.status ?? "draft",
  };
}

export function coachMatrixInputFromForm(
  form: CoachMatrixFormState,
  input: {
    campaignId: string;
    coachProfileId: string;
    status: MatrixSubmissionStatus;
  },
): CoachMatrixInput {
  return {
    id: form.id,
    campaignId: input.campaignId,
    athleteId: form.athleteId,
    coachProfileId: input.coachProfileId,
    skillScore: ratingValue(form.skillScore),
    growthScore: ratingValue(form.growthScore),
    readinessScore: ratingValue(form.readinessScore),
    tacticalScore: ratingValue(form.tacticalScore),
    strengths: optionalText(form.strengths),
    developmentFocus: optionalText(form.developmentFocus),
    coachNotes: optionalText(form.coachNotes),
    status: input.status,
  };
}
