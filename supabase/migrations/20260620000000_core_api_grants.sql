-- PostgREST needs table-level GRANTs in addition to RLS policies. Without these,
-- authenticated/service_role clients return SQLSTATE 42501 even when policies match.

grant usage on schema public to authenticated, service_role;

grant select on public.profiles to authenticated, service_role;
grant select on public.campaign_coaches to authenticated, service_role;
grant select on public.campaign_members to authenticated, service_role;
grant select on public.campaigns to authenticated, service_role;
grant select on public.athletes to service_role;

grant execute on function public.current_profile_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
