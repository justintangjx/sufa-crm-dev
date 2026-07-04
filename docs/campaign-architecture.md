# Campaign Architecture and Decision Log

This document is the architecture map for the U24 Worlds campaign-management pivot. Read it
after `docs/context.md` and before changing campaign, evaluation, NPS, roster, RLS, or
deployment behaviour.

## Current Architecture

The app remains a role-based CRM, but the MVP operating surface is now the active
`U24 Worlds 2026` campaign (`c-u24`) in mock mode. `SEA Games 2026` is a separate
competition/campaign kept only as legacy/sample data for existing Growth Matrix coverage;
it must not be treated as part of the U24 Worlds campaign.

- `campaigns` defines the training-to-competition container.
- `athletes` remains the reusable player profile record.
- `campaign_members` links selected players to the campaign.
- `campaign_coaches` links coaches to the campaign.
- `player_matrix_submissions` stores one live player self-evaluation per campaign player.
- `coach_matrix_assessments` stores one live coach assessment per coach/player/campaign.
- `evaluation_audit_events` records matrix create/update/submit actions.
- `campaign_nps_surveys`, `campaign_nps_assignments`, and `campaign_nps_responses` support
  admin-managed mid/post coach NPS.

The source-of-truth rule still holds: screens and assistants read/write through the data
API, and the database/RLS boundary owns final permissions.

## Role Flows

**Admin**

- Primary path: `/admin` -> `/admin/campaigns/:campaignId`.
- Can create campaigns, assign existing athletes to campaigns one at a time, open/close
  NPS surveys, view live matrix completion, and view aggregate NPS reports.
- Current limitation: there is no bulk upload/import path for a selected U24 roster.
  Production U24 roster setup still requires manual data creation or an import feature.

**Player**

- Primary path: `/player` -> `/player/campaigns/:campaignId`.
- Can update own particulars at `/player/profile`.
- Can submit a live self-evaluation matrix for assigned campaigns.
- Can submit NPS responses for assigned open surveys. Normal reporting is aggregate only.

**Coach**

- Primary path: `/coach` -> `/coach/campaigns/:campaignId`.
- Sees coach-safe athlete fields through the existing coach-safe projection.
- Can view player self-evaluation context for assigned campaign athletes.
- Can save/submit own coach matrix assessment with audit events.
- Must not see passport, medical, NRIC, or raw NPS responses.

## Data Boundaries

- Public TypeScript row types: `src/types/database.ts`.
- Shared app API contract: `src/data/types.ts`.
- Mock backend and seed: `src/data/mockApi.ts`, `src/data/seed.ts`.
- Supabase adapter: `src/data/supabaseApi.ts`.
- Database source of truth: `supabase/migrations/`.
- Feature flags:
  - `VITE_ENABLE_CAMPAIGN_EVALUATION_MATRIX=false`
  - `VITE_ENABLE_CAMPAIGN_NPS=false`
  - Mock/test mode enables both for local demos and tests.

For Supabase-backed deployments, keep the flags off until the migration
`20260704000000_campaign_management_pivot.sql` has been applied and data has been seeded.

## Decision Log

### 2026-07-04: Campaign-First Pivot

Decision: Reframe the MVP around U24 Worlds campaign operations while preserving the CRM
profile foundation.

Reason: The user needs the tool to manage a training-to-competition campaign, not only
general athlete readiness.

Consequence: Dashboards and campaign lists now prefer the active U24 campaign. Existing
SEA Games and Growth Matrix demo flows remain for compatibility, but U24-only matrix and
NPS features are scoped to U24 campaign rows.

### 2026-07-04: Separate SEA Games From U24 MVP

Decision: Treat SEA Games 2026 and U24 Worlds 2026 as two distinct campaigns, with U24
Worlds as the MVP focus.

Reason: The product direction is U24 Worlds campaign management. SEA Games sample data is
useful for legacy CRM/Growth Matrix tests, but showing it as the U24 operating surface
confuses users and future agents.

Consequence: U24 appears first in demo campaign lists; U24 live matrix and coach NPS tools
must not render on SEA Games routes.

### 2026-07-04: Single Live Matrix

Decision: Use one live player self-evaluation and one live coach assessment per relevant
campaign tuple, rather than baseline/mid/post snapshots.

Reason: The requested MVP should minimize operational burden and support ongoing updates.

Consequence: Historical change visibility depends on `evaluation_audit_events`; the audit
records events, not full field-level snapshots.

### 2026-07-04: NPS Is Aggregate-Only in Normal Reporting

Decision: Players score each coach individually, but reports withhold KPI values until the
minimum response threshold is met.

Reason: Coaches are KPI'd on NPS, but player candor and small-squad anonymity matter.

Consequence: Admin reports show aggregate rows; coaches do not receive raw responses. A
future analytics feature must preserve this boundary unless the product owner explicitly
changes the policy.

### 2026-07-04: No Bulk Roster Import Yet

Decision: Keep the current admin path as one-by-one assignment of existing athletes.

Reason: The refactor focused on matrix and NPS operations; selected-player upload was not
implemented.

Consequence: U24 roster setup is not production-complete unless data is manually seeded or
a roster import feature is added.

## Manual Deployment Notes

Supabase:

- Apply `supabase/migrations/20260704000000_campaign_management_pivot.sql`.
- Create or import real Auth users and `profiles`.
- Create or import `athletes`.
- Create the U24 campaign row if it does not exist.
- Insert selected players into `campaign_members`.
- Insert campaign coaches into `campaign_coaches`.
- Only then enable `VITE_ENABLE_CAMPAIGN_EVALUATION_MATRIX` and/or `VITE_ENABLE_CAMPAIGN_NPS`.

Cloudflare:

- Add/update client-visible feature flags:
  - `VITE_ENABLE_CAMPAIGN_EVALUATION_MATRIX=true`
  - `VITE_ENABLE_CAMPAIGN_NPS=true`
- Redeploy after environment variable changes.
- No new Edge Function is required for the campaign matrix or NPS feature.

## Test Coverage Added

- `src/lib/campaignManagement.test.ts` covers matrix completeness, audit event selection,
  NPS thresholding, and score averaging.
- `src/App.test.tsx` covers player/coach matrix submissions, audit event creation, and NPS
  threshold withholding/unlocking through the data API.
- Existing role and route tests continue to exercise player profile updates, admin
  campaign readiness, coach evaluation submission, and legacy Growth Matrix behavior.
