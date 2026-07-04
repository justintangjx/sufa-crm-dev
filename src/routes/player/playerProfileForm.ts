import type { AthletePatch } from "../../data/types";
import type { Athlete } from "../../types/database";
import { optionalText } from "../../lib/form";

export interface PlayerProfileFormState {
  legal_name: string;
  preferred_name: string;
  date_of_birth: string;
  phone: string;
  telegram_handle: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  passport_expiry: string;
  data_sharing_consent: boolean;
  media_consent: boolean;
}

export const emptyPlayerProfileForm: PlayerProfileFormState = {
  legal_name: "",
  preferred_name: "",
  date_of_birth: "",
  phone: "",
  telegram_handle: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  passport_expiry: "",
  data_sharing_consent: false,
  media_consent: false,
};

export function playerProfileFormFromAthlete(athlete: Athlete): PlayerProfileFormState {
  return {
    legal_name: athlete.legal_name ?? "",
    preferred_name: athlete.preferred_name ?? "",
    date_of_birth: athlete.date_of_birth ?? "",
    phone: athlete.phone ?? "",
    telegram_handle: athlete.telegram_handle ?? "",
    emergency_contact_name: athlete.emergency_contact_name ?? "",
    emergency_contact_phone: athlete.emergency_contact_phone ?? "",
    passport_expiry: athlete.passport_expiry ?? "",
    data_sharing_consent: athlete.data_sharing_consent,
    media_consent: athlete.media_consent,
  };
}

export function playerProfilePatchFromForm(form: PlayerProfileFormState): AthletePatch {
  return {
    legal_name: optionalText(form.legal_name),
    preferred_name: optionalText(form.preferred_name),
    date_of_birth: optionalText(form.date_of_birth),
    phone: optionalText(form.phone),
    telegram_handle: optionalText(form.telegram_handle),
    emergency_contact_name: optionalText(form.emergency_contact_name),
    emergency_contact_phone: optionalText(form.emergency_contact_phone),
    passport_expiry: optionalText(form.passport_expiry),
    data_sharing_consent: form.data_sharing_consent,
    media_consent: form.media_consent,
  };
}
