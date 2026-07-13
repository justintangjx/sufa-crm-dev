// Supabase-backed implementation of the data Api. Requires a configured project
// (migrations applied). Not exercised by the offline test suite; the Api type keeps
// it in sync with the mock implementation.
import { appUrl } from "../lib/env";
import {
  calculateMatrixQuadrant,
  hasTwoCoachSignoff,
  nextGrowthReviewStatus,
} from "../lib/playerGrowth";
import { getMissingAthleteFields } from "../lib/profile";
import { getPassportStatus } from "../lib/passport";
import { supabase } from "../lib/supabase";
import { useRemoteCoachLlm } from "../lib/env";
import {
  aggregateNps,
  auditEventForSave,
  DEFAULT_NPS_MIN_COACH_RATER_COUNT,
  DEFAULT_NPS_MIN_PLAYER_RATER_COUNT,
} from "../lib/campaignManagement";
import {
  invokeCoachNoteAction,
  recordRemoteCoachNoteEditMetrics,
  submitRemoteCoachNoteFeedback,
} from "./coachNoteRemote";
import type {
  AssistantDraft,
  Athlete,
  Campaign,
  CampaignNpsAssignment,
  CampaignNpsResponse,
  CampaignNpsSurvey,
  CampaignTryoutBriefing,
  CoachAthleteView,
  CoachEvaluation,
  CoachMatrixAssessment,
  EvaluationAuditEvent,
  PlayerMatrixSubmission,
  PlayerGrowthReply,
  PlayerGrowthReview,
  PlayerGrowthSignoff,
  PriorCoachEvaluation,
  Profile,
} from "../types/database";
import type {
  AdminAthletePatch,
  Api,
  AthletePatch,
  CampaignMatrixStatusRow,
  CampaignOperatingSummary,
  CampaignReadinessEntry,
  CampaignWithMembership,
  ChangeRequestView,
  CoachMatrixInput,
  CreateAthleteInput,
  EvaluationInput,
  GrowthReviewInput,
  GrowthReviewWithDetails,
  NewAssistantDraft,
  NewCampaign,
  NpsReport,
  NpsResponseInput,
  NpsSurveyInput,
  NpsTask,
  NpsTaskTarget,
  PlayerMatrixInput,
  SignInResult,
  TryoutBriefingInput,
} from "./types";
import type { CoachNoteActionRequest, CoachNoteGenerationRequest } from "../lib/coachNotes";
import { executeDeterministicCoachNoteAction } from "./coachNoteExecutor";
import { createSupabaseCoachNotePersistence } from "./coachNoteSupabasePersistence";
import { athleteFieldsFromCreateInput, normalizeEmail } from "./payloads/athlete";
import { briefingFieldsFromInput } from "./payloads/briefing";
import { displayName, profileDisplayName } from "./payloads/display";
import {
  coachMatrixFieldsFromInput,
  matrixSubmittedAtForUpsert,
  playerMatrixFieldsFromInput,
} from "./payloads/matrix";

function client() {
  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }
  return supabase;
}

async function currentAthlete(profileId: string): Promise<Athlete | null> {
  const { data } = await client()
    .from("athletes")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  return (data as Athlete | null) ?? null;
}

async function growthReviewDetails(
  reviews: PlayerGrowthReview[],
  athleteNames?: Map<string, string>,
): Promise<GrowthReviewWithDetails[]> {
  if (reviews.length === 0) {
    return [];
  }
  const reviewIds = reviews.map((review) => review.id);
  const { data: signoffs } = await client()
    .from("player_growth_signoffs")
    .select("*")
    .in("review_id", reviewIds);
  const { data: replies } = await client()
    .from("player_growth_replies")
    .select("*")
    .in("review_id", reviewIds);

  let names = athleteNames;
  if (!names) {
    const athleteIds = [...new Set(reviews.map((review) => review.athlete_id))];
    const { data: athletes } = await client()
      .from("athletes")
      .select("id, legal_name, preferred_name")
      .in("id", athleteIds);
    names = new Map(
      ((athletes ?? []) as Pick<Athlete, "id" | "legal_name" | "preferred_name">[]).map(
        (athlete) => [athlete.id, displayName(athlete)],
      ),
    );
  }

  const signoffRows = (signoffs ?? []) as PlayerGrowthSignoff[];
  const replyRows = (replies ?? []) as PlayerGrowthReply[];
  return reviews.map((review) => ({
    ...review,
    athleteName: names?.get(review.athlete_id) ?? "Unknown athlete",
    signoffs: signoffRows.filter((signoff) => signoff.review_id === review.id),
    replies: replyRows.filter((reply) => reply.review_id === review.id),
  }));
}

function latestMatrixFirst<T extends { submitted_at: string | null; updated_at: string }>(
  rows: T[],
): T[] {
  return rows.toSorted((left, right) =>
    (right.submitted_at ?? right.updated_at).localeCompare(left.submitted_at ?? left.updated_at),
  );
}

function playerMatrixPayload(input: PlayerMatrixInput) {
  return {
    ...playerMatrixFieldsFromInput(input),
    submitted_at: matrixSubmittedAtForUpsert(input.status),
  };
}

function coachMatrixPayload(input: CoachMatrixInput) {
  return {
    ...coachMatrixFieldsFromInput(input),
    submitted_at: matrixSubmittedAtForUpsert(input.status),
  };
}

async function insertEvaluationAudit(input: {
  campaignId: string;
  athleteId: string;
  actorProfileId: string;
  actorRole: EvaluationAuditEvent["actor_role"];
  eventType: EvaluationAuditEvent["event_type"];
  entityType: EvaluationAuditEvent["entity_type"];
  entityId: string;
}) {
  const { error } = await client().from("evaluation_audit_events").insert({
    campaign_id: input.campaignId,
    athlete_id: input.athleteId,
    actor_profile_id: input.actorProfileId,
    actor_role: input.actorRole,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
  });
  if (error) {
    throw error;
  }
}

async function listCampaignCoachProfiles(campaignId: string) {
  const { data, error } = await client()
    .from("campaign_coaches")
    .select("coach_profile_id, profiles(id, email, full_name, preferred_name)")
    .eq("campaign_id", campaignId);
  if (error) {
    throw error;
  }
  return (data ?? []) as unknown as {
    coach_profile_id: string;
    profiles: Pick<Profile, "email" | "full_name" | "id" | "preferred_name"> | null;
  }[];
}

type NpsAssignmentWithSurvey = CampaignNpsAssignment & {
  campaign_nps_surveys: CampaignNpsSurvey | null;
};

async function listOpenNpsAssignments(
  assignmentQuery: PromiseLike<{ data: unknown; error: unknown }>,
  campaignId?: string,
): Promise<NpsAssignmentWithSurvey[]> {
  const { data: assignments, error } = await assignmentQuery;
  if (error) {
    throw error;
  }
  return ((assignments ?? []) as unknown as NpsAssignmentWithSurvey[]).filter(
    (assignment) =>
      assignment.campaign_nps_surveys?.status === "open" &&
      (!campaignId || assignment.campaign_nps_surveys.campaign_id === campaignId),
  );
}

function openNpsCampaignIds(assignments: NpsAssignmentWithSurvey[]): string[] {
  return [
    ...new Set(assignments.map((assignment) => assignment.campaign_nps_surveys?.campaign_id)),
  ].filter((id): id is string => Boolean(id));
}

async function listOwnNpsResponses(raterProfileId: string): Promise<CampaignNpsResponse[]> {
  const { data: responses } = await client()
    .from("campaign_nps_responses")
    .select("*")
    .eq("rater_profile_id", raterProfileId);
  return (responses ?? []) as CampaignNpsResponse[];
}

export const supabaseApi: Api = {
  async getCurrentProfile(): Promise<Profile | null> {
    const { data: userData } = await client().auth.getUser();
    const user = userData.user;
    if (!user) {
      return null;
    }
    const { data } = await client().from("profiles").select("*").eq("id", user.id).maybeSingle();
    return (data as Profile | null) ?? null;
  },

  async signIn(email: string): Promise<SignInResult> {
    // Closed roster: reject unknown emails before any OTP is sent. The signup
    // trigger (handle_new_user) is the backstop that links the athlete row.
    const { data: allowed, error: gateError } = await client().rpc(
      "can_request_player_magic_link",
      { p_email: email },
    );
    if (gateError) {
      throw gateError;
    }
    if (allowed === false) {
      return { status: "unknown_email" };
    }
    const { error } = await client().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${appUrl}/auth/callback` },
    });
    if (error) {
      throw error;
    }
    return { status: "magic_link_sent" };
  },

  async signOut() {
    await client().auth.signOut();
  },

  async getAthleteForProfile(profileId: string) {
    return currentAthlete(profileId);
  },

  async updateOwnAthlete(profileId: string, patch: AthletePatch) {
    const athlete = await currentAthlete(profileId);
    if (!athlete) {
      throw new Error("Athlete not found for profile");
    }
    const audits = (Object.entries(patch) as [keyof AthletePatch, unknown][])
      .filter(([key, value]) => athlete[key] !== value)
      .map(([key, value]) => ({
        athlete_id: athlete.id,
        submitted_by: profileId,
        field_name: key as string,
        old_value: athlete[key] === null ? null : String(athlete[key]),
        new_value: value === null || value === undefined ? null : String(value),
        status: "pending" as const,
      }));
    if (audits.length > 0) {
      await client().from("change_requests").insert(audits);
    }
    const { data, error } = await client()
      .from("athletes")
      .update(patch)
      .eq("id", athlete.id)
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    return data as Athlete;
  },

  async getCampaignsForProfile(profileId: string): Promise<CampaignWithMembership[]> {
    const athlete = await currentAthlete(profileId);
    if (!athlete) {
      return [];
    }
    const { data } = await client()
      .from("campaign_members")
      .select("status, campaigns(*)")
      .eq("athlete_id", athlete.id);
    const rows = (data ?? []) as unknown as { status: string; campaigns: Campaign }[];
    return rows.map((r) =>
      Object.assign({}, r.campaigns, {
        memberStatus: r.status as CampaignWithMembership["memberStatus"],
      }),
    );
  },

  async listAthletes() {
    const { data } = await client().from("athletes").select("*");
    return (data ?? []) as Athlete[];
  },

  async createAthlete(input: CreateAthleteInput) {
    const fields = athleteFieldsFromCreateInput(input);
    if (!fields.email) {
      throw new Error("Player email is required");
    }
    const { data, error } = await client().from("athletes").insert(fields).select("*").single();
    if (error) {
      throw error;
    }
    return data as Athlete;
  },

  async updateAthleteAsAdmin(athleteId: string, patch: AdminAthletePatch) {
    const { data: existing, error: fetchError } = await client()
      .from("athletes")
      .select("*")
      .eq("id", athleteId)
      .single();
    if (fetchError) {
      throw fetchError;
    }
    const athlete = existing as Athlete;
    if (patch.email !== undefined) {
      const nextEmail = patch.email ? normalizeEmail(patch.email) : null;
      if (nextEmail !== (athlete.email?.toLowerCase() ?? null) && athlete.profile_id) {
        throw new Error("Email cannot be changed after the player has logged in");
      }
      patch = { ...patch, email: nextEmail };
    }
    const { data, error } = await client()
      .from("athletes")
      .update(patch)
      .eq("id", athleteId)
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    return data as Athlete;
  },

  async getAdminStats() {
    const athletes = (await this.listAthletes()) as Athlete[];
    const campaigns = await this.listCampaigns();
    const reviews = await this.listChangeRequests();
    return {
      totalAthletes: athletes.length,
      activeCampaigns: campaigns.filter((c) => c.status === "active").length,
      incompleteProfiles: athletes.filter((a) => getMissingAthleteFields(a).length > 0).length,
      passportExpiringSoon: athletes.filter(
        (a) => getPassportStatus(a.passport_expiry) === "expiring_soon",
      ).length,
      pendingEvaluations: 0,
      pendingReviewItems: reviews.filter((r) => r.status === "pending").length,
    };
  },

  async listCampaigns() {
    const { data } = await client().from("campaigns").select("*");
    return (data ?? []) as Campaign[];
  },

  async getCampaign(id: string) {
    const { data } = await client().from("campaigns").select("*").eq("id", id).maybeSingle();
    return (data as Campaign | null) ?? null;
  },

  async createCampaign(input: NewCampaign, createdBy: string) {
    const { data, error } = await client()
      .from("campaigns")
      .insert({ ...input, created_by: createdBy })
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    return data as Campaign;
  },

  async assignCampaignMember(input) {
    const { error } = await client().from("campaign_members").upsert(
      {
        campaign_id: input.campaignId,
        athlete_id: input.athleteId,
        status: input.status,
      },
      { onConflict: "campaign_id,athlete_id" },
    );
    if (error) {
      throw error;
    }
  },

  async getCampaignReadiness(campaignId: string): Promise<CampaignReadinessEntry[]> {
    const { data } = await client()
      .from("campaign_members")
      .select("status, athletes(*)")
      .eq("campaign_id", campaignId);
    const { data: evals } = await client()
      .from("coach_evaluations")
      .select("athlete_id, status")
      .eq("campaign_id", campaignId);
    const evalRows = (evals ?? []) as { athlete_id: string; status: string }[];
    const rows = (data ?? []) as unknown as { status: string; athletes: Athlete }[];
    return rows.map((r) => {
      const a = r.athletes;
      const ev = evalRows.find((e) => e.athlete_id === a.id);
      return {
        athleteId: a.id,
        name: a.preferred_name || a.legal_name || "Unknown athlete",
        missingFields: getMissingAthleteFields(a),
        passportStatus: getPassportStatus(a.passport_expiry),
        profileStatus: a.profile_status,
        memberStatus: r.status as CampaignReadinessEntry["memberStatus"],
        hasEvaluation: ev !== undefined,
        evaluationStatus: (ev?.status as CampaignReadinessEntry["evaluationStatus"]) ?? null,
      };
    });
  },

  async getCampaignOperatingSummary(campaignId: string): Promise<CampaignOperatingSummary> {
    const [campaign, readinessRows, matrixRows, surveys] = await Promise.all([
      supabaseApi.getCampaign(campaignId),
      supabaseApi.getCampaignReadiness(campaignId),
      supabaseApi.getCampaignMatrixStatus(campaignId),
      supabaseApi.listNpsSurveys(campaignId),
    ]);
    return {
      campaign,
      rosterCount: readinessRows.length,
      profileReadyCount: readinessRows.filter((row) => row.missingFields.length === 0).length,
      playerMatrixSubmittedCount: matrixRows.filter((row) => row.playerStatus === "submitted")
        .length,
      coachMatrixSubmittedCount: matrixRows.reduce(
        (total, row) => total + row.submittedCoachCount,
        0,
      ),
      openNpsSurveyCount: surveys.filter((survey) => survey.status === "open").length,
    };
  },

  async getCampaignMatrixStatus(campaignId: string): Promise<CampaignMatrixStatusRow[]> {
    const { data: members, error: membersError } = await client()
      .from("campaign_members")
      .select("status, athletes(id, legal_name, preferred_name)")
      .eq("campaign_id", campaignId);
    if (membersError) {
      throw membersError;
    }
    const { data: submissions, error: submissionsError } = await client()
      .from("player_matrix_submissions")
      .select("*")
      .eq("campaign_id", campaignId);
    if (submissionsError) {
      throw submissionsError;
    }
    const { data: assessments, error: assessmentsError } = await client()
      .from("coach_matrix_assessments")
      .select("*")
      .eq("campaign_id", campaignId);
    if (assessmentsError) {
      throw assessmentsError;
    }
    const submissionRows = (submissions ?? []) as PlayerMatrixSubmission[];
    const assessmentRows = (assessments ?? []) as CoachMatrixAssessment[];
    return (
      (members ?? []) as unknown as {
        status: CampaignMatrixStatusRow["memberStatus"];
        athletes: Pick<Athlete, "id" | "legal_name" | "preferred_name">;
      }[]
    ).map((member) => {
      const playerRows = latestMatrixFirst(
        submissionRows.filter((submission) => submission.athlete_id === member.athletes.id),
      );
      // Latest activity wins: an open draft, otherwise the newest submitted row.
      const playerSubmission =
        playerRows.find((submission) => submission.status === "draft") ?? playerRows[0] ?? null;
      const coachRows = assessmentRows.filter(
        (assessment) => assessment.athlete_id === member.athletes.id,
      );
      const latestPerCoach = new Map<string, CoachMatrixAssessment>();
      for (const assessment of latestMatrixFirst(coachRows)) {
        const current = latestPerCoach.get(assessment.coach_profile_id);
        if (!current || (assessment.status === "draft" && current.status !== "draft")) {
          latestPerCoach.set(assessment.coach_profile_id, assessment);
        }
      }
      return {
        athleteId: member.athletes.id,
        athleteName: displayName(member.athletes),
        memberStatus: member.status,
        playerSubmission,
        coachAssessments: [...latestPerCoach.values()],
        playerStatus: playerSubmission?.status ?? "not_started",
        playerSubmittedCount: playerRows.filter((row) => row.status === "submitted").length,
        submittedCoachCount: new Set(
          coachRows
            .filter((assessment) => assessment.status === "submitted")
            .map((assessment) => assessment.coach_profile_id),
        ).size,
      };
    });
  },

  async listEvaluationAuditEvents(campaignId: string) {
    const { data, error } = await client()
      .from("evaluation_audit_events")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });
    if (error) {
      throw error;
    }
    return (data ?? []) as EvaluationAuditEvent[];
  },

  async getPlayerMatrixDraft(campaignId: string, athleteId: string) {
    const { data, error } = await client()
      .from("player_matrix_submissions")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("athlete_id", athleteId)
      .eq("status", "draft")
      .maybeSingle();
    if (error) {
      throw error;
    }
    return (data as PlayerMatrixSubmission | null) ?? null;
  },

  async listPlayerMatrixSubmissions(campaignId: string, athleteId: string) {
    const { data, error } = await client()
      .from("player_matrix_submissions")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("athlete_id", athleteId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false });
    if (error) {
      throw error;
    }
    return (data ?? []) as PlayerMatrixSubmission[];
  },

  async savePlayerMatrixSubmission(input: PlayerMatrixInput) {
    // Saves always target the open draft; submitted rows are immutable history.
    const draft = await supabaseApi.getPlayerMatrixDraft(input.campaignId, input.athleteId);
    const eventType = auditEventForSave(draft, input.status);
    const payload = playerMatrixPayload(input);
    const query = draft
      ? client()
          .from("player_matrix_submissions")
          .update(payload)
          .eq("id", draft.id)
          .select("*")
          .single()
      : client().from("player_matrix_submissions").insert(payload).select("*").single();
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    const saved = data as PlayerMatrixSubmission;
    await insertEvaluationAudit({
      campaignId: input.campaignId,
      athleteId: input.athleteId,
      actorProfileId: input.submittedBy,
      actorRole: "player",
      eventType,
      entityType: "player_matrix_submission",
      entityId: saved.id,
    });
    return saved;
  },

  async getCoachMatrixDraft(campaignId: string, athleteId: string, coachProfileId: string) {
    const { data, error } = await client()
      .from("coach_matrix_assessments")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("athlete_id", athleteId)
      .eq("coach_profile_id", coachProfileId)
      .eq("status", "draft")
      .maybeSingle();
    if (error) {
      throw error;
    }
    return (data as CoachMatrixAssessment | null) ?? null;
  },

  async listCoachMatrixAssessments(campaignId: string, athleteId: string) {
    const { data, error } = await client()
      .from("coach_matrix_assessments")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("athlete_id", athleteId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false });
    if (error) {
      throw error;
    }
    return (data ?? []) as CoachMatrixAssessment[];
  },

  async saveCoachMatrixAssessment(input: CoachMatrixInput) {
    const draft = await supabaseApi.getCoachMatrixDraft(
      input.campaignId,
      input.athleteId,
      input.coachProfileId,
    );
    const eventType = auditEventForSave(draft, input.status);
    const payload = coachMatrixPayload(input);
    const query = draft
      ? client()
          .from("coach_matrix_assessments")
          .update(payload)
          .eq("id", draft.id)
          .select("*")
          .single()
      : client().from("coach_matrix_assessments").insert(payload).select("*").single();
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    const saved = data as CoachMatrixAssessment;
    await insertEvaluationAudit({
      campaignId: input.campaignId,
      athleteId: input.athleteId,
      actorProfileId: input.coachProfileId,
      actorRole: "coach",
      eventType,
      entityType: "coach_matrix_assessment",
      entityId: saved.id,
    });
    return saved;
  },

  async listNpsSurveys(campaignId: string) {
    const { data, error } = await client()
      .from("campaign_nps_surveys")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("survey_window", { ascending: true });
    if (error) {
      throw error;
    }
    return (data ?? []) as CampaignNpsSurvey[];
  },

  async saveNpsSurvey(input: NpsSurveyInput) {
    const { data: existing } = await client()
      .from("campaign_nps_surveys")
      .select("*")
      .eq("campaign_id", input.campaignId)
      .eq("survey_window", input.window)
      .maybeSingle();
    const payload = {
      campaign_id: input.campaignId,
      title: input.title,
      survey_window: input.window,
      status: input.status,
      opens_at: input.opensAt ?? null,
      closes_at: input.closesAt ?? null,
      min_player_rater_count: input.minPlayerRaterCount ?? DEFAULT_NPS_MIN_PLAYER_RATER_COUNT,
      min_coach_rater_count: input.minCoachRaterCount ?? DEFAULT_NPS_MIN_COACH_RATER_COUNT,
      created_by: input.createdBy,
    };
    const query = existing
      ? client()
          .from("campaign_nps_surveys")
          .update(payload)
          .eq("id", (existing as CampaignNpsSurvey).id)
          .select("*")
          .single()
      : client().from("campaign_nps_surveys").insert(payload).select("*").single();
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    const survey = data as CampaignNpsSurvey;
    // Every roster player rates each coach; every campaign coach rates each
    // player. Insert only missing assignments (partial unique indexes cannot
    // be targeted by PostgREST upserts).
    const [{ data: members }, coaches, { data: existingAssignments }] = await Promise.all([
      client().from("campaign_members").select("athlete_id").eq("campaign_id", input.campaignId),
      listCampaignCoachProfiles(input.campaignId),
      client()
        .from("campaign_nps_assignments")
        .select("athlete_id, coach_profile_id")
        .eq("survey_id", survey.id),
    ]);
    const assignmentRows = (existingAssignments ?? []) as {
      athlete_id: string | null;
      coach_profile_id: string | null;
    }[];
    const assignedAthletes = new Set(
      assignmentRows.map((row) => row.athlete_id).filter((id): id is string => id !== null),
    );
    const assignedCoaches = new Set(
      assignmentRows.map((row) => row.coach_profile_id).filter((id): id is string => id !== null),
    );
    const newAssignments = [
      ...((members ?? []) as { athlete_id: string }[])
        .filter((member) => !assignedAthletes.has(member.athlete_id))
        .map((member) => ({
          survey_id: survey.id,
          rater_kind: "player",
          athlete_id: member.athlete_id,
        })),
      ...coaches
        .filter((coach) => !assignedCoaches.has(coach.coach_profile_id))
        .map((coach) => ({
          survey_id: survey.id,
          rater_kind: "coach",
          coach_profile_id: coach.coach_profile_id,
        })),
    ];
    if (newAssignments.length > 0) {
      const { error: assignmentError } = await client()
        .from("campaign_nps_assignments")
        .insert(newAssignments);
      if (assignmentError) {
        throw assignmentError;
      }
    }
    return survey;
  },

  async listPlayerNpsTasks(profileId: string, campaignId?: string) {
    const athlete = await currentAthlete(profileId);
    if (!athlete) {
      return [];
    }
    const openAssignments = await listOpenNpsAssignments(
      client()
        .from("campaign_nps_assignments")
        .select("*, campaign_nps_surveys(*)")
        .eq("athlete_id", athlete.id),
      campaignId,
    );
    if (openAssignments.length === 0) {
      return [];
    }
    const campaignIds = openNpsCampaignIds(openAssignments);
    const coachEntries = await Promise.all(
      campaignIds.map(
        async (
          nextCampaignId,
        ): Promise<[string, Awaited<ReturnType<typeof listCampaignCoachProfiles>>]> => [
          nextCampaignId,
          await listCampaignCoachProfiles(nextCampaignId),
        ],
      ),
    );
    const coachesByCampaign = new Map<
      string,
      Awaited<ReturnType<typeof listCampaignCoachProfiles>>
    >(coachEntries);
    const responseRows = await listOwnNpsResponses(profileId);
    return openAssignments.map((assignment): NpsTask => {
      const survey = assignment.campaign_nps_surveys as CampaignNpsSurvey;
      const coaches = coachesByCampaign.get(survey.campaign_id) ?? [];
      return {
        survey,
        assignmentId: assignment.id,
        status: assignment.status,
        targets: coaches.map(
          (coach): NpsTaskTarget => ({
            id: coach.coach_profile_id,
            kind: "coach",
            name: coach.profiles ? profileDisplayName(coach.profiles) : coach.coach_profile_id,
            alreadyResponded: responseRows.some(
              (response) =>
                response.survey_id === survey.id &&
                response.subject_coach_profile_id === coach.coach_profile_id,
            ),
          }),
        ),
      };
    });
  },

  async listCoachNpsTasks(coachProfileId: string, campaignId?: string) {
    const openAssignments = await listOpenNpsAssignments(
      client()
        .from("campaign_nps_assignments")
        .select("*, campaign_nps_surveys(*)")
        .eq("coach_profile_id", coachProfileId),
      campaignId,
    );
    if (openAssignments.length === 0) {
      return [];
    }
    const campaignIds = openNpsCampaignIds(openAssignments);
    const athletesByCampaign = new Map<string, CoachAthleteView[]>(
      await Promise.all(
        campaignIds.map(
          async (nextCampaignId): Promise<[string, CoachAthleteView[]]> => [
            nextCampaignId,
            await supabaseApi.getCoachAthletes(nextCampaignId),
          ],
        ),
      ),
    );
    const responseRows = await listOwnNpsResponses(coachProfileId);
    return openAssignments.map((assignment): NpsTask => {
      const survey = assignment.campaign_nps_surveys as CampaignNpsSurvey;
      const athletes = athletesByCampaign.get(survey.campaign_id) ?? [];
      return {
        survey,
        assignmentId: assignment.id,
        status: assignment.status,
        targets: athletes.map(
          (athlete): NpsTaskTarget => ({
            id: athlete.id,
            kind: "player",
            name: displayName(athlete),
            alreadyResponded: responseRows.some(
              (response) =>
                response.survey_id === survey.id && response.subject_athlete_id === athlete.id,
            ),
          }),
        ),
      };
    });
  },

  async submitNpsResponse(input: NpsResponseInput) {
    if (!input.subjectCoachProfileId === !input.subjectAthleteId) {
      throw new Error("NPS response needs exactly one subject");
    }
    // Partial unique indexes cannot be targeted by PostgREST upserts, so
    // update-or-insert manually. RLS restricts rows to the rater.
    let existingQuery = client()
      .from("campaign_nps_responses")
      .select("id")
      .eq("survey_id", input.surveyId)
      .eq("rater_profile_id", input.raterProfileId);
    existingQuery = input.subjectCoachProfileId
      ? existingQuery.eq("subject_coach_profile_id", input.subjectCoachProfileId)
      : existingQuery.eq("subject_athlete_id", input.subjectAthleteId ?? "");
    const { data: existing } = await existingQuery.maybeSingle();
    const payload = {
      survey_id: input.surveyId,
      assignment_id: input.assignmentId,
      rater_profile_id: input.raterProfileId,
      subject_athlete_id: input.subjectAthleteId ?? null,
      subject_coach_profile_id: input.subjectCoachProfileId ?? null,
      score: input.score,
      comment: input.comment ?? null,
    };
    const { error } = existing
      ? await client()
          .from("campaign_nps_responses")
          .update(payload)
          .eq("id", (existing as { id: string }).id)
      : await client().from("campaign_nps_responses").insert(payload);
    if (error) {
      throw error;
    }
    const [{ data: assignmentRow }, { data: survey }] = await Promise.all([
      client()
        .from("campaign_nps_assignments")
        .select("rater_kind")
        .eq("id", input.assignmentId)
        .single(),
      client().from("campaign_nps_surveys").select("campaign_id").eq("id", input.surveyId).single(),
    ]);
    if (!assignmentRow || !survey) {
      return;
    }
    const surveyCampaignId = (survey as { campaign_id: string }).campaign_id;
    const raterKind = (assignmentRow as { rater_kind: string }).rater_kind;
    let targetCount: number;
    if (raterKind === "player") {
      targetCount = (await listCampaignCoachProfiles(surveyCampaignId)).length;
    } else {
      const { data: memberRows } = await client()
        .from("campaign_members")
        .select("id")
        .eq("campaign_id", surveyCampaignId);
      targetCount = (memberRows ?? []).length;
    }
    const { data: responses } = await client()
      .from("campaign_nps_responses")
      .select("id")
      .eq("survey_id", input.surveyId)
      .eq("rater_profile_id", input.raterProfileId);
    if (targetCount > 0 && (responses ?? []).length >= targetCount) {
      const { error: assignmentError } = await client()
        .from("campaign_nps_assignments")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", input.assignmentId);
      if (assignmentError) {
        throw assignmentError;
      }
    }
  },

  async getNpsReport(campaignId: string): Promise<NpsReport> {
    const [surveys, coaches, { data: members }] = await Promise.all([
      supabaseApi.listNpsSurveys(campaignId),
      listCampaignCoachProfiles(campaignId),
      client()
        .from("campaign_members")
        .select("athletes(id, legal_name, preferred_name)")
        .eq("campaign_id", campaignId),
    ]);
    if (surveys.length === 0) {
      return { coachRows: [], playerRows: [] };
    }
    const { data: responses, error } = await client()
      .from("campaign_nps_responses")
      .select("*")
      .in(
        "survey_id",
        surveys.map((survey) => survey.id),
      );
    if (error) {
      throw error;
    }
    const responseRows = (responses ?? []) as CampaignNpsResponse[];
    const memberAthletes = (
      (members ?? []) as unknown as {
        athletes: Pick<Athlete, "id" | "legal_name" | "preferred_name">;
      }[]
    ).map((member) => member.athletes);
    const coachRows = surveys.flatMap((survey) =>
      coaches.map((coach) => {
        const aggregate = aggregateNps(
          responseRows.filter(
            (response) =>
              response.survey_id === survey.id &&
              response.subject_coach_profile_id === coach.coach_profile_id,
          ),
          survey.min_player_rater_count,
        );
        return Object.assign(
          {
            surveyId: survey.id,
            surveyTitle: survey.title,
            surveyWindow: survey.survey_window,
            coachProfileId: coach.coach_profile_id,
            coachName: coach.profiles ? profileDisplayName(coach.profiles) : coach.coach_profile_id,
          },
          aggregate,
        );
      }),
    );
    const playerRows = surveys.flatMap((survey) =>
      memberAthletes.map((athlete) => {
        const aggregate = aggregateNps(
          responseRows.filter(
            (response) =>
              response.survey_id === survey.id && response.subject_athlete_id === athlete.id,
          ),
          survey.min_coach_rater_count,
        );
        return Object.assign(
          {
            surveyId: survey.id,
            surveyTitle: survey.title,
            surveyWindow: survey.survey_window,
            athleteId: athlete.id,
            athleteName: displayName(athlete),
          },
          aggregate,
        );
      }),
    );
    return { coachRows, playerRows };
  },

  async listChangeRequests(): Promise<ChangeRequestView[]> {
    const { data } = await client()
      .from("change_requests")
      .select("*, athletes(legal_name, preferred_name)");
    const rows = (data ?? []) as (ChangeRequestRow & {
      athletes: { legal_name: string | null; preferred_name: string | null } | null;
    })[];
    return rows.map((r) => ({
      id: r.id,
      athleteId: r.athlete_id,
      athleteName: r.athletes?.preferred_name || r.athletes?.legal_name || "Unknown athlete",
      fieldName: r.field_name,
      oldValue: r.old_value,
      newValue: r.new_value,
      status: r.status,
      createdAt: r.created_at,
    }));
  },

  async reviewChangeRequest(id, decision, reviewerId) {
    const { error } = await client()
      .from("change_requests")
      .update({
        status: decision,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      throw error;
    }
  },

  async listAssistantDrafts(createdBy: string) {
    const { data } = await client()
      .from("assistant_drafts")
      .select("*")
      .eq("created_by", createdBy);
    return (data ?? []) as AssistantDraft[];
  },

  async createAssistantDraft(input: NewAssistantDraft) {
    const { data, error } = await client()
      .from("assistant_drafts")
      .insert({
        created_by: input.createdBy,
        draft_type: input.draftType,
        target_profile_id: input.targetProfileId ?? null,
        campaign_id: input.campaignId ?? null,
        content: input.content,
      })
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    return data as AssistantDraft;
  },

  async getTryoutBriefing(campaignId: string) {
    const { data } = await client()
      .from("campaign_tryout_briefings")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    return (data as CampaignTryoutBriefing | null) ?? null;
  },

  async saveTryoutBriefing(input: TryoutBriefingInput, updatedBy: string) {
    const { data, error } = await client()
      .from("campaign_tryout_briefings")
      .upsert(briefingFieldsFromInput(input, updatedBy), { onConflict: "campaign_id" })
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    return data as CampaignTryoutBriefing;
  },

  async getPlayerCampaignFlow(profileId: string, campaignId: string) {
    const athlete = await currentAthlete(profileId);
    if (!athlete) {
      return null;
    }
    const { data: membership } = await client()
      .from("campaign_members")
      .select("status, campaigns(*)")
      .eq("campaign_id", campaignId)
      .eq("athlete_id", athlete.id)
      .maybeSingle();
    const row = membership as unknown as { status: string; campaigns: Campaign } | null;
    if (!row?.campaigns) {
      return null;
    }
    const briefing = await supabaseApi.getTryoutBriefing(campaignId);
    const { data: reviews } = await client()
      .from("player_growth_reviews")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("athlete_id", athlete.id)
      .in("status", ["shared", "disputed", "closed"])
      .order("updated_at", { ascending: false });

    return {
      campaign: row.campaigns,
      memberStatus: row.status as "invited" | "registered" | "selected" | "reserve" | "withdrawn",
      briefing,
      reviews: await growthReviewDetails(
        reviews as PlayerGrowthReview[],
        new Map([[athlete.id, displayName(athlete)]]),
      ),
    };
  },

  async getCampaignGrowthReviews(campaignId: string) {
    const { data } = await client()
      .from("player_growth_reviews")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("updated_at", { ascending: false });
    return growthReviewDetails((data ?? []) as PlayerGrowthReview[]);
  },

  async getCoachGrowthReviews(campaignId: string, coachProfileId: string) {
    const { data: athletes } = await client()
      .from("coach_athlete_view")
      .select("id, legal_name, preferred_name")
      .eq("campaign_id", campaignId);
    const athleteNames = new Map(
      ((athletes ?? []) as Pick<Athlete, "id" | "legal_name" | "preferred_name">[]).map(
        (athlete) => [athlete.id, displayName(athlete)],
      ),
    );
    const { data } = await client()
      .from("player_growth_reviews")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("updated_at", { ascending: false });
    const reviews = ((data ?? []) as PlayerGrowthReview[]).filter((review) =>
      athleteNames.has(review.athlete_id),
    );
    void coachProfileId;
    return growthReviewDetails(reviews, athleteNames);
  },

  async saveGrowthReviewDraft(input: GrowthReviewInput) {
    const payload = {
      campaign_id: input.campaignId,
      athlete_id: input.athleteId,
      quarter_label: input.quarterLabel.trim(),
      skill_score: input.skillScore,
      growth_potential_score: input.growthPotentialScore,
      quadrant: calculateMatrixQuadrant(input.skillScore, input.growthPotentialScore),
      rationale: input.rationale.trim(),
      created_by: input.coachProfileId,
    };
    const query = input.id
      ? client()
          .from("player_growth_reviews")
          .update(payload)
          .eq("id", input.id)
          .select("*")
          .single()
      : client()
          .from("player_growth_reviews")
          .upsert(payload, { onConflict: "campaign_id,athlete_id,quarter_label" })
          .select("*")
          .single();
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    return (await growthReviewDetails([data as PlayerGrowthReview]))[0] as GrowthReviewWithDetails;
  },

  async signGrowthReview(reviewId: string, coachProfileId: string) {
    const { data: reviewRow, error: reviewError } = await client()
      .from("player_growth_reviews")
      .select("*")
      .eq("id", reviewId)
      .single();
    if (reviewError) {
      throw reviewError;
    }
    const review = reviewRow as PlayerGrowthReview;
    const { error: signoffError } = await client().from("player_growth_signoffs").upsert(
      {
        review_id: reviewId,
        coach_profile_id: coachProfileId,
      },
      { onConflict: "review_id,coach_profile_id" },
    );
    if (signoffError) {
      throw signoffError;
    }
    const { data: signoffs } = await client()
      .from("player_growth_signoffs")
      .select("*")
      .eq("review_id", reviewId);
    const status = nextGrowthReviewStatus(review, (signoffs ?? []) as PlayerGrowthSignoff[]);
    const { data, error } = await client()
      .from("player_growth_reviews")
      .update({ status })
      .eq("id", reviewId)
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    return (await growthReviewDetails([data as PlayerGrowthReview]))[0] as GrowthReviewWithDetails;
  },

  async shareGrowthReview(reviewId: string, adminProfileId: string) {
    const { data: signoffs } = await client()
      .from("player_growth_signoffs")
      .select("*")
      .eq("review_id", reviewId);
    if (!hasTwoCoachSignoff((signoffs ?? []) as PlayerGrowthSignoff[])) {
      throw new Error("Two coach sign-offs are required before sharing");
    }
    const { data, error } = await client()
      .from("player_growth_reviews")
      .update({ status: "shared", shared_at: new Date().toISOString() })
      .eq("id", reviewId)
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    void adminProfileId;
    return (await growthReviewDetails([data as PlayerGrowthReview]))[0] as GrowthReviewWithDetails;
  },

  async submitGrowthReply(reviewId: string, _athleteProfileId: string, body: string) {
    const { data, error } = await client().rpc("submit_player_growth_reply", {
      target_review_id: reviewId,
      reply_body: body,
    });
    if (error) {
      throw error;
    }
    return data as PlayerGrowthReply;
  },

  async getCoachCampaigns(coachProfileId: string) {
    const { data } = await client()
      .from("campaign_coaches")
      .select("campaigns(*)")
      .eq("coach_profile_id", coachProfileId);
    const rows = (data ?? []) as unknown as { campaigns: Campaign }[];
    return rows.map((r) => r.campaigns);
  },

  async getCoachAthletes(campaignId: string): Promise<CoachAthleteView[]> {
    const { data } = await client()
      .from("coach_athlete_view")
      .select("*")
      .eq("campaign_id", campaignId);
    return (data ?? []) as CoachAthleteView[];
  },

  async getEvaluation(campaignId, athleteId, coachProfileId) {
    const { data } = await client()
      .from("coach_evaluations")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("athlete_id", athleteId)
      .eq("coach_profile_id", coachProfileId)
      .maybeSingle();
    return (data as CoachEvaluation | null) ?? null;
  },

  async saveEvaluation(input: EvaluationInput): Promise<CoachEvaluation> {
    const payload = {
      campaign_id: input.campaignId,
      athlete_id: input.athleteId,
      coach_profile_id: input.coachProfileId,
      throwing_rating: input.throwing_rating ?? null,
      cutting_rating: input.cutting_rating ?? null,
      defense_rating: input.defense_rating ?? null,
      fitness_rating: input.fitness_rating ?? null,
      game_iq_rating: input.game_iq_rating ?? null,
      communication_rating: input.communication_rating ?? null,
      coachability_rating: input.coachability_rating ?? null,
      strengths: input.strengths ?? null,
      development_areas: input.development_areas ?? null,
      overall_notes: input.overall_notes ?? null,
      recommendation: input.recommendation ?? null,
      status: input.status,
    };
    const row = input.id ? { id: input.id, ...payload } : payload;
    const { data, error } = await client()
      .from("coach_evaluations")
      .upsert(row)
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    return data as CoachEvaluation;
  },

  async listCoachEvaluations(coachProfileId: string) {
    const { data } = await client()
      .from("coach_evaluations")
      .select("*")
      .eq("coach_profile_id", coachProfileId);
    return (data ?? []) as CoachEvaluation[];
  },

  async listOwnSubmittedEvaluations(coachProfileId, athleteId, limit = 3) {
    const { data: evaluations, error } = await client()
      .from("coach_evaluations")
      .select(
        "id, campaign_id, strengths, development_areas, overall_notes, recommendation, updated_at",
      )
      .eq("coach_profile_id", coachProfileId)
      .eq("athlete_id", athleteId)
      .eq("status", "submitted")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) {
      throw error;
    }
    const rows = evaluations ?? [];
    const campaignIds = [...new Set(rows.map((row) => row.campaign_id))];
    const { data: campaigns } = await client()
      .from("campaigns")
      .select("id, name")
      .in("id", campaignIds.length > 0 ? campaignIds : ["__none__"]);
    const campaignNames = new Map(
      (campaigns ?? []).map((campaign) => [campaign.id, campaign.name]),
    );
    return rows.map(
      (evaluation): PriorCoachEvaluation => ({
        id: evaluation.id,
        campaignId: evaluation.campaign_id,
        campaignName: campaignNames.get(evaluation.campaign_id) ?? evaluation.campaign_id,
        submittedAt: evaluation.updated_at,
        strengths: evaluation.strengths,
        developmentAreas: evaluation.development_areas,
        overallNotes: evaluation.overall_notes,
        recommendation: evaluation.recommendation,
      }),
    );
  },

  async coachNoteAction(input: CoachNoteActionRequest) {
    if (!useRemoteCoachLlm) {
      const profile = await supabaseApi.getCurrentProfile();
      if (!profile || profile.role !== "coach") {
        throw new Error("Coach is not assigned to this athlete");
      }
      return executeDeterministicCoachNoteAction(
        input,
        profile.id,
        createSupabaseCoachNotePersistence(client()),
      );
    }
    return invokeCoachNoteAction(input);
  },

  async generateCoachNoteDraft(input: CoachNoteGenerationRequest) {
    return supabaseApi.coachNoteAction({ ...input, action: "structure" });
  },

  async submitCoachNoteFeedback(input) {
    if (!useRemoteCoachLlm) {
      const { error } = await client()
        .from("coach_note_generation_runs")
        .update({
          feedback: input.feedback,
          feedback_at: new Date().toISOString(),
        })
        .eq("id", input.runId);
      if (error) {
        throw error;
      }
      return;
    }
    return submitRemoteCoachNoteFeedback(input);
  },

  async recordCoachNoteEditMetrics(input) {
    if (!useRemoteCoachLlm) {
      const { error } = await client()
        .from("coach_note_generation_runs")
        .update({
          field_edit_count: input.fieldEditCount,
          normalized_edit_distance: input.normalizedEditDistance,
        })
        .eq("id", input.runId);
      if (error) {
        throw error;
      }
      return;
    }
    return recordRemoteCoachNoteEditMetrics(input);
  },
};

interface ChangeRequestRow {
  id: string;
  athlete_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}
