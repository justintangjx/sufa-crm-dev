import { describe, expect, it } from "vitest";
import { makeAthlete } from "../test/factories";
import { parseRosterCsv, planRosterImport, ROSTER_CSV_TEMPLATE } from "./rosterImport";

describe("parseRosterCsv", () => {
  it("parses the documented template", () => {
    const { rows, headerError } = parseRosterCsv(ROSTER_CSV_TEMPLATE);
    expect(headerError).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "player@example.com",
      legalName: "Alex Tan",
      preferredName: "Alex",
      gender: "female",
      dateOfBirth: "2004-01-15",
      positions: ["handler", "cutter"],
      memberStatus: "invited",
      fieldErrors: [],
    });
  });

  it("rejects files without email and legal name headers", () => {
    const { rows, headerError } = parseRosterCsv("foo,bar\n1,2");
    expect(rows).toEqual([]);
    expect(headerError).toMatch(/email and legal_name/i);
  });

  it("records field errors for invalid gender without dropping the row", () => {
    const { rows, headerError } = parseRosterCsv(
      "email,legal_name,gender\na@test.com,Alex,not-a-gender\n",
    );
    expect(headerError).toBeNull();
    expect(rows[0]?.fieldErrors[0]).toMatch(/invalid gender/i);
  });
});

describe("planRosterImport", () => {
  const campaignId = "c-u24";

  it("creates new players and assigns existing non-members", () => {
    const alice = makeAthlete({ id: "a-alice", email: "alice@sufa.test", legal_name: "Alice" });
    const { rows } = parseRosterCsv(
      ["email,legal_name", "alice@sufa.test,Alice Wong", "new@sufa.test,New Player"].join("\n"),
    );
    const plan = planRosterImport({
      campaignId,
      rows,
      athletes: [alice],
      memberAthleteIds: new Set(),
    });
    expect(plan.counts).toEqual({ create: 1, assign: 1, skip: 0, error: 0 });
    expect(plan.rows.map((row) => row.kind)).toEqual(["assign_only", "create_and_assign"]);
  });

  it("skips athletes already on the campaign and flags duplicate emails in-file", () => {
    const alice = makeAthlete({ id: "a-alice", email: "alice@sufa.test" });
    const { rows } = parseRosterCsv(
      ["email,legal_name", "alice@sufa.test,Alice", "alice@sufa.test,Alice Again"].join("\n"),
    );
    const plan = planRosterImport({
      campaignId,
      rows,
      athletes: [alice],
      memberAthleteIds: new Set(["a-alice"]),
    });
    expect(plan.rows[0]).toMatchObject({ kind: "skip", reason: "already_member" });
    expect(plan.rows[1]).toMatchObject({
      kind: "error",
      reason: expect.stringMatching(/duplicate/i),
    });
  });

  it("errors when a new player is missing legal_name", () => {
    const { rows } = parseRosterCsv("email,legal_name\norphan@sufa.test,\n");
    const plan = planRosterImport({
      campaignId,
      rows,
      athletes: [],
      memberAthleteIds: new Set(),
    });
    expect(plan.rows[0]).toMatchObject({
      kind: "error",
      reason: "legal_name is required for new players",
    });
  });
});
