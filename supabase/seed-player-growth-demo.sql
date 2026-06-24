-- Player Growth Matrix demo seed.
--
-- Run this only after:
-- 1. Applying supabase/migrations/20260623000000_player_growth_matrix.sql.
-- 2. Creating these Supabase Auth users, or changing the emails below:
--    - alice@sufa.test        (player who sees the shared matrix)
--    - admin@sufa.test        (admin who publishes campaign briefing)
--    - coach@sufa.test        (first coach sign-off)
--    - coach2@sufa.test       (second coach sign-off)
--
-- This file does not create tables. RLS remains controlled by the migrations.

do $$
declare
  alice_user_id uuid;
  admin_user_id uuid;
  coach_one_id uuid;
  coach_two_id uuid;
  campaign_id uuid;
  alice_athlete_id uuid;
  review_id uuid;
begin
  select id into alice_user_id from auth.users where lower(email) = lower('alice@sufa.test');
  select id into admin_user_id from auth.users where lower(email) = lower('admin@sufa.test');
  select id into coach_one_id from auth.users where lower(email) = lower('coach@sufa.test');
  select id into coach_two_id from auth.users where lower(email) = lower('coach2@sufa.test');

  if alice_user_id is null then
    raise exception 'Missing Auth user alice@sufa.test';
  end if;
  if admin_user_id is null then
    raise exception 'Missing Auth user admin@sufa.test';
  end if;
  if coach_one_id is null then
    raise exception 'Missing Auth user coach@sufa.test';
  end if;
  if coach_two_id is null then
    raise exception 'Missing Auth user coach2@sufa.test';
  end if;

  insert into public.profiles (id, email, full_name, preferred_name, role)
  values
    (admin_user_id, 'admin@sufa.test', 'Admin Staff', 'Admin', 'admin'),
    (coach_one_id, 'coach@sufa.test', 'Coach Lim', 'Coach', 'coach'),
    (coach_two_id, 'coach2@sufa.test', 'Coach Tan', 'Coach', 'coach'),
    (alice_user_id, 'alice@sufa.test', 'Alice Wong', 'Alice', 'player')
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    preferred_name = excluded.preferred_name,
    role = excluded.role;

  select id into campaign_id
  from public.campaigns
  where name = 'SEA Games 2026'
  order by created_at
  limit 1;

  if campaign_id is null then
    insert into public.campaigns (
      name,
      team,
      start_date,
      end_date,
      location,
      status,
      created_by
    )
    values (
      'SEA Games 2026',
      'Open',
      '2026-06-01',
      '2026-06-10',
      'Bangkok',
      'active',
      admin_user_id
    )
    returning id into campaign_id;
  else
    update public.campaigns
    set
      team = 'Open',
      start_date = '2026-06-01',
      end_date = '2026-06-10',
      location = 'Bangkok',
      status = 'active'
    where id = campaign_id;
  end if;

  select id into alice_athlete_id
  from public.athletes
  where profile_id = alice_user_id
  order by created_at
  limit 1;

  if alice_athlete_id is null then
    insert into public.athletes (
      profile_id,
      legal_name,
      preferred_name,
      date_of_birth,
      phone,
      emergency_contact_name,
      emergency_contact_phone,
      passport_expiry,
      data_sharing_consent,
      media_consent,
      profile_status
    )
    values (
      alice_user_id,
      'Alice Wong',
      'Alice',
      '1997-03-02',
      '+65 9000 0001',
      'May Wong',
      '+65 9000 1111',
      '2031-08-01',
      true,
      true,
      'approved'
    )
    returning id into alice_athlete_id;
  else
    update public.athletes
    set
      legal_name = 'Alice Wong',
      preferred_name = 'Alice',
      date_of_birth = '1997-03-02',
      phone = '+65 9000 0001',
      emergency_contact_name = 'May Wong',
      emergency_contact_phone = '+65 9000 1111',
      passport_expiry = '2031-08-01',
      data_sharing_consent = true,
      media_consent = true,
      profile_status = 'approved'
    where id = alice_athlete_id;
  end if;

  insert into public.campaign_members (campaign_id, athlete_id, status)
  values (campaign_id, alice_athlete_id, 'selected')
  on conflict (campaign_id, athlete_id) do update
  set status = excluded.status;

  insert into public.campaign_coaches (campaign_id, coach_profile_id, coach_role)
  values
    (campaign_id, coach_one_id, 'head_coach'),
    (campaign_id, coach_two_id, 'assistant_coach')
  on conflict (campaign_id, coach_profile_id) do update
  set coach_role = excluded.coach_role;

  insert into public.campaign_tryout_briefings (
    campaign_id,
    head_coach,
    selectors,
    welfare_committee,
    liaison,
    training_schedule,
    camps_schedule,
    competitions_schedule,
    time_commitment,
    published,
    updated_by
  )
  values (
    campaign_id,
    'Coach Lim',
    'Coach Lim, Coach Tan, Admin Staff',
    'Welfare Board - Aisha Rahman and Daniel Ng',
    'Team liaison: Mei Koh',
    'Tuesdays and Thursdays, 7:30pm-9:30pm at Kallang.',
    'Selection camp: 14-15 March. Final camp: 18-19 April.',
    'SEA Games warm-up in May; main competition 1-10 June.',
    'Two weekday trainings, one weekend block, plus travel window.',
    true,
    admin_user_id
  )
  on conflict (campaign_id) do update
  set
    head_coach = excluded.head_coach,
    selectors = excluded.selectors,
    welfare_committee = excluded.welfare_committee,
    liaison = excluded.liaison,
    training_schedule = excluded.training_schedule,
    camps_schedule = excluded.camps_schedule,
    competitions_schedule = excluded.competitions_schedule,
    time_commitment = excluded.time_commitment,
    published = excluded.published,
    updated_by = excluded.updated_by;

  insert into public.player_growth_reviews (
    campaign_id,
    athlete_id,
    quarter_label,
    skill_score,
    growth_potential_score,
    quadrant,
    rationale,
    status,
    created_by,
    shared_at
  )
  values (
    campaign_id,
    alice_athlete_id,
    'Q1 2026',
    4,
    5,
    'core_minutes',
    'Alice combines reliable throwing under pressure with strong feedback uptake and resilience across camp scenarios.',
    'shared',
    coach_one_id,
    now()
  )
  on conflict (campaign_id, athlete_id, quarter_label) do update
  set
    skill_score = excluded.skill_score,
    growth_potential_score = excluded.growth_potential_score,
    quadrant = excluded.quadrant,
    rationale = excluded.rationale,
    status = excluded.status,
    created_by = excluded.created_by,
    shared_at = excluded.shared_at
  returning id into review_id;

  insert into public.player_growth_signoffs (review_id, coach_profile_id)
  values
    (review_id, coach_one_id),
    (review_id, coach_two_id)
  on conflict (review_id, coach_profile_id) do nothing;
end $$;
