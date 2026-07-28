-- Admin coach assign + roster writes need table GRANTs in addition to RLS.
-- Root cause: 20260620000000 only granted SELECT on campaign_coaches;
-- 20260624000000 granted campaign_members/campaigns writes but not coaches or athletes writes.
-- RLS still restricts these operations to admins (and own-row athlete rules).

grant insert, update, delete on public.campaign_coaches to authenticated, service_role;
grant insert, update, delete on public.campaign_members to authenticated, service_role;
grant insert, update, delete on public.athletes to authenticated, service_role;
grant delete on public.campaign_nps_assignments to authenticated, service_role;
grant update on public.profiles to authenticated, service_role;
