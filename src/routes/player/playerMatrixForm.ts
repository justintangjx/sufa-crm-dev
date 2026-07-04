import type { PlayerMatrixInput } from "../../data/types";
import type { MatrixSubmissionStatus, PlayerMatrixSubmission } from "../../types/database";
import { optionalText, ratingValue } from "../../lib/form";

export interface PlayerMatrixFormState {
  skillScore: string;
  growthScore: string;
  readinessScore: string;
  confidenceScore: string;
  strengths: string;
  developmentFocus: string;
  supportNeeded: string;
}

export const emptyPlayerMatrixForm: PlayerMatrixFormState = {
  skillScore: "3",
  growthScore: "3",
  readinessScore: "3",
  confidenceScore: "3",
  strengths: "",
  developmentFocus: "",
  supportNeeded: "",
};

export function playerMatrixFormFromSubmission(
  submission: PlayerMatrixSubmission | null,
): PlayerMatrixFormState {
  return {
    skillScore: submission?.skill_score ? String(submission.skill_score) : "3",
    growthScore: submission?.growth_score ? String(submission.growth_score) : "3",
    readinessScore: submission?.readiness_score ? String(submission.readiness_score) : "3",
    confidenceScore: submission?.confidence_score ? String(submission.confidence_score) : "3",
    strengths: submission?.strengths ?? "",
    developmentFocus: submission?.development_focus ?? "",
    supportNeeded: submission?.support_needed ?? "",
  };
}

export function playerMatrixInputFromForm(
  form: PlayerMatrixFormState,
  input: {
    id?: string;
    campaignId: string;
    athleteId: string;
    submittedBy: string;
    status: MatrixSubmissionStatus;
  },
): PlayerMatrixInput {
  return {
    id: input.id,
    campaignId: input.campaignId,
    athleteId: input.athleteId,
    submittedBy: input.submittedBy,
    skillScore: ratingValue(form.skillScore),
    growthScore: ratingValue(form.growthScore),
    readinessScore: ratingValue(form.readinessScore),
    confidenceScore: ratingValue(form.confidenceScore),
    strengths: optionalText(form.strengths),
    developmentFocus: optionalText(form.developmentFocus),
    supportNeeded: optionalText(form.supportNeeded),
    status: input.status,
  };
}
