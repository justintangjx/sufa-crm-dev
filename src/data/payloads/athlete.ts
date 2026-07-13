import type { CreateAthleteInput } from "../types";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function athleteFieldsFromCreateInput(input: CreateAthleteInput) {
  return {
    legal_name: input.legalName.trim(),
    preferred_name: input.preferredName?.trim() || null,
    email: normalizeEmail(input.email),
    gender: input.gender ?? null,
    date_of_birth: input.dateOfBirth || null,
    positions: (input.positions ?? []).map((position) => position.trim()).filter(Boolean),
  };
}
