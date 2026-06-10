# Agent Context

This file is the quick-start handoff for coding agents opening this repository fresh.
It does not replace the product spec. Read `prd.md` and `docs/tooling.md` before
coding.

## Canonical Inputs

- Product/build spec: `prd.md`
- Agent rules: `AGENTS.md`
- Tooling commands and conventions: `docs/tooling.md`
- Database source of truth: `supabase/migrations/`
- Runtime data boundary: `src/data/types.ts`

## Current Shape

The repository is already a Vite + React + TypeScript app with Supabase-oriented data
boundaries and deterministic MVP logic.

Implemented or partially implemented:

- Package scripts for `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm format`,
  `pnpm test`, `pnpm e2e`, and `pnpm check`.
- Supabase schema/RLS migrations in `supabase/migrations/`.
- Domain row types in `src/types/database.ts`.
- Shared API interface in `src/data/types.ts`.
- In-memory mock backend and seed data in `src/data/mockApi.ts` and `src/data/seed.ts`.
- Supabase-backed API adapter in `src/data/supabaseApi.ts`.
- Auth context in `src/auth/AuthContext.tsx`.
- Deterministic helper logic in `src/lib/` for roles, profile completion, passport
  readiness, CSV export, and assistant drafts.
- Unit tests for core pure logic.
- CSS shell styles in `src/index.css`.

Not yet wired into a usable MVP UI:

- `src/App.tsx` is still the Vite starter screen.
- `src/main.tsx` does not wrap the app in `AuthProvider` or a router.
- The required product routes from `prd.md` do not exist yet as screens.
- Login, role redirects, route guards, dashboards, forms, tables, and coach evaluation
  flows still need UI implementation.

## MVP Invariants

- Database/RLS is the source of truth; assistant output is draft/supporting text only.
- Build CRM screens first. Do not turn the MVP into a chatbot.
- Respect role boundaries in both UI and data access.
- Coaches should not see passport, medical, NRIC, or admin-sensitive fields by default.
- Player profile edits may update the athlete row directly for MVP, but must also leave
  an audit trail through change requests.
- Assistant drafts must not be auto-sent or auto-submitted.

## Local Data Model

The app chooses a backend in `src/data/index.ts`.

- Without Supabase env vars, it uses the in-memory mock backend.
- With Supabase env vars, it uses `src/data/supabaseApi.ts`.
- Both implementations satisfy the `Api` interface in `src/data/types.ts`.

Seed users in the mock backend:

- `admin@sufa.test`
- `coach@sufa.test`
- `alice@sufa.test`
- `ben@sufa.test`
- `cara@sufa.test`

## Recommended Next Slice

Build the app shell and route scaffolding next:

1. Wrap the app in `AuthProvider` and React Router.
2. Replace the Vite starter in `src/App.tsx` with route definitions.
3. Add `/login`, `/auth/callback`, `/`, and role-protected layout routes.
4. Implement simple dashboard pages that read from the existing `api` interface.
5. Add component tests for login, role redirect, and at least one dashboard.

Keep this first UI slice narrow. Use the mock backend to make the app usable offline
before adding deeper Supabase-specific behaviour.

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
