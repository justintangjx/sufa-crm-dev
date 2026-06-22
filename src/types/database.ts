// Domain types mirroring the Supabase schema (supabase/migrations).
// The database is the source of truth; these types describe its rows.

export type Role = "player" | "admin" | "coach";

export type ProfileStatus = "incomplete" | "submitted" | "approved";

export type CampaignStatus = "draft" | "active" | "completed" | "archived";

export type CampaignMemberStatus = "invited" | "registered" | "selected" | "reserve" | "withdrawn";

export type CoachRole = "head_coach" | "assistant_coach" | "coach";

export type Recommendation =
  | "selected"
  | "reserve"
  | "development"
  | "not_selected"
  | "needs_review";

export type EvaluationStatus = "draft" | "submitted";

export type ChangeRequestStatus = "pending" | "approved" | "rejected";

export type AssistantDraftType = "player_reminder" | "coach_evaluation_structuring";

export type AssistantDraftStatus = "draft" | "approved" | "discarded";

export type CoachNoteGenerationStatus = "succeeded" | "failed";
export type CoachNoteGenerationSource = "llm" | "deterministic";
export type CoachNoteFeedback = "useful" | "incorrect" | "missing_context";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  preferred_name: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface Athlete {
  id: string;
  profile_id: string | null;
  legal_name: string | null;
  preferred_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
  telegram_handle: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  passport_expiry: string | null;
  data_sharing_consent: boolean;
  media_consent: boolean;
  profile_status: ProfileStatus;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  team: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  status: CampaignStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignMember {
  id: string;
  campaign_id: string;
  athlete_id: string;
  status: CampaignMemberStatus;
  created_at: string;
}

export interface CampaignCoach {
  id: string;
  campaign_id: string;
  coach_profile_id: string;
  coach_role: CoachRole;
  created_at: string;
}

export type RatingKey =
  | "throwing_rating"
  | "cutting_rating"
  | "defense_rating"
  | "fitness_rating"
  | "game_iq_rating"
  | "communication_rating"
  | "coachability_rating";

export interface CoachEvaluation {
  id: string;
  campaign_id: string;
  athlete_id: string;
  coach_profile_id: string | null;
  throwing_rating: number | null;
  cutting_rating: number | null;
  defense_rating: number | null;
  fitness_rating: number | null;
  game_iq_rating: number | null;
  communication_rating: number | null;
  coachability_rating: number | null;
  strengths: string | null;
  development_areas: string | null;
  overall_notes: string | null;
  recommendation: Recommendation | null;
  status: EvaluationStatus;
  created_at: string;
  updated_at: string;
}

export interface ChangeRequest {
  id: string;
  athlete_id: string;
  submitted_by: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  status: ChangeRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AssistantDraft {
  id: string;
  created_by: string | null;
  draft_type: AssistantDraftType;
  target_profile_id: string | null;
  campaign_id: string | null;
  content: string;
  status: AssistantDraftStatus;
  created_at: string;
}

// Coach-safe projection of an athlete (see coach_athlete_view): no passport/admin fields.
export interface CoachAthleteView {
  id: string;
  legal_name: string | null;
  preferred_name: string | null;
  phone: string | null;
  profile_status: ProfileStatus;
  created_at: string;
  updated_at: string;
  campaign_id: string;
}

export interface CoachNoteGenerationRun {
  id: string;
  campaign_id: string;
  athlete_id: string;
  coach_profile_id: string;
  schema_version: number;
  prompt_version: string;
  provider: string;
  model: string;
  source: CoachNoteGenerationSource;
  status: CoachNoteGenerationStatus;
  redacted_input: string;
  redacted_output: unknown;
  validation_errors: string[];
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  repair_count: number;
  error_code: string | null;
  feedback: CoachNoteFeedback | null;
  feedback_at: string | null;
  field_edit_count: number | null;
  normalized_edit_distance: number | null;
  ambiguity_count: number | null;
  session_id: string | null;
  turn_index: number | null;
  created_at: string;
}

export type CoachNoteSessionStatus = "active" | "completed";

export interface CoachNoteSession {
  id: string;
  campaign_id: string;
  athlete_id: string;
  coach_profile_id: string;
  accumulated_input: string;
  turn_count: number;
  status: CoachNoteSessionStatus;
  created_at: string;
  updated_at: string;
}

export type CoachNoteTurnAction = "structure" | "clarify" | "add_notes" | "regenerate_section";

export interface CoachNoteTurn {
  id: string;
  session_id: string;
  turn_index: number;
  action: CoachNoteTurnAction;
  payload: Record<string, unknown>;
  draft_snapshot: unknown;
  run_id: string | null;
  created_at: string;
}

export interface PriorCoachEvaluation {
  id: string;
  campaignId: string;
  campaignName: string;
  submittedAt: string;
  strengths: string | null;
  developmentAreas: string | null;
  overallNotes: string | null;
  recommendation: Recommendation | null;
}
