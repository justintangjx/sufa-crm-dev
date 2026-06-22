// Deterministic assistant. These functions prove the data flows; an LLM may later
// replace ONLY the text-generation parts, never permission checks or DB queries.

import type { Athlete, ProfileStatus, Recommendation } from "../types/database";
import { coachNoteDraftToFormText, createDeterministicCoachNoteDraft } from "./coachNotes";
import { getPassportStatus, passportStatusLabel, type PassportStatus } from "./passport";
import { getMissingAthleteFields, type MissingField } from "./profile";

export { getMissingAthleteFields };
export type { MissingField };

export interface CampaignReadinessRow {
  athleteId: string;
  name: string;
  missingFields: MissingField[];
  passportStatus: PassportStatus;
  profileStatus: ProfileStatus;
}

export interface ReminderInput {
  playerName: string;
  missingFields: MissingField[];
  campaignName?: string;
  dueDate?: string;
}

export interface StructuredEvaluationDraft {
  strengths: string;
  developmentAreas: string;
  overallNotes: string;
  recommendation: Recommendation | null;
}

export function buildCampaignReadinessRow(
  athlete: Athlete,
  displayName: string,
): CampaignReadinessRow {
  return {
    athleteId: athlete.id,
    name: displayName,
    missingFields: getMissingAthleteFields(athlete),
    passportStatus: getPassportStatus(athlete.passport_expiry),
    profileStatus: athlete.profile_status,
  };
}

export function summarizePlayerReadiness(athlete: Athlete): string {
  const missing = getMissingAthleteFields(athlete);
  const passport = getPassportStatus(athlete.passport_expiry);

  if (missing.length === 0) {
    const passportNote =
      passport === "ok" ? "" : ` Note: ${passportStatusLabel(passport).toLowerCase()}.`;
    return `Your profile is complete.${passportNote}`;
  }

  const items = missing.map((m) => m.label).join(", ");
  return `You're missing ${missing.length} required ${missing.length === 1 ? "item" : "items"}: ${items}.`;
}

export function summarizeCampaignReadiness(rows: readonly CampaignReadinessRow[]): string {
  if (rows.length === 0) {
    return "No players in this campaign yet.";
  }

  const incomplete = rows.filter((r) => r.missingFields.length > 0);
  const passportFlags = rows.filter(
    (r) => r.passportStatus === "expired" || r.passportStatus === "expiring_soon",
  );
  const ready = rows.length - incomplete.length;

  const parts = [
    `${ready} of ${rows.length} players have complete profiles.`,
    incomplete.length > 0
      ? `${incomplete.length} still ${incomplete.length === 1 ? "has" : "have"} missing details.`
      : "All required details are in.",
  ];

  if (passportFlags.length > 0) {
    parts.push(
      `${passportFlags.length} ${passportFlags.length === 1 ? "player needs" : "players need"} passport attention.`,
    );
  }

  return parts.join(" ");
}

export function draftPlayerReminder(input: ReminderInput): string {
  const greeting = `Hi ${input.playerName},`;
  const context = input.campaignName
    ? `Ahead of ${input.campaignName}, please complete your SUFA profile.`
    : "Please complete your SUFA profile so your record is up to date.";

  const lines: string[] = [greeting, "", context];

  if (input.missingFields.length > 0) {
    lines.push("", "Still outstanding:");
    for (const field of input.missingFields) {
      lines.push(`- ${field.label}`);
    }
  } else {
    lines.push("", "Everything looks complete - thank you!");
  }

  if (input.dueDate) {
    lines.push("", `Please complete this by ${input.dueDate}.`);
  }

  lines.push("", "Thank you,", "SUFA Admin");
  return lines.join("\n");
}

// Convert rough free-text notes into a structured DRAFT evaluation. The coach must
// review and confirm before anything is saved (see guardrails in the spec).
export function structureCoachNotes(notes: string): StructuredEvaluationDraft {
  const text = coachNoteDraftToFormText(createDeterministicCoachNoteDraft(notes));
  return {
    strengths: text.strengths,
    developmentAreas: text.developmentAreas,
    overallNotes: text.overallNotes,
    recommendation: null,
  };
}
