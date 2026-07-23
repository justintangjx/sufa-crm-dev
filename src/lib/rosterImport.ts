import { normalizeEmail } from "../data/payloads/athlete";
import type { CreateAthleteInput } from "../data/types";
import type { Athlete, CampaignMemberStatus, Gender } from "../types/database";

export const ROSTER_CSV_TEMPLATE = [
  "email,legal_name,preferred_name,gender,date_of_birth,positions,member_status",
  'player@example.com,Alex Tan,Alex,female,2004-01-15,"handler, cutter",invited',
].join("\n");

export type RosterImportSourceRow = {
  rowNumber: number;
  email: string;
  legalName: string;
  preferredName?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  positions?: string[];
  memberStatus: CampaignMemberStatus;
  fieldErrors: string[];
};

export type RosterImportRowAction =
  | {
      kind: "create_and_assign";
      rowNumber: number;
      email: string;
      fields: CreateAthleteInput;
      memberStatus: CampaignMemberStatus;
    }
  | {
      kind: "assign_only";
      rowNumber: number;
      email: string;
      athleteId: string;
      memberStatus: CampaignMemberStatus;
    }
  | {
      kind: "skip";
      rowNumber: number;
      email: string;
      reason: "already_member";
    }
  | {
      kind: "error";
      rowNumber: number;
      email: string | null;
      reason: string;
    };

export type RosterImportPlan = {
  campaignId: string;
  rows: RosterImportRowAction[];
  counts: {
    create: number;
    assign: number;
    skip: number;
    error: number;
  };
};

export type RosterImportCommitResult = {
  plan: RosterImportPlan;
  createdAthletes: number;
  assignedMembers: number;
  skipped: number;
  errors: number;
};

const MEMBER_STATUSES = new Set<CampaignMemberStatus>([
  "invited",
  "registered",
  "selected",
  "reserve",
  "withdrawn",
]);

const GENDERS = new Set<Gender>(["female", "male", "other"]);

const HEADER_ALIASES: Record<
  string,
  keyof Omit<RosterImportSourceRow, "rowNumber" | "fieldErrors">
> = {
  email: "email",
  "login email": "email",
  legal_name: "legalName",
  "legal name": "legalName",
  name: "legalName",
  preferred_name: "preferredName",
  "preferred name": "preferredName",
  gender: "gender",
  date_of_birth: "dateOfBirth",
  "date of birth": "dateOfBirth",
  dob: "dateOfBirth",
  positions: "positions",
  position: "positions",
  member_status: "memberStatus",
  "member status": "memberStatus",
  status: "memberStatus",
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parsePositions(raw: string): string[] {
  return raw
    .split(new RegExp("[,|;]"))
    .map((position) => position.trim())
    .filter(Boolean);
}

export function parseRosterCsv(text: string): {
  rows: RosterImportSourceRow[];
  headerError: string | null;
} {
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], headerError: "CSV is empty." };
  }

  const headerCells = splitCsvLine(lines[0] ?? "").map((cell) => cell.trim().toLowerCase());
  const columnIndex = new Map<
    keyof Omit<RosterImportSourceRow, "rowNumber" | "fieldErrors">,
    number
  >();
  headerCells.forEach((header, index) => {
    const field = HEADER_ALIASES[header];
    if (field && !columnIndex.has(field)) {
      columnIndex.set(field, index);
    }
  });

  if (!columnIndex.has("email") || !columnIndex.has("legalName")) {
    return {
      rows: [],
      headerError: "CSV must include email and legal_name (or Legal name) columns.",
    };
  }

  const rows: RosterImportSourceRow[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitCsvLine(lines[lineIndex] ?? "");
    const rowNumber = lineIndex + 1;
    const read = (field: keyof Omit<RosterImportSourceRow, "rowNumber" | "fieldErrors">) => {
      const index = columnIndex.get(field);
      return index === undefined ? "" : (cells[index] ?? "").trim();
    };

    const fieldErrors: string[] = [];
    const emailRaw = read("email");
    const legalName = read("legalName");
    const preferredName = read("preferredName") || null;
    const genderRaw = read("gender");
    const dateOfBirth = read("dateOfBirth") || null;
    const positionsRaw = read("positions");
    const memberStatusRaw = read("memberStatus");

    let gender: Gender | null = null;
    if (genderRaw) {
      const normalizedGender = genderRaw.toLowerCase();
      if (GENDERS.has(normalizedGender as Gender)) {
        gender = normalizedGender as Gender;
      } else {
        fieldErrors.push(`invalid gender "${genderRaw}"`);
      }
    }

    let memberStatus: CampaignMemberStatus = "invited";
    if (memberStatusRaw) {
      const normalizedStatus = memberStatusRaw.toLowerCase();
      if (MEMBER_STATUSES.has(normalizedStatus as CampaignMemberStatus)) {
        memberStatus = normalizedStatus as CampaignMemberStatus;
      } else {
        fieldErrors.push(`invalid member_status "${memberStatusRaw}"`);
      }
    }

    rows.push({
      rowNumber,
      email: emailRaw,
      legalName,
      preferredName,
      gender,
      dateOfBirth,
      positions: positionsRaw ? parsePositions(positionsRaw) : [],
      memberStatus,
      fieldErrors,
    });
  }

  return { rows, headerError: null };
}

export function planRosterImport(input: {
  campaignId: string;
  rows: readonly RosterImportSourceRow[];
  athletes: readonly Athlete[];
  memberAthleteIds: ReadonlySet<string>;
}): RosterImportPlan {
  const athletesByEmail = new Map<string, Athlete>();
  for (const athlete of input.athletes) {
    if (!athlete.email) {
      continue;
    }
    athletesByEmail.set(normalizeEmail(athlete.email), athlete);
  }

  const seenEmails = new Map<string, number>();
  const actions: RosterImportRowAction[] = [];

  for (const row of input.rows) {
    if (row.fieldErrors.length > 0) {
      actions.push({
        kind: "error",
        rowNumber: row.rowNumber,
        email: row.email || null,
        reason: row.fieldErrors.join("; "),
      });
      continue;
    }

    if (!row.email.trim()) {
      actions.push({
        kind: "error",
        rowNumber: row.rowNumber,
        email: null,
        reason: "email is required",
      });
      continue;
    }

    const email = normalizeEmail(row.email);
    if (!email.includes("@")) {
      actions.push({
        kind: "error",
        rowNumber: row.rowNumber,
        email: row.email,
        reason: "email looks invalid",
      });
      continue;
    }

    const priorRow = seenEmails.get(email);
    if (priorRow !== undefined) {
      actions.push({
        kind: "error",
        rowNumber: row.rowNumber,
        email,
        reason: `duplicate email in file (also on row ${priorRow})`,
      });
      continue;
    }
    seenEmails.set(email, row.rowNumber);

    const existing = athletesByEmail.get(email);
    if (existing) {
      if (input.memberAthleteIds.has(existing.id)) {
        actions.push({
          kind: "skip",
          rowNumber: row.rowNumber,
          email,
          reason: "already_member",
        });
        continue;
      }
      actions.push({
        kind: "assign_only",
        rowNumber: row.rowNumber,
        email,
        athleteId: existing.id,
        memberStatus: row.memberStatus,
      });
      continue;
    }

    if (!row.legalName.trim()) {
      actions.push({
        kind: "error",
        rowNumber: row.rowNumber,
        email,
        reason: "legal_name is required for new players",
      });
      continue;
    }

    actions.push({
      kind: "create_and_assign",
      rowNumber: row.rowNumber,
      email,
      fields: {
        legalName: row.legalName.trim(),
        preferredName: row.preferredName?.trim() || null,
        email,
        gender: row.gender ?? null,
        dateOfBirth: row.dateOfBirth || null,
        positions: row.positions ?? [],
      },
      memberStatus: row.memberStatus,
    });
  }

  const counts = { create: 0, assign: 0, skip: 0, error: 0 };
  for (const action of actions) {
    if (action.kind === "create_and_assign") {
      counts.create += 1;
    } else if (action.kind === "assign_only") {
      counts.assign += 1;
    } else if (action.kind === "skip") {
      counts.skip += 1;
    } else {
      counts.error += 1;
    }
  }

  return {
    campaignId: input.campaignId,
    rows: actions,
    counts,
  };
}
