# Deploy / pilot harness

Go/no-go for feature flags, eval suites, and manual Supabase/Cloudflare work. Start here before flipping any `VITE_ENABLE_*` flag or calling a pilot ready.

This is the deploy/pilot harness (`pnpm harness`), not the PRD §22 assistant evaluation harness. Same word, different job: this one gates flag enablement and pilot readiness; that one scores LLM/assistant quality.

## Source of truth

| Artifact                                            | Role                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`harness/manifest.json`](../harness/manifest.json) | Authoritative map: profiles → flags → migrations → eval commands → manual checks |
| This doc                                            | How to use it                                                                    |
| [`coach-llm.md`](coach-llm.md)                      | LLM quality gates (for the `coach-llm` profile)                                  |
| [`domains/campaign.md`](domains/campaign.md)        | Campaign / matrix / NPS architecture                                             |

Do not copy flag→migration lists into other docs. Update the manifest in the same change when flags, migrations, eval scripts, or pilot acceptance criteria change.

Suites live on profiles only. Flag entries declare migrations, Cloudflare env, manual checks, and go/no-go text. `pnpm harness --run` never merges suites from flags.

## Commands

```bash
pnpm harness --list-profiles          # baseline | pilot-u24 | coach-llm
pnpm harness --list-evals             # explicit eval suite paths + commands
pnpm harness --profile baseline       # print checklist
pnpm harness --profile pilot-u24      # U24 pilot go/no-go
pnpm harness --profile pilot-u24 --run  # run automated suites; print remaining manual
pnpm harness --profile coach-llm --run  # includes live eval if env is set
```

`--run` exits non-zero on automated failure (AUTOMATED_NO_GO). Exit 0 means AUTOMATED_GO only. Full GO still needs the printed HUMAN checklist. Agents cannot apply Supabase SQL or Cloudflare env. The runner never claims FULL_GO.

For profiles with `requiresFlagsOff`, the printout lists those flags so you can confirm Cloudflare Pages keeps them false.

## Profiles

| Profile     | Intent                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `baseline`  | Merge / Pages deploy with optional flags still off                                                                                       |
| `pilot-u24` | One campaign; open roster (~12–25 players, 1–3 coaches); soft coach 2/2; player journal; in-app end NPS; Growth Matrix and Coach LLM off |
| `coach-llm` | Remote Evaluation copilot on legacy `/coach/evaluations`                                                                                 |

## Eval suite inventory

Listed under `evalSuites` in the manifest. Paths that matter:

- Gate: `pnpm check`, `pnpm e2e`
- Campaign: `src/lib/campaignManagement.test.ts`, `src/lib/campaignCapabilities.test.ts`
- Coach notes (deterministic): `pnpm eval:coach:deterministic` → `src/evals/coach-notes/`
- Coach notes (live): `pnpm eval:coach:live` → `src/evals/coach-notes/synthetic.v1.jsonl` + Edge Function

## Decision rule

1. Pick the profile that matches what you are turning on.
2. Run `pnpm harness --profile <id> --run`.
3. Confirm every Supabase migration / Edge Function / Cloudflare env line for required flags.
4. Tick acceptance bullets on real or seeded pilot users.
5. Only then set Cloudflare `VITE_ENABLE_*` and redeploy.

If infra is missing, leave the flag false. That is the production-safe default.

## Fresh agent: U24 pilot coding order

Pilot PR-A–D and campaign roster CSV import are shipped.
Next: `pnpm harness --profile pilot-u24 --run` + human migrations/env/smoke.

Cleanup policy until FULL_GO: hide legacy domains, do not DROP their tables.
