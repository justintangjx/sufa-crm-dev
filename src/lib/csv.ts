import type { Athlete } from "../types/database";
import { getPassportStatus } from "./passport";
import { getProfileCompletion } from "./profile";

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

// Quote a CSV cell only when it contains a comma, quote, or newline.
export function escapeCsvCell(input: string | number | boolean | null | undefined): string {
  if (input === null || input === undefined) {
    return "";
  }
  const text = String(input);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(","));
  return [header, ...body].join("\n");
}

export function athletesToCsv(athletes: readonly Athlete[]): string {
  return toCsv(athletes, [
    { header: "Legal name", value: (a) => a.legal_name },
    { header: "Preferred name", value: (a) => a.preferred_name },
    { header: "Phone", value: (a) => a.phone },
    { header: "Date of birth", value: (a) => a.date_of_birth },
    { header: "Passport expiry", value: (a) => a.passport_expiry },
    { header: "Passport status", value: (a) => getPassportStatus(a.passport_expiry) },
    { header: "Data sharing consent", value: (a) => a.data_sharing_consent },
    { header: "Media consent", value: (a) => a.media_consent },
    { header: "Profile status", value: (a) => a.profile_status },
    { header: "Completion %", value: (a) => getProfileCompletion(a) },
  ]);
}
