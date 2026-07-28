import type { CampaignReadinessEntry } from "../data/types";
import type { Athlete, CampaignNpsSurvey } from "../types/database";
import type { RosterImportRowAction } from "./rosterImport";
import {
  buildNpsAggregateSnapshot,
  type NpsAggregateSnapshot,
  type NpsOpsWindow,
  U24_PILOT_NPS_POLICY,
} from "./npsAggregateSnapshot";
import type { NpsReport } from "../data/types";

/** How coach accounts are provisioned in the current backend. */
export type CoachProvisioningMode = "crm_create" | "auth_first";

export function coachProvisioningMode(useMockBackend: boolean): CoachProvisioningMode {
  return useMockBackend ? "crm_create" : "auth_first";
}

export function humanizeRosterImportAction(kind: RosterImportRowAction["kind"]): string {
  switch (kind) {
    case "create_and_assign":
      return "Create player";
    case "assign_only":
      return "Add to campaign";
    case "skip":
      return "Already on roster";
    case "error":
      return "Fix row";
    default:
      return kind;
  }
}

export interface CampaignRosterRow {
  athleteId: string;
  name: string;
  email: string;
}

export function buildCampaignRosterRows(
  readiness: readonly CampaignReadinessEntry[],
  athletes: readonly Athlete[],
): CampaignRosterRow[] {
  const athleteById = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  return readiness.map((row) => {
    const athlete = athleteById.get(row.athleteId);
    return {
      athleteId: row.athleteId,
      name: row.name,
      email: athlete?.email ?? "—",
    };
  });
}

export type NpsSurveyAdminStatus = "not_available" | "closed" | "open";

export interface NpsAdminReadiness {
  rosterCount: number;
  coachCount: number;
  surveyStatus: NpsSurveyAdminStatus;
  primaryWindow: NpsOpsWindow;
  stripLabel: string;
  openEffectCopy: string;
  responseProgressLabel: string | null;
}

export interface BuildNpsAdminReadinessInput {
  rosterCount: number;
  coachCount: number;
  npsEnabled: boolean;
  report: NpsReport;
  surveys: readonly CampaignNpsSurvey[];
}

export function buildNpsAdminReadiness(input: BuildNpsAdminReadinessInput): NpsAdminReadiness {
  const snapshot = buildNpsAggregateSnapshot("campaign", input.report, [...input.surveys]);
  const primaryWindow = U24_PILOT_NPS_POLICY.primaryWindow;
  const primarySurvey = input.surveys.find((survey) => survey.survey_window === primaryWindow);
  const surveyStatus: NpsSurveyAdminStatus = !input.npsEnabled
    ? "not_available"
    : primarySurvey?.status === "open"
      ? "open"
      : "closed";
  const completion = snapshot.completion.find((row) => row.window === primaryWindow);
  const responseProgressLabel =
    completion && surveyStatus === "open"
      ? `${completion.coachRowResponses} player→coach responses · ${completion.playerRowResponses} coach→player responses`
      : null;

  const surveyWord = surveyStatus === "open" ? "open" : "closed";
  const stripLabel = `Roster: ${input.rosterCount} · Coaches: ${input.coachCount} · End survey: ${surveyWord}`;

  const openEffectCopy =
    input.rosterCount === 0 || input.coachCount === 0
      ? "Add players and assign coaches before opening — raters need both on the campaign."
      : `Opens in-app NPS for ${input.rosterCount} player${input.rosterCount === 1 ? "" : "s"} and ${input.coachCount} coach${input.coachCount === 1 ? "" : "es"} on their next login. Telegram delivery is not wired yet.`;

  return {
    rosterCount: input.rosterCount,
    coachCount: input.coachCount,
    surveyStatus,
    primaryWindow,
    stripLabel,
    openEffectCopy,
    responseProgressLabel,
  };
}

export function formatNpsOpenConfirm(readiness: NpsAdminReadiness): string {
  return ["Open the end-of-campaign NPS survey?", readiness.openEffectCopy].join("\n\n");
}

export function formatNpsCloseConfirm(
  readiness: NpsAdminReadiness,
  snapshot: NpsAggregateSnapshot,
): string {
  const completion = snapshot.completion.find((row) => row.window === readiness.primaryWindow);
  const responseLine = completion
    ? `Responses so far: ${completion.coachRowResponses} player→coach · ${completion.playerRowResponses} coach→player.`
    : "No responses recorded yet.";
  return [
    "Close the end-of-campaign NPS survey?",
    responseLine,
    "Players and coaches can no longer submit.",
  ].join("\n\n");
}

export function npsPrerequisitesMet(readiness: NpsAdminReadiness): boolean {
  return readiness.rosterCount > 0 && readiness.coachCount > 0;
}
