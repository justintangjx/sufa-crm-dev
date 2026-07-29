import {
  enableCampaignEvaluationMatrix,
  enableCampaignNps,
  enableCampaignQuestionnaire,
  enablePlayerGrowthMatrix,
} from "./env";
import { isQuestionnaireCampaign } from "./campaignSurveyUi";
import { isU24Campaign } from "./campaignUi";
import type { Campaign } from "../types/database";

export interface CampaignCapabilities {
  liveMatrix: boolean;
  /** Stakeholder end-of-campaign questionnaire (Likert / NPS / text). */
  endOfCampaignSurvey: boolean;
  /** Legacy peer-rating 0–10 per person; hidden when questionnaire is on for U24. */
  coachNps: boolean;
  growthMatrix: boolean;
  legacyCoachEvaluation: boolean;
}

export function hasAnyCampaignFeature(): boolean {
  return (
    enablePlayerGrowthMatrix ||
    enableCampaignEvaluationMatrix ||
    enableCampaignNps ||
    enableCampaignQuestionnaire
  );
}

export function campaignCapabilities(
  campaign: Pick<Campaign, "id" | "name" | "team"> | null | undefined,
): CampaignCapabilities {
  const u24 = isU24Campaign(campaign);
  const questionnaireCampaign = isQuestionnaireCampaign(campaign);
  const liveMatrix = enableCampaignEvaluationMatrix && u24;
  const endOfCampaignSurvey = enableCampaignQuestionnaire && questionnaireCampaign;
  const peerNps = enableCampaignNps && u24 && !endOfCampaignSurvey;
  return {
    liveMatrix,
    endOfCampaignSurvey,
    coachNps: peerNps,
    growthMatrix: enablePlayerGrowthMatrix && !u24,
    legacyCoachEvaluation: !liveMatrix,
  };
}
