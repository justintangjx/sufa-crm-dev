import type { Athlete, Profile } from "../../types/database";

export function displayName(a: Pick<Athlete, "preferred_name" | "legal_name">): string {
  return a.preferred_name || a.legal_name || "Unknown athlete";
}

export function profileDisplayName(
  profile: Pick<Profile, "email" | "full_name" | "preferred_name">,
): string {
  return profile.preferred_name || profile.full_name || profile.email;
}
