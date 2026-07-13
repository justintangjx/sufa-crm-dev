# Campaign Domain

Architecture map for U24 Worlds campaign management. Read after [`state.md`](../state.md) and
[`codemap.md`](../codemap.md) before changing campaign, evaluation, NPS, roster, or RLS
behaviour.

## Current architecture

The MVP operating surface is **U24 Worlds 2026** (`c-u24`). **SEA Games 2026** is separate
legacy/sample data for Growth Matrix demos — not part of the U24 campaign.

| Table                       | Role                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `campaigns`                 | Training-to-competition container                                   |
| `athletes`                  | Reusable player profile; roster identity (`email` is the login key) |
| `campaign_members`          | Selected players on a campaign                                      |
| `campaign_coaches`          | Coaches assigned to a campaign                                      |
| `player_matrix_submissions` | Append-only self-evaluation history + at most one open draft        |
| `coach_matrix_assessments`  | Append-only coach assessment history + at most one open draft       |
| `evaluation_audit_events`   | Matrix create/update/submit audit trail                             |
| `campaign_nps_*`            | Admin-managed mid/post bidirectional NPS (players↔coaches)          |

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
  `20260704000000_campaign_management_pivot.sql`; closed roster:
  `20260713000000_closed_roster.sql`; evaluation history:
  `20260713000100_evaluation_history.sql`; bidirectional NPS:
  `20260713000200_bidirectional_nps.sql`)

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

### 2026-07-13: Closed roster, admin-first onboarding

Players no longer self-signup. Admin creates the athlete row (name, email, gender, DOB,
positions) on `/admin/players` or via campaign detail create-and-assign. Sign-in is gated by
the `can_request_player_magic_link(email)` RPC before `signInWithOtp`; unknown emails never
receive an OTP. `handle_new_user` links `athletes.profile_id` by case-insensitive email on
first login and bumps `invited` memberships to `registered`. Email is immutable once a login
is linked. Admin sees login status (active / not logged in) per athlete. The migration
de-dups legacy empty athlete shells (left by the old auto-create-on-signup trigger) before
backfilling emails, and enforces one athlete per profile via `athletes_profile_id_unique_idx`.

### 2026-07-13: Evaluation history replaces single live matrix

Supersedes "Single live matrix" (2026-07-04). `player_matrix_submissions` and
`coach_matrix_assessments` are append-only evidence logs: unlimited immutable `submitted`
rows per tuple plus at most one open `draft` (partial unique index). Saves always target the
open draft; submitting freezes the row (RLS blocks updates to submitted rows). Drafts are
private to their owner: coaches only see submitted self-evaluations, players only see
submitted coach assessments about themselves. UI shows explicit "Start new
self-evaluation/assessment" prefilled from the latest submitted entry.

### 2026-07-13: Bidirectional NPS with direction-specific thresholds

Surveys now assign both directions: every roster player rates each coach and every campaign
coach rates each player. Responses are generalized to `rater_profile_id` + exactly one of
`subject_coach_profile_id` / `subject_athlete_id`. Reporting thresholds are per direction
(`min_player_rater_count`, default 3; `min_coach_rater_count`, default 2) because coach
pools are small — a single player-rater threshold would permanently withhold per-player
aggregates. Raw responses remain visible only to the rater (own rows) and admin.

## Deployment

URLs, env vars, migration order, and seed steps: [`state.md`](../state.md) (Deployment
snapshot). Enable `VITE_ENABLE_CAMPAIGN_EVALUATION_MATRIX` and `VITE_ENABLE_CAMPAIGN_NPS`
only after migration + seed.

## Tests

- `src/lib/campaignManagement.test.ts` — matrix completeness, audit events, NPS thresholds
- `src/lib/campaignCapabilities.test.ts` — U24 detection and capability gating
- `src/App.test.tsx` — matrix/NPS flows through the data API
