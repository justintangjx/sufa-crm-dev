import type { CampaignOperatingSummary } from "../data/types";
import type { CampaignCapabilities } from "./campaignCapabilities";

export interface AdminCampaignAction {
  label: string;
  to: string;
}

export interface BuildCampaignAdminActionsInput {
  campaignId: string;
  summary: Pick<CampaignOperatingSummary, "rosterCount" | "openNpsSurveyCount">;
  coachCount: number;
  capabilities: CampaignCapabilities;
}

export function buildCampaignAdminActions(
  input: BuildCampaignAdminActionsInput,
): AdminCampaignAction[] {
  const actions: AdminCampaignAction[] = [];
  const campaignPath = `/admin/campaigns/${input.campaignId}`;
  const npsPath = `${campaignPath}#nps`;

  if (input.summary.rosterCount === 0) {
    actions.push({
      label: "Import roster CSV or add players on the campaign page",
      to: campaignPath,
    });
  }

  if (input.coachCount === 0) {
    actions.push({
      label: "Assign coaches for this campaign",
      to: campaignPath,
    });
  }

  if (
    input.capabilities.coachNps &&
    input.summary.openNpsSurveyCount === 0 &&
    input.summary.rosterCount > 0 &&
    input.coachCount > 0
  ) {
    actions.push({
      label: "Open end-of-campaign NPS when ready",
      to: npsPath,
    });
  }

  if (input.capabilities.coachNps && input.summary.openNpsSurveyCount > 0) {
    actions.push({
      label: "Review the open NPS survey",
      to: npsPath,
    });
  }

  return actions;
}
