-- Hybrid demo coach seed for VITE_DEMO_COACH_LLM.
-- UUIDs match src/lib/demoCoachLlmConfig.ts (DEMO_COACH_LLM_SEED_UUIDS).
--
-- Before running part 2:
-- 1. Create Supabase Auth user coach-demo@sfda.sg (email + password, auto-confirm).
-- 2. Set profiles.role = 'coach' for that user.
--
-- Cloudflare env (after seed):
-- VITE_DEMO_COACH_LLM_ID_MAP={"c-sea":"c0000000-0000-4000-8000-000000000001","a-alice":"a0000000-0000-4000-8000-000000000001","a-ben":"a0000000-0000-4000-8000-000000000002","a-cara":"a0000000-0000-4000-8000-000000000003"}

-- Part 1: campaign + athletes + members (idempotent)
insert into public.campaigns (
  id,
  name,
  team,
  start_date,
  end_date,
  location,
  status
)
values (
  'c0000000-0000-4000-8000-000000000001',
  'SEA Games 2026',
  'Open',
  '2026-06-01',
  '2026-06-10',
  'Bangkok',
  'active'
)
on conflict (id) do nothing;

insert into public.athletes (id, legal_name, preferred_name, profile_status)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    'Alice Wong',
    'Alice',
    'approved'
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    'Ben Ong',
    'Ben',
    'incomplete'
  ),
  (
    'a0000000-0000-4000-8000-000000000003',
    'Cara Lee',
    'Cara',
    'submitted'
  )
on conflict (id) do nothing;

insert into public.campaign_members (campaign_id, athlete_id, status)
values
  (
    'c0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'selected'
  ),
  (
    'c0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000002',
    'invited'
  ),
  (
    'c0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000003',
    'registered'
  )
on conflict (campaign_id, athlete_id) do nothing;

-- Part 2: assign demo coach (backend identity for LLM; UI still uses coach@sufa.test)
insert into public.campaign_coaches (campaign_id, coach_profile_id, coach_role)
select
  'c0000000-0000-4000-8000-000000000001',
  p.id,
  'head_coach'
from public.profiles p
where p.email = 'coach-demo@sfda.sg'
  and p.role = 'coach'
on conflict (campaign_id, coach_profile_id) do nothing;

-- Optional prior evaluation for the read-only side panel
insert into public.coach_evaluations (
  campaign_id,
  athlete_id,
  coach_profile_id,
  strengths,
  development_areas,
  overall_notes,
  recommendation,
  status,
  updated_at
)
select
  'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  p.id,
  'Strong downfield speed and confident hucks.',
  'Reset defense positioning under pressure.',
  'Reliable handler rotation player during camp.',
  'selected',
  'submitted',
  now()
from public.profiles p
where p.email = 'coach-demo@sfda.sg'
  and p.role = 'coach'
  and not exists (
    select 1
    from public.coach_evaluations e
    where e.campaign_id = 'c0000000-0000-4000-8000-000000000001'
      and e.athlete_id = 'a0000000-0000-4000-8000-000000000001'
      and e.coach_profile_id = p.id
  );
