# Coach LLM Architecture And Evaluation

This document is the implementation and learning guide for the coach note-structuring
LLM. It supplements `prd.md`; the product spec remains canonical.

## Product Boundary

The LLM performs one transformation per copilot turn:

```txt
rough coach notes (+ optional clarifications / additional notes) -> evidence-grounded editable draft
```

The coach evaluation page uses an **Evaluation copilot**: typed turns (`structure`,
`clarify`, `add_notes`, `regenerate_section`), not a free-form chatbot. The evaluation
form remains the only commit surface for ratings, recommendations, and saved text.

It does not query the database, choose tools, set ratings, suggest recommendations,
save evaluations, or submit evaluations. Supabase authorization and RLS remain the
security boundary. The coach remains responsible for every saved field and decision.

The deterministic assistant remains available only as an explicit fallback after a
remote-generation failure.

## Evaluation Copilot (bounded multi-turn)

Copilot turns are explicit UI actions, not open dialogue:

| Action               | Trigger                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `structure`          | **Structure notes** on pasted rough notes                             |
| `clarify`            | **Apply clarifications and re-structure** after answering ambiguities |
| `add_notes`          | **Add notes and re-structure** after appending more text              |
| `regenerate_section` | **Regenerate section** on strengths, development, or overall          |

Sessions are capped at five turns per evaluation attempt. Each turn records telemetry in
`coach_note_generation_runs` and, when the copilot migration is applied, in
`coach_note_sessions` / `coach_note_turns`.

**Open conversational chat is deferred.** Do not add `VITE_ENABLE_COACH_COPILOT_CHAT` or
a message-thread UI unless pilot metrics and eval gates fail after copilot turns ship.

## Local development without Cloudflare / Edge Function

The app works fully in mock mode (tests, offline dev, Playwright) without deploying
Cloudflare or the Supabase Edge Function:

- `VITE_ENABLE_COACH_LLM=false` (default) uses the deterministic structurer with full
  copilot telemetry when coach-note migrations are applied.
- Mock mode exercises the full copilot UI without Supabase.
- Supabase + `VITE_ENABLE_COACH_LLM=true` requires migrations, Edge Function deploy,
  and provider secrets before remote LLM generation works.
- Hybrid demo: `VITE_USE_MOCK=true` + `VITE_DEMO_COACH_LLM=true` keeps instant
  `coach@sufa.test` login while coach evaluations call the live Edge Function. Seed data:
  `supabase/seed-demo-coach.sql`. Misconfigured env shows a startup banner. See
  `docs/context.md` (Demo coach with live LLM).

Deployment checklist when ready:

Apply Supabase migrations **in filename order** (partial apply breaks telemetry and the
Edge Function):

1. `20260615000000_coach_note_generation.sql` — creates `coach_note_generation_runs`
2. `20260617000000_coach_note_copilot.sql` — sessions, turns, ambiguity columns
3. `20260618000000_coach_note_deterministic_telemetry.sql` — coach INSERT for flag-off path

Then:

4. Deploy `structure-coach-notes` and set Edge Function secrets.
5. Set `VITE_ENABLE_COACH_LLM=true` only in staging/pilot environments.
6. Run `pnpm eval:coach:live` against the deployed function.
7. Complete human blind review before production pilot.

Shared contract source of truth: edit `shared/coach-note-core.ts`, then run
`pnpm sync:coach-note-core` (also runs at the start of `pnpm check`).

## Optimization Model

Optimize in this order:

1. Faithfulness and privacy.
2. Coach usefulness and reduced editing.
3. Reliability and P95 latency.
4. Cost.

Prompt engineering controls the transformation instructions, examples, uncertainty
handling, and output schema. Tool design controls authorized external capabilities. RAG
supplies relevant context. Architecture coordinates authorization, generation,
validation, telemetry, and confirmation. Evals decide whether any change is better.

Do not add a free-form conversational agent, tool router, or vector database unless
measured pilot results show that bounded copilot turns are insufficient.

## Runtime Architecture

The coach page calls `coachNoteAction` on the data layer (or `generateCoachNoteDraft` for
a single `structure` turn). In mock mode it uses a deterministic evaluation double with
full session/turn logging. In Supabase mode it invokes the `structure-coach-notes` Edge
Function only when `VITE_ENABLE_COACH_LLM=true`.

Leave `VITE_ENABLE_COACH_LLM` unset or `false` in production until the Edge Function,
provider secrets, and live eval checks are complete. With the flag off, `coachNoteAction`
runs the deterministic structurer client-side and writes session/run/turn telemetry to
Supabase when the coach-note migrations are applied. It does not call the Edge Function.

The Edge Function:

1. Verifies the user JWT and `coach` role.
2. Verifies campaign assignment and that the athlete belongs to the campaign.
3. Removes the athlete's name, email addresses, phone numbers, and UUID-like identifiers.
4. Calls a provider-neutral `CoachNoteGenerator` through an OpenAI-compatible HTTP
   adapter.
5. Requires the versioned JSON schema and exact evidence quotes.
6. Rejects ratings, recommendations, selection decisions, and unsupported evidence.
7. Makes at most one repair call inside a configurable provider timeout (default 30s).
8. Records a redacted success or failure run with `ambiguity_count`, `session_id`, and
   `turn_index`.
9. Persists copilot session turns when the copilot migration is applied.
10. Returns an unsaved draft.

Configure Edge Function secrets:

```txt
COACH_NOTE_API_URL
COACH_NOTE_API_KEY
COACH_NOTE_MODEL
COACH_NOTE_PROVIDER_TIMEOUT_MS=30000
COACH_NOTE_INPUT_COST_PER_MILLION
COACH_NOTE_OUTPUT_COST_PER_MILLION
```

Do not expose them as `VITE_*` variables.

## Prompt Design

The prompt and schema live under `supabase/functions/_shared/` and use the version
`coach-notes-v1`.

Prompt requirements:

- One transformation task.
- Only supplied notes may support output.
- Evidence quotes must be exact substrings.
- Negation, uncertainty, fragments, Ultimate shorthand, and common Singaporean English
  must be preserved.
- Decision-oriented language becomes an ambiguity, not a recommendation.
- Missing evidence produces an empty array.
- The model returns JSON only and is never asked for visible chain-of-thought.

Change one prompt element at a time and run the complete eval suite. Prompt edits are
not accepted based only on a few hand-picked examples.

## Tool And RAG Roadmap

V1 has no model-selected tools. Prior evaluations use deterministic SQL retrieval only:

```ts
listOwnSubmittedEvaluations(coachId, athleteId, 3);
```

The evaluation page shows these in a **read-only side panel**. They are never merged into
the current-session draft automatically.

`getEvaluationRubric(version)` remains a future static helper if a rubric panel is
needed. Do not add embeddings until authorized material becomes too numerous for SQL
filtering.

## Evaluation Data

Datasets live under `src/evals/coach-notes/`.

- `synthetic`: shorthand, fragments, negation, vague language, Ultimate terminology,
  decision requests, and prompt injection.
- `anonymized-real`: coach-approved notes with player identity removed.
- `holdout`: unseen release cases.
- `red-team`: privacy leakage, contradictory notes, malicious instructions, and
  unauthorized-context requests.

Production traces are never copied automatically into an eval dataset. A human must
review redaction and expected labels before promoting a failure into a regression case.

## Automated Evals

Run:

```bash
pnpm eval:coach:deterministic
```

This covers schema validity, exact evidence grounding, decision suppression, field
placement, and the deterministic fallback.

Run live provider evals with an assigned staging coach and athlete:

```bash
COACH_NOTE_EVAL_URL=<edge-function-url> \
COACH_NOTE_EVAL_JWT=<staging-coach-jwt> \
COACH_NOTE_EVAL_CAMPAIGN_ID=<campaign-id> \
COACH_NOTE_EVAL_ATHLETE_ID=<athlete-id> \
COACH_NOTE_REPORT_PATH=<report.json> \
pnpm eval:coach:live
```

Compare champion and candidate reports:

```bash
pnpm eval:coach:compare champion.json candidate.json
```

Deterministic graders own hard safety gates. An optional pinned LLM judge may assess
semantic equivalence or writing usefulness, but it cannot override privacy,
authorization, schema, grounding, or decision-suppression failures.

## Release Gates

Hard gates:

- 100% schema validity and exact evidence validation.
- 100% suppression of ratings and recommendations.
- No critical privacy, authorization, identity, or historical-claim failures.

Quality gates:

- Atomic-fact precision at least 98%.
- Atomic-fact recall at least 95%.
- Field-placement F1 at least 90%.
- Negation and uncertainty preservation at least 95%.
- No tagged segment regresses by more than five percentage points.

Operational gates:

- P95 latency below five seconds.
- Successful generation rate at least 99%.
- Estimated model cost below US$0.03 per successful draft.
- At most one repair call.

Human gates:

- Two coaches blindly compare at least 30 representative cases.
- At least 80% of drafts are rated useful.
- At most 5% are rated incorrect.
- Median field edit ratio is at most 20%.
- Median completion time improves at least 30% over manual entry.

## Telemetry And Feedback

`coach_note_generation_runs` stores redacted input/output, prompt and model versions,
validation results, latency, tokens, estimated cost, repair count, error code, coach
feedback, field edit count, normalized edit distance, **`ambiguity_count`**, **`session_id`**,
and **`turn_index`**.

`coach_note_sessions` and `coach_note_turns` store copilot session state for auditing
multi-turn flows.

Promotion criteria for any further agent work (e.g. open chat): pilot data shows >30% of
runs with unresolved ambiguities after copilot clarify turns, or median edit ratio stays

> 20% after prompt iteration, **and** coaches request free-form dialogue in interviews.

Coaches can read only their own runs and can update only `feedback`, `feedback_at`,
`field_edit_count`, and `normalized_edit_distance`. The UI collects `useful`,
`incorrect`, or `missing_context` after a successful draft. Ratings and evaluation
recommendations remain outside model telemetry.

## Improvement Loop

```txt
Collect synthetic and reviewed anonymized cases
  -> evaluate deterministic baseline
  -> test one prompt or model change
  -> inspect tagged failures
  -> rerun holdout and red-team suites
  -> run hidden shadow generation
  -> conduct blinded coach review
  -> release to a small opt-in pilot
  -> monitor edits, feedback, latency, cost, and failures
  -> promote, revise, or roll back
```

Keep the deterministic fallback available during rollout. Never silently substitute it
for a failed LLM call because that would corrupt quality telemetry and coach trust.
