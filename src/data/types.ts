import type { CampaignReadinessRow } from '../lib/assistant'
import type { PassportStatus } from '../lib/passport'
import type {
  AssistantDraft,
  AssistantDraftType,
  Athlete,
  Campaign,
  CampaignMemberStatus,
  CampaignStatus,
  CoachAthleteView,
  CoachEvaluation,
  EvaluationStatus,
  Profile,
  Recommendation,
} from '../types/database'

export type SignInResult =
  | { status: 'magic_link_sent' }
  | { status: 'signed_in'; profile: Profile }
  | { status: 'unknown_email' }

// Editable subset of an athlete row (admin-sensitive identity fields excluded).
export type AthletePatch = Partial<
  Pick<
    Athlete,
    | 'legal_name'
    | 'preferred_name'
    | 'date_of_birth'
    | 'phone'
    | 'telegram_handle'
    | 'emergency_contact_name'
    | 'emergency_contact_phone'
    | 'passport_expiry'
    | 'data_sharing_consent'
    | 'media_consent'
    | 'profile_status'
  >
>

export interface CampaignWithMembership extends Campaign {
  memberStatus: CampaignMemberStatus
}

export interface NewCampaign {
  name: string
  team?: string
  start_date?: string
  end_date?: string
  location?: string
  status?: CampaignStatus
}

export interface AdminStats {
  totalAthletes: number
  activeCampaigns: number
  incompleteProfiles: number
  passportExpiringSoon: number
  pendingEvaluations: number
  pendingReviewItems: number
}

export interface CampaignReadinessEntry extends CampaignReadinessRow {
  memberStatus: CampaignMemberStatus
  passportStatus: PassportStatus
  hasEvaluation: boolean
  evaluationStatus: EvaluationStatus | null
}

export interface ChangeRequestView {
  id: string
  athleteId: string
  athleteName: string
  fieldName: string
  oldValue: string | null
  newValue: string | null
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export interface NewAssistantDraft {
  createdBy: string
  draftType: AssistantDraftType
  targetProfileId?: string
  campaignId?: string
  content: string
}

export interface EvaluationInput {
  id?: string
  campaignId: string
  athleteId: string
  coachProfileId: string
  throwing_rating?: number | null
  cutting_rating?: number | null
  defense_rating?: number | null
  fitness_rating?: number | null
  game_iq_rating?: number | null
  communication_rating?: number | null
  coachability_rating?: number | null
  strengths?: string | null
  development_areas?: string | null
  overall_notes?: string | null
  recommendation?: Recommendation | null
  status: EvaluationStatus
}

export interface Api {
  getCurrentProfile(): Promise<Profile | null>
  signIn(email: string): Promise<SignInResult>
  signOut(): Promise<void>

  getAthleteForProfile(profileId: string): Promise<Athlete | null>
  updateOwnAthlete(profileId: string, patch: AthletePatch): Promise<Athlete>
  getCampaignsForProfile(profileId: string): Promise<CampaignWithMembership[]>

  listAthletes(): Promise<Athlete[]>
  getAdminStats(): Promise<AdminStats>
  listCampaigns(): Promise<Campaign[]>
  getCampaign(id: string): Promise<Campaign | null>
  createCampaign(input: NewCampaign, createdBy: string): Promise<Campaign>
  getCampaignReadiness(campaignId: string): Promise<CampaignReadinessEntry[]>
  listChangeRequests(): Promise<ChangeRequestView[]>
  reviewChangeRequest(
    id: string,
    decision: 'approved' | 'rejected',
    reviewerId: string,
  ): Promise<void>
  listAssistantDrafts(createdBy: string): Promise<AssistantDraft[]>
  createAssistantDraft(input: NewAssistantDraft): Promise<AssistantDraft>

  getCoachCampaigns(coachProfileId: string): Promise<Campaign[]>
  getCoachAthletes(campaignId: string): Promise<CoachAthleteView[]>
  getEvaluation(
    campaignId: string,
    athleteId: string,
    coachProfileId: string,
  ): Promise<CoachEvaluation | null>
  saveEvaluation(input: EvaluationInput): Promise<CoachEvaluation>
  listCoachEvaluations(coachProfileId: string): Promise<CoachEvaluation[]>
}
