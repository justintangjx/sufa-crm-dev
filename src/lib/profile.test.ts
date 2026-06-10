import { describe, expect, it } from "vitest";
import { makeAthlete } from "../test/factories";
import {
  getMissingAthleteFields,
  getProfileCompletion,
  isProfileComplete,
  REQUIRED_FIELDS,
} from "./profile";

describe("getMissingAthleteFields", () => {
  it("returns no missing fields for a complete athlete", () => {
    expect(getMissingAthleteFields(makeAthlete())).toEqual([]);
  });

  it("flags a missing emergency contact", () => {
    const athlete = makeAthlete({
      emergency_contact_name: null,
      emergency_contact_phone: "",
    });
    const missing = getMissingAthleteFields(athlete).map((m) => m.field);
    expect(missing).toContain("emergency_contact_name");
    expect(missing).toContain("emergency_contact_phone");
  });

  it("treats unchecked data-sharing consent as missing", () => {
    const athlete = makeAthlete({ data_sharing_consent: false });
    const missing = getMissingAthleteFields(athlete).map((m) => m.field);
    expect(missing).toContain("data_sharing_consent");
  });

  it("treats whitespace-only values as missing", () => {
    const athlete = makeAthlete({ phone: "   " });
    const missing = getMissingAthleteFields(athlete).map((m) => m.field);
    expect(missing).toContain("phone");
  });

  it("includes a section label for each missing field", () => {
    const missing = getMissingAthleteFields(makeAthlete({ legal_name: null }));
    expect(missing[0]).toMatchObject({ field: "legal_name", section: "Basic details" });
  });
});

describe("getProfileCompletion", () => {
  it("is 100 for a complete athlete", () => {
    expect(getProfileCompletion(makeAthlete())).toBe(100);
  });

  it("is 0 when all required fields are empty", () => {
    const empty = makeAthlete({
      legal_name: null,
      date_of_birth: null,
      phone: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      passport_expiry: null,
      data_sharing_consent: false,
    });
    expect(getProfileCompletion(empty)).toBe(0);
  });

  it("reflects partial completion", () => {
    const athlete = makeAthlete({ passport_expiry: null });
    const expected = Math.round(((REQUIRED_FIELDS.length - 1) / REQUIRED_FIELDS.length) * 100);
    expect(getProfileCompletion(athlete)).toBe(expected);
  });
});

describe("isProfileComplete", () => {
  it("is true for a complete athlete and false otherwise", () => {
    expect(isProfileComplete(makeAthlete())).toBe(true);
    expect(isProfileComplete(makeAthlete({ phone: null }))).toBe(false);
  });
});
