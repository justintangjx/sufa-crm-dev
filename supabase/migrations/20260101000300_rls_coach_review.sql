-- RLS: campaign_coaches, coach_evaluations, change_requests, assistant_drafts.

alter table public.campaign_coaches enable row level security;
alter table public.coach_evaluations enable row level security;
alter table public.change_requests enable row level security;
alter table public.assistant_drafts enable row level security;

-- campaign_coaches ----------------------------------------------------------
create policy campaign_coaches_select on public.campaign_coaches
  for select to authenticated
  using (public.is_admin() or coach_profile_id = auth.uid());

create policy campaign_coaches_insert on public.campaign_coaches
  for insert to authenticated
  with check (public.is_admin());

create policy campaign_coaches_update on public.campaign_coaches
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy campaign_coaches_delete on public.campaign_coaches
  for delete to authenticated
  using (public.is_admin());

-- coach_evaluations ---------------------------------------------------------
-- Coaches manage their own evaluations for campaigns they are assigned to.
-- Players do NOT see coach evaluations by default (no athlete-facing policy).
create policy coach_evaluations_select on public.coach_evaluations
  for select to authenticated
  using (public.is_admin() or coach_profile_id = auth.uid());

create policy coach_evaluations_insert on public.coach_evaluations
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      coach_profile_id = auth.uid()
      and exists (
        select 1 from public.campaign_coaches cc
        where cc.campaign_id = coach_evaluations.campaign_id
          and cc.coach_profile_id = auth.uid()
      )
    )
  );

create policy coach_evaluations_update on public.coach_evaluations
  for update to authenticated
  using (public.is_admin() or coach_profile_id = auth.uid())
  with check (public.is_admin() or coach_profile_id = auth.uid());

create policy coach_evaluations_delete on public.coach_evaluations
  for delete to authenticated
  using (public.is_admin());

-- change_requests -----------------------------------------------------------
-- Players create/read requests for their own athlete row; admins review them.
create policy change_requests_select on public.change_requests
  for select to authenticated
  using (
    public.is_admin()
    or submitted_by = auth.uid()
    or exists (
      select 1 from public.athletes a
      where a.id = change_requests.athlete_id and a.profile_id = auth.uid()
    )
  );

create policy change_requests_insert on public.change_requests
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      submitted_by = auth.uid()
      and exists (
        select 1 from public.athletes a
        where a.id = change_requests.athlete_id and a.profile_id = auth.uid()
      )
    )
  );

create policy change_requests_update on public.change_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- assistant_drafts ----------------------------------------------------------
-- Drafts are private to their creator (admins can also see all). Never auto-sent.
create policy assistant_drafts_select on public.assistant_drafts
  for select to authenticated
  using (public.is_admin() or created_by = auth.uid());

create policy assistant_drafts_insert on public.assistant_drafts
  for insert to authenticated
  with check (created_by = auth.uid());

create policy assistant_drafts_update on public.assistant_drafts
  for update to authenticated
  using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());

create policy assistant_drafts_delete on public.assistant_drafts
  for delete to authenticated
  using (public.is_admin() or created_by = auth.uid());
