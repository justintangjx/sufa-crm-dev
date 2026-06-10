// Deterministic assistant. These functions prove the data flows; an LLM may later
// replace ONLY the text-generation parts, never permission checks or DB queries.

import type { Athlete, ProfileStatus, Recommendation } from "../types/database";
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

const STRENGTH_KEYWORDS = [
  "strong",
  "great",
  "good",
  "excellent",
  "solid",
  "reliable",
  "fast",
  "accurate",
  "confident",
  "calm",
];

const DEVELOPMENT_KEYWORDS = [
  "needs",
  "improve",
  "work on",
  "weak",
  "struggle",
  "inconsistent",
  "lacks",
  "should",
  "more",
];

function splitSentences(notes: string): string[] {
  return notes
    .split(/[\n.!;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function detectRecommendation(text: string): Recommendation | null {
  if (includesAny(text, ["not select", "not selected", "cut", "drop", "not ready"])) {
    return "not_selected";
  }
  if (includesAny(text, ["reserve", "backup", "bench"])) {
    return "reserve";
  }
  if (includesAny(text, ["develop", "potential", "project", "young", "raw"])) {
    return "development";
  }
  if (includesAny(text, ["select", "starter", "lock", "definite"])) {
    return "selected";
  }
  return null;
}

// Convert rough free-text notes into a structured DRAFT evaluation. The coach must
// review and confirm before anything is saved (see guardrails in the spec).
export function structureCoachNotes(notes: string): StructuredEvaluationDraft {
  const sentences = splitSentences(notes);
  const strengths: string[] = [];
  const development: string[] = [];
  const overall: string[] = [];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (includesAny(lower, DEVELOPMENT_KEYWORDS)) {
      development.push(sentence);
    } else if (includesAny(lower, STRENGTH_KEYWORDS)) {
      strengths.push(sentence);
    } else {
      overall.push(sentence);
    }
  }

  return {
    strengths: strengths.join(". "),
    developmentAreas: development.join(". "),
    overallNotes: overall.join(". ") || notes.trim(),
    recommendation: detectRecommendation(notes.toLowerCase()),
  };
}
