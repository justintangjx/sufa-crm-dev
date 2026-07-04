import { enableCampaignEvaluationMatrix, enableCampaignNps, enablePlayerGrowthMatrix } from "./env";
import { isU24Campaign } from "./campaignUi";
import type { Campaign } from "../types/database";

export interface CampaignCapabilities {
  liveMatrix: boolean;
  coachNps: boolean;
  growthMatrix: boolean;
  legacyCoachEvaluation: boolean;
}

export function hasAnyCampaignFeature(): boolean {
  return enablePlayerGrowthMatrix || enableCampaignEvaluationMatrix || enableCampaignNps;
}

export function campaignCapabilities(
  campaign: Pick<Campaign, "id" | "name" | "team"> | null | undefined,
): CampaignCapabilities {
  const u24 = isU24Campaign(campaign);
  return {
    liveMatrix: enableCampaignEvaluationMatrix && u24,
    coachNps: enableCampaignNps && u24,
    growthMatrix: enablePlayerGrowthMatrix,
    legacyCoachEvaluation: true,
  };
}
