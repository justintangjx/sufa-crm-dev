# Candidate 1 — 3-team U24 rollout shape

**Verdict: (A) No new architecture.** Treat Mixed / Opens / Womens as three campaigns. Ship product/ops deltas only. Do not add `teams`, `events`, or membership-level team columns.

---

## Problem

Roll out U24 Worlds as three concurrent squads (Mixed, Opens, Womens), each with ~2 coaches and ~22 players (6 coaches / 66 players total). Decide whether that requires a new domain layer, or whether the existing campaign-first model already is the assignment and evaluation boundary.

Pain that looks like “architecture”:

- Admin create/assign is one-by-one → 66 athlete creates + 66 membership upserts + 6 Auth coaches + 6 coach assigns without bulk tooling.
- `pickPrimaryCampaign` returns the first active U24 → ambiguous once three U24 campaigns are active (admin/coach dashboards deep-link to one campaign).
- Pilot docs and seed still speak as if MVP focus is a single `c-u24`.

None of those break RLS, uniqueness, matrix soft limits, or NPS scoping. They are ops volume and primary-campaign UX.

---

## Usage

Callers first (what the product must do), then types.

### Admin

1. Create three campaigns (or clone naming from one template): e.g. `U24 Worlds 2026 — Mixed` / `Opens` / `Womens`, with `campaigns.team` set to the squad label and name/team containing `u24` so `isU24Campaign` stays true.
2. For each campaign: provision roster (prefer CSV import once volume hurts; otherwise create-and-assign) to ~22 athletes; assign 2 existing coach profiles.
3. Open matrix/NPS per campaign independently; read readiness and NPS aggregates per `campaignId`.
4. Land on `/admin/campaigns` list (ordered U24-first) rather than trusting a single dashboard “primary” when multiple U24s are live.

### Coach

1. Auth user exists outside CRM; profile `role=coach`; assigned via `campaign_coaches` (typically one squad; model allows many).
2. Dashboard lists assigned campaigns; “Open campaign” should not silently pick the wrong U24 when the coach has multiple (rare) or when admin is browsing all three.
3. Work matrix assessments inside `/coach/campaigns/:campaignId` — soft ≤2 submits per player stays campaign-local (~88 assessment rows target per squad).

### Player

1. Athlete row created by admin (email = login key); membership on exactly one of the three squads in the common case (model allows many campaigns).
2. Self-eval + NPS only for campaigns they belong to; no cross-squad matrix bleed.

### Ops / Auth

1. Six coach Auth users created in Supabase Auth (CRM cannot create them).
2. Optional: bulk athlete CSV → athletes + `campaign_members` upserts (already queued in cleanup plan; urgency rises at 66, not at schema).

### Usage sketch (sequence)

```
admin.createCampaign × 3  (name/team encode U24 + Mixed|Opens|Womens)
  → for each campaignId:
       importOrCreateAthletes(22) → upsert campaign_members
       assignCoaches(2)           → upsert campaign_coaches
  → coach/player navigate by campaignId
  → matrix + NPS APIs always take campaignId
```

No caller needs `teamId` or `eventId` if campaign is the unit.

---

## Shape

### Domain rule

**Team ≡ campaign row.** Squad identity is `campaigns.team` (and naming). Access, matrix history, and NPS remain keyed by `campaign_id` via `campaign_members` / `campaign_coaches`. That already encodes “Mixed work is not Opens work.”

### Invariants (already in DB / types — keep, do not reinvent)

| Invariant                          | Encoding today                                                    |
| ---------------------------------- | ----------------------------------------------------------------- |
| Athlete on a campaign at most once | `campaign_members` unique `(campaign_id, athlete_id)`             |
| Coach on a campaign at most once   | `campaign_coaches` unique `(campaign_id, coach_profile_id)`       |
| Athlete may join many campaigns    | No global single-campaign constraint                              |
| Coach may join many campaigns      | Same                                                              |
| U24 matrix/NPS capabilities        | `isU24Campaign` + flags in `campaignCapabilities`                 |
| Soft coach assessment cadence      | UI only (`matrixSoftLimit`); append-only DB                       |
| Login key                          | `athletes.email` unique; Auth provisioned outside CRM for coaches |

### Product/ops deltas (not new entities)

1. **Campaign naming convention** — three rows; each `name`/`team` includes `u24` and squad label. Prefer stable ids in seed (`c-u24-mixed`, …) only if seed/tests need them; production can use generated UUIDs.
2. **Primary-campaign UX** — when ≥2 active U24 campaigns exist, do not imply a single Worlds focus:
   - Admin dashboard: either show a U24 campaign picker / multi-summary, or deep-link to `/admin/campaigns` instead of one `pickPrimaryCampaign`.
   - Coach dashboard: if `assignedU24Count > 1`, require explicit campaign choice (CTA list); if exactly one, keep current shortcut.
   - Keep `pickPrimaryCampaign` as a **heuristic for empty state / single-focus MVP**, document that multi-U24 makes it non-authoritative.
3. **Roster CSV import** — promote from “optional next-queue” to **rollout dependency** for 66 players (shape already specified in `docs/cleanup-refactor-plan.md` §2: preview, match by email/legal name, upsert members, audit). Still not a new domain table unless audit RPC is chosen.
4. **Harness / docs / seed** — extend `pilot-u24` narrative from one campaign to three; mock seed may keep one dense U24 plus stubs, or three thin squads — product choice, not schema.
5. **No hard roster caps** — pilot policy remains open roster (~12–25 historically; 22 is within band). Do not add DB max 22 / max 2 coaches.

### Type / module map

**No new modules required for architecture.** Optional product touchpoints:

| Area                                       | Change?                      | Notes                                                         |
| ------------------------------------------ | ---------------------------- | ------------------------------------------------------------- |
| `campaigns` / members / coaches tables     | No                           | Reuse                                                         |
| `src/types/database.ts`                    | No                           | Unless import audit table added later                         |
| `src/data/types.ts` + adapters             | Only if CSV import API added | e.g. `previewRosterImport` / `commitRosterImport`             |
| `src/lib/campaignUi.ts`                    | Small product fix            | Multi-U24 primary behaviour / helper `listActiveU24Campaigns` |
| `src/lib/campaignCapabilities.ts`          | No                           | Already name/team/`c-u24` gated                               |
| `src/lib/matrixSoftLimit.ts` / NPS helpers | No                           | Per-campaign; scale is fine                                   |
| New `teams` / `events` modules             | **Reject**                   | Duplicate assignment unit                                     |
| Admin import route                         | Product, queued              | Under campaign detail or `/admin/players`                     |
| RLS                                        | No change                    | Membership EXISTS already scopes multi-campaign users         |

Derived types from usage (conceptual — only materialize if implementing import/UX):

```ts
/** Squad label stored on campaigns.team; not an FK. */
type U24SquadLabel = "Mixed" | "Opens" | "Womens";

/** Rollout unit = one campaign row satisfying isU24Campaign. */
type U24SquadCampaign = Campaign & {
  // invariant enforced by ops naming + isU24Campaign, not a new table
};

type RosterImportRow = {
  email: string;
  legalName: string;
  // …existing athlete create fields
};

type RosterImportPreview = {
  creates: RosterImportRow[];
  matches: { athleteId: string; row: RosterImportRow }[];
  duplicates: RosterImportRow[];
  errors: { row: RosterImportRow; reason: string }[];
};
```

Encode “three squads” as **three campaigns in data**, not as a TypeScript union that the DB must know.

---

## Synthesis decision

_(leave blank for orchestrator)_

---

## Tradeoffs

| Keep campaign-as-team                                 | Cost                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| Zero migration / RLS risk                             | Admin dashboard “primary” is wrong until UX tweak                   |
| Matrix/NPS/audit stay coherent per squad              | Cross-squad Worlds rollup needs three queries or a later read model |
| Matches seed + multi-campaign coach behaviour already | Ops pain until CSV import exists                                    |
| Honest about Auth (still external)                    | 6 coach invites remain manual                                       |

Inventing `events` + `teams` would add join paths for every matrix/NPS query and duplicate what `campaign_id` already means, for a rollup admin might not need in pilot.

---

## Alternatives considered

1. **`events` parent + `teams` children** — Worlds 2026 event owns Mixed/Opens/Womens; campaigns become optional or 1:1 with teams. Rejected: assignment/eval unit today is campaign; a parent is only justified for cross-team dashboards/exports not in the critical path.
2. **One campaign, `team` on `campaign_members`** — single U24 campaign, partition roster by membership team. Rejected: matrix/NPS/capabilities/soft limits are campaign-scoped; would force schema and RLS redesign to re-scope every feature by `(campaign_id, team)`.
3. **CSV import as “architecture” / first-class subdomain** — Rejected as _architecture_ for this decision: it is the right _product_ lever for volume, already designed in cleanup plan; it does not change whether teams exist.
4. **Hard DB caps (22 players, 2 coaches)** — Rejected: contradicts open-roster pilot policy and soft matrix cadence; ops convention + UI warnings suffice.
5. **Widen `isU24Campaign` with a `campaign_kind` enum column** — Optional later polish; not required if naming convention holds. Avoid blocking rollout on a migration.

---

## Open questions

1. May any athlete appear on two of Mixed/Opens/Womens at once? (Model allows; product may forbid socially.)
2. Should admin Worlds rollup (3-way matrix/NPS summary) ship with rollout, or is per-campaign admin enough?
3. Seed strategy: three full mock squads vs one full + two stubs for harness?
4. Promote CSV import before or in parallel with creating the second/third production campaigns?
5. Stable campaign ids in production seed vs opaque UUIDs + team labels only?

---

## Next implementation step

1. **Ops:** Create/name the three U24 campaigns; assign coaches after Auth provisioning; roster via current UI or import if ready.
2. **Product (small):** Adjust admin/coach dashboard primary CTA for multiple active U24 campaigns (`campaignUi` + dashboard links) — do not add tables.
3. **Product (volume):** Implement U24 roster CSV import per cleanup-plan §2 when 66 one-by-ones are unacceptable.
4. **Docs/harness:** Update `state.md` MVP focus and `pilot-u24` smoke to “three U24 campaigns”; keep flags/migrations unchanged.

Manual Supabase/Cloudflare for architecture: **none**. Auth: create 6 coach users in Supabase Auth. Optional later: import audit migration only if import is not pure client upserts.
