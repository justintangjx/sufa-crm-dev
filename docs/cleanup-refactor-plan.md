# Cleanup and refactor plan

For future coding agents. Read before large refactors, especially when more than one agent may work in parallel.

## Goals

- Split `src/App.tsx` from a mixed route/page/component file into role-owned modules.
- Make U24 campaign management easier to extend without weakening role/RLS boundaries.
- Add a production-ready path for selected-player roster import.
- Keep deployment setup explicit whenever schema, feature flags, or external services change.

## Recommended order

### 0. Coordinator scaffold (Phase 0): done

Extract shared shell, campaign gating, and adapter payload helpers before role route splits:

- `src/components/shell/*`: layout, guards, form fields, page primitives
- `src/lib/campaignUi.ts`: U24 detection and campaign ordering
- `src/lib/campaignCapabilities.ts`: feature-flag + campaign capability gating
- `src/data/payloads/*`: shared Input → DB field mapping for both API adapters

Acceptance:

- No route behaviour changes.
- `pnpm check` passes.

Manual Supabase/Cloudflare work: none.

### 1a. Extract auth routes: done

- `src/routes/auth/LoginPage.tsx`, `AuthCallbackPage.tsx`
- `src/routes/NotFoundPage.tsx`
- `src/routes/index.tsx`: `AppRoutes`, `TestApp`, default `App` export
- `src/main.tsx` imports from `src/routes/`
- Role pages remain in `src/App.tsx` (exported for route wiring)

Acceptance:

- No route behaviour changes.
- `pnpm check` passes.

Manual Supabase/Cloudflare work: none.

### 1b. Split thin admin pages: done

- `src/routes/admin/AdminPlayersPage.tsx`
- `src/routes/admin/AdminExportsPage.tsx`

Acceptance:

- No route behaviour changes.
- `pnpm check` passes.

Manual Supabase/Cloudflare work: none.

### 1c. Split player routes: done

- `src/routes/player/PlayerDashboard.tsx`, `PlayerProfilePage.tsx`, `PlayerCampaignPage.tsx`
- Form mappers: `playerProfileForm.ts`, `playerMatrixForm.ts`
- Growth matrix panels: `PlayerCampaignPanels.tsx`
- Shared form helpers: `src/lib/form.ts` (`optionalText`, `ratingValue`)

Acceptance:

- No route behaviour changes.
- `pnpm check` passes.

Manual Supabase/Cloudflare work: none.

### 1d. Split remaining admin pages: done

- `src/routes/admin/AdminDashboard.tsx`
- `src/routes/admin/AdminCampaignsPage.tsx`, `AdminCampaignDetailPage.tsx`
- `src/routes/admin/AdminReviewPage.tsx`
- Helpers: `adminCampaignForm.ts`, `adminCampaignAssistant.ts`, `adminReviewHelpers.ts`, `AdminCampaignPanels.tsx`

Acceptance:

- No route behaviour changes.
- `pnpm check` passes.

Manual Supabase/Cloudflare work: none.

### 1e. Split coach pages: done

- `src/routes/coach/CoachDashboard.tsx`
- `src/routes/coach/CoachCampaignPage.tsx`, `CoachEvaluationPage.tsx`
- Helpers: `coachMatrixForm.ts`, `coachGrowthMatrixForm.ts`, `coachEvaluationForm.ts`, `CoachEvaluationPanels.tsx`
- `src/App.tsx` removed; all role pages live under `src/routes/`

Acceptance:

- No route behaviour changes.
- `pnpm check` passes.

Manual Supabase/Cloudflare work: none.

### 2. Add U24 roster import — done (campaign CSV)

Shipped as campaign-scoped CSV on campaign detail: `parseRosterCsv` → `planRosterImport` →
preview → `commitCampaignRosterImport`. Email match key; create_and_assign / assign_only /
skip / error. Coaches and multi-team splitting remain out of scope. Sheets fetch deferred.

See `src/lib/rosterImport.ts`, `AdminRosterImportPanel`, `docs/domains/campaign.md`.

### 3. Tighten player particulars review policy

Current behaviour writes player profile edits immediately and records `change_requests`. Decide whether that stays acceptable for U24 operations.

Options:

- Keep immediate writes plus audit for low-risk MVP speed.
- Make sensitive fields approval-gated: player submissions create pending requests and admins approve before the athlete row changes.

Recommended:

- Approval-gate sensitive fields such as legal name, DOB, passport expiry, emergency contact, and consent.
- Allow low-risk fields such as preferred name and Telegram handle to update immediately.

Acceptance:

- Tests prove pending sensitive changes do not alter live export/readiness data until approved.
- Admin review applies or rejects the pending value.
- RLS remains player-own-row only.

Manual Supabase/Cloudflare work:

- Supabase migration likely required if adding structured pending-change payloads or field-risk metadata.
- Cloudflare needs no new setting unless protected behind a feature flag.

### 4. Normalize campaign operations UI

After route split, clean up duplicated concepts.

- Separate "live U24 matrix" from legacy "Player Growth Matrix" naming in the UI.
- Keep legacy Growth Matrix only if still needed for demos.
- Make `/admin/campaigns/:campaignId` a dense command center with tabs or sections for roster, matrix, NPS, audit, and exports.
- Add search/filtering to `/admin/players`.

Acceptance:

- No confusing duplicate "matrix" actions.
- Admin can scan roster/matrix/NPS state without scrolling through unrelated legacy panels.
- Component tests cover section visibility.

Manual Supabase/Cloudflare work:

- None expected for UI-only cleanup.

### 5. Expand E2E coverage

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

## Documentation rule

Every future feature/refactor must update docs in the same change when it affects:

- Routes or role flows
- Database schema or RLS
- Feature flags
- Deployment setup
- Demo data or demo users
- Manual Supabase or Cloudflare steps
- Architecture decisions or tradeoffs

At minimum update `docs/state.md`. For architectural decisions, update `docs/domains/campaign.md`. For structural cleanup progress, update this file.

## Final response rule

Coding-agent final responses for features/refactors should include:

- What changed
- What tests/checks passed
- Remaining risks or gaps
- Manual Supabase work required, or "none"
- Manual Cloudflare work required, or "none"
