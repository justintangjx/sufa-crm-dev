import { describe, expect, it } from "vitest";
import { getPassportStatus, isPassportActionNeeded } from "./passport";

const REF = new Date("2026-01-01T00:00:00.000Z");

describe("getPassportStatus", () => {
  it("returns missing when no expiry is provided", () => {
    expect(getPassportStatus(null, REF)).toBe("missing");
    expect(getPassportStatus("", REF)).toBe("missing");
  });

  it("returns missing for an unparseable date", () => {
    expect(getPassportStatus("not-a-date", REF)).toBe("missing");
  });

  it("returns expired for a past date", () => {
    expect(getPassportStatus("2025-12-31", REF)).toBe("expired");
  });

  it("returns expiring_soon within 6 months", () => {
    expect(getPassportStatus("2026-05-15", REF)).toBe("expiring_soon");
  });

  it("treats the 6-month boundary as expiring_soon", () => {
    expect(getPassportStatus("2026-07-01", REF)).toBe("expiring_soon");
  });

  it("returns ok well beyond 6 months", () => {
    expect(getPassportStatus("2027-01-01", REF)).toBe("ok");
  });
});

describe("isPassportActionNeeded", () => {
  it("is false only when status is ok", () => {
    expect(isPassportActionNeeded("ok")).toBe(false);
    expect(isPassportActionNeeded("missing")).toBe(true);
    expect(isPassportActionNeeded("expired")).toBe(true);
    expect(isPassportActionNeeded("expiring_soon")).toBe(true);
  });
});
