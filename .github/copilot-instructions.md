# SUFA CRM Coding Agent Instructions

Before coding, read:

1. `prd.md`
2. `AGENTS.md`
3. `docs/context.md`
4. `docs/tooling.md`
5. `docs/agent-orchestration.md` when multiple agents or role-specific work is involved

Core rules:

- The database is the source of truth, not the assistant.
- Build CRM screens first; assistant features only draft and summarize.
- Preserve role boundaries for players, admins, and coaches.
- Do not expose coach-restricted player fields.
- Do not auto-send assistant drafts or auto-submit generated evaluations.
- Do not weaken RLS, auth checks, or tests to make a suite pass.
- Use pnpm commands from `docs/tooling.md`.
- For multi-agent work, keep player/admin/coach changes inside the ownership lanes in
  `docs/agent-orchestration.md`.
