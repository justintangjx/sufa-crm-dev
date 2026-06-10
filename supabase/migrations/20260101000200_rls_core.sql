-- RLS: profiles, athletes, campaigns, campaign_members.
-- Default-deny: enabling RLS with no matching policy denies access.

alter table public.profiles enable row level security;
alter table public.athletes enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid() or public.is_admin());

-- athletes ------------------------------------------------------------------
-- Players see/edit only their own row; admins see all. Coaches do NOT get a
-- direct policy here (they read non-sensitive fields via coach_athlete_view).
create policy athletes_select on public.athletes
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

create policy athletes_insert on public.athletes
  for insert to authenticated
  with check (profile_id = auth.uid() or public.is_admin());

create policy athletes_update on public.athletes
  for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

create policy athletes_delete on public.athletes
  for delete to authenticated
  using (public.is_admin());

-- campaigns -----------------------------------------------------------------
create policy campaigns_select on public.campaigns
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.campaign_members cm
      join public.athletes a on a.id = cm.athlete_id
      where cm.campaign_id = campaigns.id and a.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.campaign_coaches cc
      where cc.campaign_id = campaigns.id and cc.coach_profile_id = auth.uid()
    )
  );

create policy campaigns_insert on public.campaigns
  for insert to authenticated
  with check (public.is_admin());

create policy campaigns_update on public.campaigns
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy campaigns_delete on public.campaigns
  for delete to authenticated
  using (public.is_admin());

-- campaign_members ----------------------------------------------------------
create policy campaign_members_select on public.campaign_members
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.athletes a
      where a.id = campaign_members.athlete_id and a.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.campaign_coaches cc
      where cc.campaign_id = campaign_members.campaign_id
        and cc.coach_profile_id = auth.uid()
    )
  );

create policy campaign_members_insert on public.campaign_members
  for insert to authenticated
  with check (public.is_admin());

create policy campaign_members_update on public.campaign_members
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy campaign_members_delete on public.campaign_members
  for delete to authenticated
  using (public.is_admin());
