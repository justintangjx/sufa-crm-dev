# SUFA Athlete CRM MVP — Codex Build Prompt

Use this document as the main prompt/spec for Codex or another coding agent. The goal is to build a small, working MVP for Singapore Ultimate Frisbee Association (SUFA): a role-based athlete CRM for players, admin staff, and coaches, with an assistant layer that reduces manual chasing and summarises missing work.

---

## 0. Product framing

SUFA currently collects player admin information through Google Forms, Google Drive, and manual WhatsApp/Telegram chasing. Coach evaluations are not consistently documented. The MVP should prove that a lightweight CRM is better than repeated forms by creating one canonical athlete profile per player and making each campaign a set of requirements attached to that profile.

The AI/agent layer should **not** be the source of truth. The database is the source of truth. The assistant only helps users understand what is missing, draft reminders, and convert coach notes into structured draft evaluations for human confirmation.

---

## 1. Tech stack

Build a web app using:

- Frontend: React + TypeScript + Vite
- Routing: React Router
- Backend/database/auth: Supabase
- Styling: Tailwind CSS or simple CSS modules; choose the fastest stable option
- Testing: Vitest + Testing Library for unit/component tests; Playwright for end-to-end tests
- Linting: Oxlint
- Formatting: Oxfmt if stable enough in this environment; otherwise add Prettier as fallback and leave Oxfmt notes in `docs/tooling.md`
- Editor workflow: Void or VS Code-compatible project setup

Prefer boring, explicit code over clever abstractions. Prioritise working user flows, role-based access, tests, and clear database boundaries.

---

## 2. MVP roles

There are three user roles:

### Player

Players can:

- Log in using a magic link
- View their own profile completion checklist
- Edit their own profile fields
- View campaign-specific requirements
- Submit changes for admin review, where required
- Ask the assistant: “What am I missing?”

Players cannot:

- View other players
- View coach notes by default
- View admin dashboards

### Admin staff

Admins can:

- Create campaigns
- Invite players/coaches by email
- View all players
- View campaign readiness dashboards
- See missing player information
- Review submitted updates
- Draft reminders for incomplete profiles
- Export campaign data as CSV

Admins cannot:

- Silently overwrite player-submitted sensitive information without audit trail
- Send AI-generated reminders without previewing them first in the MVP

### Coach

Coaches can:

- View campaigns assigned to them
- View assigned players’ sporting profile
- Submit structured evaluations
- See pending evaluation checklist
- Use the assistant to convert rough notes into a structured evaluation draft

Coaches cannot:

- View passport numbers, NRIC, or unrelated admin data by default
- Edit player admin profiles

---

## 3. Core product principles

1. **CRM first, agent second.** Build normal screens: dashboards, checklists, forms, tables, review queues. Do not build a pure chatbot UI.
2. **Single source of truth.** Each player has one athlete profile. Campaigns attach additional requirements to existing profiles.
3. **Role-specific landing pages.** After login, redirect users to `/player`, `/admin`, or `/coach` based on role.
4. **Human confirmation.** The assistant can draft and suggest, but saving sensitive data and sending reminders should require user confirmation.
5. **Auditability.** Important profile changes should record who changed what and when.
6. **SportSync readiness.** Build a simple export/mapping layer now, but do not attempt real SportSync integration in MVP.

---

## 4. Authentication and magic links

Use Supabase Auth passwordless email login.

Expected flow:

1. User visits `/login`.
2. User enters email.
3. App calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <app callback URL> } })`.
4. User receives magic link.
5. User clicks link and lands at `/auth/callback`.
6. Callback page reads authenticated user.
7. App loads `profiles` row for that user.
8. App redirects based on role:
   - player -> `/player`
   - admin -> `/admin`
   - coach -> `/coach`

Important implementation detail:

- Magic links should be temporary login links, not permanent bookmarks.
- Returning users should go to `/login` if their session expired, or `/` if they still have a valid session.
- The root route `/` should check session and redirect to the correct dashboard.

Create these routes:

```txt
/
/login
/auth/callback
/player
/player/profile
/player/campaigns/:campaignId
/admin
/admin/players
/admin/campaigns
/admin/campaigns/:campaignId
/admin/review
/admin/exports
/coach
/coach/campaigns/:campaignId
/coach/evaluations/:campaignId/:playerId
```

---

## 5. Database schema

Create Supabase SQL migrations for the following tables.

### `profiles`

Represents a logged-in user and their app role.

Fields:

- `id uuid primary key references auth.users(id)`
- `email text unique not null`
- `full_name text`
- `preferred_name text`
- `role text not null check (role in ('player', 'admin', 'coach'))`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `athletes`

Represents the player/athlete profile. Usually one `athletes` row maps to one `profiles` row, but keep it separate from auth identity.

Fields:

- `id uuid primary key default gen_random_uuid()`
- `profile_id uuid references profiles(id)`
- `legal_name text`
- `preferred_name text`
- `date_of_birth date`
- `nationality text`
- `phone text`
- `telegram_handle text`
- `whatsapp_number text`
- `emergency_contact_name text`
- `emergency_contact_relationship text`
- `emergency_contact_phone text`
- `passport_expiry date`
- `dietary_restrictions text`
- `medical_notes text`
- `data_sharing_consent boolean default false`
- `media_consent boolean default false`
- `profile_status text default 'incomplete' check (profile_status in ('incomplete', 'submitted', 'approved'))`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Do not include NRIC/passport number in the first MVP unless explicitly required. Passport expiry is enough for the travel-readiness demo.

### `campaigns`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `team text`
- `start_date date`
- `end_date date`
- `location text`
- `status text default 'draft' check (status in ('draft', 'active', 'completed', 'archived'))`
- `created_by uuid references profiles(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `campaign_members`

Links athletes/coaches to campaigns.

Fields:

- `id uuid primary key default gen_random_uuid()`
- `campaign_id uuid references campaigns(id) on delete cascade`
- `athlete_id uuid references athletes(id) on delete cascade`
- `status text default 'invited' check (status in ('invited', 'registered', 'selected', 'reserve', 'withdrawn'))`
- `created_at timestamptz default now()`

### `campaign_coaches`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `campaign_id uuid references campaigns(id) on delete cascade`
- `coach_profile_id uuid references profiles(id) on delete cascade`
- `coach_role text default 'coach' check (coach_role in ('head_coach', 'assistant_coach', 'coach'))`
- `created_at timestamptz default now()`

### `coach_evaluations`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `campaign_id uuid references campaigns(id) on delete cascade`
- `athlete_id uuid references athletes(id) on delete cascade`
- `coach_profile_id uuid references profiles(id)`
- `throwing_rating int check (throwing_rating between 1 and 5)`
- `cutting_rating int check (cutting_rating between 1 and 5)`
- `defense_rating int check (defense_rating between 1 and 5)`
- `fitness_rating int check (fitness_rating between 1 and 5)`
- `game_iq_rating int check (game_iq_rating between 1 and 5)`
- `communication_rating int check (communication_rating between 1 and 5)`
- `coachability_rating int check (coachability_rating between 1 and 5)`
- `strengths text`
- `development_areas text`
- `overall_notes text`
- `recommendation text check (recommendation in ('selected', 'reserve', 'development', 'not_selected', 'needs_review'))`
- `status text default 'draft' check (status in ('draft', 'submitted'))`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `change_requests`

Tracks player-submitted updates that admins may review.

Fields:

- `id uuid primary key default gen_random_uuid()`
- `athlete_id uuid references athletes(id) on delete cascade`
- `submitted_by uuid references profiles(id)`
- `field_name text not null`
- `old_value text`
- `new_value text`
- `status text default 'pending' check (status in ('pending', 'approved', 'rejected'))`
- `reviewed_by uuid references profiles(id)`
- `reviewed_at timestamptz`
- `created_at timestamptz default now()`

### `assistant_drafts`

Stores AI-generated reminder/evaluation drafts for review.

Fields:

- `id uuid primary key default gen_random_uuid()`
- `created_by uuid references profiles(id)`
- `draft_type text check (draft_type in ('player_reminder', 'coach_evaluation_structuring'))`
- `target_profile_id uuid references profiles(id)`
- `campaign_id uuid references campaigns(id)`
- `content text not null`
- `status text default 'draft' check (status in ('draft', 'approved', 'discarded'))`
- `created_at timestamptz default now()`

---

## 6. Row-level security requirements

Enable RLS on all app tables.

Minimum policy behaviour:

- Admins can select/update/insert most CRM tables.
- Players can select and update only their own athlete profile.
- Players can select campaigns where they are campaign members.
- Coaches can select campaigns where they are assigned.
- Coaches can select athletes assigned to their campaigns, but only non-sensitive fields.
- Coaches can insert/update their own evaluations.

For MVP simplicity, create database views for coach-safe athlete fields if needed:

```sql
create view coach_athlete_view as
select
  a.id,
  a.legal_name,
  a.preferred_name,
  a.phone,
  a.profile_status,
  a.created_at,
  a.updated_at
from athletes a;
```

Avoid exposing `medical_notes` broadly. If a coach safety view needs this later, add it intentionally.

---

## 7. Role-specific screens

### `/login`

Purpose: request magic link.

UI:

- Heading: “Sign in to SUFA CRM”
- Email input
- Submit button: “Send magic link”
- Success message: “Check your email for your login link.”

Tests:

- User can type email and submit.
- Supabase auth function is called with correct redirect URL.

### `/player`

Purpose: player dashboard.

UI cards:

- Profile completion percentage
- Missing items checklist
- Campaign readiness cards
- Button: “Complete missing details”
- Assistant panel with prompt suggestions:
  - “What am I missing?”
  - “Why do you need passport expiry?”

Completion logic:

Required base profile fields:

- legal_name
- date_of_birth
- phone
- emergency_contact_name
- emergency_contact_phone
- passport_expiry
- data_sharing_consent

### `/player/profile`

Purpose: edit profile.

Use structured form sections:

- Basic details
- Contact details
- Emergency contact
- Travel readiness
- Consent

On save:

- Low-risk fields can update directly.
- For MVP, all edits can directly update own athlete row, but also write to `change_requests` for audit.
- Show clear success state.

### `/admin`

Purpose: admin operations dashboard.

UI cards:

- Total athletes
- Active campaigns
- Incomplete profiles
- Passport expiring within 6 months
- Pending coach evaluations
- Pending review items

Include assistant panel:

- “Who is incomplete?”
- “Draft reminders for missing passport expiry”
- “Are we SportSync-ready?”

### `/admin/players`

Purpose: manage athlete database.

UI:

- Table of athletes
- Search by name/email
- Filters:
  - incomplete
  - approved
  - passport expiring soon
  - missing consent
- Row click opens athlete detail modal/page

### `/admin/campaigns`

Purpose: list/create campaigns.

UI:

- Campaign table
- Create campaign button

### `/admin/campaigns/:campaignId`

Purpose: campaign readiness dashboard.

UI:

- Campaign details
- Readiness summary
- Player readiness table
- Missing field filters
- Draft reminder action
- Coach evaluation status

### `/admin/review`

Purpose: review change requests.

UI:

- Pending change requests table
- Approve/reject buttons

### `/admin/exports`

Purpose: export CSV.

MVP export types:

- All athletes
- Campaign players
- Campaign readiness
- Coach evaluation summary

### `/coach`

Purpose: coach dashboard.

UI cards:

- Assigned campaigns
- Pending evaluations
- Recently submitted evaluations

Assistant prompts:

- “Who do I still need to evaluate?”
- “Structure my notes into an evaluation draft”

### `/coach/campaigns/:campaignId`

Purpose: assigned player list.

UI:

- Player table
- Evaluation status
- Button per player: “Evaluate”

### `/coach/evaluations/:campaignId/:playerId`

Purpose: structured evaluation form.

UI fields:

- Ratings from 1 to 5
- Strengths
- Development areas
- Overall notes
- Recommendation
- Save draft
- Submit evaluation

Assistant helper:

- Textarea: “Paste rough notes”
- Button: “Structure notes”
- Agent returns a draft that the coach can edit before saving

---

## 8. Assistant/agent capabilities

Do not integrate a real LLM until the deterministic workflows are working. First build a fake/local assistant module that proves the data flows.

Create `src/lib/assistant.ts` with deterministic functions:

```ts
export function getMissingAthleteFields(athlete: Athlete): MissingField[];
export function summarizePlayerReadiness(athlete: Athlete): string;
export function summarizeCampaignReadiness(rows: CampaignReadinessRow[]): string;
export function draftPlayerReminder(input: ReminderInput): string;
export function structureCoachNotes(notes: string): StructuredEvaluationDraft;
```

Later, an LLM can replace only the text-generation parts, not the permission checks or database queries.

### Required agent behaviour

Player:

- “What am I missing?” -> checks required fields and explains missing items.

Admin:

- “Who is incomplete?” -> summarises incomplete players from campaign readiness data.
- “Draft reminders” -> creates `assistant_drafts` records, one per target user.

Coach:

- “Structure notes” -> converts free text into a draft evaluation object; coach must confirm before saving.

### Required guardrails

- Assistant must never bypass RLS.
- Assistant must only operate on data already accessible to the logged-in user.
- Assistant drafts are not automatically sent.
- Assistant-generated coach evaluations are drafts until coach saves/submits.

---

## 9. Learning goals: Oxlint, Oxfmt, Vite+, and Void

Create `docs/tooling.md` explaining how each tool is used in this MVP.

### Oxlint in this MVP

Oxlint is a fast JavaScript/TypeScript linter from the Oxc toolchain. Use it to catch correctness, suspicious, performance, and style issues quickly.

Add scripts:

```json
{
  "scripts": {
    "lint": "oxlint .",
    "lint:strict": "oxlint --deny-warnings ."
  }
}
```

Use Oxlint during agent development because it gives the coding agent fast feedback. The agent should run `pnpm lint` after meaningful edits.

Explain in `docs/tooling.md`:

- What linting catches
- Why linting is different from formatting
- Why fast lint feedback helps AI-generated code
- Which rules/categories are enabled

### Oxfmt in this MVP

Oxfmt is the formatter from the Oxc ecosystem. Try to use it as the default formatter if available in the current package ecosystem. If it is not stable or installable in the project environment, use Prettier as a temporary fallback and document the reason.

Add intended scripts:

```json
{
  "scripts": {
    "format": "oxfmt --write .",
    "format:check": "oxfmt --check ."
  }
}
```

Fallback scripts if needed:

```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

Explain:

- Formatting standardises style automatically
- Linting finds potential problems
- The coding agent should not debate formatting; it should run the formatter

### Vite / Vite+ in this MVP

Use Vite to create the React + TypeScript app and run the dev server. Vite provides fast local development and hot module replacement.

Suggested setup command:

```bash
pnpm create vite sufa-crm --template react-ts
```

If “Vite+” refers to the newer integrated VoidZero/Oxc/Rolldown direction, document it as a learning note rather than a hard MVP dependency. The MVP should stay on stable Vite unless Codex verifies that a Vite+ package/tooling path is stable in the current environment.

Explain:

- Vite runs the local dev server
- Vite builds the frontend bundle
- Vitest fits naturally with Vite because it can reuse Vite config and transforms
- Future Vite+/Rolldown/Oxc tooling may reduce fragmentation, but MVP should prioritise stability

### Void in this MVP

Void is an open-source AI code editor. Use it as the environment for working with Codex/agents if desired.

Create `.github/copilot-instructions.md` or `AGENTS.md` so Void/Codex has persistent instructions.

The file should tell agents:

- Always read this spec before coding
- Make small commits/changes
- Run tests before declaring success
- Do not bypass tests by weakening assertions
- Do not disable RLS or auth checks to make tests pass
- Ask before adding major dependencies

Explain:

- Void is the coding environment
- Codex/agent is the collaborator
- Tests and CI are the judge

---

## 10. Testing strategy: how we know the coding agent is working well

The coding agent is working well only if it repeatedly produces code that passes deterministic checks and satisfies user-flow tests. Natural-language confidence is not enough.

Add these test layers.

### 10.1 Static checks

Scripts:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "oxlint .",
    "format:check": "oxfmt --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm e2e"
  }
}
```

If Oxfmt is unavailable, replace `format:check` with Prettier.

### 10.2 Unit tests

Test pure logic first:

- `getMissingAthleteFields`
- `summarizePlayerReadiness`
- `summarizeCampaignReadiness`
- `draftPlayerReminder`
- `structureCoachNotes`
- role redirect helper
- passport expiry warning helper
- CSV export mapper

Examples:

- Given athlete missing emergency contact, function returns emergency contact as missing.
- Given passport expiry within 6 months, readiness row shows warning.
- Given complete athlete, profile completion is 100%.

### 10.3 Component tests

Use Vitest + Testing Library.

Test:

- Player dashboard shows missing checklist
- Admin dashboard shows campaign counts
- Coach evaluation form validates required ratings
- Login page calls magic-link function

Mock Supabase client at the boundary. Do not make component tests depend on a live Supabase project.

### 10.4 End-to-end tests

Use Playwright for user flows.

Create E2E tests with seeded/mock data:

1. Player returns to profile and sees missing fields.
2. Player completes profile and completion status updates.
3. Admin views incomplete campaign players.
4. Admin drafts reminders but does not auto-send them.
5. Coach submits evaluation for assigned player.
6. Coach cannot access admin-only page.
7. Player cannot access another player’s profile.

### 10.5 Database/RLS tests

Where possible, test Supabase policies using local Supabase and SQL tests.

Critical cases:

- Player can select own athlete row.
- Player cannot select another athlete row.
- Coach can view assigned campaign athletes through safe view.
- Coach cannot view passport/admin-sensitive fields.
- Admin can view all athletes.

### 10.6 Agent-behaviour tests

Since the assistant starts deterministic, test it like normal code.

Required tests:

- Assistant lists only fields the user is allowed to see.
- Admin reminder draft includes only the target player’s missing fields.
- Reminder draft does not include medical notes.
- Coach note structuring returns draft status, not submitted status.
- Assistant cannot create a sent message directly.

### 10.7 Regression tests for coding-agent quality

Add a folder:

```txt
tests/agent-regression/
```

Include small issue prompts and expected outcomes, for example:

```md
# Regression: player cannot access admin route

Task: Implement route protection so player users cannot access `/admin`.
Expected: Playwright test `player-cannot-access-admin.spec.ts` passes.
Forbidden: Do not remove the `/admin` route or skip the test.
```

These are not automated by themselves, but they become repeatable prompts for Codex. Each regression prompt should map to a deterministic test.

### 10.8 Pull request checklist for the coding agent

Create `.github/pull_request_template.md`:

```md
## What changed

## How I tested it

- [ ] pnpm typecheck
- [ ] pnpm lint
- [ ] pnpm format:check
- [ ] pnpm test
- [ ] pnpm e2e

## Security/privacy checks

- [ ] Did not weaken RLS policies
- [ ] Did not expose sensitive player fields to coaches
- [ ] Did not auto-send assistant drafts
- [ ] Did not store secrets in source code

## Screenshots

Add screenshots for UI changes.
```

---

## 11. Seed data

Create seed data for local development.

Users:

- `admin@sufa.test` role admin
- `player1@sufa.test` role player
- `player2@sufa.test` role player
- `coach@sufa.test` role coach

Campaign:

- `2026 Asia-Oceanic Campaign`

Athletes:

- Player 1: incomplete emergency contact and passport expiry
- Player 2: complete profile but passport expiry within 6 months

Coach:

- Assigned to campaign
- One pending evaluation
- One submitted evaluation

---

## 12. Implementation order for Codex

Build in this order:

1. Initialise Vite React TypeScript app.
2. Add routing and placeholder pages.
3. Add Supabase client setup and environment variables.
4. Add database migrations.
5. Add TypeScript types.
6. Add auth flow: login, callback, role redirect.
7. Add route guards.
8. Add deterministic assistant logic with unit tests.
9. Add player dashboard and profile form.
10. Add admin dashboard and player table.
11. Add campaign readiness logic.
12. Add reminder draft creation.
13. Add coach dashboard and evaluation form.
14. Add CSV export.
15. Add Playwright E2E tests.
16. Add docs/tooling.md for Oxlint, Oxfmt, Vite/Vite+, Void.
17. Run full `pnpm check`.

After each step, run the relevant checks. Do not wait until the end.

---

## 13. Definition of done

The MVP is done when:

- A user can log in with magic link flow.
- Role redirect works for player/admin/coach.
- Player can see and update own profile.
- Admin can see missing player information for a campaign.
- Admin can generate reminder drafts without auto-sending.
- Coach can submit structured evaluations.
- CSV export works for campaign players.
- Role protection prevents obvious cross-role access.
- Unit tests pass.
- Component tests pass.
- E2E tests pass.
- Typecheck, lint, and format checks pass.
- Tooling docs explain Oxlint, Oxfmt, Vite/Vite+, and Void in the context of this MVP.

---

## 14. Non-goals for MVP

Do not build these yet:

- Real SportSync API integration
- WhatsApp/Telegram sending integration
- Payment flows
- Native mobile app
- Full document upload system
- NRIC/passport number storage unless explicitly approved
- Fully autonomous AI agent actions
- Complex analytics dashboards
- Multi-association tenancy

---

## 15. Security notes

- Store secrets only in `.env.local`; never commit them.
- Use `.env.example` with placeholder values.
- Do not expose service-role keys to the frontend.
- Use RLS for client-accessible tables.
- Avoid storing sensitive identity documents in MVP.
- Keep medical notes access-controlled.
- Keep audit logs/change requests for important changes.

---

## 16. First Codex task prompt

Use this as the first task:

```md
Read `sufa_crm_mvp_codex_prompt.md` fully. Create the initial Vite React TypeScript project structure for the SUFA CRM MVP. Add React Router routes for all specified pages, placeholder layouts for player/admin/coach dashboards, Supabase client setup using environment variables, and initial test setup with Vitest and Playwright. Add scripts for typecheck, lint, format:check, test, e2e, and check. Do not implement business logic yet. After coding, run the available checks and report exactly what passed or failed.
```

## 17. Second Codex task prompt

```md
Implement the deterministic assistant logic in `src/lib/assistant.ts` and write unit tests for missing field detection, player readiness summary, campaign readiness summary, reminder drafts, and coach note structuring. Do not call any external LLM. Keep outputs deterministic. Run `pnpm test` and `pnpm typecheck`.
```

## 18. Third Codex task prompt

```md
Implement Supabase database migrations for profiles, athletes, campaigns, campaign_members, campaign_coaches, coach_evaluations, change_requests, and assistant_drafts. Add RLS policies for player/admin/coach access. Add seed data for local development. Add documentation in `docs/database.md` explaining the schema and access model. Do not expose sensitive fields to coaches.
```

---

## 19. Association-first product positioning

This MVP should be built first for SUFA adoption, not for a job application or generic portfolio polish. The primary audience is SUFA players, admin staff, and coaches. The product should prove that the association can reduce repeated admin chasing, maintain cleaner athlete records, and document coach evaluations without making the experience feel heavier than Google Forms.

The project can still be used later as an agent development case study, but that is secondary. Product usefulness for SUFA comes first.

### Positioning statement

Use this framing in the README, demo, and product materials:

> SUFA currently manages athlete data across Google Forms, Drive, WhatsApp, Telegram, and informal coach notes. This MVP creates a lightweight, role-based athlete CRM where players maintain one reusable profile, admins see campaign readiness and missing information, and coaches document evaluations consistently. The assistant layer helps detect gaps, draft follow-ups, and structure coach notes, while humans remain responsible for approvals, submissions, and official decisions.

### Primary success criteria

The MVP is successful if SUFA users would plausibly prefer it over the current workflow for a real campaign.

Measure success through:

- Player adoption: players can complete or update their profile quickly without needing admin guidance.
- Admin usefulness: admins can immediately see who is incomplete and what needs chasing.
- Coach usefulness: coaches can submit evaluations with less friction than using separate docs or forms.
- Handover value: a new admin or coach can understand campaign status without asking the previous person.
- Data quality: the system reduces duplicate submissions, stale information, and spreadsheet cleanup.
- Trust: sensitive data is protected by role-based access and human confirmation.

### Product principles

- Build the smallest product SUFA would actually use.
- Prefer obvious buttons, checklists, and tables over a blank chatbot.
- Use the assistant to reduce friction, not to hide the workflow.
- Do not ask returning players to re-enter information that already exists.
- Make missing work visible by default.
- Keep coach evaluations quick enough to complete after training or selection discussions.
- Make admin exports boring, predictable, and auditable.
- Do not overbuild SportSync integration before the required fields and format are confirmed.

### README section required

Add a top-level `README.md` section called `Association-first product brief` with these subsections:

1. `Customer problem`
   - SUFA's athlete data is fragmented across Google Forms, Google Drive, WhatsApp/Telegram, and coach memory.
   - The operational pain is not just collection; it is repeated chasing, incomplete data, poor handover, and lack of structured performance records.

2. `Who this is for`
   - Players who need a simple way to maintain their profile and know what is missing.
   - Admin staff who need a campaign readiness view and targeted chasing.
   - Coaches who need a lightweight way to document evaluations.

3. `Before and after workflow`
   - Before: form blast -> spreadsheet cleanup -> Drive lookup -> WhatsApp chasing -> manual coach notes -> ad hoc export.
   - After: athlete profile -> campaign requirements -> role-specific dashboards -> assistant detects blockers -> drafts reminders -> human approval -> audited export.

4. `Why not just Google Forms`
   - Google Forms is good for one-off collection.
   - SUFA needs reusable athlete profiles, campaign readiness, role-specific access, coach evaluation history, and handover continuity.

5. `Agent operating model`
   - Intent classification.
   - Role and permission check.
   - Tool/function selection.
   - Database query or deterministic draft generation.
   - Human confirmation for sensitive actions.
   - Audit log.
   - Evaluation tests.

6. `What the assistant can do`
   - Player: explain missing fields and why they matter.
   - Admin: summarise incomplete profiles, draft reminders, identify SportSync readiness gaps.
   - Coach: structure rough notes into draft evaluations.

7. `What the assistant cannot do`
   - It cannot bypass RLS.
   - It cannot auto-send reminders in the MVP.
   - It cannot save sensitive updates without confirmation.
   - It cannot decide team selection or grant/reward eligibility.
   - It cannot expose admin-only fields to coaches or players.

8. `How SUFA should evaluate the MVP`
   - Run one real or simulated campaign with a small group.
   - Track completion rate, admin time spent chasing, number of missing fields, coach evaluation completion, and user feedback.
   - Compare against the current Google Forms + WhatsApp workflow.

---

## 20. Agent operating model implementation

Create `docs/agent-operating-model.md`.

This document should explain the agent lifecycle for the MVP.

### Agent lifecycle

For every assistant action, follow this sequence:

```txt
User request
  -> identify intent
  -> confirm authenticated user
  -> load user role and permissions
  -> retrieve only allowed data
  -> run deterministic assistant function
  -> return answer or draft
  -> require confirmation for state-changing actions
  -> write audit/draft record where appropriate
```

### Intent types

Implement these deterministic intent categories first:

```ts
type AssistantIntent =
  | "player_missing_fields"
  | "player_explain_field"
  | "admin_incomplete_players"
  | "admin_draft_reminders"
  | "admin_sportsync_readiness"
  | "coach_pending_evaluations"
  | "coach_structure_notes"
  | "unsupported";
```

Do not use an LLM router in the MVP. A simple button-driven assistant with prompt suggestions is enough. The text box can map common phrases to deterministic intents, but the main flows should be accessible through buttons.

### Tool/function permissions

Create a permission matrix in `docs/agent-operating-model.md`:

| Function                     |           Player |       Admin |                                    Coach |
| ---------------------------- | ---------------: | ----------: | ---------------------------------------: |
| `getMissingAthleteFields`    | Own profile only | Any athlete | Assigned athletes only, safe fields only |
| `summarizeCampaignReadiness` |               No |         Yes | Assigned campaign evaluation status only |
| `draftPlayerReminder`        |               No |         Yes |                                       No |
| `structureCoachNotes`        |               No |          No |               Own evaluation drafts only |
| `exportCampaignCsv`          |               No |         Yes |                                       No |

### Human-in-the-loop requirements

State-changing actions must use explicit confirmation:

- Player profile save: confirmation on form submit.
- Admin reminder draft: generated as draft; not sent automatically.
- Coach structured notes: returned as editable draft; not submitted automatically.
- Export: admin must click export; assistant can only explain readiness.

---

## 21. Demo script for SUFA stakeholder review

Create `docs/demo-script.md` with a 3 to 5 minute walkthrough for SUFA stakeholders.

### Demo structure

1. `The association problem`
   - Explain the current SUFA workflow in 30 seconds.
   - Emphasise fragmented tools, repeated chasing, and undocumented coach evaluations.

2. `Product decision`
   - Explain why this is not just a chatbot.
   - The CRM is the source of truth; the assistant is the workflow helper.
   - The UI is mostly dashboards, checklists, and forms, with an assistant side panel.

3. `Player flow`
   - Log in as `player1@sufa.test`.
   - Show missing fields checklist.
   - Ask the assistant: "What am I missing?"
   - Update a missing field.
   - Show that returning players do not need to re-enter completed details.

4. `Admin flow`
   - Log in as `admin@sufa.test`.
   - Open campaign readiness dashboard.
   - Ask: "Who is incomplete?"
   - Generate reminder drafts.
   - Show that drafts require approval and are not auto-sent.
   - Export campaign readiness data.

5. `Coach flow`
   - Log in as `coach@sufa.test`.
   - Open assigned campaign.
   - Paste rough notes.
   - Convert to structured draft.
   - Save or submit only after human confirmation.

6. `Trust and guardrails`
   - Show role-based data boundaries.
   - Show that coaches cannot see passport or admin-only fields.
   - Show that sensitive actions require confirmation.

7. `Pilot plan`
   - Suggest testing with one upcoming campaign or a simulated campaign.
   - Collect feedback from at least one player, one admin, and one coach.
   - Track completion rate, reminders generated, evaluation completion, and qualitative pain points.

---

## 22. Agent evaluation harness

Create an explicit eval harness so the MVP demonstrates assistant quality, not just UI.

### File structure

```txt
src/lib/assistant/
  intents.ts
  permissions.ts
  missing-fields.ts
  reminders.ts
  coach-notes.ts
  sportsync-readiness.ts
  index.ts

tests/assistant-evals/
  player-missing-fields.eval.test.ts
  admin-reminders.eval.test.ts
  coach-notes.eval.test.ts
  permissions.eval.test.ts
  unsupported-intents.eval.test.ts
```

### Eval case format

Use table-driven tests.

Example:

```ts
const cases = [
  {
    name: "admin drafts reminder without medical notes",
    role: "admin",
    input: {
      athleteName: "Player One",
      missingFields: ["passport_expiry", "emergency_contact_phone"],
      medicalNotes: "Do not include this",
    },
    expectedIncludes: ["passport expiry", "emergency contact"],
    expectedExcludes: ["Do not include this"],
  },
];
```

### Required evals

Add deterministic tests for:

- Player asking what is missing sees only their own missing fields.
- Player cannot ask about another player's profile.
- Admin can summarise campaign blockers.
- Admin reminder drafts contain only relevant missing fields.
- Admin reminder drafts do not include medical notes.
- Coach can structure rough notes only for assigned players.
- Coach structured notes are returned with `status: 'draft'`.
- Unsupported requests return a safe fallback.
- Any state-changing action requires confirmation.

### Success criteria

The coding agent should not be considered successful unless:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm e2e
```

all pass, or the agent reports exactly which checks failed and why.

---

## 23. Association and project artifacts to generate

The MVP should generate evidence that SUFA can use to decide whether to pilot or adopt the system.

Create these files:

```txt
README.md
AGENTS.md
docs/product-brief.md
docs/agent-operating-model.md
docs/demo-script.md
docs/tooling.md
docs/database.md
docs/testing-strategy.md
docs/pilot-plan.md
```

### `docs/product-brief.md`

Must include:

- Problem statement.
- Users and jobs-to-be-done.
- MVP scope.
- Non-goals.
- Risks.
- Success metrics.
- Future roadmap.

### `docs/pilot-plan.md`

Must include:

- Suggested pilot scope: one campaign, limited player group, one admin, one coach.
- How to seed or import initial players.
- What feedback to collect from each role.
- What metrics to compare against Google Forms + WhatsApp.
- Go/no-go criteria for continuing development.

### `docs/testing-strategy.md`

Must include:

- Why tests are used to evaluate AI-generated code.
- What each test layer catches.
- How to run checks.
- What not to do when tests fail.
- A short explanation that tests are the judge, not the coding agent's confidence.

### `AGENTS.md`

Must tell coding agents:

- Read the spec and README before coding.
- Make small, reviewable changes.
- Add or update tests with every behaviour change.
- Do not weaken tests to pass.
- Do not bypass RLS.
- Do not expose sensitive fields to the wrong role.
- Do not auto-send assistant drafts.
- Optimise for SUFA user adoption before portfolio polish.
- Report exactly what commands were run and their results.

---

## 24. Association-first implementation priorities

When choosing between features, prioritise work that makes the MVP more likely to be used by SUFA in a real campaign:

1. Player profile completion that is faster than filling repeated forms.
2. Admin campaign readiness dashboard that makes missing work obvious.
3. Coach evaluation flow that can be completed quickly and consistently.
4. Clear role-specific navigation and landing pages.
5. Human-in-the-loop assistant actions.
6. Permission and privacy guardrails.
7. Exports that admins can trust.
8. Evals and regression tests.
9. Demo script and pilot plan for SUFA stakeholders.
10. Stable technical implementation.

Do not over-optimise for visual polish, generic portfolio language, or advanced LLM behaviour before the core SUFA workflows and tests are working.

---

## 25. Fourth Codex task prompt: association-ready documentation

```md
Update the project so it reads like an association-ready product MVP, not only a technical demo. Add README sections for customer problem, users, why not Google Forms, before/after workflow, assistant operating model, guardrails, testing strategy, and SUFA pilot instructions. Create `docs/product-brief.md`, `docs/agent-operating-model.md`, `docs/demo-script.md`, `docs/testing-strategy.md`, `docs/pilot-plan.md`, and `AGENTS.md`. Keep the content specific to the SUFA CRM MVP. Do not add implementation code in this task unless needed for documentation links. After editing, run formatting checks if available.
```

## 26. Fifth Codex task prompt: agent eval harness

```md
Create the deterministic assistant eval harness. Add assistant modules for intents, permissions, missing fields, reminders, coach notes, and SportSync readiness if they do not already exist. Add table-driven tests under `tests/assistant-evals/` covering player, admin, coach, permissions, unsupported intents, and human-confirmation requirements. Do not use an external LLM. Do not weaken existing tests. Run `pnpm test`, `pnpm typecheck`, and `pnpm lint`.
```
