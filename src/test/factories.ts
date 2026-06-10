import type { Athlete, Campaign, CoachEvaluation, Profile } from "../types/database";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

// A fully-complete athlete by default; pass overrides to simulate missing fields.
export function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: nextId("athlete"),
    profile_id: nextId("profile"),
    legal_name: "Jordan Tan",
    preferred_name: "Jordan",
    date_of_birth: "1998-04-12",
    phone: "+65 9123 4567",
    telegram_handle: "@jordan",
    emergency_contact_name: "Pat Tan",
    emergency_contact_phone: "+65 9876 5432",
    passport_expiry: "2030-01-01",
    data_sharing_consent: true,
    media_consent: true,
    profile_status: "approved",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: nextId("profile"),
    email: "player@example.com",
    full_name: "Jordan Tan",
    preferred_name: "Jordan",
    role: "player",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: nextId("campaign"),
    name: "SEA Games 2026",
    team: "Open",
    start_date: "2026-06-01",
    end_date: "2026-06-10",
    location: "Bangkok",
    status: "active",
    created_by: nextId("profile"),
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeEvaluation(overrides: Partial<CoachEvaluation> = {}): CoachEvaluation {
  return {
    id: nextId("eval"),
    campaign_id: nextId("campaign"),
    athlete_id: nextId("athlete"),
    coach_profile_id: nextId("profile"),
    throwing_rating: null,
    cutting_rating: null,
    defense_rating: null,
    fitness_rating: null,
    game_iq_rating: null,
    communication_rating: null,
    coachability_rating: null,
    strengths: null,
    development_areas: null,
    overall_notes: null,
    recommendation: null,
    status: "draft",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
