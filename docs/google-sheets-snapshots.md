# Google Sheets Campaign Snapshots

This document is the implementation context for publishing controlled SUFA CRM campaign
snapshots to Google Sheets through n8n. It supplements `prd.md`; where requirements
conflict, `prd.md` remains canonical.

## Why This Exists

Admins sometimes need to share campaign information with people who should not receive
CRM or database access. Google Sheets is a familiar read-only surface for checking and
using a bounded dataset.

The spreadsheet is a publication, not another database:

- Supabase remains the source of truth.
- Publishing is a deliberate admin action, never a side effect of a player update.
- A sheet may be stale and must show when it was published.
- Changes made directly in Google Sheets never sync back to the CRM.
- Readers receive only the fields allowed by the fixed export policy.

## V1 Decisions

- Only authenticated admins can publish snapshots.
- V1 supports campaign snapshots only.
- An admin must preview and explicitly confirm every publication.
- Each campaign has one stable spreadsheet. Later publications refresh that file.
- V1 uses one fixed operational column preset; admins cannot select arbitrary fields.
- Readers must be named Google accounts in configured SUFA email domains.
- A dedicated SUFA-managed Google account owns every spreadsheet.
- Each refresh makes the Google reader list exactly match the confirmed CRM recipient
  list, including removing omitted readers.
- An existing hosted n8n instance performs Google Sheets and Drive operations.
- The React client never receives the n8n URL, shared secret, Google credentials, or a
  service-role key.
- Export generation is deterministic. It is not an LLM feature.

Public-link sharing, all-player exports, scheduled refreshes, editable recipient access,
custom columns, and Google-to-Supabase synchronization are out of scope for V1.

## Export Policy

The export mapper must construct a new allowlisted row object. It must not serialize an
`Athlete`, database result, or arbitrary object and then remove fields.

### Snapshot Columns

Use this exact column order and `schemaVersion` value:

```ts
export const CAMPAIGN_SNAPSHOT_SCHEMA_VERSION = 1;

export interface CampaignSnapshotRow {
  athleteId: string;
  legalName: string;
  preferredName: string;
  phone: string;
  campaignMemberStatus: CampaignMemberStatus;
  profileStatus: ProfileStatus;
  completionPercent: number;
  missingRequiredFields: string;
  passportReadiness: PassportStatus;
  athleteUpdatedAt: string;
  snapshotPublishedAt: string;
}
```

The Google Sheet headers are:

```txt
Athlete ID
Legal name
Preferred name
Phone
Campaign member status
Profile status
Completion %
Missing required fields
Passport readiness
Athlete updated at
Snapshot published at
```

`missingRequiredFields` is a comma-separated list of labels returned by the existing
profile-completion logic. `passportReadiness` is the derived status only, never the
expiry date. Timestamps use ISO 8601 UTC values in the integration payload; Google may
format them for display without changing their values.

### Prohibited Data

The mapper, Edge Function payload, n8n execution data, fixtures, and spreadsheet must
not contain:

- Date of birth.
- Exact passport expiry.
- Passport or NRIC numbers if added later.
- Emergency-contact names, relationships, or phone numbers.
- Data-sharing or media-consent values.
- Medical notes, dietary restrictions, or other health information.
- Coach evaluations, ratings, notes, or recommendations.
- Change-request history, previous values, or reviewer comments.
- Authentication IDs, email addresses, tokens, or credentials.

`athleteId` is the CRM domain identifier. Do not export `profile_id` or Supabase Auth
user IDs.

## User Experience

Implement the workflow at `/admin/exports`.

1. The admin selects a campaign.
2. The page loads a preview generated with the same fixed mapper used for publication.
3. The preview shows the row count, column list, excluded-data notice, and snapshot
   warning.
4. The admin enters one or more named reader email addresses.
5. The client normalizes emails by trimming whitespace and lowercasing them, then shows
   validation errors. The server repeats all validation.
6. The confirmation screen states that the existing sheet will be replaced and its
   reader list reconciled.
7. The admin clicks `Publish snapshot` or `Refresh snapshot`.
8. The page shows the resulting audit status. A successful run exposes the stable
   Google Sheets link. A failed run exposes a safe error summary and `Retry`.

The page also lists prior publication attempts newest first with campaign, requester,
status, row count, recipients, timestamps, and link when available. Do not display raw
n8n or Google error bodies.

## System Flow

```txt
Admin preview
  -> React loads campaign snapshot preview through the Api interface
  -> admin confirms recipients and publication
  -> React invokes the authenticated Supabase Edge Function
  -> Edge Function verifies JWT and admin role
  -> Edge Function validates campaign and recipient policy
  -> Edge Function queries current campaign data
  -> Edge Function maps only allowlisted fields
  -> Edge Function creates a pending export-run record
  -> Edge Function calls the secured n8n webhook
  -> n8n validates the secret, schema, and request ID
  -> n8n creates or refreshes the Google spreadsheet
  -> n8n reconciles read-only Drive permissions
  -> n8n returns the spreadsheet identity and applied recipients
  -> Edge Function records success or failure
  -> React displays the audit result
```

The publication timestamp is captured once by the Edge Function and used for every row
in that attempt. The latest successful run for the campaign supplies the existing
spreadsheet ID to n8n. A failed run never replaces that successful sheet identity.

## Application Contracts

Add these shared data-layer types. Exact file placement should follow the existing
`src/data/types.ts` and `src/types/database.ts` boundary.

```ts
export type GoogleSheetExportStatus = "pending" | "succeeded" | "failed";

export interface CampaignSnapshotPreview {
  campaignId: string;
  campaignName: string;
  schemaVersion: 1;
  columns: string[];
  rows: CampaignSnapshotRow[];
  excludedDataNotice: string;
}

export interface PublishCampaignSheetInput {
  campaignId: string;
  recipients: string[];
}

export interface GoogleSheetExportRun {
  id: string;
  campaign_id: string;
  requested_by: string;
  export_type: "campaign_operational_snapshot";
  schema_version: number;
  recipients: string[];
  status: GoogleSheetExportStatus;
  row_count: number | null;
  payload_hash: string | null;
  spreadsheet_id: string | null;
  spreadsheet_url: string | null;
  error_code: string | null;
  error_summary: string | null;
  requested_at: string;
  completed_at: string | null;
}
```

Extend `Api` with:

```ts
getCampaignSnapshotPreview(campaignId: string): Promise<CampaignSnapshotPreview>;

publishCampaignSheet(
  input: PublishCampaignSheetInput,
): Promise<GoogleSheetExportRun>;

listCampaignSheetExports(): Promise<GoogleSheetExportRun[]>;
```

The mock implementation must validate the same recipient and mapping policy, record
runs in mock storage, reuse a deterministic spreadsheet ID per campaign, and return a
fake `https://docs.google.com/spreadsheets/d/...` URL. Tests must not require n8n,
Google, or network access.

## Database And RLS

Add `google_sheet_export_runs` in a new migration. Use `jsonb` for the normalized
recipient array and constrain it to an array. Do not store the exported rows.

```sql
create table public.google_sheet_export_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  export_type text not null default 'campaign_operational_snapshot'
    check (export_type = 'campaign_operational_snapshot'),
  schema_version integer not null,
  recipients jsonb not null check (jsonb_typeof(recipients) = 'array'),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed')),
  row_count integer check (row_count is null or row_count >= 0),
  payload_hash text,
  spreadsheet_id text,
  spreadsheet_url text,
  error_code text,
  error_summary text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
```

Add indexes on `(campaign_id, requested_at desc)` and `(requested_by, requested_at
desc)`.

Enable RLS with these boundaries:

- Authenticated admins may select export-run rows.
- Authenticated clients may not insert, update, or delete export-run rows directly.
- The Edge Function writes using a server-side service-role client only after verifying
  the caller's JWT and admin role with a separate authenticated client.
- Players and coaches cannot read export runs.

Do not loosen existing athlete, campaign, profile, or change-request policies.

## Edge Function Contract

Create a Supabase Edge Function named `publish-campaign-sheet`.

Request:

```http
POST /functions/v1/publish-campaign-sheet
Authorization: Bearer <user access token>
Content-Type: application/json

{
  "campaignId": "uuid",
  "recipients": ["reader@sufa.example"]
}
```

Successful response:

```json
{
  "run": {
    "id": "uuid",
    "campaign_id": "uuid",
    "status": "succeeded",
    "row_count": 24,
    "spreadsheet_id": "google-file-id",
    "spreadsheet_url": "https://docs.google.com/spreadsheets/d/google-file-id",
    "recipients": ["reader@sufa.example"],
    "requested_at": "2026-06-15T10:00:00.000Z",
    "completed_at": "2026-06-15T10:00:03.000Z"
  }
}
```

Validation rules:

- `campaignId` must be a valid UUID for an existing campaign.
- `recipients` must contain between 1 and 50 entries.
- Normalize by trimming and lowercasing, then remove duplicates.
- Every entry must be a syntactically valid email in `SUFA_ALLOWED_EMAIL_DOMAINS`.
- The caller must have an authenticated `profiles.role = 'admin'`.
- The campaign snapshot may be empty, but the confirmation UI must state `0 players`.

The function creates the pending run before calling n8n. It computes a SHA-256
`payload_hash` from a canonical serialization of the schema version, campaign metadata,
normalized recipients, publication timestamp, and ordered rows. It updates the same run
to `succeeded` or `failed`.

Return `401` for missing authentication, `403` for non-admin callers, `400` for invalid
input, `404` for an unknown campaign, and `502` for a recorded downstream failure. A
`502` response includes the failed run ID and safe error code so the UI can show and
retry it.

Retrying from the UI creates a new run and a new request ID. Repeated transport delivery
of the same run ID is idempotent in n8n.

## n8n Contract

The Edge Function calls the configured n8n webhook with:

```http
POST <N8N_EXPORT_WEBHOOK_URL>
X-SUFA-Webhook-Secret: <N8N_EXPORT_WEBHOOK_SECRET>
Content-Type: application/json
```

```json
{
  "requestId": "export-run-uuid",
  "exportType": "campaign_operational_snapshot",
  "schemaVersion": 1,
  "campaign": {
    "id": "campaign-uuid",
    "name": "SEA Games 2026"
  },
  "publishedAt": "2026-06-15T10:00:00.000Z",
  "existingSpreadsheetId": "google-file-id-or-null",
  "recipients": ["reader@sufa.example"],
  "columns": ["Athlete ID", "Legal name"],
  "rows": [
    {
      "athleteId": "athlete-uuid",
      "legalName": "Example Player"
    }
  ]
}
```

The abbreviated row above illustrates the envelope only; production rows must match the
complete versioned schema.

n8n must:

1. Reject a missing or incorrect shared secret.
2. Validate the exact envelope and row schema before Google operations.
3. Look up `requestId` in persistent workflow data or a dedicated n8n data store.
4. Return the stored successful response without repeating side effects when the same
   request ID is received again.
5. Create a spreadsheet when `existingSpreadsheetId` is null; otherwise verify and
   refresh that file.
6. Replace the complete `Snapshot` tab, rather than appending rows.
7. Maintain an `About` tab with campaign name, publication timestamp, schema version,
   row count, and this warning:

   ```txt
   Snapshot only. Supabase SUFA CRM remains the source of truth.
   ```

8. Grant reader permission to each requested account.
9. Remove reader permissions not present in the requested list. Never remove the
   SUFA-managed owner or n8n's required integration access.
10. Verify the final reader list before reporting success.
11. Store the successful response against `requestId`.

Success response:

```json
{
  "requestId": "export-run-uuid",
  "spreadsheetId": "google-file-id",
  "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/google-file-id",
  "rowCount": 24,
  "appliedRecipients": ["reader@sufa.example"]
}
```

The response is successful only after data replacement and permission reconciliation
both complete. Partial permission changes are failures.

## Secrets And Configuration

Configure these only as Supabase Edge Function secrets:

```txt
N8N_EXPORT_WEBHOOK_URL
N8N_EXPORT_WEBHOOK_SECRET
SUFA_ALLOWED_EMAIL_DOMAINS
```

`SUFA_ALLOWED_EMAIL_DOMAINS` is a comma-separated lowercase allowlist. Do not add these
values to `.env.example` as `VITE_*` variables or expose them to the browser.

Google credentials belong in n8n's credential store. The Google identity must be a
dedicated SUFA-managed account, not an individual admin account.

## Failure Behaviour

| Failure                                      | Required behaviour                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Malformed, empty, or non-SUFA recipients     | Reject before creating a run; show field-level UI errors.                                              |
| Unauthenticated caller                       | Return `401`; create no run and call no webhook.                                                       |
| Player or coach caller                       | Return `403`; create no run and call no webhook.                                                       |
| Unknown campaign                             | Return `404`; create no run.                                                                           |
| n8n timeout or non-2xx response              | Mark the pending run failed with a safe code; return `502`.                                            |
| Google Sheets write failure                  | n8n reports failure; do not report or record false success.                                            |
| Partial permission reconciliation            | Treat the entire publication as failed and retain the previous successful run as the stable reference. |
| Duplicate delivery of one request ID         | n8n returns the stored result without recreating or rewriting the file.                                |
| Admin retries a failed run                   | Create a new run ID and preserve the failed audit row.                                                 |
| Existing spreadsheet missing or inaccessible | Fail with `spreadsheet_unavailable`; do not silently create a replacement under the same run.          |
| Snapshot becomes stale                       | Display its publication timestamp; never imply live synchronization.                                   |

A downstream failure may have changed Google state before failing. The retry workflow
must therefore refresh the full sheet and reconcile the full permission list, making
the operation convergent.

## Implementation Slices

Complete and verify one slice before starting the next.

1. **Export mapping and policy evals**
   - Add the versioned row mapper, headers, recipient normalization, and prohibited-field
     tests.
2. **Migration, types, and RLS**
   - Add the export-run table, indexes, admin-select policy, domain types, and RLS tests.
3. **Mock and Supabase API contracts**
   - Add preview, publish, and history methods while keeping offline tests deterministic.
4. **Edge Function**
   - Add authorization, server-side queries and mapping, audit transitions, hashing,
     webhook call, and safe errors.
5. **n8n workflow**
   - Add schema validation, idempotency storage, sheet create/replace, `About` tab, and
     exact reader reconciliation.
6. **Admin export UI**
   - Replace the placeholder with preview, recipient validation, confirmation, history,
     stable link, failure state, and retry.
7. **Integration and E2E verification**
   - Cover role guards, successful publication, refresh, failures, and audit history.
8. **Pilot rollout**
   - Deploy to staging, publish a non-sensitive test campaign, verify permissions, then
     run one limited real or simulated campaign.

Keep the role-page refactor in `docs/context.md` in mind. If `src/App.tsx` has not yet
been split when this work starts, coordinate ownership before editing it.

## Export Evals

Use table-driven tests, following the eval style in `prd.md`. Suggested location:

```txt
src/lib/google-sheets/
  campaign-snapshot.ts
  recipients.ts
  index.ts

tests/export-evals/
  campaign-snapshot-policy.eval.test.ts
  recipients.eval.test.ts
  permissions.eval.test.ts
  publication-lifecycle.eval.test.ts
  n8n-contract.eval.test.ts
```

Each policy case should declare input, expected included values, and forbidden keys or
values:

```ts
const cases = [
  {
    name: "campaign snapshot exposes readiness but not passport expiry",
    athlete: makeAthlete({ passport_expiry: "2026-09-01" }),
    expectedIncludes: ["expiring_soon"],
    forbiddenKeys: ["passport_expiry", "date_of_birth", "profile_id"],
    expectedExcludes: ["2026-09-01"],
  },
];
```

Required evals:

- Allowlisted fields appear in the fixed order with correct completion, missing-field,
  passport-status, and timestamp values.
- Date of birth, exact passport expiry, emergency contacts, consent, medical data,
  evaluations, Auth IDs, and change history never appear.
- Player and coach callers cannot publish or read export-run history.
- Empty, malformed, duplicate, mixed-case, whitespace-padded, non-SUFA, and over-limit
  recipient lists produce the specified normalized result or error.
- First publication creates a sheet identity.
- Refresh preserves the spreadsheet ID and URL while replacing all rows.
- Refresh adds and removes readers so the final list exactly matches the request.
- Duplicate delivery of a request ID is idempotent.
- n8n timeouts, Google write failures, and partial permission failures produce failed
  audit runs without false success.
- Retrying creates a new attempt while retaining earlier failed and successful history.
- An empty campaign publishes a valid header-only snapshot with row count zero.
- The mock and server implementations conform to the same public contract.

Fixtures and recorded webhook payloads are subject to the same prohibited-field checks
as production mapping code.

## Coding-Agent Loop

For every implementation slice:

```txt
Read prd.md, AGENTS.md, docs/context.md, and this document
  -> inspect current code and working-tree ownership
  -> implement one slice
  -> add or update table-driven evals
  -> run the narrowest relevant tests
  -> inspect payloads, logs, and RLS for prohibited data
  -> fix failures without weakening assertions or permissions
  -> run pnpm format
  -> run pnpm check
  -> run pnpm e2e when the complete flow exists
  -> update context and leave a handoff
```

Do not move to the next slice while focused tests fail. If external staging verification
is unavailable, report that gap explicitly rather than replacing it with a mock result.

## Production Feedback Loop

For each pilot publication:

```txt
Admin previews snapshot
  -> publishes to named readers
  -> system records outcome
  -> admin verifies row count, fields, owner, and reader access
  -> collect usefulness and privacy feedback
  -> review failures, retries, and stale snapshots
  -> change policy or mapping through a new schema version
  -> rerun the complete export eval suite
```

Never fix a production mismatch by editing the generated sheet manually and treating it
as resolved. Correct the CRM data or versioned mapping, then republish.

Track:

- Publication success rate and retry rate.
- Time from opening the export page to successful sharing.
- CRM-to-sheet row-count mismatches.
- Unauthorized-access incidents.
- Recipient-removal failures.
- Admin-reported missing or unnecessary columns.
- Number and age of active campaign snapshots.
- Whether recipients still request direct database or CRM access.

Review pilot results after each campaign. Add a field only when there is a documented
operational need and a privacy review; remove fields that are not being used.

## Acceptance Gates

Implementation is complete only when:

- All export-policy evals pass.
- RLS tests prove admin-only export-run access and publication.
- No prohibited field exists in mapper output, fixtures, or webhook payloads.
- n8n idempotency and exact permission reconciliation are verified.
- UI tests cover preview, validation, confirmation, success, failure, stable link, and
  retry.
- `pnpm format`, `pnpm check`, and `pnpm e2e` pass.
- A manual staging publication confirms:
  - The dedicated SUFA account owns the sheet.
  - Named recipients have reader access only.
  - Omitted recipients lose access after refresh.
  - The spreadsheet URL remains stable.
  - The `Snapshot` tab is replaced rather than appended.
  - The `About` tab contains the source-of-truth warning and accurate timestamp.
  - The displayed and recorded row counts match the sheet.

If a required check cannot run, the handoff must identify the exact unverified gate and
why it remains outstanding.
