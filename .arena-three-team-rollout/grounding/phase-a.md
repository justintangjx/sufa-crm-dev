# Phase A grounding — 3-team U24 rollout

## Target

- 3 teams: Mixed, Opens, Womens
- Each: 2 coaches + 22 players
- Totals: 3 campaigns, 6 coaches, 66 players

## Existing model (constraints)

- No `teams` table. `campaigns.team` is free-text. Assignment unit is campaign.
- `campaign_members` unique (campaign_id, athlete_id); athlete can join many campaigns.
- `campaign_coaches` unique (campaign_id, coach_profile_id); coach can join many campaigns.
- Seed already multi-campaign (c-sea + c-u24); coaches on multiple campaigns.
- U24 matrix/NPS gated by `isU24Campaign`: id===c-u24 OR name/team contains "u24".
- `pickPrimaryCampaign` prefers first active U24 — ambiguous if 3 active U24 campaigns.
- Admin create/assign is one-by-one; docs list CSV import as optional next-queue.
- Coach Auth: profiles FK auth.users; CRM cannot create Auth users on Supabase.
- Soft 2/2, NPS, matrix are per-campaign — scale linearly with roster size per campaign.

## Auth explorer note

Same athlete/coach can be on multiple campaigns. RLS scopes via membership/assignment EXISTS. Team label is not an access boundary.

## Scale math (per campaign)

- Matrix coverage: 22 players × 2 coaches × ≤2 soft submits ≈ 88 coach assessment rows target
- NPS open: 22 player assignments + 2 coach assignments; responses 22×2 + 2×22 = 88
- Admin: 66 athlete creates + 66 assigns + 6 Auth coach + 6 assigns without import = painful ops, not schema break
