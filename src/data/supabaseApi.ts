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
  invokeCoachNoteAction,
  recordRemoteCoachNoteEditMetrics,
  submitRemoteCoachNoteFeedback,
} from "./coachNoteRemote";
import type {
  AssistantDraft,
  Athlete,
  Campaign,
  CampaignTryoutBriefing,
  CoachAthleteView,
  CoachEvaluation,
  PlayerGrowthReply,
  PlayerGrowthReview,
  PlayerGrowthSignoff,
  PriorCoachEvaluation,
  Profile,
} from "../types/database";
import type {
  Api,
  AthletePatch,
  CampaignReadinessEntry,
  CampaignWithMembership,
  ChangeRequestView,
  EvaluationInput,
  GrowthReviewInput,
  GrowthReviewWithDetails,
  NewAssistantDraft,
  NewCampaign,
  SignInResult,
  TryoutBriefingInput,
} from "./types";
import type { CoachNoteActionRequest, CoachNoteGenerationRequest } from "../lib/coachNotes";
import { executeDeterministicCoachNoteAction } from "./coachNoteExecutor";
import { createSupabaseCoachNotePersistence } from "./coachNoteSupabasePersistence";

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

function displayName(a: Pick<Athlete, "preferred_name" | "legal_name">): string {
  return a.preferred_name || a.legal_name || "Unknown athlete";
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

function briefingPayload(input: TryoutBriefingInput, updatedBy: string) {
  return {
    campaign_id: input.campaignId,
    head_coach: input.headCoach ?? null,
    selectors: input.selectors ?? null,
    welfare_committee: input.welfareCommittee ?? null,
    liaison: input.liaison ?? null,
    training_schedule: input.trainingSchedule ?? null,
    camps_schedule: input.campsSchedule ?? null,
    competitions_schedule: input.competitionsSchedule ?? null,
    time_commitment: input.timeCommitment ?? null,
    published: input.published,
    updated_by: updatedBy,
  };
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
      .upsert(briefingPayload(input, updatedBy), { onConflict: "campaign_id" })
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
