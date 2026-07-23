# Agent documentation index

Read tier 0 first, then one task-specific doc.

## Tier 0: always read

| File                        | Purpose                                           |
| --------------------------- | ------------------------------------------------- |
| [`AGENTS.md`](../AGENTS.md) | Rules, invariants, definition of done             |
| [`state.md`](state.md)      | What is implemented, gaps, deployment, next queue |
| [`codemap.md`](codemap.md)  | File layers, ownership lanes, feature flags       |

## Tier 1: read by task

| Task                       | Read                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Deploy / flag go-no-go     | [`harness.md`](harness.md) + [`../harness/manifest.json`](../harness/manifest.json) |
| Commands / CI              | [`tooling.md`](tooling.md)                                                          |
| Product requirements       | [`prd.md`](../prd.md) via [`prd-index.md`](prd-index.md)                            |
| Campaign / matrix / NPS    | [`domains/campaign.md`](domains/campaign.md)                                        |
| Coach LLM / Edge Functions | [`coach-llm.md`](coach-llm.md)                                                      |
| Structural refactor        | [`cleanup-refactor-plan.md`](cleanup-refactor-plan.md)                              |
| Multi-agent parallel work  | [`agent-orchestration.md`](agent-orchestration.md)                                  |

## Tier 2: future / deep dive

| File                                                       | When                               |
| ---------------------------------------------------------- | ---------------------------------- |
| [`google-sheets-snapshots.md`](google-sheets-snapshots.md) | Implementing Sheets export only    |
| [`prd.md`](../prd.md) full                                 | New product scope or schema design |
| `supabase/migrations/`                                     | RLS or schema changes              |

## Adding documentation

1. One home per fact. Update `state.md` for current status. Append decisions to domain docs.
2. New doc → add a row to this index.
3. Future work stays out of tier 0. Use tier 2 or `plans/` when that folder exists.
4. Do not copy invariants from `AGENTS.md` into other files.
