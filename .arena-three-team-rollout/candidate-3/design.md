# Candidate 3 — Three campaigns, no Teams table

## Verdict

**No architecture change for a `teams` entity.** Model Mixed / Opens / Womens as three campaigns. The existing campaign membership graph already supports the roster shape. Scale (matrix soft 2/2, NPS fan-out) stays comfortably per-campaign. The real gaps are **ops UX** (bulk assign) and **multi-active-U24 navigation** (`pickPrimaryCampaign` / U24 detection), not a new domain table.

Auth explorer finding (accepted): multi-campaign membership already works; `campaigns.team` is a display label only and is not an access boundary.

---

## Problem

Roll out U24 Worlds as three squads (Mixed, Opens, Womens), each with ~22 players and 2 coaches (≈66 players, 6 coaches total). Someone may propose a `teams` table because the product language says "team." That would invent a second assignment unit beside `campaign_members` / `campaign_coaches` without a usage that requires it.

Concrete failure modes if we do nothing careful:

1. Three active U24-shaped campaigns make `pickPrimaryCampaign` arbitrary (first match).
2. `isU24Campaign` depends on `id === c-u24` or name/team containing `"u24"` — squad labels like "Mixed" alone would drop matrix/NPS capabilities.
3. Admin create/assign one-by-one at 66+6 is painful ops, not a schema break.

## Usage

| Actor        | What they do with three squads                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin        | Creates three campaigns; assigns athletes/coaches per campaign; opens NPS per campaign; reads matrix coverage and NPS aggregates per campaign. May want a single "U24 Worlds" list grouping in the UI later — still navigation, not a join table. |
| Coach        | Signed into Auth once; assigned to one or more campaigns; assesses only players on that campaign; soft 2/2 is per (coach, player, campaign). Never needs a team entity to know who to rate.                                                       |
| Player       | One athlete row; membership in one or more campaigns; self-eval and NPS assignments scoped to campaign membership. Multi-campaign already legal.                                                                                                  |
| System / RLS | Access via `campaign_members` / `campaign_coaches` EXISTS checks. Team string never consulted.                                                                                                                                                    |

No usage requires: "list all athletes on Team X across campaigns," "move team between campaigns," "team as RLS subject," or "shared team-level NPS."

## Shape

### Keep (source of truth)

```
campaigns                    -- one row per squad (Mixed / Opens / Womens)
athletes                     -- reusable player identity (email login key)
campaign_members             -- (campaign_id, athlete_id) unique
campaign_coaches             -- (campaign_id, coach_profile_id) unique
player_matrix_submissions    -- per campaign
coach_matrix_assessments     -- per campaign; soft 2/2 UI only
campaign_nps_*               -- surveys / assignments / responses per campaign
```

`campaigns.team` stays free-text label for display (e.g. `"U24 Mixed"`). It is not a FK and not an access boundary.

### Do not add

- `teams` table
- `team_id` on athletes, members, or coaches
- Team-scoped RLS
- Cross-campaign "team rollup" schema

### Smallest correct change set

Ordered by necessity for a correct three-squad pilot:

1. **Data / seed shape (no migration required for structure)**  
   Three campaign rows; each with ~22 `campaign_members` and 2 `campaign_coaches`. Reuse athletes across campaigns only when a person truly plays on two squads (rare; already supported).

2. **U24 capability identity (small app change; optional tiny column later)**  
   Ensure each squad campaign still passes `isU24Campaign` so matrix/NPS capabilities turn on.
   - Minimal: naming convention — `name` or `team` includes `"u24"` (e.g. team `"U24 Mixed"`).
   - Slightly cleaner later: explicit `program` or `capability_profile` enum/text on `campaigns` — still not a Teams table.

3. **Multi-primary navigation (app-only)**  
   Stop treating "the" primary U24 campaign as unique. Dashboards / deep-links should list ordered active campaigns (existing `orderCampaignsForMvp`) or remember last-selected `campaignId`. `pickPrimaryCampaign` remains a convenience default, not a domain invariant.

4. **Admin ops (product next-queue, not architecture)**  
   CSV roster import + bulk assign (already queued). Auth coaches still provisioned outside CRM client, then assigned per campaign. Painful at 66 without import; still not a reason for `teams`.

5. **No change to soft 2/2 or NPS model**  
   Soft max remains UI on per-campaign assessment history. NPS fan-out remains bidirectional assignments generated from that campaign's roster × coaches.

### Scale math (why schema is fine)

Per campaign (~22 players, 2 coaches):

| Surface                | Order of magnitude                                   |
| ---------------------- | ---------------------------------------------------- |
| Soft matrix target     | 22 × 2 coaches × ≤2 submits ≈ **88** assessment rows |
| NPS assignments (open) | 22 player + 2 coach ≈ **24** assignment rows         |
| NPS responses (full)   | 22×2 + 2×22 = **88** responses per survey window     |

×3 campaigns ≈ **264** matrix target rows and **264** NPS responses per window. Negligible for Postgres; admin aggregate panels stay per-campaign. Fan-out is linear in roster size **per campaign**, which is the right unit — a Teams table does not reduce fan-out; collapsing three squads into one campaign would _increase_ wrong-pair NPS/matrix work (Mixed coach rating Opens players).

### Domain: team vs campaign

| Concept                               | In this product                                                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Campaign**                          | Training-to-competition container; assignment unit; matrix/NPS/RLS scope.                                                                                                                                                                               |
| **Team (colloquial)**                 | Squad label for that container (Mixed / Opens / Womens). Same lifetime as the campaign for this rollout.                                                                                                                                                |
| **When a Teams table earns its keep** | Squads persist across multiple campaigns; athletes belong to a squad independent of campaign; team is an access or reporting root; or multiple campaigns share one roster identity that must stay in sync. **None of these are in the 3×(22+2) usage.** |

Push-back line: if the ask is "we say team in the UI," use `campaigns.team` (and campaign name). If the ask is "we need a join graph," show a usage that campaign membership cannot express — there isn't one for this rollout.

## Tradeoffs

| Choice                                      | Upside                                                                        | Cost                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Three campaigns, no Teams                   | Matches RLS, matrix, NPS, Auth membership; zero migration risk; smallest diff | Admin sees three rows; no formal "event" parent                                     |
| Naming convention for U24 detect            | Zero schema                                                                   | Brittle if someone renames to "Mixed" only                                          |
| Explicit `program` / capability field later | Stable gating                                                                 | One migration + mapper touch — still not Teams                                      |
| CSV / bulk assign                           | Fixes real admin pain at 66                                                   | Feature work; unrelated to entity model                                             |
| Introduce Teams now                         | Feels "correct" linguistically                                                | Dual assignment paths, migration, RLS redesign, duplicate concepts, no usage payoff |

## Alternatives considered

1. **`teams` + `team_members` + campaign links** — Rejected: duplicates `campaign_members`; team is not access-scoped; multi-membership already works on campaigns.
2. **One mega-campaign with a `squad` column on members** — Rejected: NPS/matrix would need squad filters everywhere; soft 2/2 and coach visibility become error-prone; breaks "campaign is the unit" decision log.
3. **`events` / `programs` parent of campaigns** — Optional later for admin grouping only; not required to ship three squads; still no Teams.
4. **Hard DB cap of 2 assessments** — Out of scope; soft UI already correct; scale does not force a hard cap.
5. **Shared NPS across three campaigns** — Rejected: raters/subjects are squad-local; cross-squad ratings are not in the usage.

## Open questions

1. Can any athlete legitimately sit on two of Mixed / Opens / Womens for the same event? (Supported today; product policy may forbid it in UI.)
2. Prefer naming-convention U24 detection for pilot, or a one-field `program`/`capability_profile` in the same change set?
3. Should admin "U24 Worlds" be three list rows only, or a lightweight UI group (filter by `program` / name prefix) without a new table?
4. Is CSV import in-scope for this rollout or deferred until one-by-one pain is felt in ops?

## Next implementation step

Seed (or admin-create) three U24-capable campaigns with distinct `team` labels that keep `isU24Campaign` true; assign 2 coaches + ~22 players each; smoke matrix soft 2/2 and NPS open/close **per campaign**; fix dashboard primary-campaign assumption to tolerate multiple active U24 campaigns. Defer any `teams` migration unless a usage appears that campaign membership cannot express.

## Synthesis

_(blank — reserved for architect synthesis pass)_
