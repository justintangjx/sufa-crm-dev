import type { Athlete } from "../types/database";
import { enableTravelReadiness } from "./env";

// A required profile field and where it lives in the profile form.
export interface RequiredField {
  field: keyof Athlete;
  label: string;
  section: string;
}

export interface MissingField {
  field: string;
  label: string;
  section: string;
}

// Required base-profile fields for a "complete" athlete (see spec /player logic).
export const REQUIRED_FIELDS: readonly RequiredField[] = [
  { field: "legal_name", label: "Legal name", section: "Basic details" },
  { field: "date_of_birth", label: "Date of birth", section: "Basic details" },
  { field: "phone", label: "Phone number", section: "Contact details" },
  {
    field: "emergency_contact_name",
    label: "Emergency contact name",
    section: "Emergency contact",
  },
  {
    field: "emergency_contact_phone",
    label: "Emergency contact phone",
    section: "Emergency contact",
  },
  { field: "passport_expiry", label: "Passport expiry", section: "Travel readiness" },
  {
    field: "data_sharing_consent",
    label: "Data sharing consent",
    section: "Consent",
  },
];

const TRAVEL_FIELDS = new Set<keyof Athlete>(["passport_expiry"]);

/** Active required fields for the current deployment (pilot omits travel). */
export function getRequiredFields(): readonly RequiredField[] {
  if (enableTravelReadiness) {
    return REQUIRED_FIELDS;
  }
  return REQUIRED_FIELDS.filter((field) => !TRAVEL_FIELDS.has(field.field));
}

// A field counts as present when it holds a non-empty value. Consent booleans must be true.
export function isFieldComplete(athlete: Athlete, field: keyof Athlete): boolean {
  const value = athlete[field];
  if (typeof value === "boolean") {
    return value === true;
  }
  return value !== null && value !== undefined && String(value).trim() !== "";
}

// Required fields the athlete is still missing.
export function getMissingAthleteFields(athlete: Athlete): MissingField[] {
  return getRequiredFields()
    .filter((f) => !isFieldComplete(athlete, f.field))
    .map((f) => ({
      field: f.field as string,
      label: f.label,
      section: f.section,
    }));
}

// Completion as a 0-100 integer percentage over the required fields.
export function getProfileCompletion(athlete: Athlete): number {
  const fields = getRequiredFields();
  const total = fields.length;
  const complete = fields.filter((f) => isFieldComplete(athlete, f.field)).length;
  return Math.round((complete / total) * 100);
}

export function isProfileComplete(athlete: Athlete): boolean {
  return getMissingAthleteFields(athlete).length === 0;
}
