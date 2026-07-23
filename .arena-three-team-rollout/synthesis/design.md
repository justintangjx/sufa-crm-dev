# Design: 3-team U24 rollout (Mixed / Opens / Womens)

## Problem

Roll out evaluation CRM for three squads (Mixed, Opens, Womens), each with 22 players and 2 coaches (66 / 6 total). Today the product docs and harness still speak as if MVP is one U24 campaign (~12–25 / 1–3). The question is whether that forces a new domain layer (teams, events) or whether three campaigns on the existing model is enough.

Constraints from grounding: assignment is already campaign-scoped; `campaigns.team` is a label; multi-campaign membership and multi-campaign coaching already work; U24 matrix/NPS key off `isU24Campaign`; bulk import is documented as optional but becomes ops-critical at 66.

## Usage (caller's view)

```text
Admin creates three campaigns:
  name: "U24 Worlds 2026 — Mixed"   team: "Mixed"
  name: "U24 Worlds 2026 — Opens"   team: "Open"
  name: "U24 Worlds 2026 — Womens"  team: "Women"

Admin imports or creates 22 athletes per campaign and assigns them.
Admin provisions 6 coach Auth users (role=coach), assigns 2 per campaign.
Each coach opens /coach/campaigns/:id for their team only.
Each player sees only campaigns they belong to.
Admin opens/closes end NPS once per campaign at the end.
```

```ts
// No new API surface required for the happy path:
await api.createCampaign(
  { name: "U24 Worlds 2026 — Mixed", team: "Mixed", status: "active" },
  adminId,
);
await api.assignCampaignMember({ campaignId, athleteId, status: "invited" });
await api.assignCampaignCoach({ campaignId, coachProfileId });
campaignCapabilities(campaign).liveMatrix; // true if isU24Campaign(campaign)
```

Optional later (ops, not architecture rewrite):

```ts
await api.importCampaignRoster({ campaignId, rows: csvRows }); // preview + commit
```

## Shape

**Keep campaigns as the unit of roster, matrix, NPS, and coach assignment. Map each team → one campaign. Do not add a Teams or Events table for this rollout.**

Load-bearing decisions:

1. **Team = campaign row** (`campaigns.team` label). Access and eval history stay on `campaign_members` / `campaign_coaches`. Encodes “a player’s Mixed work is not Opens work” without a new entity (boundary-discipline at existing membership tables).
2. **U24 family gating, not single id.** Ensure all three campaigns match `isU24Campaign` (name/team contains `u24`, or a small allowlist). Avoid inventing `events` just to flip flags.
3. **Primary-campaign UX is soft.** `pickPrimaryCampaign` among three active U24s is arbitrary; dashboards already list/order multiple campaigns. Accept “pick one default” or later add explicit `is_primary` only if product needs it — not required to ship.
4. **CSV/roster import becomes pilot-critical ops**, still behind the existing Api + admin UI. Schema unchanged; subtract-before-add: no import audit table unless we need it.
5. **Auth coach provisioning stays outside CRM** (6× Dashboard invites). Same as today.

Module map: **no new modules** for the domain. Possible touch list if implementing deltas only:

| Area            | Change?                                             |
| --------------- | --------------------------------------------------- |
| Schema / RLS    | No                                                  |
| Api contract    | Only if CSV import ships                            |
| `isU24Campaign` | Maybe tighten naming convention / tests for 3 names |
| Docs / harness  | Yes — 3 campaigns, 22+2 each                        |
| Seed            | Optional demo of 3 U24 campaigns                    |

## Synthesis decision

**Base:** [Arena candidate 2](df3ebbb1-5960-45ae-9773-5f2e33d5efaf) — Shape A with usage-derived `importCampaignRoster` and an explicit multi-U24 `PrimaryCampaignPolicy`.

**Convergence:** [Candidate 1](549b39e1-4989-4c75-a7b7-d586596b19d9), [Candidate 2](df3ebbb1-5960-45ae-9773-5f2e33d5efaf), and [Candidate 3](962b709c-05d3-495b-a50b-53c0d6293c2a) all chose three campaigns / no Teams or Events table. Parent Phase A grounding already matched that; arena confirms it.

**Grafts**

| From        | Kept                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate 2 | `ImportCampaignRoster*` types; coach emails assign-only (no Auth create); naming table `c-u24-mixed` / opens / womens; primary policy kinds (`explicit` \| `list` \| `first-ordered`) |
| Candidate 1 | Prefer `/admin/campaigns` list over fake single primary; optional migrate `c-u24` → Mixed vs archive                                                                                  |
| Candidate 3 | Strong push-back wording against Teams-without-usage; optional later `capability_profile` instead of inventing Teams; scale math ~88 matrix / ~88 NPS per squad                       |

**Rejected from all three**

- Event + Team entities (B)
- Mega-campaign + member team tags (C)
- Hard DB roster caps of 22/2

**Cross-judge:** Not run (API limit earlier). Parent pick agrees with all three candidates on the base shape.

## Tradeoffs accepted

- We accept three parallel NPS/matrix admin surfaces in exchange for zero schema churn and correct per-team isolation.
- We accept manual or CSV roster load in exchange for not blocking rollout on a new domain model.
- We accept ambiguous “primary” U24 among three actives in exchange for not adding event hierarchy yet.

## Alternatives considered

- **Event + Team entities above campaigns** — lost: no product need for cross-team rollups yet; doubles admin mental model; migrations/RLS cost for 3 rows.
- **One mega-campaign with team tags on members** — lost: coaches/NPS/matrix would need team filters everywhere; soft 2/2 and RLS today are campaign-scoped; mixes three coaching staffs.
- **Freeze at one campaign until import ships** — lost: architecture already supports three; delay is ops preference, not a design blocker.

## Open questions and risks

- Should a player ever appear on two of Mixed/Opens/Womens in the same event? Schema allows it; product may forbid it in import validation only.
- Exact campaign naming so all three get matrix/NPS (`U24` in name/team)?
- Is CSV import required before first invite wave, or is SQL seed acceptable for v1 load?
- Do the six coaches map 1:1 to teams, or can one coach sit on two campaigns?

## Next implementation step

Lock Shape A in docs/harness (“3 U24 campaigns × 22+2”), confirm campaign naming for `isU24Campaign`, then either fix multi-U24 `pickPrimaryCampaign` UX or ship `importCampaignRoster` — order by which ops pain hits first.
