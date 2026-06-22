import { describe, expect, it } from "vitest";
import { makeAthlete } from "../test/factories";
import {
  buildCampaignReadinessRow,
  draftPlayerReminder,
  getMissingAthleteFields,
  structureCoachNotes,
  summarizeCampaignReadiness,
  summarizePlayerReadiness,
} from "./assistant";

describe("summarizePlayerReadiness", () => {
  it("confirms completion for a complete athlete", () => {
    expect(summarizePlayerReadiness(makeAthlete())).toContain("complete");
  });

  it("lists missing items for an incomplete athlete", () => {
    const summary = summarizePlayerReadiness(makeAthlete({ phone: null }));
    expect(summary).toContain("1 required item");
    expect(summary).toContain("Phone number");
  });
});

describe("summarizeCampaignReadiness", () => {
  it("handles an empty campaign", () => {
    expect(summarizeCampaignReadiness([])).toContain("No players");
  });

  it("counts complete vs incomplete and flags passports", () => {
    const ready = buildCampaignReadinessRow(makeAthlete(), "Ready Player");
    const incomplete = buildCampaignReadinessRow(
      makeAthlete({ phone: null, passport_expiry: "2020-01-01" }),
      "Incomplete Player",
    );
    const summary = summarizeCampaignReadiness([ready, incomplete]);
    expect(summary).toContain("1 of 2 players");
    expect(summary).toContain("passport");
  });
});

describe("draftPlayerReminder", () => {
  it("lists outstanding fields and includes campaign + due date", () => {
    const text = draftPlayerReminder({
      playerName: "Jordan",
      missingFields: getMissingAthleteFields(makeAthlete({ passport_expiry: null })),
      campaignName: "SEA Games 2026",
      dueDate: "2026-05-01",
    });
    expect(text).toContain("Hi Jordan,");
    expect(text).toContain("SEA Games 2026");
    expect(text).toContain("- Passport expiry");
    expect(text).toContain("2026-05-01");
  });

  it("confirms completeness when nothing is missing", () => {
    const text = draftPlayerReminder({ playerName: "Jordan", missingFields: [] });
    expect(text).toContain("complete");
  });
});

describe("structureCoachNotes", () => {
  it("buckets strengths and development areas", () => {
    const draft = structureCoachNotes(
      "Strong hucks and accurate throws. Needs to work on defense. Calm under pressure.",
    );
    expect(draft.strengths.toLowerCase()).toContain("strong hucks");
    expect(draft.developmentAreas.toLowerCase()).toContain("defense");
  });

  it("does not infer a not-selected recommendation", () => {
    const draft = structureCoachNotes("Good athlete but not ready to select this cycle.");
    expect(draft.recommendation).toBeNull();
  });

  it("does not infer a selected recommendation", () => {
    const draft = structureCoachNotes("Reliable starter, lock them in to select.");
    expect(draft.recommendation).toBeNull();
  });

  it("falls back to needs_review and keeps overall notes", () => {
    const draft = structureCoachNotes("Played midfield the whole tournament.");
    expect(draft.recommendation).toBeNull();
    expect(draft.overallNotes).toContain("midfield");
  });
});
