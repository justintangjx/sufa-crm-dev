# Cleanup and Refactor Plan

This plan is for future coding agents. Use it before large refactors, especially when more
than one agent may work in parallel.

## Goals

- Reduce `src/App.tsx` from a mixed route/page/component file into role-owned modules.
- Make U24 campaign management easier to extend without weakening role/RLS boundaries.
- Add a production-ready path for selected-player roster import.
- Keep deployment setup explicit whenever schema, feature flags, or external services change.

## Recommended Order

### 1. Split Route Modules

Move UI out of `src/App.tsx` while preserving behaviour.

- Keep `src/App.tsx` for providers, route guards, layout, and route wiring.
- Move player pages to `src/routes/player/`.
- Move admin pages to `src/routes/admin/`.
- Move coach pages to `src/routes/coach/`.
- Move shared form/table/stat components to `src/components/` only when reused.

Acceptance:

- No route behaviour changes.
- `pnpm check` passes.
- `pnpm e2e` passes because route structure changes can break navigation.

Manual Supabase/Cloudflare work:

- None expected for a pure file split.

### 2. Add U24 Roster Import

Build the missing path for selected-player details.

- Add an admin import screen under the campaign detail page or `/admin/players`.
- Accept CSV with a documented template.
- Validate required columns before writing.
- Match existing athletes by email and/or exact legal name.
- Create/update athlete rows only through an admin-only API path.
- Upsert `campaign_members` for selected U24 players.
- Show an import preview before commit.
- Record audit metadata for created/updated athletes and campaign assignments.

Acceptance:

- Admin can import a selected U24 roster without SQL.
- Duplicate rows are flagged before commit.
- Players cannot import or assign campaign members.
- Tests cover happy path, duplicate handling, missing required columns, and admin-only access.

Manual Supabase/Cloudflare work:

- Supabase may need a migration if adding import audit tables or RPCs.
- If implemented entirely client-side against existing tables, no new migration is required.
- Cloudflare needs no new setting unless a new feature flag is added.

### 3. Tighten Player Particulars Review Policy

Current behaviour writes player profile edits immediately and records `change_requests`.
Decide whether this remains acceptable for U24 operations.

Options:

- Keep immediate writes plus audit for low-risk MVP speed.
- Make sensitive fields approval-gated, where player submissions create pending requests and
  admins approve before the athlete row changes.

Recommended:

- Approval-gate sensitive fields such as legal name, DOB, passport expiry, emergency contact,
  and consent.
- Allow low-risk fields such as preferred name and Telegram handle to update immediately.

Acceptance:

- Tests prove pending sensitive changes do not alter live export/readiness data until approved.
- Admin review applies or rejects the pending value.
- RLS remains player-own-row only.

Manual Supabase/Cloudflare work:

- Supabase migration likely required if adding structured pending-change payloads or field-risk
  metadata.
- Cloudflare needs no new setting unless protected behind a feature flag.

### 4. Normalize Campaign Operations UI

After route split, clean up duplicated concepts.

- Separate “live U24 matrix” from legacy “Player Growth Matrix” naming in the UI.
- Keep legacy Growth Matrix only if still needed for demos.
- Make `/admin/campaigns/:campaignId` a dense command center with tabs or sections for roster,
  matrix, NPS, audit, and exports.
- Add search/filtering to `/admin/players`.

Acceptance:

- No confusing duplicate “matrix” actions.
- Admin can scan roster/matrix/NPS state without scrolling through unrelated legacy panels.
- Component tests cover section visibility.

Manual Supabase/Cloudflare work:

- None expected for UI-only cleanup.

### 5. Expand E2E Coverage

Current Playwright coverage is light.

- Add admin U24 campaign command center smoke test.
- Add player self-evaluation submission flow.
- Add coach matrix assessment submission flow.
- Add NPS threshold report flow in mock mode.

Acceptance:

- `pnpm e2e` covers all primary role flows.
- Tests run in mock mode without external network or real Supabase Auth.

Manual Supabase/Cloudflare work:

- None expected.

## Documentation Rule

Every future feature/refactor must update docs in the same change when it affects:

- Routes or role flows
- Database schema or RLS
- Feature flags
- Deployment setup
- Demo data or demo users
- Manual Supabase or Cloudflare steps
- Architecture decisions or tradeoffs

At minimum update `docs/context.md`. For architectural decisions, update
`docs/campaign-architecture.md`. For structural cleanup progress, update this file.

## Final Response Rule

Future coding-agent final responses for features/refactors should include:

- What changed
- What tests/checks passed
- Remaining risks or gaps
- Manual Supabase work required, or “none”
- Manual Cloudflare work required, or “none”
