# Code Map

Where code lives and who owns it. Read with `docs/state.md` before editing.

## Layers

```txt
supabase/migrations/          DB source of truth (schema + RLS)
src/types/database.ts         Row types (snake_case, mirrors DB)
src/data/payloads/            Input → DB field mapping (shared by adapters)
src/data/mockApi.ts           In-memory backend (dev + tests)
src/data/supabaseApi.ts       Supabase backend (production)
src/data/types.ts             Api interface + DTOs/views (camelCase inputs)
src/routes/index.tsx          Route wiring, TestApp, default App export
src/routes/auth/              Login, auth callback
src/routes/admin/             Admin dashboard, campaigns, review, players, exports
src/routes/coach/             Coach dashboard, campaign, evaluation + copilot panels
src/routes/player/            PlayerDashboard, PlayerProfilePage, PlayerCampaignPage
src/components/shell/         Layout, guards, shared form fields
src/lib/                      Domain logic (profile, passport, assistant, campaign)
src/auth/AuthContext.tsx      Session + profile
```

**Rule:** UI calls `api.*` only. Adapters enforce role boundaries; RLS is the final gate on Supabase.

## Feature flags (`src/lib/env.ts`)

| Flag                             | Production default                                | Gates                            |
| -------------------------------- | ------------------------------------------------- | -------------------------------- |
| `useMockBackend`                 | On when no Supabase creds or `VITE_USE_MOCK=true` | Entire backend                   |
| `enablePlayerGrowthMatrix`       | Off unless env true                               | Legacy Growth Matrix (SEA Games) |
| `enableCampaignEvaluationMatrix` | Off unless env true                               | U24 live player/coach matrix     |
| `enableCampaignNps`              | Off unless env true                               | U24 coach NPS                    |
| `enableCoachLlm`                 | Off unless Supabase + env true                    | Remote coach note Edge Function  |

Campaign identity gating: `campaignCapabilities(campaign)` in `src/lib/campaignCapabilities.ts`
combines flags with `isU24Campaign()` for matrix/NPS UI.

## Agent ownership lanes

| Lane            | Owns                                                                                    | Do not                              |
| --------------- | --------------------------------------------------------------------------------------- | ----------------------------------- |
| **Coordinator** | `src/routes/index.tsx`, `src/data/*`, `src/components/shell/`, migrations, shared types | Weaken RLS/guards                   |
| **Player**      | `/player/*` pages, profile completion UI                                                | Expose other players or coach evals |
| **Admin**       | `/admin/*` pages, reminder/review assistants                                            | Auto-send or auto-approve           |
| **Coach**       | `/coach/*` pages, evaluation copilot                                                    | Show passport/NRIC/medical fields   |

Branch/merge order: platform → role flows → integration. See `docs/agent-orchestration.md`.

## Evaluation domains (do not merge tables)

| Domain               | Tables                                                                             | Status                       |
| -------------------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| U24 live matrix      | `player_matrix_submissions`, `coach_matrix_assessments`, `evaluation_audit_events` | MVP focus                    |
| Legacy Growth Matrix | `player_growth_reviews`, signoffs, replies                                         | SEA Games demo; flag-gated   |
| Coach ratings form   | `coach_evaluations`                                                                | Legacy coach evaluation page |

## Key files by task

| Task               | Start here                                                       |
| ------------------ | ---------------------------------------------------------------- |
| New API method     | `src/data/types.ts` → both adapters                              |
| New DB table       | `supabase/migrations/` → `src/types/database.ts`                 |
| Campaign UI change | `campaignCapabilities.ts` + role page in `src/routes/`           |
| Coach LLM          | `docs/coach-llm.md`, `supabase/functions/structure-coach-notes/` |
| Tests              | `src/App.test.tsx`, `src/lib/*.test.ts`, `e2e/`                  |
