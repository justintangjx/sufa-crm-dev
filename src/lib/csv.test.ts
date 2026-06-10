import { describe, expect, it } from "vitest";
import { makeAthlete } from "../test/factories";
import { athletesToCsv, escapeCsvCell, toCsv } from "./csv";

describe("escapeCsvCell", () => {
  it("returns empty string for null/undefined", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("leaves plain values untouched", () => {
    expect(escapeCsvCell("plain")).toBe("plain");
    expect(escapeCsvCell(42)).toBe("42");
  });
});

describe("toCsv", () => {
  it("builds a header row and one row per record", () => {
    const csv = toCsv([{ name: "A" }, { name: "B" }], [{ header: "Name", value: (r) => r.name }]);
    expect(csv).toBe("Name\nA\nB");
  });
});

describe("athletesToCsv", () => {
  it("includes headers and computed passport status + completion", () => {
    const csv = athletesToCsv([makeAthlete({ legal_name: "Jordan Tan" })]);
    const [header, row] = csv.split("\n");
    expect(header).toContain("Legal name");
    expect(header).toContain("Passport status");
    expect(header).toContain("Completion %");
    expect(row).toContain("Jordan Tan");
    expect(row).toContain("100");
  });
});
