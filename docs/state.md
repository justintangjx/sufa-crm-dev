# Repository state

Live snapshot for coding agents. Update this file when behaviour, deployment, gaps, or the build queue changes. Canonical requirements stay in `prd.md`.

## Now

- Phase 0 done: shell components, campaign capabilities, adapter payloads.
- Phase 1e done: coach routes in `src/routes/coach/`; `src/App.tsx` removed.
- U24 roster + evaluation redesign done: closed roster (admin creates players, email is
  the login key), append-only evaluation history with drafts, bidirectional NPS. See
  [`domains/campaign.md`](domains/campaign.md) decision log (2026-07-13 entries).
- Soft coach assessment cadence shipped: max 2 submitted per player with nudge at 0 and
  confirm at/over 2 (`src/lib/matrixSoftLimit.ts` on `CoachCampaignPage`). DB stays
  append-only.
- Pilot hide + ops shipped: U24 capabilities hide Growth/legacy Evaluate; admin coach
  assign UI; `distinctSubmittedCoachCount` rename; NPS post-primary panel +
  `buildNpsAggregateSnapshot` (Telegram deferred).
- MVP focus: U24 Worlds 2026 — three team campaigns (`c-u24` Mixed, `c-u24-opens`, `c-u24-womens`) plus `c-survey-test` for prod questionnaire smoke. SEA Games 2026 is legacy Growth Matrix demo data.
- Pilot roster policy: open band (~12–25 players, 1–3 coaches), not a frozen exact N.
  All coaches use role `coach` (no head/assistant UX). See campaign decision log.

## Pilot next

`pnpm harness --profile pilot-u24 --run` + human migrations/env/smoke. Do **not** DROP
Growth Matrix / coach-LLM schema before FULL_GO (hide via flags + capabilities only).

## Next queue (after / beside pilot)

1. `/admin/players` search and filters.
2. `/admin/exports` CSV actions (questionnaire response export ships with `#survey`, not here).
3. Expand Playwright E2E for U24 matrix + questionnaire + soft-limit confirms + coach assign + roster import.
4. NPS Telegram delivery after aggregate dashboard is trusted (peer NPS; questionnaire chase copy is manual for now).
5. Optional Sheets `fetchSheetRows` adapter if CSV download becomes ops pain.
6. Post-FULL_GO cleanup only: decide kill vs keep Growth Matrix demos / LLM stack / peer NPS.

## Implemented

- Vite + React + TypeScript SPA; mock and Supabase backends via `src/data/index.ts`.
- Supabase migrations + RLS in `supabase/migrations/`.
- Row types: `src/types/database.ts`. API contract: `src/data/types.ts`.
- Payload mappers: `src/data/payloads/`. Adapters: `mockApi.ts`, `supabaseApi.ts`.
- Auth, role guards, shell UI: `src/components/shell/`, `src/routes/` (auth, admin, coach, player).
- Campaign gating: `src/lib/campaignCapabilities.ts`, `src/lib/campaignUi.ts`.
- Player profile + change-request audit; admin readiness + review assistants.
- Coach evaluations + note-structuring copilot (deterministic or Edge Function LLM).
- Closed roster: `/admin/players` add/edit (name, email, gender, DOB, positions), login
  status column, campaign-detail create-and-assign; sign-in gated by
  `can_request_player_magic_link` RPC; `handle_new_user` links roster athletes by email.
- U24 evaluation history: append-only submitted self-evaluations and coach assessments with
  one open draft per tuple; player/coach timelines; submitted rows immutable via RLS.
- Soft coach matrix cadence: `matrixSoftLimit.ts` (nudge at 0, confirm at/over 2 submitted).
- U24 capability hide: Growth Matrix and legacy Evaluate off when live matrix is on
  (`campaignCapabilities.ts`).
- Admin dashboard lists every campaign with per-campaign next actions (roster, coaches,
  NPS only); review queue stays in the header.
- Pilot profile scope: passport/travel fields hidden unless `VITE_ENABLE_TRAVEL_READINESS=true`
  (default off); admin Players table drops passport column.
- Admin can remove campaign coach assignments (`unassignCampaignCoach`).
- Admin can remove players from a campaign roster (`unassignCampaignMember`); pending NPS
  assignments with no responses are dropped on unassign; list/submit NPS gates on active membership.
- Campaign detail (pilot): roster CSV, roster table, manual add toggle, coach Auth checklist,
  NPS `#nps` panel; ops in `src/lib/adminCampaignOps.ts` (Telegram-bot friendly).
- Admin coach assignment on campaign detail (`listCoachProfiles` /
  `listCampaignCoaches` / `assignCampaignCoach` / mock `createCoachProfile`).
- Campaign roster CSV import: `planRosterImport` + preview/commit on campaign detail
  (`AdminRosterImportPanel`); email match key; coaches and multi-team splitting out.
- Matrix coverage field: `distinctSubmittedCoachCount` (not soft 2/2 own-submit count).
- NPS post-primary admin UI + `buildNpsAggregateSnapshot`; mock seed keeps mid+post closed.
- Bidirectional NPS: players rate coaches and coaches rate players per survey;
  direction-specific withhold thresholds; admin report shows both directions
  (feature-flagged on Supabase; hidden on U24 when questionnaire flag is on).
- End-of-campaign **questionnaire** (`campaign_survey_*`): CSV import with `audience`
  column, admin `#survey` panel (publish/open/close, completion roster, aggregates,
  export, chase copy), player/coach sectioned Likert form. U20 fixture in
  `src/fixtures/u20Questionnaire.ts`. UX spec: [`domains/campaign-survey-admin.md`](domains/campaign-survey-admin.md).
  Flag: `VITE_ENABLE_CAMPAIGN_QUESTIONNAIRE`. Pilot campaigns: `c-u24`, `c-u24-opens`,
  `c-u24-womens`; prod smoke: `c-survey-test` (questionnaire only, no matrix).
- Deploy/pilot harness: `harness/manifest.json` + `pnpm harness` (flag→migration→eval
  go/no-go; profiles `baseline`, `pilot-u24`, `coach-llm`). Suites are profile-only;
  `--run` is AUTOMATED_GO only; printout labels MACHINE vs HUMAN and lists OFF-flag
  Cloudflare keep-false notes. Not the PRD §22 assistant eval harness.

## Known gaps

- `/admin/exports` placeholder; export helpers exist in `src/lib/csv.ts` (roster import is separate).
- Light E2E coverage; coach evaluation submit validation is minimal.
- Production magic links need deliverable emails (`.test` addresses are mock-only).
- Supabase cannot create Auth coach users from the CRM client; create Auth user with
  `role=coach` then assign on campaign detail.
- End-of-campaign questionnaire not yet applied on production Supabase (migration
  `20260729100000_campaign_questionnaires.sql`). Peer NPS ≠ tournament survey.
- NPS Telegram delivery not wired.
- Apply `20260723100000_admin_roster_coach_grants.sql` if admin coach assign / athlete
  create / roster remove / NPS assignment cleanup returns permission denied.

## Deployment snapshot

| Item             | Value                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| Cloudflare Pages | `sufa-crm-dev` → https://sufa-crm-dev.pages.dev                                  |
| Supabase         | https://kowzzhlpeesmuoosuobl.supabase.co                                         |
| Build            | `pnpm build` → `dist`                                                            |
| Required env     | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`, `NODE_VERSION=22` |

Optional flags (default off on Supabase until migrations + seed):

```txt
VITE_ENABLE_CAMPAIGN_EVALUATION_MATRIX=false
VITE_ENABLE_CAMPAIGN_QUESTIONNAIRE=false
VITE_ENABLE_CAMPAIGN_NPS=false
VITE_ENABLE_PLAYER_GROWTH_MATRIX=false
VITE_ENABLE_COACH_LLM=false
```

Campaign-management migrations (apply in order): `20260704000000_campaign_management_pivot.sql`, `20260713000000_closed_roster.sql`, `20260713000100_evaluation_history.sql`, `20260713000200_bidirectional_nps.sql`, `20260729100000_campaign_questionnaires.sql`.

Detailed Supabase/Cloudflare setup: [`domains/campaign.md`](domains/campaign.md) and [`coach-llm.md`](coach-llm.md).

## Demo quick-ref

Mock mode (no Supabase env, or `VITE_USE_MOCK=true`):

- `admin@sufa.test`, `coach@sufa.test`, `alice@sufa.test`, `derrick@sufa.test`
- `elle@sufa.test`: roster-only player (no profile yet); first sign-in shows closed-roster provisioning (invited → registered)
- U24 campaigns: `c-u24` (Mixed), `c-u24-opens`, `c-u24-womens`; questionnaire smoke `c-survey-test`
- Selected players Alice, Ben, Cara on Mixed; Alice also on `c-survey-test`
- All campaign feature flags enabled in mock/test; U24 shows questionnaire (not peer NPS)

U24 smoke path: sign in as admin → `/admin/campaigns/c-u24` → matrix + `#survey` questionnaire panels.
Prod questionnaire-only smoke: `/admin/campaigns/c-survey-test` with `VITE_USE_MOCK=false` and `VITE_ENABLE_CAMPAIGN_QUESTIONNAIRE=true`.

Growth Matrix (legacy): `alice@sufa.test` → SEA Games `c-sea` (not U24).

## Verification

```bash
pnpm check    # typecheck + lint + format + unit tests
pnpm e2e      # after route/auth changes
pnpm harness --profile baseline --run   # merge/deploy automated gate
pnpm harness --profile pilot-u24        # print U24 pilot go/no-go + manual deps
```

Flag enable / pilot ship decisions: [`harness.md`](harness.md) / [`../harness/manifest.json`](../harness/manifest.json).
