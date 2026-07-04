import type { TryoutBriefingInput } from "../types";

export function briefingFieldsFromInput(input: TryoutBriefingInput, updatedBy: string) {
  return {
    campaign_id: input.campaignId,
    head_coach: input.headCoach ?? null,
    selectors: input.selectors ?? null,
    welfare_committee: input.welfareCommittee ?? null,
    liaison: input.liaison ?? null,
    training_schedule: input.trainingSchedule ?? null,
    camps_schedule: input.campsSchedule ?? null,
    competitions_schedule: input.competitionsSchedule ?? null,
    time_commitment: input.timeCommitment ?? null,
    published: input.published,
    updated_by: updatedBy,
  };
}
