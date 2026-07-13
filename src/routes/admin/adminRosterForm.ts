import type { AdminAthletePatch, CreateAthleteInput } from "../../data/types";
import { optionalText } from "../../lib/form";
import type { Athlete, Gender } from "../../types/database";

export interface RosterFormState {
  athleteId: string | null;
  legalName: string;
  preferredName: string;
  email: string;
  gender: "" | Gender;
  dateOfBirth: string;
  positions: string;
}

export const emptyRosterForm: RosterFormState = {
  athleteId: null,
  legalName: "",
  preferredName: "",
  email: "",
  gender: "",
  dateOfBirth: "",
  positions: "",
};

export function rosterFormFromAthlete(athlete: Athlete): RosterFormState {
  return {
    athleteId: athlete.id,
    legalName: athlete.legal_name ?? "",
    preferredName: athlete.preferred_name ?? "",
    email: athlete.email ?? "",
    gender: athlete.gender ?? "",
    dateOfBirth: athlete.date_of_birth ?? "",
    positions: athlete.positions.join(", "),
  };
}

function parsePositions(raw: string): string[] {
  return raw
    .split(",")
    .map((position) => position.trim())
    .filter(Boolean);
}

export function createInputFromRosterForm(form: RosterFormState): CreateAthleteInput {
  return {
    legalName: form.legalName.trim(),
    preferredName: optionalText(form.preferredName),
    email: form.email.trim(),
    gender: form.gender || null,
    dateOfBirth: form.dateOfBirth || null,
    positions: parsePositions(form.positions),
  };
}

export function adminPatchFromRosterForm(form: RosterFormState): AdminAthletePatch {
  return {
    legal_name: form.legalName.trim() || null,
    preferred_name: optionalText(form.preferredName),
    email: form.email.trim() || null,
    gender: form.gender || null,
    date_of_birth: form.dateOfBirth || null,
    positions: parsePositions(form.positions),
  };
}
