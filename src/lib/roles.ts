import type { Role } from "../types/database";

const ROLE_HOME: Record<Role, string> = {
  player: "/player",
  admin: "/admin",
  coach: "/coach",
};

// Landing route for a role after login. Falls back to /login for unknown roles.
export function getRoleHome(role: Role | null | undefined): string {
  if (!role || !(role in ROLE_HOME)) {
    return "/login";
  }
  return ROLE_HOME[role];
}

export function isRole(value: unknown): value is Role {
  return value === "player" || value === "admin" || value === "coach";
}
