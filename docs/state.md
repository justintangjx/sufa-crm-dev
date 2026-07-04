# Repository State

Live snapshot for coding agents. Update this file when behaviour, deployment, gaps, or the
build queue changes. Canonical requirements remain in `prd.md`.

## Now

- **Phase 0** done: shell components, campaign capabilities, adapter payloads.
- **Phase 1e** done: coach routes in `src/routes/coach/`; `src/App.tsx` removed.
- MVP focus: **U24 Worlds 2026** (`c-u24`). SEA Games 2026 is legacy Growth Matrix demo data.

## Next queue

1. U24 roster CSV import.
2. `/admin/players` search and filters.
3. `/admin/exports` CSV actions.
4. Expand Playwright E2E for U24 matrix/NPS flows.

## Implemented

- Vite + React + TypeScript SPA; mock and Supabase backends via `src/data/index.ts`.
- Supabase migrations + RLS in `supabase/migrations/`.
- Row types: `src/types/database.ts`. API contract: `src/data/types.ts`.
- Payload mappers: `src/data/payloads/`. Adapters: `mockApi.ts`, `supabaseApi.ts`.
- Auth, role guards, shell UI: `src/components/shell/`, `src/routes/` (auth, admin, coach, player).
- Campaign gating: `src/lib/campaignCapabilities.ts`, `src/lib/campaignUi.ts`.
- Player profile + change-request audit; admin readiness + review assistants.
- Coach evaluations + note-structuring copilot (deterministic or Edge Function LLM).
- U24 live matrix, coach assessments, audit events, coach NPS (feature-flagged on Supabase).

## Known gaps

- No bulk U24 roster import (one-by-one `campaign_members` assignment only).
- `/admin/exports` placeholder; CSV helpers exist in `src/lib/csv.ts`.
- Light E2E coverage; coach evaluation submit validation is minimal.
- Production magic links need deliverable emails (`.test` addresses are mock-only).

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
VITE_ENABLE_CAMPAIGN_NPS=false
VITE_ENABLE_PLAYER_GROWTH_MATRIX=false
VITE_ENABLE_COACH_LLM=false
```

Campaign-management migration: `supabase/migrations/20260704000000_campaign_management_pivot.sql`.

Detailed Supabase/Cloudflare setup: [`domains/campaign.md`](domains/campaign.md) and [`coach-llm.md`](coach-llm.md).

## Demo quick-ref

**Mock mode** (no Supabase env, or `VITE_USE_MOCK=true`):

- `admin@sufa.test`, `coach@sufa.test`, `alice@sufa.test`, `derrick@sufa.test`
- U24 campaign `c-u24`; selected players Alice, Ben, Cara
- All campaign feature flags enabled in mock/test

**U24 smoke path:** sign in as admin → `/admin/campaigns/c-u24` → matrix + NPS panels.

**Growth Matrix (legacy):** `alice@sufa.test` → SEA Games `c-sea` (not U24).

## Verification

```bash
pnpm check    # typecheck + lint + format + unit tests
pnpm e2e      # after route/auth changes
```
