import type { CampaignReadinessRow } from "../lib/assistant";
import type { PassportStatus } from "../lib/passport";
import type {
  AssistantDraft,
  AssistantDraftType,
  Athlete,
  Campaign,
  CampaignNpsSurvey,
  CampaignTryoutBriefing,
  CampaignMemberStatus,
  CampaignStatus,
  CoachAthleteView,
  CoachEvaluation,
  CoachMatrixAssessment,
  EvaluationAuditEvent,
  EvaluationStatus,
  Gender,
  MatrixSubmissionStatus,
  NpsRaterKind,
  NpsSurveyStatus,
  NpsSurveyWindow,
  PlayerMatrixSubmission,
  PlayerGrowthReply,
  PlayerGrowthReview,
  PlayerGrowthSignoff,
  Profile,
  Recommendation,
} from "../types/database";
import type {
  CoachNoteActionRequest,
  CoachNoteEditMetricsInput,
  CoachNoteFeedbackInput,
  CoachNoteGenerationRequest,
  CoachNoteGenerationResult,
} from "../lib/coachNotes";
import type { PriorCoachEvaluation } from "../types/database";
import type { RosterImportCommitResult, RosterImportSourceRow } from "../lib/rosterImport";
import type {
  QuestionnaireImportPlan,
  QuestionnaireImportSourceRow,
} from "../lib/questionnaireImport";
import type { SurveyAnswerInput } from "../lib/campaignSurvey";
import type { SurveySectionAggregate } from "../lib/campaignSurvey";

export type {
  RosterImportCommitResult,
  RosterImportPlan,
  RosterImportSourceRow,
} from "../lib/rosterImport";

export type SignInResult =
  | { status: "magic_link_sent" }
  | { status: "signed_in"; profile: Profile }
  | { status: "unknown_email" };

// Editable subset of an athlete row (admin-sensitive identity fields excluded).
export type AthletePatch = Partial<
  Pick<
    Athlete,
    | "legal_name"
    | "preferred_name"
    | "date_of_birth"
    | "phone"
    | "telegram_handle"
    | "emergency_contact_name"
    | "emergency_contact_phone"
    | "passport_expiry"
    | "data_sharing_consent"
    | "media_consent"
    | "profile_status"
  >
>;

// Admin-created roster player. Email is the login key: the player signs in
// with a magic link to this address and gets linked on first login.
export interface CreateAthleteInput {
  legalName: string;
  preferredName?: string | null;
  email: string;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  positions?: string[];
}

// Admin-editable roster fields. Email changes are blocked once a login is linked.
export type AdminAthletePatch = Partial<
  Pick<
    Athlete,
    "legal_name" | "preferred_name" | "email" | "gender" | "date_of_birth" | "positions"
  >
>;

export interface CampaignWithMembership extends Campaign {
  memberStatus: CampaignMemberStatus;
}

export interface CampaignMemberAssignment {
  campaignId: string;
  athleteId: string;
  status: CampaignMemberStatus;
}

export interface CampaignMemberUnassignment {
  campaignId: string;
  athleteId: string;
}

export interface CampaignCoachAssignment {
  campaignId: string;
  coachProfileId: string;
}

export interface CreateCoachProfileInput {
  email: string;
  fullName: string;
}

export interface CampaignCoachView {
  id: string;
  campaignId: string;
  coachProfileId: string;
  coachRole: "coach" | "head_coach" | "assistant_coach";
  email: string;
  name: string;
}

export interface CampaignRosterImportInput {
  campaignId: string;
  rows: RosterImportSourceRow[];
}

export interface NewCampaign {
  name: string;
  team?: string;
  start_date?: string;
  end_date?: string;
  location?: string;
  status?: CampaignStatus;
}

export interface AdminStats {
  totalAthletes: number;
  activeCampaigns: number;
  incompleteProfiles: number;
  passportExpiringSoon: number;
  pendingEvaluations: number;
  pendingReviewItems: number;
}

export interface CampaignReadinessEntry extends CampaignReadinessRow {
  memberStatus: CampaignMemberStatus;
  passportStatus: PassportStatus;
  hasEvaluation: boolean;
  evaluationStatus: EvaluationStatus | null;
}

export interface ChangeRequestView {
  id: string;
  athleteId: string;
  athleteName: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface NewAssistantDraft {
  createdBy: string;
  draftType: AssistantDraftType;
  targetProfileId?: string;
  campaignId?: string;
  content: string;
}

export interface GrowthReviewWithDetails extends PlayerGrowthReview {
  athleteName: string;
  signoffs: PlayerGrowthSignoff[];
  replies: PlayerGrowthReply[];
}

export interface PlayerCampaignFlow {
  campaign: Campaign;
  memberStatus: CampaignMemberStatus;
  briefing: CampaignTryoutBriefing | null;
  reviews: GrowthReviewWithDetails[];
}

export interface TryoutBriefingInput {
  campaignId: string;
  headCoach?: string | null;
  selectors?: string | null;
  welfareCommittee?: string | null;
  liaison?: string | null;
  trainingSchedule?: string | null;
  campsSchedule?: string | null;
  competitionsSchedule?: string | null;
  timeCommitment?: string | null;
  published: boolean;
}

export interface GrowthReviewInput {
  id?: string;
  campaignId: string;
  athleteId: string;
  coachProfileId: string;
  quarterLabel: string;
  skillScore: number;
  growthPotentialScore: number;
  rationale: string;
}

export interface EvaluationInput {
  id?: string;
  campaignId: string;
  athleteId: string;
  coachProfileId: string;
  throwing_rating?: number | null;
  cutting_rating?: number | null;
  defense_rating?: number | null;
  fitness_rating?: number | null;
  game_iq_rating?: number | null;
  communication_rating?: number | null;
  coachability_rating?: number | null;
  strengths?: string | null;
  development_areas?: string | null;
  overall_notes?: string | null;
  recommendation?: Recommendation | null;
  status: EvaluationStatus;
}

export interface PlayerMatrixInput {
  id?: string;
  campaignId: string;
  athleteId: string;
  submittedBy: string;
  skillScore?: number | null;
  growthScore?: number | null;
  readinessScore?: number | null;
  confidenceScore?: number | null;
  strengths?: string | null;
  developmentFocus?: string | null;
  supportNeeded?: string | null;
  status: MatrixSubmissionStatus;
}

export interface CoachMatrixInput {
  id?: string;
  campaignId: string;
  athleteId: string;
  coachProfileId: string;
  skillScore?: number | null;
  growthScore?: number | null;
  readinessScore?: number | null;
  tacticalScore?: number | null;
  strengths?: string | null;
  developmentFocus?: string | null;
  coachNotes?: string | null;
  status: MatrixSubmissionStatus;
}

// Status derives from the latest activity per tuple: the open draft if one
// exists, otherwise the most recent submitted row.
export interface CampaignMatrixStatusRow {
  athleteId: string;
  athleteName: string;
  memberStatus: CampaignMemberStatus;
  playerSubmission: PlayerMatrixSubmission | null;
  coachAssessments: CoachMatrixAssessment[];
  playerStatus: MatrixSubmissionStatus | "not_started";
  playerSubmittedCount: number;
  /** Distinct coaches with ≥1 submitted assessment for this player (coverage, not soft 2/2). */
  distinctSubmittedCoachCount: number;
}

export interface CampaignOperatingSummary {
  campaign: Campaign | null;
  rosterCount: number;
  profileReadyCount: number;
  playerMatrixSubmittedCount: number;
  coachMatrixSubmittedCount: number;
  openNpsSurveyCount: number;
}

export interface NpsSurveyInput {
  campaignId: string;
  title: string;
  window: NpsSurveyWindow;
  status: NpsSurveyStatus;
  opensAt?: string | null;
  closesAt?: string | null;
  minPlayerRaterCount?: number;
  minCoachRaterCount?: number;
  createdBy: string;
}

// A rating target for an open survey: coaches for player raters, players for
// coach raters. For coach targets `id` is a profile id; for player targets it
// is an athlete id.
export interface NpsTaskTarget {
  id: string;
  kind: NpsRaterKind;
  name: string;
  alreadyResponded: boolean;
}

export interface NpsTask {
  survey: CampaignNpsSurvey;
  assignmentId: string;
  status: "pending" | "completed";
  targets: NpsTaskTarget[];
}

export interface NpsResponseInput {
  surveyId: string;
  assignmentId: string;
  raterProfileId: string;
  subjectCoachProfileId?: string | null;
  subjectAthleteId?: string | null;
  score: number;
  comment?: string | null;
}

interface NpsReportAggregate {
  surveyId: string;
  surveyTitle: string;
  surveyWindow: NpsSurveyWindow;
  responseCount: number;
  averageScore: number | null;
  nps: number | null;
  promoterCount: number;
  passiveCount: number;
  detractorCount: number;
  withheld: boolean;
}

export interface NpsCoachReportRow extends NpsReportAggregate {
  coachProfileId: string;
  coachName: string;
}

export interface NpsPlayerReportRow extends NpsReportAggregate {
  athleteId: string;
  athleteName: string;
}

export interface NpsReport {
  coachRows: NpsCoachReportRow[];
  playerRows: NpsPlayerReportRow[];
}

export interface CampaignQuestionnaireImportInput {
  campaignId: string;
  rows: QuestionnaireImportSourceRow[];
  createdBy: string;
}

export interface QuestionnaireImportCommitResult {
  plan: QuestionnaireImportPlan;
  playerTemplateId: string;
  coachTemplateId: string;
}

export interface SurveyTemplateBundle {
  template: import("../types/database").CampaignSurveyTemplate;
  sections: import("../types/database").CampaignSurveySection[];
  questions: import("../types/database").CampaignSurveyQuestion[];
}

export interface SurveyCompletionRow {
  profileId: string;
  name: string;
  email: string;
  audience: import("../types/database").SurveyAudience;
  status: import("../types/database").SurveyAssignmentStatus;
  answeredCount: number;
  questionCount: number;
  submittedAt: string | null;
}

export interface SurveyAssignmentBundle {
  assignment: import("../types/database").CampaignSurveyAssignment;
  instance: import("../types/database").CampaignSurveyInstance;
  template: SurveyTemplateBundle;
  answers: import("../types/database").CampaignSurveyAnswer[];
}

export interface Api {
  getCurrentProfile(): Promise<Profile | null>;
  signIn(email: string): Promise<SignInResult>;
  signOut(): Promise<void>;

  getAthleteForProfile(profileId: string): Promise<Athlete | null>;
  updateOwnAthlete(profileId: string, patch: AthletePatch): Promise<Athlete>;
  getCampaignsForProfile(profileId: string): Promise<CampaignWithMembership[]>;

  listAthletes(): Promise<Athlete[]>;
  createAthlete(input: CreateAthleteInput): Promise<Athlete>;
  updateAthleteAsAdmin(athleteId: string, patch: AdminAthletePatch): Promise<Athlete>;
  commitCampaignRosterImport(input: CampaignRosterImportInput): Promise<RosterImportCommitResult>;
  getAdminStats(): Promise<AdminStats>;
  listCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  createCampaign(input: NewCampaign, createdBy: string): Promise<Campaign>;
  assignCampaignMember(input: CampaignMemberAssignment): Promise<void>;
  unassignCampaignMember(input: CampaignMemberUnassignment): Promise<void>;
  listCoachProfiles(): Promise<Profile[]>;
  listCampaignCoaches(campaignId: string): Promise<CampaignCoachView[]>;
  assignCampaignCoach(input: CampaignCoachAssignment): Promise<void>;
  unassignCampaignCoach(input: CampaignCoachAssignment): Promise<void>;
  createCoachProfile(input: CreateCoachProfileInput): Promise<Profile>;
  getCampaignReadiness(campaignId: string): Promise<CampaignReadinessEntry[]>;
  getCampaignOperatingSummary(campaignId: string): Promise<CampaignOperatingSummary>;
  getCampaignMatrixStatus(campaignId: string): Promise<CampaignMatrixStatusRow[]>;
  listEvaluationAuditEvents(campaignId: string): Promise<EvaluationAuditEvent[]>;
  // Matrix evaluations are an append-only history: at most one open draft per
  // tuple, unlimited immutable submitted rows. Saves target the open draft
  // (creating one when absent); submitting freezes the row.
  getPlayerMatrixDraft(
    campaignId: string,
    athleteId: string,
  ): Promise<PlayerMatrixSubmission | null>;
  listPlayerMatrixSubmissions(
    campaignId: string,
    athleteId: string,
  ): Promise<PlayerMatrixSubmission[]>;
  savePlayerMatrixSubmission(input: PlayerMatrixInput): Promise<PlayerMatrixSubmission>;
  getCoachMatrixDraft(
    campaignId: string,
    athleteId: string,
    coachProfileId: string,
  ): Promise<CoachMatrixAssessment | null>;
  listCoachMatrixAssessments(
    campaignId: string,
    athleteId: string,
  ): Promise<CoachMatrixAssessment[]>;
  saveCoachMatrixAssessment(input: CoachMatrixInput): Promise<CoachMatrixAssessment>;
  listNpsSurveys(campaignId: string): Promise<CampaignNpsSurvey[]>;
  saveNpsSurvey(input: NpsSurveyInput): Promise<CampaignNpsSurvey>;
  listPlayerNpsTasks(profileId: string, campaignId?: string): Promise<NpsTask[]>;
  listCoachNpsTasks(coachProfileId: string, campaignId?: string): Promise<NpsTask[]>;
  submitNpsResponse(input: NpsResponseInput): Promise<void>;
  getNpsReport(campaignId: string): Promise<NpsReport>;
  commitQuestionnaireImport(
    input: CampaignQuestionnaireImportInput,
  ): Promise<QuestionnaireImportCommitResult>;
  listSurveyTemplates(
    campaignId: string,
  ): Promise<import("../types/database").CampaignSurveyTemplate[]>;
  getSurveyTemplateBundle(templateId: string): Promise<SurveyTemplateBundle | null>;
  publishSurveyTemplate(templateId: string, publishedBy: string): Promise<SurveyTemplateBundle>;
  listSurveyInstances(
    campaignId: string,
  ): Promise<import("../types/database").CampaignSurveyInstance[]>;
  openSurveyInstance(input: {
    campaignId: string;
    audience: import("../types/database").SurveyAudience;
    createdBy: string;
  }): Promise<import("../types/database").CampaignSurveyInstance>;
  closeSurveyInstance(
    instanceId: string,
  ): Promise<import("../types/database").CampaignSurveyInstance>;
  listSurveyCompletion(campaignId: string): Promise<SurveyCompletionRow[]>;
  getSurveySectionAggregates(
    campaignId: string,
    audience: import("../types/database").SurveyAudience,
  ): Promise<SurveySectionAggregate[]>;
  getMySurveyAssignment(
    profileId: string,
    campaignId: string,
  ): Promise<SurveyAssignmentBundle | null>;
  saveSurveyAnswers(input: {
    assignmentId: string;
    answers: SurveyAnswerInput[];
    submit: boolean;
  }): Promise<SurveyAssignmentBundle>;
  listChangeRequests(): Promise<ChangeRequestView[]>;
  reviewChangeRequest(
    id: string,
    decision: "approved" | "rejected",
    reviewerId: string,
  ): Promise<void>;
  listAssistantDrafts(createdBy: string): Promise<AssistantDraft[]>;
  createAssistantDraft(input: NewAssistantDraft): Promise<AssistantDraft>;

  getTryoutBriefing(campaignId: string): Promise<CampaignTryoutBriefing | null>;
  saveTryoutBriefing(
    input: TryoutBriefingInput,
    updatedBy: string,
  ): Promise<CampaignTryoutBriefing>;
  getPlayerCampaignFlow(profileId: string, campaignId: string): Promise<PlayerCampaignFlow | null>;
  getCampaignGrowthReviews(campaignId: string): Promise<GrowthReviewWithDetails[]>;
  getCoachGrowthReviews(
    campaignId: string,
    coachProfileId: string,
  ): Promise<GrowthReviewWithDetails[]>;
  saveGrowthReviewDraft(input: GrowthReviewInput): Promise<GrowthReviewWithDetails>;
  signGrowthReview(reviewId: string, coachProfileId: string): Promise<GrowthReviewWithDetails>;
  shareGrowthReview(reviewId: string, adminProfileId: string): Promise<GrowthReviewWithDetails>;
  submitGrowthReply(
    reviewId: string,
    athleteProfileId: string,
    body: string,
  ): Promise<PlayerGrowthReply>;

  getCoachCampaigns(coachProfileId: string): Promise<Campaign[]>;
  getCoachAthletes(campaignId: string): Promise<CoachAthleteView[]>;
  getEvaluation(
    campaignId: string,
    athleteId: string,
    coachProfileId: string,
  ): Promise<CoachEvaluation | null>;
  saveEvaluation(input: EvaluationInput): Promise<CoachEvaluation>;
  listCoachEvaluations(coachProfileId: string): Promise<CoachEvaluation[]>;
  listOwnSubmittedEvaluations(
    coachProfileId: string,
    athleteId: string,
    limit?: number,
  ): Promise<PriorCoachEvaluation[]>;
  coachNoteAction(input: CoachNoteActionRequest): Promise<CoachNoteGenerationResult>;
  generateCoachNoteDraft(input: CoachNoteGenerationRequest): Promise<CoachNoteGenerationResult>;
  submitCoachNoteFeedback(input: CoachNoteFeedbackInput): Promise<void>;
  recordCoachNoteEditMetrics(input: CoachNoteEditMetricsInput): Promise<void>;
}
