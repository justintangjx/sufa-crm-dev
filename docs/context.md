# SUFA CRM Context

This is the quick-start context for coding agents opening this repository fresh. It
summarizes the current implementation, deployment state, demo caveats, and next work.
It does not replace `prd.md`, which remains the canonical product spec.

## Canonical Inputs

- Product/build spec: `prd.md`
- Agent rules: `AGENTS.md`
- Tooling commands: `docs/tooling.md`
- Multi-agent workflow: `docs/agent-orchestration.md`
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
- Component/unit tests for the current MVP agent flows.
- Cloudflare Pages SPA fallback in `public/_redirects`.

Known gaps:

- Most UI still lives in `src/App.tsx`; split it into route/page modules before heavy
  parallel role-agent work.
- `/admin/players` needs real search and filters.
- `/admin/exports` is still a placeholder despite CSV helper logic existing.
- Campaign creation/invitation flows are minimal or missing.
- Coach evaluation submit validation is light.
- E2E tests are not yet implemented.
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

## Runtime Modes

The app chooses a backend in `src/data/index.ts`.

- Without Supabase env vars, it uses the in-memory mock backend.
- With Supabase env vars, it uses `src/data/supabaseApi.ts`.
- In Vitest/test mode, it always uses the mock backend even if `.env.local` contains
  Supabase credentials.
- Both implementations satisfy the `Api` interface in `src/data/types.ts`.

Mock backend seed users:

- `admin@sufa.test`
- `coach@sufa.test`
- `alice@sufa.test`
- `ben@sufa.test`
- `cara@sufa.test`

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

Then map those users to the desired roles and seed data in `public.profiles`,
`public.athletes`, campaigns, members, coaches, and change requests.

For a pure product demo using the `.test` emails, deploy a separate Cloudflare preview
or Pages project with:

```txt
VITE_USE_MOCK=true
```

That mode bypasses real magic-link delivery and uses the in-memory mock backend.

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

Coach assistant:

```txt
/coach
open assigned campaign
evaluate a player
paste rough notes
click Structure notes
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
