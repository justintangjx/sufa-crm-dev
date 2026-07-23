# Candidate 2 — Shape A: three campaigns, reuse model, ops/import

**Chosen shape:** A — three U24 team-campaigns; no Event/Team tables; bulk CSV import for roster/coach assignment pain.

**Synthesis decision:** _(blank — leave for synthesis pass)_

---

## 1. Problem

Roll SUFA CRM from one U24 pilot campaign (`c-u24`) to three concurrent U24 team-campaigns:

| Team      | Players | Coaches |
| --------- | ------- | ------- |
| Mixed     | 22      | 2       |
| Opens     | 22      | 2       |
| Womens    | 22      | 2       |
| **Total** | **66**  | **6**   |

Constraints from grounding:

- Assignment unit today is **campaign**. No `teams` table; `campaigns.team` is free-text.
- Matrix, soft 2/2, and NPS are **per-campaign** and scale with roster × coaches.
- Admin create/assign is one-by-one; 66+6 without import is ops pain, not a schema break.
- `pickPrimaryCampaign` prefers first active U24 — **ambiguous** once three U24 campaigns are active.
- Coach Auth users cannot be created from the CRM client.

---

## 2. Usage (callers first)

Derive the shape from what callers already do. Do not invent entities callers do not ask for.

### Admin

| Call site                                                                  | Needs                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `AdminCampaignsPage` → `listCampaigns()` + `orderCampaignsForMvp`          | Flat list of campaigns; U24 rows sorted first                             |
| `AdminCampaignDetailPage` → `assignCampaignMember` / `assignCampaignCoach` | One `(campaignId, athleteId\|coachProfileId)` at a time                   |
| Admin dashboards → `pickPrimaryCampaign`                                   | A single “focus” campaign deep-link (today assumes ≤1 active U24)         |
| Future CSV import (queue item)                                             | Bulk create athletes + assign members; optionally assign coaches by email |

### Coach / player

| Call site                                                   | Needs                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| `listCampaigns` / membership-scoped lists                   | Campaigns they belong to (already multi-campaign capable) |
| `CoachDashboard` / `AdminDashboard` → `pickPrimaryCampaign` | Prefer U24 when present; breaks with 3 peers              |
| `CoachCampaignPage` / player campaign routes                | Matrix + soft limit scoped by `campaignId`                |
| NPS flows                                                   | Assignments/responses keyed by campaign survey            |

### Capability / gating

| Call site                        | Needs                                                     |
| -------------------------------- | --------------------------------------------------------- |
| `campaignCapabilities(campaign)` | `isU24Campaign` → live matrix + NPS on; Growth/legacy off |
| `isU24Campaign`                  | `id === "c-u24"` **or** name/team contains `"u24"`        |

### Access

RLS scopes via `campaign_members` / `campaign_coaches` EXISTS. Team label is **not** an access boundary. Same athlete/coach may sit on multiple campaigns.

**Usage verdict:** Every product surface keys on `campaignId`. Callers never ask for Event or Team ids. The 3-team rollout is “three campaigns that look like U24,” plus cheaper ops.

---

## 3. Shape A (chosen)

### 3.1 Entity model (unchanged tables)

```
campaigns
  └── campaign_members (athlete ↔ campaign)
  └── campaign_coaches (coach_profile ↔ campaign)
  └── player_matrix_submissions / coach_matrix_assessments (per campaign)
  └── campaign_nps_* (per campaign)

athletes, profiles  — shared identity; not duplicated per team
```

No `events`, no `teams`, no member `team_tag`. Team identity = **one campaign row** with a distinctive `name` + `team` string.

### 3.2 Concrete campaign instances

Seed / production create three **active** U24 campaigns (example ids; production may use UUIDs):

| id (example)   | name                     | team       | status |
| -------------- | ------------------------ | ---------- | ------ |
| `c-u24-mixed`  | U24 Worlds 2026 — Mixed  | U24 Mixed  | active |
| `c-u24-opens`  | U24 Worlds 2026 — Opens  | U24 Opens  | active |
| `c-u24-womens` | U24 Worlds 2026 — Womens | U24 Womens | active |

Naming rules (ops + gating):

1. Every U24 team-campaign **must** include `"u24"` in `name` and/or `team` so `isU24Campaign` stays true without new columns.
2. Prefer migrating the current pilot `c-u24` → Mixed (rename in place) **or** archive `c-u24` and create three fresh rows if pilot data should not carry over. Decision is ops, not shape.
3. Keep SEA Games (`c-sea`) as non-U24 demo; do not put `"u24"` in its name/team.

### 3.3 Types derived from usage (no new core entities)

Existing (keep):

```ts
// database.ts — already sufficient
Campaign { id, name, team, status, start_date, end_date, ... }
CampaignMemberAssignment { campaignId, athleteId, status }
CampaignCoachAssignment { campaignId, coachProfileId }
```

Add only what **callers need** for multi-U24 UX + import (API/contract level; still no Event/Team):

```ts
/** Disambiguate dashboards when ≥2 active U24 campaigns exist. */
type PrimaryCampaignPolicy =
  | { kind: "explicit"; campaignId: string } // last-opened / user preference
  | { kind: "list" } // no fake primary; show U24 list
  | { kind: "first-ordered" }; // current pickPrimaryCampaign fallback

/** Admin CSV import — batch of today's one-by-one assign calls. */
interface CampaignRosterImportRow {
  email: string;
  fullName: string;
  gender?: string;
  dateOfBirth?: string;
  positions?: string[];
  memberStatus?: CampaignMemberStatus; // default selected/invited per product
}

interface ImportCampaignRosterInput {
  campaignId: string;
  athletes: CampaignRosterImportRow[];
  /** Optional: assign existing coach profiles by email after Auth provision. */
  coachEmails?: string[];
}

interface ImportCampaignRosterResult {
  createdAthletes: number;
  assignedMembers: number;
  skippedDuplicates: number;
  coachAssigned: number;
  errors: { row: number; message: string }[];
}
```

`Api` extension (usage-shaped):

```ts
importCampaignRoster(input: ImportCampaignRosterInput): Promise<ImportCampaignRosterResult>;
```

Internals: loop existing `createAthlete` / `assignCampaignMember` / `assignCampaignCoach` semantics; enforce uniqueness `(campaign_id, athlete_id)` the same way as today. No new tables.

Coach Auth remains out-of-band: CSV may list coach emails only if matching `profiles` already exist; otherwise report error rows (“create Auth user first”).

### 3.4 U24 gating

Keep string/id heuristic; **do not** introduce `campaign.kind = 'u24'` unless synthesis later demands it.

With Shape A:

- All three team-campaigns match `isU24Campaign` via name/team containing `"u24"`.
- `campaignCapabilities` continues to enable live matrix + NPS per campaign automatically.
- Growth Matrix / legacy Evaluate stay off on all three.

**Required companion change (product, not schema):** fix `pickPrimaryCampaign` ambiguity.

Recommended policy for this design:

1. Prefer **explicit last-opened campaign** (localStorage / profile preference) when set and still in the user’s list.
2. Else if multiple active U24 campaigns → return `null` primary and let dashboards show an **ordered U24 campaign list** (`orderCampaignsForMvp` already ranks U24 first).
3. Else keep today’s first-active-U24 / first-active / first behaviour.

Do **not** invent a cross-campaign “Event primary.” That would be Shape B leaking in.

### 3.5 CSV import (ops lane)

Import is the scale answer for 66 players + 6 coaches.

**Scope (MVP import):**

1. Admin selects a **target campaign** (Mixed / Opens / Womens).
2. Upload CSV → map columns → `ImportCampaignRosterInput`.
3. Per row: upsert athlete by email (closed-roster rules: admin-created, email login key) → `assignCampaignMember`.
4. Optional coach email column/file: assign only existing coach profiles; never create Auth users.
5. Idempotent on re-run: duplicate `(campaign, athlete)` → skip; report counts.

**Out of scope for Shape A:**

- Cross-campaign “one CSV for all three teams” mega-import (can be three runs).
- Event-level rollups.
- Auto-splitting by a `team` CSV column into one mega-campaign (that is Shape C).

**Why import belongs in Shape A:** grounding scale math already says schema is fine; pain is admin click-count. Import is the smallest whole-shape change that makes 66/6 operable.

### 3.6 Per-campaign product behaviour (unchanged semantics)

Per team-campaign (22 × 2):

| Surface                  | Scale                                   |
| ------------------------ | --------------------------------------- |
| Soft coach matrix target | ≤88 submitted assessment rows (22×2×2)  |
| NPS open assignments     | 22 player + 2 coach; responses up to 88 |
| RLS                      | Membership on that campaign only        |

Coaches on two teams = two `campaign_coaches` rows (already supported). Athletes on two teams = two memberships (rare; allowed).

### 3.7 Ops runbook (no app schema migration required for core shape)

1. Create/rename three campaigns with U24 in name/team; status `active`.
2. Provision 6 coach Auth users externally; assign 2 per campaign (UI or CSV coach emails).
3. Run roster CSV import thrice (or once per campaign).
4. Enable matrix/NPS flags only after harness `pilot-u24` GO (same as today; three campaigns inherit gating via `isU24Campaign`).
5. Smoke: coach sees only assigned campaigns; player magic link still gated by closed roster email.

Migrations: **none required** for Shape A core. Optional later: seed SQL for the three campaigns; preference column for primary campaign if not local-only.

---

## 4. Tradeoffs

|          |                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pros** | Zero new domain entities; reuses RLS, matrix, NPS, soft limit, capabilities; import addresses real ops bottleneck; matches seed’s existing multi-campaign reality                                                                    |
| **Cons** | No first-class Event for “U24 Worlds 2026” rollup; admin compares teams by opening three campaigns; `pickPrimaryCampaign` must be fixed; naming convention is brittle if someone creates “Regional tune-up” without `u24` in strings |
| **Risk** | Duplicate athletes across teams if import emails differ by typo (same as today, magnified by volume) — mitigate with email-normalized upsert + import dry-run                                                                        |

---

## 5. Alternatives (rejected for this candidate)

### Shape B — Event + Team above campaigns

Introduce `events` and `teams`, nest campaigns or replace campaign as assignment unit.

- **Why not:** No caller today passes `eventId`/`teamId`. Matrix/NPS/RLS all key on `campaign_id`. Would force migrations, API, screens, and capability rewiring for three peer rosters that already fit campaigns.
- **When revisit:** Cross-team admin dashboards, shared event-level NPS, or many sports events with nested teams become primary product asks.

### Shape C — One mega-campaign + team tags on members

Single `c-u24` with `team_tag` on `campaign_members` / coaches.

- **Why not:** Soft 2/2, matrix coverage, and bidirectional NPS are campaign-scoped. Tags would require filtering every list/query/RLS path or else Mixed coaches see Opens players. Team label is explicitly **not** an access boundary today — Shape C makes it one, which is a security/product redesign, not a rollout shortcut.
- **When revisit:** Only if product demands one shared NPS pool across all 66 players and 6 coaches.

---

## 6. Open questions

1. Migrate pilot `c-u24` in place to Mixed vs archive and create three clean campaigns?
2. May the same athlete appear on two of Mixed/Opens/Womens, or is that a hard ops rule (app still allows it)?
3. Primary-campaign UX: localStorage last-opened vs force campaign picker on every dashboard?
4. Import MVP: athletes-only first, or athletes+coach emails in v1?
5. Should `isU24Campaign` eventually become an explicit `campaign_kind` / flag to avoid string brittleness?

---

## 7. Next step

1. Agree Shape A with synthesis (or reject).
2. Spec `pickPrimaryCampaign` policy + dashboard list UI for ≥2 active U24.
3. Spec CSV column map + `importCampaignRoster` against closed-roster invariants + pre-flight email uniqueness audit.
4. Ops: create three campaigns; Auth-provision coaches; import rosters; harness GO before flag enablement.

**Manual Supabase / Cloudflare work if implemented:** create/rename three campaign rows (SQL Editor or admin UI); provision 6 Auth coach users; Cloudflare flag flips only after harness GO. No new migrations required for core Shape A.
