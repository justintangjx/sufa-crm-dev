# Agent instructions (SUFA CRM)

These are persistent instructions for any AI coding agent (Codex/Void/etc.) working in
this repository. Read them before writing code.

## Before coding

1. **Read the product/build spec** in [`prd.md`](prd.md) for SUFA CRM (the canonical
   requirements: roles, routes, database schema, RLS, assistant behaviour). Do not invent
   requirements.
2. Read [`docs/context.md`](docs/context.md) for the current implementation map,
   deployment state, demo flows, and next build queue.
3. Read [`docs/tooling.md`](docs/tooling.md) to know the commands and conventions.
4. For multi-agent work, read
   [`docs/agent-orchestration.md`](docs/agent-orchestration.md).

## Core principles (do not violate)

- **The database is the source of truth, not the assistant.** The assistant only helps
  users understand what is missing, drafts reminders, and structures notes for human
  confirmation. It never auto-sends or auto-saves sensitive data.
- **CRM first, agent second.** Build real screens (dashboards, tables, forms, review
  queues), not a chatbot UI.
- **Role-based access is a hard boundary.** Players, admins, and coaches see only what
  their role permits. Coaches never see passport/NRIC/admin-sensitive fields by default.
- **Auditability.** Important profile changes record who/what/when.
- **Production-safe by default.** If a feature requires extra deployment/setup before it
  works in production (new migrations, Edge Functions, provider/API keys, webhooks,
  n8n/Google setup, background jobs, external services, or manual data seeding), ship it
  behind a feature flag that defaults off in production. The app must keep working, and
  the default path must not call missing infrastructure.

## Working style

- Make **small, focused changes**. Prefer editing existing files over creating new ones.
- Write **boring, explicit code** over clever abstractions.
- Match the surrounding code and comment style. Don't add narration comments.
- **Ask before adding major dependencies.** Use pnpm (`pnpm add` / `pnpm add -D`).
- New feature flags should be explicit environment variables, documented in
  `.env.example` when they are client-visible, and named by capability
  (for example `VITE_ENABLE_COACH_LLM`). Prefer safe fallback UI over broken buttons.
- If multiple coding agents are active, respect the ownership lanes in
  [`docs/agent-orchestration.md`](docs/agent-orchestration.md). Do not edit a role-owned
  file at the same time as another agent without coordination.

## Tests and checks are the judge

- **Run tests before declaring success.** At minimum run `pnpm check`
  (typecheck + lint + format:check + unit tests). Run `pnpm e2e` for flow changes.
- **Do not weaken assertions** or delete/skip tests to make a suite pass. Fix the code.
- **Do not disable RLS, auth checks, or role guards** to make tests pass. If a test fails
  because of a permission boundary, the boundary is usually correct.
- Run `pnpm format` before finishing; never hand-tune formatting.
- Keep `pnpm lint:strict` clean (zero warnings) for code you touch.

## Definition of done for a change

1. Types pass (`pnpm typecheck`).
2. Lint passes with no new warnings (`pnpm lint`).
3. Code is formatted (`pnpm format`).
4. Relevant unit/component tests pass and new behaviour is covered.
5. RLS/role boundaries are intact.
6. Any feature that depends on unprovisioned production infrastructure has a
   production-default-off feature flag, documented setup steps, and a verified fallback.
