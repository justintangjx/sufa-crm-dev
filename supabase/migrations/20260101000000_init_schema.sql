-- SUFA CRM: core schema
-- The database is the single source of truth. One athlete profile per player;
-- campaigns attach requirements to existing athlete profiles.

create extension if not exists "pgcrypto";

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles: a logged-in user and their app role
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  full_name text,
  preferred_name text,
  role text not null default 'player' check (role in ('player', 'admin', 'coach')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- athletes: the player/athlete profile (kept separate from auth identity)
-- Note: date_of_birth, emergency contact, and passport_expiry are added beyond the
-- minimal spec list because the profile-completion checklist requires them.
create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  legal_name text,
  preferred_name text,
  date_of_birth date,
  phone text,
  telegram_handle text,
  emergency_contact_name text,
  emergency_contact_phone text,
  passport_expiry date,
  data_sharing_consent boolean not null default false,
  media_consent boolean not null default false,
  profile_status text not null default 'incomplete'
    check (profile_status in ('incomplete', 'submitted', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index athletes_profile_id_idx on public.athletes (profile_id);

-- campaigns
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team text,
  start_date date,
  end_date date,
  location text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'archived')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- campaign_members: athletes linked to campaigns
create table public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited', 'registered', 'selected', 'reserve', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (campaign_id, athlete_id)
);
create index campaign_members_campaign_idx on public.campaign_members (campaign_id);
create index campaign_members_athlete_idx on public.campaign_members (athlete_id);

-- campaign_coaches: coaches linked to campaigns
create table public.campaign_coaches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  coach_profile_id uuid not null references public.profiles (id) on delete cascade,
  coach_role text not null default 'coach'
    check (coach_role in ('head_coach', 'assistant_coach', 'coach')),
  created_at timestamptz not null default now(),
  unique (campaign_id, coach_profile_id)
);
create index campaign_coaches_campaign_idx on public.campaign_coaches (campaign_id);
create index campaign_coaches_coach_idx on public.campaign_coaches (coach_profile_id);

-- coach_evaluations
create table public.coach_evaluations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  coach_profile_id uuid references public.profiles (id),
  throwing_rating int check (throwing_rating between 1 and 5),
  cutting_rating int check (cutting_rating between 1 and 5),
  defense_rating int check (defense_rating between 1 and 5),
  fitness_rating int check (fitness_rating between 1 and 5),
  game_iq_rating int check (game_iq_rating between 1 and 5),
  communication_rating int check (communication_rating between 1 and 5),
  coachability_rating int check (coachability_rating between 1 and 5),
  strengths text,
  development_areas text,
  overall_notes text,
  recommendation text
    check (recommendation in ('selected', 'reserve', 'development', 'not_selected', 'needs_review')),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coach_evaluations_campaign_idx on public.coach_evaluations (campaign_id);
create index coach_evaluations_athlete_idx on public.coach_evaluations (athlete_id);

-- change_requests: player-submitted updates for audit/review
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  submitted_by uuid references public.profiles (id),
  field_name text not null,
  old_value text,
  new_value text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index change_requests_athlete_idx on public.change_requests (athlete_id);

-- assistant_drafts: AI-generated reminder/evaluation drafts pending human review
create table public.assistant_drafts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id),
  draft_type text check (draft_type in ('player_reminder', 'coach_evaluation_structuring')),
  target_profile_id uuid references public.profiles (id),
  campaign_id uuid references public.campaigns (id),
  content text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'discarded')),
  created_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger athletes_set_updated_at before update on public.athletes
  for each row execute function public.set_updated_at();
create trigger campaigns_set_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger coach_evaluations_set_updated_at before update on public.coach_evaluations
  for each row execute function public.set_updated_at();
