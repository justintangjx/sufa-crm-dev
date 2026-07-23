# Tooling

Oxc toolchain (Oxlint + Oxfmt) on Vite + React + TypeScript, Vitest for unit/component tests, Playwright for e2e. Package manager is pnpm via Corepack. Commands below match this doc verbatim.

## Quick reference

| Task                    | Command             |
| ----------------------- | ------------------- |
| Dev server              | `pnpm dev`          |
| Type check              | `pnpm typecheck`    |
| Lint                    | `pnpm lint`         |
| Lint (CI gate)          | `pnpm lint:strict`  |
| Format (write)          | `pnpm format`       |
| Format (check)          | `pnpm format:check` |
| Unit/component tests    | `pnpm test`         |
| E2E tests               | `pnpm e2e`          |
| Aggregate gate          | `pnpm check`        |
| Deploy / pilot go-no-go | `pnpm harness`      |

## Oxlint

Fast JS/TS linter. It catches correctness, suspicious, and performance problems. Bugs and risky patterns, not cosmetic style.

- `pnpm lint` reports warnings and errors.
- `pnpm lint:strict` runs `oxlint --deny-warnings .` so any warning fails the build.

Linting finds potential problems: unused variables, shadowed names, unreachable code, hook misuse, accidental coercions. Fixing them can change behaviour. Formatting only changes whitespace and layout. It never changes meaning.

Keep them separate so agents do not argue about brace placement and spend lint time on real defects.

Agents write code in tight loops. Oxlint returns in milliseconds, so they can self-correct before tests run. Slow linters let mistakes pile up.

### Enabled rules (`.oxlintrc.json`)

- Categories: `correctness` = error, `suspicious` = warn, `perf` = warn.
- Plugins: `typescript`, `unicorn`, `oxc`, `react`, `import`.
- Disabled on purpose:
  - `react/react-in-jsx-scope`: not needed with React 19's automatic JSX runtime.
  - `unicorn/filename-case`: PascalCase component files by convention.
- The broad `style` category is off. Oxfmt owns formatting, and rules like `sort-keys`, `no-ternary`, and `no-magic-numbers` are too noisy for this MVP. Re-enable later if the team wants stricter style gates.

## Oxfmt

Default formatter for this project.

- `pnpm format` formats in place (`oxfmt --write .`).
- `pnpm format:check` verifies without writing (used in `pnpm check`).
- Config: `.oxfmtrc.json` (defaults + ignore patterns for build/test output).

Oxfmt is still pre-1.0 (currently `0.5x`). It is installable and good enough here, so we use it instead of Prettier. If an upgrade breaks things, switch the `format` / `format:check` scripts to `prettier --write .` / `prettier --check .` and record why here.

Do not debate formatting. Run `pnpm format` before committing.

## Vite

Dev server and bundler.

- `pnpm dev` starts HMR (default `http://localhost:5173`).
- `pnpm build` type-checks (`tsc -b`) then produces the production bundle.
- Vitest reuses `vite.config.ts` (the `test` block), so transforms and resolve rules match the app. Fewer "works in app, fails in test" surprises.

Rolldown-powered Vite / unified Oxc tooling may land later. This MVP stays on stable Vite and only uses Oxc for lint/format. Treat Rolldown as a future option, not a dependency now.

## Void

Void (or any VS Code-compatible editor) is where the coding agent works. Persistent instructions live in [`AGENTS.md`](../AGENTS.md): read the spec first, make small changes, run tests before claiming success, never weaken assertions or disable RLS/auth to pass tests, ask before major dependencies.

Void is the environment. The agent is the collaborator. `pnpm check` is the judge.

## Notes

- `pnpm check` runs typecheck + lint + format:check + unit tests. `pnpm e2e` stays separate because Playwright needs browser binaries and a running dev server. Run it on its own and in CI, not inside the fast inner-loop gate.
- `pnpm harness` prints or runs deploy/pilot go/no-go from [`harness/manifest.json`](../harness/manifest.json). See [`harness.md`](harness.md). Use `--profile baseline --run` before merge/deploy; `--profile pilot-u24` before enabling matrix/NPS flags; `--profile coach-llm --run` before `VITE_ENABLE_COACH_LLM`.
