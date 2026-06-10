// Deterministic seed data for the in-memory mock backend (offline dev + tests).
import type {
  AssistantDraft,
  Athlete,
  Campaign,
  CampaignCoach,
  CampaignMember,
  ChangeRequest,
  CoachEvaluation,
  Profile,
} from '../types/database'

export interface MockData {
  profiles: Profile[]
  athletes: Athlete[]
  campaigns: Campaign[]
  campaignMembers: CampaignMember[]
  campaignCoaches: CampaignCoach[]
  evaluations: CoachEvaluation[]
  changeRequests: ChangeRequest[]
  assistantDrafts: AssistantDraft[]
}

const TS = '2026-01-01T00:00:00.000Z'

export const SEED_EMAILS = {
  admin: 'admin@sufa.test',
  coach: 'coach@sufa.test',
  alice: 'alice@sufa.test',
  ben: 'ben@sufa.test',
  cara: 'cara@sufa.test',
} as const

function profile(id: string, email: string, role: Profile['role'], name: string): Profile {
  return {
    id,
    email,
    full_name: name,
    preferred_name: name.split(' ')[0],
    role,
    created_at: TS,
    updated_at: TS,
  }
}

function athlete(over: Partial<Athlete> & { id: string; profile_id: string }): Athlete {
  return {
    legal_name: null,
    preferred_name: null,
    date_of_birth: null,
    phone: null,
    telegram_handle: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    passport_expiry: null,
    data_sharing_consent: false,
    media_consent: false,
    profile_status: 'incomplete',
    created_at: TS,
    updated_at: TS,
    ...over,
  }
}

// Fresh deep copy each call so tests start from a known state.
export function buildSeed(): MockData {
  const profiles: Profile[] = [
    profile('p-admin', SEED_EMAILS.admin, 'admin', 'Admin Staff'),
    profile('p-coach', SEED_EMAILS.coach, 'coach', 'Coach Lim'),
    profile('p-alice', SEED_EMAILS.alice, 'player', 'Alice Wong'),
    profile('p-ben', SEED_EMAILS.ben, 'player', 'Ben Ong'),
    profile('p-cara', SEED_EMAILS.cara, 'player', 'Cara Lee'),
  ]

  const athletes: Athlete[] = [
    athlete({
      id: 'a-alice',
      profile_id: 'p-alice',
      legal_name: 'Alice Wong',
      preferred_name: 'Alice',
      date_of_birth: '1997-03-02',
      phone: '+65 9000 0001',
      emergency_contact_name: 'May Wong',
      emergency_contact_phone: '+65 9000 1111',
      passport_expiry: '2031-08-01',
      data_sharing_consent: true,
      media_consent: true,
      profile_status: 'approved',
    }),
    athlete({
      id: 'a-ben',
      profile_id: 'p-ben',
      legal_name: 'Ben Ong',
      preferred_name: 'Ben',
      phone: '+65 9000 0002',
      profile_status: 'incomplete',
    }),
    athlete({
      id: 'a-cara',
      profile_id: 'p-cara',
      legal_name: 'Cara Lee',
      preferred_name: 'Cara',
      date_of_birth: '1999-11-20',
      phone: '+65 9000 0003',
      emergency_contact_name: 'Tom Lee',
      emergency_contact_phone: '+65 9000 3333',
      passport_expiry: '2026-09-01',
      data_sharing_consent: true,
      profile_status: 'submitted',
    }),
  ]

  const campaigns: Campaign[] = [
    {
      id: 'c-sea',
      name: 'SEA Games 2026',
      team: 'Open',
      start_date: '2026-06-01',
      end_date: '2026-06-10',
      location: 'Bangkok',
      status: 'active',
      created_by: 'p-admin',
      created_at: TS,
      updated_at: TS,
    },
  ]

  const campaignMembers: CampaignMember[] = [
    { id: 'm-1', campaign_id: 'c-sea', athlete_id: 'a-alice', status: 'selected', created_at: TS },
    { id: 'm-2', campaign_id: 'c-sea', athlete_id: 'a-ben', status: 'invited', created_at: TS },
    { id: 'm-3', campaign_id: 'c-sea', athlete_id: 'a-cara', status: 'registered', created_at: TS },
  ]

  const campaignCoaches: CampaignCoach[] = [
    { id: 'cc-1', campaign_id: 'c-sea', coach_profile_id: 'p-coach', coach_role: 'head_coach', created_at: TS },
  ]

  const evaluations: CoachEvaluation[] = []

  const changeRequests: ChangeRequest[] = [
    {
      id: 'cr-1',
      athlete_id: 'a-cara',
      submitted_by: 'p-cara',
      field_name: 'phone',
      old_value: '+65 9000 0003',
      new_value: '+65 9000 9999',
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      created_at: TS,
    },
  ]

  return {
    profiles,
    athletes,
    campaigns,
    campaignMembers,
    campaignCoaches,
    evaluations,
    changeRequests,
    assistantDrafts: [],
  }
}
