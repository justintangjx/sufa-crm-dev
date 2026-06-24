-- Player Growth Matrix: quarterly placement, two-coach sign-off, player reply.

create table public.campaign_tryout_briefings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade unique,
  head_coach text,
  selectors text,
  welfare_committee text,
  liaison text,
  training_schedule text,
  camps_schedule text,
  competitions_schedule text,
  time_commitment text,
  published boolean not null default false,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_growth_reviews (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  quarter_label text not null,
  skill_score int not null check (skill_score between 1 and 5),
  growth_potential_score int not null check (growth_potential_score between 1 and 5),
  quadrant text not null check (
    quadrant in (
      'core_minutes',
      'reliable_contributor',
      'development_priority',
      'foundation_builder'
    )
  ),
  rationale text not null,
  status text not null default 'draft' check (
    status in ('draft', 'awaiting_second_signoff', 'shared', 'disputed', 'closed')
  ),
  created_by uuid references public.profiles (id),
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, athlete_id, quarter_label)
);
create index player_growth_reviews_campaign_idx on public.player_growth_reviews (campaign_id);
create index player_growth_reviews_athlete_idx on public.player_growth_reviews (athlete_id);

create table public.player_growth_signoffs (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.player_growth_reviews (id) on delete cascade,
  coach_profile_id uuid not null references public.profiles (id) on delete cascade,
  signed_at timestamptz not null default now(),
  unique (review_id, coach_profile_id)
);
create index player_growth_signoffs_review_idx on public.player_growth_signoffs (review_id);

create table public.player_growth_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.player_growth_reviews (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  submitted_by uuid references public.profiles (id),
  body text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index player_growth_replies_review_idx on public.player_growth_replies (review_id);

create trigger campaign_tryout_briefings_set_updated_at before update
  on public.campaign_tryout_briefings
  for each row execute function public.set_updated_at();

create trigger player_growth_reviews_set_updated_at before update
  on public.player_growth_reviews
  for each row execute function public.set_updated_at();

create trigger player_growth_replies_set_updated_at before update
  on public.player_growth_replies
  for each row execute function public.set_updated_at();

alter table public.campaign_tryout_briefings enable row level security;
alter table public.player_growth_reviews enable row level security;
alter table public.player_growth_signoffs enable row level security;
alter table public.player_growth_replies enable row level security;

grant select, insert, update on public.campaign_tryout_briefings to authenticated, service_role;
grant select, insert, update on public.player_growth_reviews to authenticated, service_role;
grant select, insert on public.player_growth_signoffs to authenticated, service_role;
grant select, insert, update on public.player_growth_replies to authenticated, service_role;

create policy campaign_tryout_briefings_select on public.campaign_tryout_briefings
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.campaign_coaches cc
      where cc.campaign_id = campaign_tryout_briefings.campaign_id
        and cc.coach_profile_id = auth.uid()
    )
    or (
      published
      and exists (
        select 1
        from public.campaign_members cm
        join public.athletes a on a.id = cm.athlete_id
        where cm.campaign_id = campaign_tryout_briefings.campaign_id
          and a.profile_id = auth.uid()
      )
    )
  );

create policy campaign_tryout_briefings_insert on public.campaign_tryout_briefings
  for insert to authenticated
  with check (public.is_admin());

create policy campaign_tryout_briefings_update on public.campaign_tryout_briefings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy player_growth_reviews_select on public.player_growth_reviews
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.campaign_coaches cc
      where cc.campaign_id = player_growth_reviews.campaign_id
        and cc.coach_profile_id = auth.uid()
    )
    or (
      status in ('shared', 'disputed', 'closed')
      and exists (
        select 1
        from public.athletes a
        where a.id = player_growth_reviews.athlete_id
          and a.profile_id = auth.uid()
      )
    )
  );

create policy player_growth_reviews_insert on public.player_growth_reviews
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      created_by = auth.uid()
      and exists (
        select 1
        from public.campaign_coaches cc
        where cc.campaign_id = player_growth_reviews.campaign_id
          and cc.coach_profile_id = auth.uid()
      )
    )
  );

create policy player_growth_reviews_update on public.player_growth_reviews
  for update to authenticated
  using (
    public.is_admin()
    or (
      status in ('draft', 'awaiting_second_signoff')
      and exists (
        select 1
        from public.campaign_coaches cc
        where cc.campaign_id = player_growth_reviews.campaign_id
          and cc.coach_profile_id = auth.uid()
      )
    )
  )
  with check (
    public.is_admin()
    or (
      status in ('draft', 'awaiting_second_signoff')
      and exists (
        select 1
        from public.campaign_coaches cc
        where cc.campaign_id = player_growth_reviews.campaign_id
          and cc.coach_profile_id = auth.uid()
      )
    )
  );

create policy player_growth_signoffs_select on public.player_growth_signoffs
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.player_growth_reviews r
      join public.campaign_coaches cc on cc.campaign_id = r.campaign_id
      where r.id = player_growth_signoffs.review_id
        and cc.coach_profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.player_growth_reviews r
      join public.athletes a on a.id = r.athlete_id
      where r.id = player_growth_signoffs.review_id
        and r.status in ('shared', 'disputed', 'closed')
        and a.profile_id = auth.uid()
    )
  );

create policy player_growth_signoffs_insert on public.player_growth_signoffs
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      coach_profile_id = auth.uid()
      and exists (
        select 1
        from public.player_growth_reviews r
        join public.campaign_coaches cc on cc.campaign_id = r.campaign_id
        where r.id = player_growth_signoffs.review_id
          and cc.coach_profile_id = auth.uid()
      )
    )
  );

create policy player_growth_replies_select on public.player_growth_replies
  for select to authenticated
  using (
    public.is_admin()
    or submitted_by = auth.uid()
    or exists (
      select 1
      from public.player_growth_reviews r
      join public.campaign_coaches cc on cc.campaign_id = r.campaign_id
      where r.id = player_growth_replies.review_id
        and cc.coach_profile_id = auth.uid()
    )
  );

create policy player_growth_replies_insert on public.player_growth_replies
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1
      from public.player_growth_reviews r
      join public.athletes a on a.id = r.athlete_id
      where r.id = player_growth_replies.review_id
        and r.status in ('shared', 'disputed')
        and a.id = player_growth_replies.athlete_id
        and a.profile_id = auth.uid()
    )
  );

create policy player_growth_replies_update on public.player_growth_replies
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.submit_player_growth_reply(
  target_review_id uuid,
  reply_body text
)
returns public.player_growth_replies
language plpgsql
security definer
set search_path = public
as $$
declare
  target_review public.player_growth_reviews%rowtype;
  target_athlete public.athletes%rowtype;
  inserted_reply public.player_growth_replies%rowtype;
begin
  select * into target_review
  from public.player_growth_reviews
  where id = target_review_id;

  if target_review.id is null then
    raise exception 'Growth review not found';
  end if;

  if target_review.status not in ('shared', 'disputed') then
    raise exception 'Only shared growth reviews can receive replies';
  end if;

  select * into target_athlete
  from public.athletes
  where id = target_review.athlete_id;

  if target_athlete.profile_id is distinct from auth.uid() then
    raise exception 'Player cannot reply to this growth review';
  end if;

  insert into public.player_growth_replies (
    review_id,
    athlete_id,
    submitted_by,
    body,
    status
  )
  values (
    target_review_id,
    target_review.athlete_id,
    auth.uid(),
    btrim(reply_body),
    'open'
  )
  returning * into inserted_reply;

  update public.player_growth_reviews
  set status = 'disputed', updated_at = now()
  where id = target_review_id;

  return inserted_reply;
end;
$$;

grant execute on function public.submit_player_growth_reply(uuid, text) to authenticated, service_role;
