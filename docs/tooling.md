# Tooling

This MVP uses the Oxc toolchain (Oxlint + Oxfmt) on top of Vite + React + TypeScript,
with Vitest for unit/component tests and Playwright for end-to-end tests. The package
manager is **pnpm** (enabled via Corepack, so commands match this doc verbatim).

## Quick reference

| Task                 | Command             |
| -------------------- | ------------------- |
| Dev server           | `pnpm dev`          |
| Type check           | `pnpm typecheck`    |
| Lint                 | `pnpm lint`         |
| Lint (CI gate)       | `pnpm lint:strict`  |
| Format (write)       | `pnpm format`       |
| Format (check)       | `pnpm format:check` |
| Unit/component tests | `pnpm test`         |
| E2E tests            | `pnpm e2e`          |
| Aggregate gate       | `pnpm check`        |

## Oxlint

Oxlint is a very fast JS/TS linter from the Oxc toolchain. It catches **correctness**,
**suspicious**, and **performance** problems — bugs and risky patterns — not cosmetic style.

- `pnpm lint` reports warnings and errors.
- `pnpm lint:strict` runs `oxlint --deny-warnings .` so any warning fails the build (CI gate).

### What linting catches (vs. formatting)

- **Linting** finds _potential problems_: unused variables, shadowed names, unreachable
  code, misuse of hooks, accidental coercions, etc. Fixing them can change behaviour.
- **Formatting** only changes _whitespace/layout_. It never changes meaning.

Keeping them separate means the agent never argues about brace placement (a formatter
decision) and instead focuses lint feedback on real defects.

### Why fast lint feedback helps AI-generated code

An agent writes code in tight loops. Oxlint runs in milliseconds, so the agent gets an
almost-instant signal after each edit and can self-correct before tests even run. Slow
linters break that loop and let mistakes pile up.

### Enabled rules/categories (`.oxlintrc.json`)

- Categories: `correctness` = **error**, `suspicious` = **warn**, `perf` = **warn**.
- Plugins: `typescript`, `unicorn`, `oxc`, `react`, `import`.
- Deliberately disabled:
  - `react/react-in-jsx-scope` — not needed with React 19's automatic JSX runtime.
  - `unicorn/filename-case` — we use PascalCase for component files by convention.
- The broad `style` category is **not** enabled: Oxfmt owns formatting, and several
  style rules (`sort-keys`, `no-ternary`, `no-magic-numbers`) are too opinionated for an
  MVP and would only add noise. Re-enable later if the team wants stricter style gates.

## Oxfmt

Oxfmt is the Oxc formatter. It is the **default formatter** for this project.

- `pnpm format` formats in place (`oxfmt --write .`).
- `pnpm format:check` verifies formatting without writing (used in `pnpm check`).
- Config: `.oxfmtrc.json` (defaults + ignore patterns for build/test output).

> **Stability note:** Oxfmt is pre-1.0 (currently `0.5x`). It is installable and stable
> enough for this MVP, so we use it directly instead of the Prettier fallback. If a future
> upgrade regresses, switch the `format`/`format:check` scripts to
> `prettier --write .` / `prettier --check .` and record the reason here.

The agent should **not debate formatting** — it just runs `pnpm format` before committing.

## Vite (and "Vite+")

Vite is the dev server and bundler.

- `pnpm dev` starts the HMR dev server (default `http://localhost:5173`).
- `pnpm build` type-checks (`tsc -b`) then produces the production bundle.
- **Vitest reuses the Vite config** (`vite.config.ts` holds the `test` block), so the same
  transforms/resolve rules apply in tests as in the app — fewer "works in app, fails in
  test" surprises.

> **"Vite+" learning note:** the newer VoidZero / Oxc / Rolldown direction (Rolldown-powered
> Vite, unified Oxc tooling) aims to reduce JS-tooling fragmentation. This MVP stays on
> stable Vite and only adopts Oxc for lint/format. Treat Rolldown/Vite+ as a future
> optimisation, not an MVP dependency.

## Void

Void is an open-source AI code editor; it (or any VS Code-compatible editor) is the
environment where the coding agent works. Persistent agent instructions live in
[`AGENTS.md`](../AGENTS.md): read the spec first, make small changes, run tests before
declaring success, never weaken assertions or disable RLS/auth to make tests pass, and
ask before adding major dependencies.

The division of labour: **Void is the environment, the agent is the collaborator, and the
tests + CI gate (`pnpm check`) are the judge.**

## Notes / deviations

- `pnpm check` runs typecheck + lint + format:check + unit tests. `pnpm e2e` is kept
  separate because Playwright needs browser binaries and a running dev server; run it on
  its own (and in CI) rather than inside the fast inner-loop gate.
