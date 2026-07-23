# Roster CSV import — design sketch (contract for implement)

## Usage

```ts
const parsed = parseRosterCsv(fileText);
const plan = planRosterImport({
  campaignId,
  rows: parsed.rows,
  athletes,
  memberAthleteIds: new Set(members.map((m) => m.athleteId)),
});
// preview plan.rows in UI
await api.commitCampaignRosterImport({ campaignId, plan });
```

## Types

```ts
type RosterImportSourceRow = {
  rowNumber: number;
  email: string;
  legalName: string;
  preferredName?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  positions?: string[];
  memberStatus?: CampaignMemberStatus; // default invited
};

type RosterImportRowAction =
  | {
      kind: "create_and_assign";
      rowNumber: number;
      email: string;
      fields: CreateAthleteInput;
      memberStatus: CampaignMemberStatus;
    }
  | {
      kind: "assign_only";
      rowNumber: number;
      email: string;
      athleteId: string;
      memberStatus: CampaignMemberStatus;
    }
  | { kind: "skip"; rowNumber: number; email: string; reason: "already_member" }
  | { kind: "error"; rowNumber: number; email: string | null; reason: string };

type RosterImportPlan = {
  campaignId: string;
  rows: RosterImportRowAction[];
  counts: { create: number; assign: number; skip: number; error: number };
};
```

## Modules

- `src/lib/rosterImport.ts` — parse + plan (pure)
- `Api.commitCampaignRosterImport` — execute non-error/skip rows
- Preview can be client-side from plan (no separate preview API required)
- UI: `AdminCampaignDetailPage` section

## Out of scope

Coaches, multi-team CSV, Sheets adapter, update_and_assign, import audit table.
