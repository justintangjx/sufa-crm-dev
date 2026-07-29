import type { Campaign } from "../types/database";
import { isU24Campaign } from "./campaignUi";

/** Prod-safe smoke-test campaign id (questionnaire only; not U24 matrix). */
export const SURVEY_TEST_CAMPAIGN_ID = "c-survey-test";

export function isSurveyTestCampaign(campaign: Pick<Campaign, "id"> | null | undefined): boolean {
  return campaign?.id === SURVEY_TEST_CAMPAIGN_ID;
}

/** Campaigns that receive the end-of-campaign questionnaire when the flag is on. */
export function isQuestionnaireCampaign(
  campaign: Pick<Campaign, "id" | "name" | "team"> | null | undefined,
): boolean {
  if (!campaign) {
    return false;
  }
  return isU24Campaign(campaign) || isSurveyTestCampaign(campaign);
}
