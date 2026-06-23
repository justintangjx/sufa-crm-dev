# SUFA CRM

CRM for Singapore Ultimate: player profiles, campaign readiness, admin review, and coach
evaluations. The app is a Vite + React + TypeScript SPA. Supabase holds the data. Optional
Edge Functions handle coach note structuring when you turn that on.

**Live demo:** [sufa-crm-dev.pages.dev](https://sufa-crm-dev.pages.dev)

## Who uses it

- **Players** complete profiles and join campaigns.
- **Admins** track readiness, review change requests, and run deterministic assistants
  (reminders, queue summary). No auto-send.
- **Coaches** evaluate players. Rough notes can be structured into an editable draft.
  The coach still sets ratings, recommendations, and submit.

## Local development

```bash
pnpm install
cp .env.example .env.local   # optional; mock mode works without Supabase
pnpm dev
```

Without Supabase env vars, the app uses an in-memory mock backend. Demo logins such as
`coach@sufa.test` work there. See `docs/context.md` for mock vs Supabase vs hybrid demo
LLM modes.

**Checks before you push:**

```bash
pnpm check    # sync, typecheck, lint, format, unit tests
pnpm e2e      # after route or auth changes
```

Command details: `docs/tooling.md`.

## Documentation map

| If you are…                          | Read                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| Changing product behaviour           | `prd.md`                                                 |
| Coding in this repo (human or agent) | `AGENTS.md`, then `docs/context.md`                      |
| Coach LLM / evals                    | `docs/coach-llm.md`                                      |
| Deploying Cloudflare + Supabase      | `docs/context.md` (Deployment, Demo coach with live LLM) |
| Google Sheets export (planned)       | `docs/google-sheets-snapshots.md`                        |

Agents should follow `AGENTS.md` first. This README is for humans browsing the repo.

## Stack

React 19, React Router, Supabase (Postgres + Auth + Edge Functions), Cloudflare Pages.
Lint/format: Oxlint + Oxfmt. Tests: Vitest + Playwright.

## License

Private / internal SUFA use unless stated otherwise.
