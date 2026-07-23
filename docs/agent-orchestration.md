# Agent orchestration

This repo can run separate player, admin, and coach coding agents. Role pages live under `src/routes/{player,admin,coach}/`. Auth and routing are in `src/routes/index.tsx`.

## Recommended setup

Use one coordinator plus role-focused agents:

- Coordinator/platform agent
- Player flow agent
- Admin flow agent
- Coach flow agent

The coordinator owns cross-cutting code and integration. Role agents own user-facing flows inside their lane.

## Route split (done)

```txt
src/routes/index.tsx           route wiring, TestApp, App export
src/routes/auth/*              login, auth callback
src/routes/player/*            player pages/forms
src/routes/admin/*             admin pages
src/routes/coach/*             coach pages
src/components/shell/*         shared UI primitives
```

## Agent lanes

### Player agent

Owns:

- `/player`
- `/player/profile`
- `/player/campaigns/:campaignId`
- Player profile completion logic and UI
- Player-facing assistant prompt: "What am I missing?"

Hard boundaries:

- Do not expose other players.
- Do not show coach evaluations.
- Do not bypass change-request audit behaviour.

Suggested next work:

- Improve player campaign readiness screen.
- Clearer save/review status for submitted profile changes.
- Component tests for player dashboard completion updates.

### Admin agent

Owns:

- `/admin`
- `/admin/players`
- `/admin/campaigns`
- `/admin/campaigns/:campaignId`
- `/admin/review`
- `/admin/exports`
- Admin assistant panels and reminder drafts

Hard boundaries:

- Do not auto-send reminders.
- Do not auto-approve change requests.
- Preserve RLS assumptions and admin-only access.

Suggested next work:

- Admin coach assignment on campaign detail (pilot-critical; see `docs/state.md` PR-B).
- Search and filters on `/admin/players`.
- CSV export actions in `/admin/exports`.
- Campaign creation form.

### Coach agent

Owns:

- `/coach`
- `/coach/campaigns/:campaignId`
- `/coach/evaluations/:campaignId/:playerId`
- Coach note-structuring assistant

Hard boundaries:

- Use `CoachAthleteView` or another coach-safe projection.
- Do not expose passport, medical, NRIC, or admin-sensitive fields.
- Do not auto-submit assistant-generated evaluations.

Suggested next work:

- Improve pending evaluation checklist.
- Validation before submit.
- Recently submitted evaluations.

### Coordinator / platform agent

Owns:

- Routing and shared app shell
- `src/data/types.ts` API contract
- Supabase adapter and RLS-sensitive changes
- Shared UI components
- Deployment docs and env handling
- Cross-role tests

Hard boundaries:

- Coordinate API changes before role agents depend on them.
- Keep `pnpm check` passing before merging role branches.
- Do not loosen RLS or role guards for convenience.

## Branch strategy

One branch per agent:

```txt
agent/player-flow
agent/admin-flow
agent/coach-flow
agent/platform
```

Merge order:

1. Platform refactors / shared API changes
2. Role flow branches
3. Final integration branch

Each agent should start with:

```bash
git pull --rebase
pnpm check
```

Each agent should finish with:

```bash
pnpm format
pnpm check
git status
```

Run `pnpm e2e` for cross-role or route-guard changes.

## Conflict rules

- If two agents need the same file, pause and coordinate ownership first.
- Shared API changes go through the coordinator.
- Role agents should add tests near their changed flow.
- Never "fix" another role's failing test by weakening assertions or role boundaries.

## Handoff format

Leave a short handoff in the PR or commit body:

```md
## Scope

## Files touched

## Tests

## Role/RLS risks

## Follow-up
```
