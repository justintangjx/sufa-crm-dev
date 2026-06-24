-- Admin campaign management UI needs PostgREST table grants in addition to RLS.
-- RLS policies still restrict these writes to admins.

grant select on public.athletes to authenticated, service_role;
grant insert, update on public.campaigns to authenticated, service_role;
grant insert, update on public.campaign_members to authenticated, service_role;
