import type { CampaignNpsSurvey, NpsSurveyStatus, NpsSurveyWindow } from "../types/database";
import type { NpsReport } from "../data/types";

export type NpsOpsWindow = "mid_season" | "post_season";

export const U24_PILOT_NPS_POLICY = {
  primaryWindow: "post_season" as const satisfies NpsOpsWindow,
  allowMidControls: true,
  replaceGoogleForms: true,
};

export type NpsAggregateSnapshot = {
  campaignId: string;
  surveys: {
    id: string;
    window: NpsSurveyWindow;
    status: NpsSurveyStatus;
    title: string;
  }[];
  coachRows: NpsReport["coachRows"];
  playerRows: NpsReport["playerRows"];
  completion: {
    window: NpsSurveyWindow;
    coachSubjects: number;
    playerSubjects: number;
    coachRowResponses: number;
    playerRowResponses: number;
  }[];
  thresholds: {
    minPlayerRaterCount: number;
    minCoachRaterCount: number;
  };
};

export function buildNpsAggregateSnapshot(
  campaignId: string,
  report: NpsReport,
  surveys: CampaignNpsSurvey[],
): NpsAggregateSnapshot {
  const ordered = [...surveys].toSorted((a, b) => a.survey_window.localeCompare(b.survey_window));
  const completion = ordered.map((survey) => {
    const coachRows = report.coachRows.filter((row) => row.surveyId === survey.id);
    const playerRows = report.playerRows.filter((row) => row.surveyId === survey.id);
    return {
      window: survey.survey_window,
      coachSubjects: coachRows.length,
      playerSubjects: playerRows.length,
      coachRowResponses: coachRows.reduce((total, row) => total + row.responseCount, 0),
      playerRowResponses: playerRows.reduce((total, row) => total + row.responseCount, 0),
    };
  });
  const primary = ordered.find((survey) => survey.survey_window === "post_season") ?? ordered[0];
  return {
    campaignId,
    surveys: ordered.map((survey) => ({
      id: survey.id,
      window: survey.survey_window,
      status: survey.status,
      title: survey.title,
    })),
    coachRows: report.coachRows,
    playerRows: report.playerRows,
    completion,
    thresholds: {
      minPlayerRaterCount: primary?.min_player_rater_count ?? 3,
      minCoachRaterCount: primary?.min_coach_rater_count ?? 2,
    },
  };
}
