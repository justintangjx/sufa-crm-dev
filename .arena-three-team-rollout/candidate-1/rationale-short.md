# Rationale short — candidate 1

1. Considered whole shapes: campaign-as-team ×3, events+teams parent, one campaign with team on members, CSV-as-architecture, hard 22/2 caps.
2. Chose (A): no new architecture — Mixed/Opens/Womens are three `campaigns` rows; `campaigns.team` is the squad label.
3. Rejected events+teams: would re-key matrix/NPS/RLS for a rollup admin does not need to ship.
4. Rejected membership-level team: breaks campaign-scoped eval/NPS; huge redesign for label partitioning.
5. Rejected treating CSV import as architectural: it is the ops lever already queued; urgency≠schema.
6. Rejected DB roster/coach caps: contradicts open-roster + soft matrix policy.
7. Grounding scale math (~88 matrix/NPS rows per squad) fits existing per-campaign model.
8. Real gaps are ops volume (66+6 assigns) and `pickPrimaryCampaign` ambiguity with ≥2 active U24s.
9. Product deltas only: naming convention, multi-U24 dashboard CTA, promote CSV import, harness/docs.
10. Type/module map: no new modules; optional import API + small `campaignUi` helper later.
