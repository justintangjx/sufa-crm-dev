import { describe, expect, it } from "vitest";
import { buildNpsAggregateSnapshot } from "./npsAggregateSnapshot";
import type { CampaignNpsSurvey } from "../types/database";
import type { NpsReport } from "../data/types";

const survey = (
  partial: Partial<CampaignNpsSurvey> & Pick<CampaignNpsSurvey, "id" | "survey_window" | "status">,
): CampaignNpsSurvey => ({
  campaign_id: "c-u24",
  title: "Survey",
  opens_at: null,
  closes_at: null,
  min_player_rater_count: 3,
  min_coach_rater_count: 2,
  created_by: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...partial,
});

describe("buildNpsAggregateSnapshot", () => {
  it("aggregates completion per survey window", () => {
    const surveys = [
      survey({ id: "mid", survey_window: "mid_season", status: "closed", title: "Mid" }),
      survey({ id: "post", survey_window: "post_season", status: "open", title: "Post" }),
    ];
    const report: NpsReport = {
      coachRows: [
        {
          surveyId: "post",
          surveyTitle: "Post",
          surveyWindow: "post_season",
          coachProfileId: "p-coach",
          coachName: "Coach",
          responseCount: 2,
          averageScore: 8,
          nps: 50,
          withheld: false,
          promoterCount: 1,
          passiveCount: 1,
          detractorCount: 0,
        },
      ],
      playerRows: [
        {
          surveyId: "post",
          surveyTitle: "Post",
          surveyWindow: "post_season",
          athleteId: "a-1",
          athleteName: "Alice",
          responseCount: 1,
          averageScore: 9,
          nps: 100,
          withheld: true,
          promoterCount: 1,
          passiveCount: 0,
          detractorCount: 0,
        },
      ],
    };
    const snap = buildNpsAggregateSnapshot("c-u24", report, surveys);
    expect(snap.surveys).toHaveLength(2);
    expect(snap.completion.find((row) => row.window === "post_season")).toEqual({
      window: "post_season",
      coachSubjects: 1,
      playerSubjects: 1,
      coachRowResponses: 2,
      playerRowResponses: 1,
    });
    expect(snap.thresholds.minPlayerRaterCount).toBe(3);
  });
});
