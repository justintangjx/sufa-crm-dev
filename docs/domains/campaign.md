# Campaign Domain

Architecture map for U24 Worlds campaign management. Read after [`state.md`](../state.md) and
[`codemap.md`](../codemap.md) before changing campaign, evaluation, NPS, roster, or RLS
behaviour.

## Current architecture

The MVP operating surface is **U24 Worlds 2026** (`c-u24`). **SEA Games 2026** is separate
legacy/sample data for Growth Matrix demos — not part of the U24 campaign.

| Table                       | Role                                                |
| --------------------------- | --------------------------------------------------- |
| `campaigns`                 | Training-to-competition container                   |
| `athletes`                  | Reusable player profile                             |
| `campaign_members`          | Selected players on a campaign                      |
| `campaign_coaches`          | Coaches assigned to a campaign                      |
| `player_matrix_submissions` | One live player self-evaluation per campaign player |
| `coach_matrix_assessments`  | One live coach assessment per coach/player/campaign |
| `evaluation_audit_events`   | Matrix create/update/submit audit trail             |
| `campaign_nps_*`            | Admin-managed mid/post coach NPS                    |

Screens read/write through the `Api` contract; database/RLS owns final permissions.

Capability gating: `campaignCapabilities()` in `src/lib/campaignCapabilities.ts` combines
feature flags with U24 campaign identity. Flag defaults: [`codemap.md`](../codemap.md).

## Role flows

**Admin** — `/admin` → `/admin/campaigns/:campaignId`

- Create campaigns, assign athletes one at a time, open/close NPS, view matrix status and
  aggregate NPS reports.
- No bulk roster import yet (manual seed or future import feature).

**Player** — `/player` → `/player/campaigns/:campaignId`

- Profile at `/player/profile`; live self-evaluation matrix; NPS for open surveys (aggregate
  reporting only).

**Coach** — `/coach` → `/coach/campaigns/:campaignId`

- Coach-safe athlete projection only; matrix assessment with audit events.
- No passport/medical/NRIC or raw NPS responses.

## Data boundaries

- Row types: `src/types/database.ts`
- API contract: `src/data/types.ts`
- Payload mappers: `src/data/payloads/`
- Adapters: `src/data/mockApi.ts`, `src/data/supabaseApi.ts`
- Migrations: `supabase/migrations/` (campaign pivot:
  `20260704000000_campaign_management_pivot.sql`)

## Decision log

### 2026-07-04: Campaign-first pivot

Reframe MVP around U24 Worlds while preserving CRM profile foundation. U24 dashboards and
lists prefer the active U24 campaign; matrix/NPS scoped to U24 rows.

### 2026-07-04: Separate SEA Games from U24 MVP

SEA Games and U24 Worlds are distinct campaigns. U24 matrix/NPS must not render on SEA
Games routes.

### 2026-07-04: Single live matrix

One live player self-evaluation and one live coach assessment per tuple — not baseline/mid/post
snapshots. History via `evaluation_audit_events` (events, not field snapshots).

### 2026-07-04: NPS aggregate-only reporting

Players score coaches individually; admin reports withhold KPIs until minimum response threshold.
Coaches never see raw responses.

### 2026-07-04: No bulk roster import yet

Admin assigns existing athletes one at a time. Production U24 roster needs manual seed or
import feature.

## Deployment

URLs, env vars, migration order, and seed steps: [`state.md`](../state.md) (Deployment
snapshot). Enable `VITE_ENABLE_CAMPAIGN_EVALUATION_MATRIX` and `VITE_ENABLE_CAMPAIGN_NPS`
only after migration + seed.

## Tests

- `src/lib/campaignManagement.test.ts` — matrix completeness, audit events, NPS thresholds
- `src/lib/campaignCapabilities.test.ts` — U24 detection and capability gating
- `src/App.test.tsx` — matrix/NPS flows through the data API
