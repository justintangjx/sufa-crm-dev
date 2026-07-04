# Agent instructions (SUFA CRM)

Read before coding. Full doc index: [`docs/README.md`](docs/README.md).

## Tier 0 — read every session

1. [`docs/state.md`](docs/state.md) — current implementation, gaps, deployment, next queue
2. [`docs/codemap.md`](docs/codemap.md) — layers, ownership, feature flags

## Tier 1 — read when the task needs it

| Task                       | Read                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| Product behaviour / schema | [`prd.md`](prd.md) via [`docs/prd-index.md`](docs/prd-index.md)  |
| Campaign / matrix / NPS    | [`docs/domains/campaign.md`](docs/domains/campaign.md)           |
| Structural refactor        | [`docs/cleanup-refactor-plan.md`](docs/cleanup-refactor-plan.md) |
| Coach LLM                  | [`docs/coach-llm.md`](docs/coach-llm.md)                         |
| Commands                   | [`docs/tooling.md`](docs/tooling.md)                             |
| Multi-agent work           | [`docs/agent-orchestration.md`](docs/agent-orchestration.md)     |

Do not read `prd.md` cover-to-cover for small fixes. Do not read future-plan docs unless implementing that feature.

## Core principles (do not violate)

- **The database is the source of truth, not the assistant.** Drafts only; never auto-send or auto-save sensitive data.
- **CRM first, agent second.** Real screens, not a chatbot UI.
- **Role-based access is a hard boundary.** Coaches never see passport/NRIC/admin-sensitive fields by default.
- **Auditability.** Important profile changes record who/what/when.
- **Production-safe by default.** Unprovisioned infrastructure → feature flag off; safe fallback UI.

## Working style

- Small, focused changes. Match surrounding code. No narration comments.
- Ask before major dependencies (`pnpm add`).
- Feature flags: `VITE_*` in `.env.example`, production-default-off, documented in `state.md`.
- Multi-agent: respect lanes in `docs/codemap.md` / `docs/agent-orchestration.md`.
- **Doc updates:** change `docs/state.md` when behaviour/deployment/gaps change; append architecture decisions to `docs/domains/campaign.md`; edit `prd.md` only when requirements change.

## Tests and checks

```bash
pnpm check    # minimum before declaring success
pnpm e2e      # route/auth/cross-role changes
pnpm format   # before finishing
```

Do not weaken assertions, disable RLS, or skip tests to pass. Keep `pnpm lint:strict` clean on touched code.

## Definition of done

1. `pnpm typecheck` 2. `pnpm lint` 3. `pnpm format` 4. Relevant tests pass 5. RLS/role boundaries intact 6. New infra behind flags with fallback

Final responses must state manual **Supabase** and **Cloudflare** work required, or "none".
