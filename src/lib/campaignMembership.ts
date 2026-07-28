import type {
  CampaignNpsAssignment,
  CampaignNpsResponse,
  CampaignNpsSurvey,
} from "../types/database";

export function isPlayerOnCampaign(
  members: { campaign_id: string; athlete_id: string }[],
  campaignId: string,
  athleteId: string,
): boolean {
  return members.some(
    (member) => member.campaign_id === campaignId && member.athlete_id === athleteId,
  );
}

export function isCoachOnCampaign(
  coaches: { campaign_id: string; coach_profile_id: string }[],
  campaignId: string,
  coachProfileId: string,
): boolean {
  return coaches.some(
    (coach) => coach.campaign_id === campaignId && coach.coach_profile_id === coachProfileId,
  );
}

export function shouldDropPendingNpsAssignment(
  assignment: CampaignNpsAssignment,
  survey: CampaignNpsSurvey | undefined,
  responses: CampaignNpsResponse[],
): boolean {
  if (!survey || survey.status !== "open") {
    return false;
  }
  if (assignment.status !== "pending") {
    return false;
  }
  return !responses.some((response) => response.assignment_id === assignment.id);
}
