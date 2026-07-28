import { beforeEach, describe, expect, it } from "vitest";
import { api, resetData } from "../data";
import {
  isCoachOnCampaign,
  isPlayerOnCampaign,
  shouldDropPendingNpsAssignment,
} from "./campaignMembership";
import type {
  CampaignNpsAssignment,
  CampaignNpsResponse,
  CampaignNpsSurvey,
} from "../types/database";

const TS = "2026-02-12T00:00:00.000Z";

const openSurvey: CampaignNpsSurvey = {
  id: "nps-open",
  campaign_id: "c-u24",
  title: "Open survey",
  survey_window: "post_season",
  status: "open",
  opens_at: TS,
  closes_at: null,
  min_player_rater_count: 1,
  min_coach_rater_count: 1,
  created_by: "p-admin",
  created_at: TS,
  updated_at: TS,
};

const pendingAssignment: CampaignNpsAssignment = {
  id: "npsa-pending",
  survey_id: "nps-open",
  rater_kind: "player",
  athlete_id: "a-alice",
  coach_profile_id: null,
  status: "pending",
  completed_at: null,
  created_at: TS,
};

describe("campaignMembership helpers", () => {
  it("detects campaign roster membership", () => {
    expect(
      isPlayerOnCampaign([{ campaign_id: "c-u24", athlete_id: "a-alice" }], "c-u24", "a-alice"),
    ).toBe(true);
    expect(
      isPlayerOnCampaign([{ campaign_id: "c-u24", athlete_id: "a-alice" }], "c-u24", "a-ben"),
    ).toBe(false);
  });

  it("detects coach campaign membership", () => {
    expect(
      isCoachOnCampaign(
        [{ campaign_id: "c-u24", coach_profile_id: "p-coach" }],
        "c-u24",
        "p-coach",
      ),
    ).toBe(true);
    expect(
      isCoachOnCampaign(
        [{ campaign_id: "c-u24", coach_profile_id: "p-coach" }],
        "c-u24",
        "p-coach-2",
      ),
    ).toBe(false);
  });

  it("drops only pending open-survey assignments without responses", () => {
    expect(shouldDropPendingNpsAssignment(pendingAssignment, openSurvey, [])).toBe(true);
    const response: CampaignNpsResponse = {
      id: "npsr-1",
      survey_id: "nps-open",
      assignment_id: "npsa-pending",
      rater_profile_id: "p-alice",
      subject_athlete_id: null,
      subject_coach_profile_id: "p-coach",
      score: 9,
      comment: null,
      created_at: TS,
      updated_at: TS,
    };
    expect(shouldDropPendingNpsAssignment(pendingAssignment, openSurvey, [response])).toBe(false);
    expect(
      shouldDropPendingNpsAssignment({ ...pendingAssignment, status: "completed" }, openSurvey, []),
    ).toBe(false);
  });
});

describe("mock API membership + NPS", () => {
  beforeEach(() => {
    resetData();
  });

  it("removes a player from the campaign roster", async () => {
    await api.unassignCampaignMember({ campaignId: "c-u24", athleteId: "a-alice" });
    const readiness = await api.getCampaignReadiness("c-u24");
    expect(readiness.some((row) => row.athleteId === "a-alice")).toBe(false);
  });

  it("hides NPS tasks after a player is removed from the campaign", async () => {
    await api.saveNpsSurvey({
      campaignId: "c-u24",
      title: "U24 Worlds post-season NPS",
      window: "post_season",
      status: "open",
      opensAt: new Date().toISOString(),
      createdBy: "p-admin",
    });
    expect((await api.listPlayerNpsTasks("p-alice", "c-u24")).length).toBeGreaterThan(0);
    await api.unassignCampaignMember({ campaignId: "c-u24", athleteId: "a-alice" });
    expect(await api.listPlayerNpsTasks("p-alice", "c-u24")).toEqual([]);
  });

  it("cleans up pending NPS assignments when a coach is unassigned", async () => {
    await api.saveNpsSurvey({
      campaignId: "c-u24",
      title: "U24 Worlds post-season NPS",
      window: "post_season",
      status: "open",
      opensAt: new Date().toISOString(),
      createdBy: "p-admin",
    });
    await api.unassignCampaignCoach({ campaignId: "c-u24", coachProfileId: "p-coach" });
    expect(await api.listCoachNpsTasks("p-coach", "c-u24")).toEqual([]);
  });

  it("rejects NPS submit when the rater is no longer on the campaign", async () => {
    await api.saveNpsSurvey({
      campaignId: "c-u24",
      title: "U24 Worlds post-season NPS",
      window: "post_season",
      status: "open",
      opensAt: new Date().toISOString(),
      createdBy: "p-admin",
    });
    const task = (await api.listPlayerNpsTasks("p-alice", "c-u24"))[0];
    expect(task).toBeDefined();
    await api.submitNpsResponse({
      surveyId: task!.survey.id,
      assignmentId: task!.assignmentId,
      raterProfileId: "p-alice",
      subjectCoachProfileId: "p-coach",
      score: 8,
    });
    await api.unassignCampaignMember({ campaignId: "c-u24", athleteId: "a-alice" });
    await expect(
      api.submitNpsResponse({
        surveyId: task!.survey.id,
        assignmentId: task!.assignmentId,
        raterProfileId: "p-alice",
        subjectCoachProfileId: "p-coach-2",
        score: 7,
      }),
    ).rejects.toThrow(/not on this campaign roster/i);
  });
});
