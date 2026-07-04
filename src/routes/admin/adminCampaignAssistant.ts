import type { CampaignReadinessEntry } from "../../data/types";
import { passportStatusLabel } from "../../lib/passport";

export function buildIncompletePlayersAnswer(rows: readonly CampaignReadinessEntry[]): string {
  const incomplete = rows.filter((row) => row.missingFields.length > 0);
  const passportAttention = rows.filter(
    (row) => row.passportStatus === "expired" || row.passportStatus === "expiring_soon",
  );

  const lines: string[] = [];
  if (incomplete.length === 0) {
    lines.push("All campaign players have the required profile fields.");
  } else {
    lines.push(
      `${incomplete.length} ${incomplete.length === 1 ? "player is" : "players are"} missing required profile details:`,
    );
    for (const row of incomplete) {
      lines.push(`- ${row.name}: ${row.missingFields.map((field) => field.label).join(", ")}`);
    }
  }

  if (passportAttention.length > 0) {
    lines.push("", "Passport attention:");
    for (const row of passportAttention) {
      lines.push(`- ${row.name}: ${passportStatusLabel(row.passportStatus)}`);
    }
  }

  return lines.join("\n");
}

export function buildSportSyncReadinessAnswer(rows: readonly CampaignReadinessEntry[]): string {
  if (rows.length === 0) {
    return "No campaign players are available to export yet.";
  }

  const incomplete = rows.filter((row) => row.missingFields.length > 0);
  const passportAttention = rows.filter(
    (row) => row.passportStatus === "expired" || row.passportStatus === "expiring_soon",
  );
  const pendingEvaluations = rows.filter((row) => row.evaluationStatus !== "submitted");
  const ready = rows.length - incomplete.length;

  return [
    `${ready} of ${rows.length} players are profile-ready for export.`,
    `${incomplete.length} ${incomplete.length === 1 ? "player is" : "players are"} missing required profile fields.`,
    `${passportAttention.length} ${
      passportAttention.length === 1 ? "player needs" : "players need"
    } passport attention.`,
    `${pendingEvaluations.length} coach ${
      pendingEvaluations.length === 1 ? "evaluation is" : "evaluations are"
    } still pending.`,
    "SportSync export can be drafted, but review the flagged rows before using it.",
  ].join(" ");
}
