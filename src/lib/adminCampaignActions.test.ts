import { describe, expect, it } from "vitest";
import { buildCampaignAdminActions } from "./adminCampaignActions";

const questionnaireCaps = {
  liveMatrix: true,
  endOfCampaignSurvey: true,
  coachNps: false,
  growthMatrix: false,
  legacyCoachEvaluation: false,
};

const peerNpsCaps = {
  liveMatrix: true,
  endOfCampaignSurvey: false,
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
      capabilities: questionnaireCaps,
    });

    expect(actions.map((action) => action.label)).toEqual([
      "Import roster CSV or add players on the campaign page",
      "Assign coaches for this campaign",
    ]);
  });

  it("nudges questionnaire CSV when roster and coaches are ready", () => {
    const actions = buildCampaignAdminActions({
      campaignId: "c-u24",
      summary: { rosterCount: 22, openNpsSurveyCount: 0 },
      coachCount: 2,
      capabilities: questionnaireCaps,
    });

    expect(actions).toEqual([
      {
        label: "Set up end-of-campaign questionnaire (CSV)",
        to: "/admin/campaigns/c-u24#survey",
      },
    ]);
  });

  it("surfaces open peer NPS only when coachNps capability is on", () => {
    const actions = buildCampaignAdminActions({
      campaignId: "c-u24",
      summary: { rosterCount: 22, openNpsSurveyCount: 1 },
      coachCount: 2,
      capabilities: peerNpsCaps,
    });

    expect(actions).toEqual([
      {
        label: "Review the open NPS survey",
        to: "/admin/campaigns/c-u24#nps",
      },
    ]);
  });

  it("returns no actions when roster, coaches, and NPS are settled", () => {
    const actions = buildCampaignAdminActions({
      campaignId: "c-sea",
      summary: { rosterCount: 3, openNpsSurveyCount: 1 },
      coachCount: 2,
      capabilities: {
        ...peerNpsCaps,
        coachNps: false,
        liveMatrix: false,
        legacyCoachEvaluation: true,
        endOfCampaignSurvey: false,
      },
    });

    expect(actions).toEqual([]);
  });
});
