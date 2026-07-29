import { describe, expect, it } from "vitest";
import { campaignCapabilities, hasAnyCampaignFeature } from "./campaignCapabilities";
import { isU24Campaign, orderCampaignsForMvp, pickPrimaryCampaign } from "./campaignUi";
import type { Campaign } from "../types/database";

const u24Campaign: Campaign = {
  id: "c-u24",
  name: "U24 Worlds 2026",
  team: "Singapore U24",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  location: "Perth",
  status: "active",
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const seaCampaign: Campaign = {
  ...u24Campaign,
  id: "c-sea",
  name: "SEA Games 2026",
  team: "Singapore Open",
};

describe("campaignUi", () => {
  it("detects U24 campaigns by id, name, or team", () => {
    expect(isU24Campaign(u24Campaign)).toBe(true);
    expect(isU24Campaign({ ...seaCampaign, name: "Regional U24 tune-up" })).toBe(true);
    expect(isU24Campaign(seaCampaign)).toBe(false);
  });

  it("prefers active U24 as the primary campaign", () => {
    expect(pickPrimaryCampaign([seaCampaign, u24Campaign])?.id).toBe("c-u24");
  });

  it("orders U24 campaigns ahead of legacy campaigns", () => {
    expect(orderCampaignsForMvp([seaCampaign, u24Campaign]).map((campaign) => campaign.id)).toEqual(
      ["c-u24", "c-sea"],
    );
  });
});

describe("campaignCapabilities", () => {
  it("enables U24 matrix and questionnaire for U24 campaigns in mock mode", () => {
    const caps = campaignCapabilities(u24Campaign);
    expect(caps.liveMatrix).toBe(true);
    expect(caps.endOfCampaignSurvey).toBe(true);
    expect(caps.coachNps).toBe(false);
    expect(caps.growthMatrix).toBe(false);
    expect(caps.legacyCoachEvaluation).toBe(false);
  });

  it("enables questionnaire for the prod smoke-test campaign", () => {
    const caps = campaignCapabilities({
      ...u24Campaign,
      id: "c-survey-test",
      name: "Questionnaire smoke test",
      team: "Test",
    });
    expect(caps.endOfCampaignSurvey).toBe(true);
    expect(caps.liveMatrix).toBe(false);
  });

  it("withholds U24 matrix and NPS for non-U24 campaigns", () => {
    const caps = campaignCapabilities(seaCampaign);
    expect(caps.liveMatrix).toBe(false);
    expect(caps.coachNps).toBe(false);
    expect(caps.growthMatrix).toBe(true);
    expect(caps.legacyCoachEvaluation).toBe(true);
  });

  it("reports whether any optional campaign feature is enabled", () => {
    expect(hasAnyCampaignFeature()).toBe(true);
  });
});
