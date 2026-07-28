import { describe, expect, it } from "vitest";
import { buildCampaignAdminActions } from "./adminCampaignActions";

const caps = {
  liveMatrix: true,
  coachNps: true,
  growthMatrix: false,
  legacyCoachEvaluation: false,
};

describe("buildCampaignAdminActions", () => {
  it("prioritizes roster and coach setup", () => {
    const actions = buildCampaignAdminActions({
      campaignId: "c-u24",
      summary: { rosterCount: 0, openNpsSurveyCount: 0 },
      coachCount: 0,
      capabilities: caps,
    });

    expect(actions.map((action) => action.label)).toEqual([
      "Import roster CSV or add players on the campaign page",
      "Assign coaches for this campaign",
    ]);
  });

  it("surfaces open NPS only when the campaign supports coach NPS", () => {
    const actions = buildCampaignAdminActions({
      campaignId: "c-u24",
      summary: { rosterCount: 22, openNpsSurveyCount: 1 },
      coachCount: 2,
      capabilities: caps,
    });

    expect(actions).toEqual([
      {
        label: "Review the open NPS survey",
        to: "/admin/campaigns/c-u24#nps",
      },
    ]);
  });

  it("nudges opening NPS when roster and coaches are ready but survey is closed", () => {
    const actions = buildCampaignAdminActions({
      campaignId: "c-u24",
      summary: { rosterCount: 22, openNpsSurveyCount: 0 },
      coachCount: 2,
      capabilities: caps,
    });

    expect(actions).toEqual([
      {
        label: "Open end-of-campaign NPS when ready",
        to: "/admin/campaigns/c-u24#nps",
      },
    ]);
  });

  it("returns no actions when roster, coaches, and NPS are settled", () => {
    const actions = buildCampaignAdminActions({
      campaignId: "c-sea",
      summary: { rosterCount: 3, openNpsSurveyCount: 1 },
      coachCount: 2,
      capabilities: { ...caps, coachNps: false, liveMatrix: false, legacyCoachEvaluation: true },
    });

    expect(actions).toEqual([]);
  });
});
