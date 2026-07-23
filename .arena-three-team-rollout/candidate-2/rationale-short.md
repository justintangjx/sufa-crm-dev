# Candidate 2 — rationale (short)

**Shape chosen:** A — three campaigns; reuse current model; CSV import for ops.

**Synthesis decision:** _(blank)_

---

## Problem

Stand up Mixed / Opens / Womens U24 team-campaigns (22+2 each → 66/6) without breaking per-campaign matrix, NPS, soft 2/2, or RLS.

## Usage

Callers already speak `campaignId`: `listCampaigns`, `assignCampaignMember` / `assignCampaignCoach`, `campaignCapabilities` / `isU24Campaign`, matrix and NPS rows. Dashboards alone assume ≤1 active U24 via `pickPrimaryCampaign`. Scale pain is admin click-count, not missing tables.

## Shape

Three active campaigns with `"u24"` in `name`/`team`; keep existing tables and uniqueness; add usage-derived `importCampaignRoster` + a multi-U24 primary policy (last-opened or list, not a fake single primary). No Event/Team entities; no member team tags.

## Tradeoffs

Fastest path to production behaviour; inherits RLS and feature gating. Loses event-level rollup; relies on naming convention for U24 detection; must fix primary-campaign ambiguity.

## Alternatives

- **B (Event+Team):** Overbuilds for callers that never pass event/team ids; large migration for no new product surface.
- **C (mega-campaign + tags):** Collapses access and NPS/matrix scopes that are campaign-keyed today; turns free-text team into a security boundary.

## Open questions

Pilot `c-u24` rename vs replace; cross-team dual membership allowed?; primary UX preference store; import coaches in v1?; eventual explicit `campaign_kind`.

## Next step

Lock Shape A → fix primary-campaign UX → ship CSV import → ops create three campaigns + Auth coaches → harness GO before flags.
