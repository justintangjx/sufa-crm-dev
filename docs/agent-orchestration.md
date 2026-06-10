# Agent Orchestration

This repo can support separate player, admin, and coach coding agents, but do not run
three agents against the same files without coordination. The current MVP still keeps
most UI code in `src/App.tsx`, so parallel feature work there will create conflicts.

## Recommended Setup

Use one coordinator plus role-focused agents:

- Coordinator/platform agent
- Player flow agent
- Admin flow agent
- Coach flow agent

The coordinator owns cross-cutting code and integration. Role agents own user-facing
flows inside their lane.

## First Parallelization Task

Before heavy parallel work, have the coordinator split `src/App.tsx` into role-owned
modules:

```txt
src/App.tsx                    route wiring only
src/routes/LoginRoutes.tsx      login/callback/root redirect
src/routes/player/*             player pages/forms
src/routes/admin/*              admin pages/assistant panels
src/routes/coach/*              coach pages/evaluation flow
src/components/*                shared UI primitives only
```

Until that split happens, only one agent should edit `src/App.tsx` at a time.

## Agent Lanes

### Player Agent

Primary ownership:

- `/player`
- `/player/profile`
- `/player/campaigns/:campaignId`
- Player profile completion logic and UI
- Player-facing assistant prompt: “What am I missing?”

Hard boundaries:

- Do not expose other players.
- Do not show coach evaluations.
- Do not bypass change-request audit behaviour.

Suggested next work:

- Improve player campaign readiness screen.
- Add clearer save/review status for submitted profile changes.
- Add component tests for player dashboard completion updates.

### Admin Agent

Primary ownership:

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

- Add search and filters to `/admin/players`.
- Implement CSV export actions in `/admin/exports`.
- Add campaign creation form.

### Coach Agent

Primary ownership:

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
- Add validation before submit.
- Add recently submitted evaluations.

### Coordinator/Platform Agent

Primary ownership:

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

## Branch Strategy

Use one branch per agent:

```txt
agent/player-flow
agent/admin-flow
agent/coach-flow
agent/platform
```

Merge order:

1. Platform refactors/shared API changes
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

## Conflict Rules

- If two agents need the same file, pause and coordinate ownership first.
- Shared API changes go through the coordinator.
- Role agents should add tests near their changed flow.
- Never “fix” another role’s failing test by weakening assertions or role boundaries.

## Handoff Format

Each agent should leave a short handoff in the PR or commit body:

```md
## Scope

## Files touched

## Tests

## Role/RLS risks

## Follow-up
```
