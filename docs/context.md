# SUFA CRM Context

This is the quick-start context for coding agents opening this repository fresh. It
summarizes the current implementation, deployment state, demo caveats, and next work.
It does not replace `prd.md`, which remains the canonical product spec.

## Canonical Inputs

- Product/build spec: `prd.md`
- Agent rules: `AGENTS.md`
- Tooling commands: `docs/tooling.md`
- Multi-agent workflow: `docs/agent-orchestration.md`
- U24 campaign architecture + decision log: `docs/campaign-architecture.md`
- Cleanup/refactor plan: `docs/cleanup-refactor-plan.md`
- Future Google Sheets campaign snapshot implementation:
  `docs/google-sheets-snapshots.md`
- Coach LLM architecture and evaluation: `docs/coach-llm.md`
- Database source of truth: `supabase/migrations/`
- Runtime data boundary: `src/data/types.ts`

## Current Status

The repository is a Vite + React + TypeScript app with Supabase-oriented data
boundaries, deterministic assistant logic, and deployed Cloudflare/Supabase wiring.

Implemented:

- Package scripts for `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm format`,
  `pnpm test`, `pnpm e2e`, and `pnpm check`.
- Supabase schema/RLS migrations in `supabase/migrations/`.
- Domain row types in `src/types/database.ts`.
- Shared API interface in `src/data/types.ts`.
- In-memory mock backend and seed data in `src/data/mockApi.ts` and `src/data/seed.ts`.
- Supabase-backed API adapter in `src/data/supabaseApi.ts`.
- Auth context in `src/auth/AuthContext.tsx`.
- Deterministic helper logic in `src/lib/` for roles, profile completion, passport
  readiness, CSV export, and assistant behaviour.
- Role-aware routing, login, dashboard shell, and route guards in `src/App.tsx`.
- Player dashboard and editable profile form with change-request audit records.
- Admin dashboard, player table, campaign readiness command center, reminder draft
  assistant, and review-queue triage assistant.
- Coach dashboard, coach-safe campaign player list, and rough-notes-to-evaluation
  assistant.
- U24 Worlds campaign-management pivot:
  - active mock campaign `c-u24` / `U24 Worlds 2026`
  - live player self-evaluation matrix
  - coach matrix assessment with audit events
  - admin matrix status and audit panel
  - admin-managed mid/post coach NPS with aggregate threshold reporting
- Component/unit tests for the current MVP agent flows.
- Cloudflare Pages SPA fallback in `public/_redirects`.

Known gaps:

- Most UI still lives in `src/App.tsx`; split it into route/page modules before heavy
  parallel role-agent work. See `docs/cleanup-refactor-plan.md`.
- U24 selected-player upload/import is not implemented. Admins can only assign existing
  athletes to a campaign one at a time from `/admin/campaigns/:campaignId`; production
  roster setup still needs manual seeding or a future roster import flow.
- `/admin/players` needs real search and filters.
- `/admin/exports` is still a placeholder despite CSV helper logic existing.
- Campaign creation/invitation flows are minimal or missing.
- Coach evaluation submit validation is light.
- E2E coverage exists but is still light; expand it for U24 admin/player/coach matrix
  and NPS flows.
- Production Supabase Auth needs deliverable emails; `.test` demo emails work only in
  mock mode.

## MVP Invariants

- Database/RLS is the source of truth; assistant output is draft/supporting text only.
- Build CRM screens first. Do not turn the MVP into a chatbot.
- Respect role boundaries in both UI and data access.
- Coaches should not see passport, medical, NRIC, or admin-sensitive fields by default.
- Player profile edits may update the athlete row directly for MVP, but must also leave
  an audit trail through change requests.
- Assistant drafts must not be auto-sent or auto-submitted.
- Assistant suggestions must not approve/reject profile changes or submit evaluations.
- Features that need extra production setup must be feature-flagged off by default until
  that setup is complete. This includes new migrations, Supabase Edge Functions,
  provider/API secrets, webhooks, n8n/Google integrations, background jobs, or manual
  seed/configuration steps. The safe default must not call missing infrastructure.

## Runtime Modes

The app chooses a backend in `src/data/index.ts`.

- Without Supabase env vars, it uses the in-memory mock backend.
- With Supabase env vars, it uses `src/data/supabaseApi.ts`.
- In Vitest/test mode, it always uses the mock backend even if `.env.local` contains
  Supabase credentials.
- Both implementations satisfy the `Api` interface in `src/data/types.ts`.
- Client-visible feature flags use `VITE_*` environment variables and should default to
  production-safe behaviour. Example: `VITE_ENABLE_COACH_LLM=false` keeps coach note
  structuring on the local deterministic path until the Edge Function and model secrets
  are deployed.
- `VITE_ENABLE_PLAYER_GROWTH_MATRIX=false` keeps the audited Growth Matrix workflow off
  on Supabase-backed deployments until the `player_growth_matrix` migration has been
  applied. Mock mode enables the flow for local demos/tests.
- `VITE_ENABLE_CAMPAIGN_EVALUATION_MATRIX=false` keeps the U24 live matrix off on
  Supabase-backed deployments until `20260704000000_campaign_management_pivot.sql` is
  applied and campaign data is seeded. Mock mode enables it for local demos/tests.
- `VITE_ENABLE_CAMPAIGN_NPS=false` keeps campaign NPS off on Supabase-backed deployments
  until the same migration and survey/assignment data path are ready. Mock mode enables
  it for local demos/tests.

Mock backend seed users:

- `admin@sufa.test`
- `coach@sufa.test`
- `alice@sufa.test`
- `ben@sufa.test`
- `cara@sufa.test`
- `derrick@sufa.test` (blank player profile for form-completion demos)

Player Growth Matrix demo:

- In mock mode, use `Player (Alice - Matrix)` / `alice@sufa.test`, then open SEA
  Games 2026 from the player dashboard. Alice has a shared `Q1 2026` matrix review
  with two coach sign-offs and can submit a right-of-reply.
- For Supabase-backed demos, create Auth users for `admin@sufa.test`,
  `coach@sufa.test`, `coach2@sufa.test`, and `alice@sufa.test`, then run
  `supabase/seed-player-growth-demo.sql` after applying migrations.

U24 Worlds campaign demo:

- In mock mode, admin/coach/player dashboards prefer `U24 Worlds 2026` (`c-u24`).
- Mock U24 selected players are Alice, Ben, and Cara through `campaign_members`.
- Alice has a submitted player matrix and one submitted coach assessment.
- The mid-season coach NPS survey is open and aggregate reporting is withheld until at
  least three responses exist for a coach.
- There is no CSV/upload path for U24 selected-player details yet.

## Deployment

Current deployment:

- Cloudflare Pages app: `sufa-crm-dev`
- Production URL: `https://sufa-crm-dev.pages.dev`
- Supabase project URL: `https://kowzzhlpeesmuoosuobl.supabase.co`

Cloudflare Pages settings:

- Framework preset: React/Vite
- Build command: `pnpm build`
- Build output directory: `dist`
- Root directory: leave blank
- Required env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_APP_URL=https://sufa-crm-dev.pages.dev`
  - `NODE_VERSION=22`

Optional feature flags for Supabase-backed campaign management:

```txt
VITE_ENABLE_CAMPAIGN_EVALUATION_MATRIX=false
VITE_ENABLE_CAMPAIGN_NPS=false
```

Only set these to `true` in Cloudflare after the campaign-management migration has been
applied and production data has been seeded.

React Router fallback:

```txt
public/_redirects
/* /index.html 200
```

Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref kowzzhlpeesmuoosuobl
npx supabase db push
```

Campaign-management migration:

```txt
supabase/migrations/20260704000000_campaign_management_pivot.sql
```

Manual Supabase setup for real U24 campaign use:

1. Apply migrations.
2. Create real Auth users and `profiles` for admins, coaches, and players.
3. Create/import `athletes`.
4. Create the U24 campaign row if needed.
5. Insert selected players into `campaign_members`.
6. Insert coaches into `campaign_coaches`.
7. Enable Cloudflare feature flags only after the above is complete.

Coach-note migrations must apply in order:

1. `20260615000000_coach_note_generation.sql`
2. `20260617000000_coach_note_copilot.sql`
3. `20260618000000_coach_note_deterministic_telemetry.sql`

See `docs/coach-llm.md` for Edge Function deploy and `VITE_ENABLE_COACH_LLM`.

Supabase Auth URL configuration:

- Site URL: `https://sufa-crm-dev.pages.dev`
- Redirect URLs:
  - `https://sufa-crm-dev.pages.dev/auth/callback`
  - `http://localhost:5173/auth/callback`

Remove malformed redirect URLs such as `https://sufa-crm-dev/auth/callback`.

Do not commit `.env.local`, Supabase service-role keys, database passwords, or any
non-public secrets.

## Demo Users

The `.test` emails are for mock mode only. Supabase Auth may reject fake `.test`
addresses or fail to deliver magic links.

For a real Supabase-auth demo, use deliverable aliases such as:

- `yourname+admin@gmail.com`
- `yourname+coach@gmail.com`
- `yourname+alice@gmail.com`
- `yourname+ben@gmail.com`
- `yourname+cara@gmail.com`
- `yourname+derrick@gmail.com`

Then map those users to the desired roles and seed data in `public.profiles`,
`public.athletes`, campaigns, members, coaches, and change requests.

For a pure product demo using the `.test` emails, deploy a separate Cloudflare preview
or Pages project with:

```txt
VITE_USE_MOCK=true
```

That mode bypasses real magic-link delivery and uses the in-memory mock backend.

**Demo coach with live LLM** (one-click `coach@sufa.test` + real model drafting):

```txt
VITE_USE_MOCK=true
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_DEMO_COACH_LLM=true
VITE_COACH_DEMO_GATE_TOKEN=<same value as COACH_DEMO_GATE_TOKEN edge secret>
VITE_DEMO_COACH_LLM_ID_MAP={"c-sea":"c0000000-0000-4000-8000-000000000001","a-alice":"a0000000-0000-4000-8000-000000000001","a-ben":"a0000000-0000-4000-8000-000000000002","a-cara":"a0000000-0000-4000-8000-000000000003"}
```

Supabase setup for hybrid demo:

1. Apply coach-note migrations (`pnpm` / `supabase db push`).
2. Deploy `structure-coach-notes` and `demo-coach-session`.
3. Create Supabase Auth user `coach-demo@sfda.sg` (password + auto-confirm), set
   `profiles.role = coach`, then run `supabase/seed-demo-coach.sql` in the SQL editor.
4. Edge secrets:

```txt
COACH_DEMO_ENABLED=true
COACH_DEMO_GATE_TOKEN=<matches VITE_COACH_DEMO_GATE_TOKEN>
COACH_DEMO_EMAIL=<demo coach login email>
COACH_DEMO_PASSWORD=<demo coach password>
COACH_NOTE_API_URL=...
COACH_NOTE_API_KEY=...
COACH_NOTE_MODEL=...
COACH_NOTE_PROVIDER_TIMEOUT_MS=60000
```

Keep `COACH_DEMO_ENABLED=false` on production deployments that should not issue demo sessions. The gate token is client-visible; demo mode is for controlled preview/demo hosts only. `demo-coach-session` rate-limits to 10 requests per client IP per hour (per edge isolate).

## Demo Flows

Admin campaign assistant:

```txt
/admin/campaigns
open a campaign
click Who is incomplete?
click Are we SportSync-ready?
click Draft reminders
```

Admin review assistant:

```txt
/admin/review
click Summarize queue
click Review risk
click Suggest decisions
```

Coach evaluation copilot (not a chatbot):

```txt
/coach
open assigned campaign
evaluate a player
review prior evaluations panel (read-only)
paste rough notes
click Structure notes
answer ambiguity cards or add more notes / regenerate section if needed
review fields
submit evaluation
```

Player flow:

```txt
/player
/player/profile
complete missing details
save profile
```

## Completed Slices

Covered by `pnpm check`:

- App shell, login, role routing, and route guards.
- Player dashboard and editable profile form with audit records.
- Admin campaign readiness command center with guided assistant prompts and reminder
  draft creation.
- Admin review assistant for queue summary, risk review, and suggested decisions.
- Coach rough-notes-to-structured-evaluation assistant with explicit save/submit.
- Cloudflare Pages deployment fallback.

## Next Build Queue

1. Split `src/App.tsx` into route/page modules for safer multi-agent work.
2. Add search and filters to `/admin/players`.
3. Implement CSV export actions in `/admin/exports`.
4. Add campaign creation and simple assignment management.
5. Improve coach evaluation validation and pending checklist.
6. Add Playwright E2E tests for player, admin, and coach flows.

## Verification Habit

For documentation-only changes, run `pnpm format:check` if feasible.

For code changes, run at least:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format
pnpm check
```

Run `pnpm e2e` for route, auth, dashboard, or cross-role flow changes.
