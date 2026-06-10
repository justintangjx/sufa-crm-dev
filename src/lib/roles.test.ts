import { describe, expect, it } from "vitest";
import { getRoleHome, isRole } from "./roles";

describe("getRoleHome", () => {
  it("maps each role to its dashboard", () => {
    expect(getRoleHome("player")).toBe("/player");
    expect(getRoleHome("admin")).toBe("/admin");
    expect(getRoleHome("coach")).toBe("/coach");
  });

  it("falls back to /login for unknown or missing roles", () => {
    expect(getRoleHome(null)).toBe("/login");
    expect(getRoleHome(undefined)).toBe("/login");
  });
});

describe("isRole", () => {
  it("recognises valid roles only", () => {
    expect(isRole("player")).toBe(true);
    expect(isRole("admin")).toBe(true);
    expect(isRole("coach")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});
