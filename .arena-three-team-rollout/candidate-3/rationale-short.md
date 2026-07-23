# Candidate 3 — Rationale (short)

## Problem

Three squads (Mixed / Opens / Womens) × ~22 players + 2 coaches. Risk: inventing a `teams` table because the word "team" appears in product language, while the assignment unit is already `campaign`.

## Usage

Admin/coach/player work is per campaign: roster, soft matrix 2/2, bidirectional NPS, RLS. Multi-campaign membership already works; `campaigns.team` is label-only, not an access boundary. No usage needs team-as-entity (cross-campaign squad identity, team RLS, shared team NPS).

## Shape

**Keep campaign as the unit.** Ship three campaigns. Do not add `teams`.

Smallest correct change set:

1. Three campaign rows + per-campaign members/coaches (structure exists).
2. Keep U24 capabilities on (name/team includes `"u24"`, or later a small `program`/`capability_profile` field — not Teams).
3. Fix multi-active U24 navigation (`pickPrimaryCampaign` must not imply a unique primary).
4. Ops: CSV/bulk assign when 66 one-by-one hurts (queued product work, not schema).
5. Soft 2/2 + NPS stay per-campaign; fan-out ~88 matrix / ~88 NPS responses per squad — fine ×3.

**Push-back:** A Teams table without a usage campaign membership cannot express is premature architecture.

## Tradeoffs

Three campaigns = zero migration risk, correct NPS/matrix boundaries. Cost = three admin rows and brittle string U24 detection until/unless a capability field is added. Teams-now = dual graphs, RLS churn, no scale win.

## Alternatives considered

- Teams + team_members — duplicate of campaign_members; rejected.
- One campaign + squad column — pollutes matrix/NPS/coach scope; rejected.
- Event/program parent — optional UI grouping later; not required.
- Cross-campaign shared NPS — wrong rater/subject set; rejected.

## Open questions

Dual-squad athletes allowed? Naming vs explicit capability field? Admin grouping without a table? CSV in this rollout?

## Next implementation step

Create three U24-capable campaigns; assign rosters; smoke matrix + NPS per campaign; make dashboards tolerate multiple active U24 campaigns. No `teams` migration.

## Synthesis

_(blank)_
