import { describe, expect, it } from "vitest";
import {
  buildCampaignRosterRows,
  buildNpsAdminReadiness,
  coachProvisioningMode,
  formatNpsCloseConfirm,
  formatNpsOpenConfirm,
  humanizeRosterImportAction,
  npsPrerequisitesMet,
} from "./adminCampaignOps";
import { buildNpsAggregateSnapshot } from "./npsAggregateSnapshot";

describe("adminCampaignOps", () => {
  it("humanizes roster import actions for admins", () => {
    expect(humanizeRosterImportAction("create_and_assign")).toBe("Create player");
    expect(humanizeRosterImportAction("assign_only")).toBe("Add to campaign");
    expect(humanizeRosterImportAction("skip")).toBe("Already on roster");
  });

  it("builds roster rows from campaign membership", () => {
    const rows = buildCampaignRosterRows(
      [
        {
          athleteId: "a-ben",
          name: "Ben",
          missingFields: [],
          passportStatus: "ok",
          profileStatus: "approved",
          memberStatus: "registered",
          hasEvaluation: false,
          evaluationStatus: null,
        },
      ],
      [
        {
          id: "a-ben",
          email: "ben@sufa.test",
        } as never,
      ],
    );
    expect(rows).toEqual([{ athleteId: "a-ben", name: "Ben", email: "ben@sufa.test" }]);
  });

  it("selects coach provisioning mode by backend", () => {
    expect(coachProvisioningMode(true)).toBe("crm_create");
    expect(coachProvisioningMode(false)).toBe("auth_first");
  });

  it("warns when NPS prerequisites are missing", () => {
    const readiness = buildNpsAdminReadiness({
      rosterCount: 0,
      coachCount: 2,
      npsEnabled: true,
      report: { coachRows: [], playerRows: [] },
      surveys: [],
    });
    expect(npsPrerequisitesMet(readiness)).toBe(false);
    expect(readiness.openEffectCopy).toContain("Add players and assign coaches");
  });

  it("formats open and close confirmations", () => {
    const readiness = buildNpsAdminReadiness({
      rosterCount: 22,
      coachCount: 2,
      npsEnabled: true,
      report: { coachRows: [], playerRows: [] },
      surveys: [
        {
          id: "nps-post",
          survey_window: "post_season",
          status: "open",
          title: "Post",
          campaign_id: "c-u24",
          opens_at: null,
          closes_at: null,
          min_player_rater_count: 3,
          min_coach_rater_count: 2,
          created_by: "p-admin",
          created_at: "",
          updated_at: "",
        },
      ],
    });
    const snapshot = buildNpsAggregateSnapshot("c-u24", { coachRows: [], playerRows: [] }, [
      {
        id: "nps-post",
        survey_window: "post_season",
        status: "open",
        title: "Post",
        campaign_id: "c-u24",
        opens_at: null,
        closes_at: null,
        min_player_rater_count: 3,
        min_coach_rater_count: 2,
        created_by: "p-admin",
        created_at: "",
        updated_at: "",
      },
    ]);
    expect(formatNpsOpenConfirm(readiness)).toContain("22 players");
    expect(formatNpsCloseConfirm(readiness, snapshot)).toContain("can no longer submit");
  });
});
