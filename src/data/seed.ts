// Deterministic seed data for the in-memory mock backend (offline dev + tests).
import type {
  AssistantDraft,
  Athlete,
  Campaign,
  CampaignCoach,
  CampaignMember,
  CampaignTryoutBriefing,
  ChangeRequest,
  CoachEvaluation,
  CoachNoteGenerationRun,
  CoachNoteSession,
  CoachNoteTurn,
  PlayerGrowthReply,
  PlayerGrowthReview,
  PlayerGrowthSignoff,
  Profile,
} from "../types/database";

export interface MockData {
  profiles: Profile[];
  athletes: Athlete[];
  campaigns: Campaign[];
  campaignMembers: CampaignMember[];
  campaignCoaches: CampaignCoach[];
  evaluations: CoachEvaluation[];
  tryoutBriefings: CampaignTryoutBriefing[];
  growthReviews: PlayerGrowthReview[];
  growthSignoffs: PlayerGrowthSignoff[];
  growthReplies: PlayerGrowthReply[];
  changeRequests: ChangeRequest[];
  assistantDrafts: AssistantDraft[];
  coachNoteGenerationRuns: CoachNoteGenerationRun[];
  coachNoteSessions: CoachNoteSession[];
  coachNoteTurns: CoachNoteTurn[];
}

const TS = "2026-01-01T00:00:00.000Z";

export const SEED_EMAILS = {
  admin: "admin@sufa.test",
  coach: "coach@sufa.test",
  coach2: "coach2@sufa.test",
  alice: "alice@sufa.test",
  ben: "ben@sufa.test",
  cara: "cara@sufa.test",
  derrick: "derrick@sufa.test",
} as const;

function profile(id: string, email: string, role: Profile["role"], name: string): Profile {
  return {
    id,
    email,
    full_name: name,
    preferred_name: name.split(" ")[0],
    role,
    created_at: TS,
    updated_at: TS,
  };
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
    profile_status: "incomplete",
    created_at: TS,
    updated_at: TS,
    ...over,
  };
}

// Fresh deep copy each call so tests start from a known state.
export function buildSeed(): MockData {
  const profiles: Profile[] = [
    profile("p-admin", SEED_EMAILS.admin, "admin", "Admin Staff"),
    profile("p-coach", SEED_EMAILS.coach, "coach", "Coach Lim"),
    profile("p-coach-2", SEED_EMAILS.coach2, "coach", "Coach Tan"),
    profile("p-alice", SEED_EMAILS.alice, "player", "Alice Wong"),
    profile("p-ben", SEED_EMAILS.ben, "player", "Ben Ong"),
    profile("p-cara", SEED_EMAILS.cara, "player", "Cara Lee"),
    profile("p-derrick", SEED_EMAILS.derrick, "player", "Derrick Tan"),
  ];

  const athletes: Athlete[] = [
    athlete({
      id: "a-alice",
      profile_id: "p-alice",
      legal_name: "Alice Wong",
      preferred_name: "Alice",
      date_of_birth: "1997-03-02",
      phone: "+65 9000 0001",
      emergency_contact_name: "May Wong",
      emergency_contact_phone: "+65 9000 1111",
      passport_expiry: "2031-08-01",
      data_sharing_consent: true,
      media_consent: true,
      profile_status: "approved",
    }),
    athlete({
      id: "a-ben",
      profile_id: "p-ben",
      legal_name: "Ben Ong",
      preferred_name: "Ben",
      phone: "+65 9000 0002",
      profile_status: "incomplete",
    }),
    athlete({
      id: "a-cara",
      profile_id: "p-cara",
      legal_name: "Cara Lee",
      preferred_name: "Cara",
      date_of_birth: "1999-11-20",
      phone: "+65 9000 0003",
      emergency_contact_name: "Tom Lee",
      emergency_contact_phone: "+65 9000 3333",
      passport_expiry: "2026-09-01",
      data_sharing_consent: true,
      profile_status: "submitted",
    }),
    athlete({
      id: "a-derrick",
      profile_id: "p-derrick",
      profile_status: "incomplete",
    }),
  ];

  const campaigns: Campaign[] = [
    {
      id: "c-sea",
      name: "SEA Games 2026",
      team: "Open",
      start_date: "2026-06-01",
      end_date: "2026-06-10",
      location: "Bangkok",
      status: "active",
      created_by: "p-admin",
      created_at: TS,
      updated_at: TS,
    },
    {
      id: "c-u24",
      name: "U24 Nationals 2025",
      team: "Mixed",
      start_date: "2025-03-01",
      end_date: "2025-03-05",
      location: "Singapore",
      status: "completed",
      created_by: "p-admin",
      created_at: TS,
      updated_at: TS,
    },
  ];

  const campaignMembers: CampaignMember[] = [
    { id: "m-1", campaign_id: "c-sea", athlete_id: "a-alice", status: "selected", created_at: TS },
    { id: "m-2", campaign_id: "c-sea", athlete_id: "a-ben", status: "invited", created_at: TS },
    { id: "m-3", campaign_id: "c-sea", athlete_id: "a-cara", status: "registered", created_at: TS },
  ];

  const campaignCoaches: CampaignCoach[] = [
    {
      id: "cc-1",
      campaign_id: "c-sea",
      coach_profile_id: "p-coach",
      coach_role: "head_coach",
      created_at: TS,
    },
    {
      id: "cc-2",
      campaign_id: "c-sea",
      coach_profile_id: "p-coach-2",
      coach_role: "assistant_coach",
      created_at: TS,
    },
  ];

  const evaluations: CoachEvaluation[] = [
    {
      id: "eval-alice-u24",
      campaign_id: "c-u24",
      athlete_id: "a-alice",
      coach_profile_id: "p-coach",
      throwing_rating: 4,
      cutting_rating: 4,
      defense_rating: 3,
      fitness_rating: 4,
      game_iq_rating: 4,
      communication_rating: 4,
      coachability_rating: 5,
      strengths: "Strong downfield speed and confident hucks.",
      development_areas: "Reset defense positioning under pressure.",
      overall_notes: "Reliable handler rotation player during U24 camp.",
      recommendation: "selected",
      status: "submitted",
      created_at: "2025-03-06T00:00:00.000Z",
      updated_at: "2025-03-06T00:00:00.000Z",
    },
  ];

  const changeRequests: ChangeRequest[] = [
    {
      id: "cr-1",
      athlete_id: "a-cara",
      submitted_by: "p-cara",
      field_name: "phone",
      old_value: "+65 9000 0003",
      new_value: "+65 9000 9999",
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      created_at: TS,
    },
  ];

  const tryoutBriefings: CampaignTryoutBriefing[] = [
    {
      id: "tb-sea",
      campaign_id: "c-sea",
      head_coach: "Coach Lim",
      selectors: "Coach Lim, Coach Tan, Admin Staff",
      welfare_committee: "Welfare Board - Aisha Rahman and Daniel Ng",
      liaison: "Team liaison: Mei Koh",
      training_schedule: "Tuesdays and Thursdays, 7:30pm-9:30pm at Kallang.",
      camps_schedule: "Selection camp: 14-15 March. Final camp: 18-19 April.",
      competitions_schedule: "SEA Games warm-up in May; main competition 1-10 June.",
      time_commitment: "Two weekday trainings, one weekend block, plus travel window.",
      published: true,
      updated_by: "p-admin",
      created_at: TS,
      updated_at: TS,
    },
  ];

  const growthReviews: PlayerGrowthReview[] = [
    {
      id: "gr-alice-q1",
      campaign_id: "c-sea",
      athlete_id: "a-alice",
      quarter_label: "Q1 2026",
      skill_score: 4,
      growth_potential_score: 5,
      quadrant: "core_minutes",
      rationale:
        "Alice combines reliable throwing under pressure with strong feedback uptake and resilience across camp scenarios.",
      status: "shared",
      created_by: "p-coach",
      shared_at: "2026-01-15T00:00:00.000Z",
      created_at: TS,
      updated_at: "2026-01-15T00:00:00.000Z",
    },
    {
      id: "gr-ben-q1",
      campaign_id: "c-sea",
      athlete_id: "a-ben",
      quarter_label: "Q1 2026",
      skill_score: 2,
      growth_potential_score: 4,
      quadrant: "development_priority",
      rationale:
        "Ben is still building tactical execution but responds well to correction and has improved between sessions.",
      status: "awaiting_second_signoff",
      created_by: "p-coach",
      shared_at: null,
      created_at: TS,
      updated_at: TS,
    },
  ];

  const growthSignoffs: PlayerGrowthSignoff[] = [
    {
      id: "gs-alice-1",
      review_id: "gr-alice-q1",
      coach_profile_id: "p-coach",
      signed_at: "2026-01-14T00:00:00.000Z",
    },
    {
      id: "gs-alice-2",
      review_id: "gr-alice-q1",
      coach_profile_id: "p-coach-2",
      signed_at: "2026-01-14T12:00:00.000Z",
    },
    {
      id: "gs-ben-1",
      review_id: "gr-ben-q1",
      coach_profile_id: "p-coach",
      signed_at: "2026-01-14T00:00:00.000Z",
    },
  ];

  const growthReplies: PlayerGrowthReply[] = [];

  return {
    profiles,
    athletes,
    campaigns,
    campaignMembers,
    campaignCoaches,
    evaluations,
    tryoutBriefings,
    growthReviews,
    growthSignoffs,
    growthReplies,
    changeRequests,
    assistantDrafts: [],
    coachNoteGenerationRuns: [],
    coachNoteSessions: [],
    coachNoteTurns: [],
  };
}
