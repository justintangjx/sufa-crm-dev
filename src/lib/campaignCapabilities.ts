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
  const liveMatrix = enableCampaignEvaluationMatrix && u24;
  return {
    liveMatrix,
    coachNps: enableCampaignNps && u24,
    // U24 never shows Growth Matrix, even if the Cloudflare flag is mis-set.
    growthMatrix: enablePlayerGrowthMatrix && !u24,
    // U24 live matrix path hides legacy Evaluate links.
    legacyCoachEvaluation: !liveMatrix,
  };
}
