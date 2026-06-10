# MVP Next Steps

Use this as the working queue after reading `prd.md`. Keep tasks small and verify each
slice before moving on.

## 1. App Shell And Routing

Goal: replace the starter screen with the actual CRM surface.

- Add React Router wiring.
- Wrap the app with `AuthProvider`.
- Implement root redirect using `getRoleHome`.
- Add `/login` and `/auth/callback`.
- Add protected role layouts for player, admin, and coach.
- Create placeholder pages for every route listed in `prd.md`.

Definition of done:

- App opens to a role-aware CRM shell when using mock login.
- Unknown/signed-out users land on `/login`.
- Player/admin/coach users cannot casually navigate into the wrong role shell.
- Component tests cover login and role protection.

## 2. Player MVP

Goal: make a player able to see and fix their own profile.

- `/player` shows profile completion, missing required fields, campaigns, and assistant
  readiness summary.
- `/player/profile` has structured sections for basic details, contact, emergency
  contact, travel readiness, and consent.
- Saving calls `api.updateOwnAthlete`.
- Success state confirms the update.

Definition of done:

- Mock player login can complete missing details.
- Change requests are created for edited fields through the existing API behaviour.
- Tests cover missing checklist and save flow.

## 3. Admin MVP

Goal: make admins able to inspect readiness and create drafts.

- `/admin` shows stats from `api.getAdminStats`.
- `/admin/players` lists athletes with useful filters.
- `/admin/campaigns` lists campaigns and supports basic creation.
- `/admin/campaigns/:campaignId` shows readiness rows and campaign assistant summary.
- `/admin/review` lists pending change requests and approve/reject actions.
- `/admin/exports` exposes CSV export actions using existing CSV helpers.

Definition of done:

- Admin can identify incomplete players.
- Admin can create reminder drafts without sending anything.
- Admin export works for at least all athletes and campaign readiness.

## 4. Coach MVP

Goal: make coaches able to evaluate assigned players without seeing admin-sensitive data.

- `/coach` shows assigned campaigns and pending evaluations.
- `/coach/campaigns/:campaignId` lists coach-safe athlete rows.
- `/coach/evaluations/:campaignId/:playerId` saves draft/submitted evaluations.
- Assistant note structuring fills a draft that the coach can edit before saving.

Definition of done:

- Coach only sees `CoachAthleteView` fields.
- Coach can save draft and submit evaluation.
- Tests cover note structuring and submitted status.

## 5. E2E And RLS Confidence

Goal: prove the MVP boundaries hold end to end.

- Add Playwright flows for player, admin, and coach paths using mock data.
- Add regression prompts under `tests/agent-regression/` only when each prompt maps to
  a deterministic test.
- If local Supabase is available, add SQL/RLS verification notes or tests.

Definition of done:

- `pnpm check` passes.
- `pnpm e2e` passes for the critical role flows.
- No route or assistant path bypasses role restrictions.
