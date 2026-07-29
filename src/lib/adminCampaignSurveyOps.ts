import type { SurveyAudience, SurveyInstanceStatus, SurveyTemplateStatus } from "../types/database";
import { appUrl } from "./env";

export type SurveyAdminReadiness = {
  rosterCount: number;
  coachCount: number;
  playerTemplateStatus: SurveyTemplateStatus | "missing";
  coachTemplateStatus: SurveyTemplateStatus | "missing";
  playerInstanceStatus: SurveyInstanceStatus | "none";
  coachInstanceStatus: SurveyInstanceStatus | "none";
  playerSubmitted: number;
  playerTotal: number;
  coachSubmitted: number;
  coachTotal: number;
};

export function surveyPrerequisitesMet(
  readiness: SurveyAdminReadiness,
  audience: SurveyAudience,
): boolean {
  if (audience === "player") {
    return readiness.rosterCount > 0;
  }
  return readiness.coachCount > 0;
}

export function formatSurveyOpenConfirm(input: {
  campaignName: string;
  audience: SurveyAudience;
  count: number;
}): string {
  const role = input.audience === "player" ? "player" : "coach";
  const plural = input.count === 1 ? "" : "s";
  const coachNote =
    input.audience === "coach"
      ? "\n\nCoaches do not see questions 1–8 (coach leadership items)."
      : "";
  return [
    `Open the ${role} questionnaire?`,
    `Opens the in-app survey for ${input.count} ${role}${plural}. They complete it after signing in at ${appUrl}.`,
    "Send the chase message if they do not use the CRM daily.",
    coachNote,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function formatSurveyCloseConfirm(input: {
  audience: SurveyAudience;
  submitted: number;
  total: number;
}): string {
  const role = input.audience === "player" ? "player" : "coach";
  return [
    `Close the ${role} questionnaire?`,
    `${input.submitted} of ${input.total} submitted. No further submissions after closing.`,
  ].join("\n\n");
}

export function formatSurveyChaseMessage(input: {
  campaignName: string;
  campaignId: string;
  audience: SurveyAudience;
  questionCount: number;
  deadline?: string | null;
}): string {
  const path =
    input.audience === "player"
      ? `${appUrl}/player/campaigns/${input.campaignId}#survey`
      : `${appUrl}/coach/campaigns/${input.campaignId}#survey`;
  const deadline = input.deadline?.trim() || "TBC";
  if (input.audience === "player") {
    return [
      `Hi — please complete the ${input.campaignName} end-of-tournament questionnaire in the SUFA CRM (about 15 min).`,
      "",
      `1. Sign in with your player email: ${appUrl}`,
      `2. Open campaign "${input.campaignName}"`,
      `3. Complete the questionnaire (${input.questionCount} questions; save as you go)`,
      "",
      `Or go directly: ${path}`,
      "",
      `Deadline: ${deadline}`,
      "",
      "Reply here if you cannot access your account.",
    ].join("\n");
  }
  return [
    `Hi — please complete the coach end-of-tournament questionnaire for ${input.campaignName} in the SUFA CRM.`,
    "",
    `1. Sign in: ${appUrl}`,
    `2. Open campaign "${input.campaignName}"`,
    `3. Complete the questionnaire (${input.questionCount} questions)`,
    "",
    `Or go directly: ${path}`,
    "",
    `Deadline: ${deadline}`,
  ].join("\n");
}

export function surveyCompletionLabel(
  submitted: number,
  total: number,
  inProgress: number,
): string {
  if (total === 0) {
    return "No assignments yet";
  }
  const base = `${submitted} of ${total} submitted`;
  return inProgress > 0 ? `${base} · ${inProgress} in progress` : base;
}
