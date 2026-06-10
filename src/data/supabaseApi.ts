// Supabase-backed implementation of the data Api. Requires a configured project
// (migrations applied). Not exercised by the offline test suite; the Api type keeps
// it in sync with the mock implementation.
import { appUrl } from "../lib/env";
import { getMissingAthleteFields } from "../lib/profile";
import { getPassportStatus } from "../lib/passport";
import { supabase } from "../lib/supabase";
import type {
  AssistantDraft,
  Athlete,
  Campaign,
  CoachAthleteView,
  CoachEvaluation,
  Profile,
} from "../types/database";
import type {
  Api,
  AthletePatch,
  CampaignReadinessEntry,
  CampaignWithMembership,
  ChangeRequestView,
  EvaluationInput,
  NewAssistantDraft,
  NewCampaign,
  SignInResult,
} from "./types";

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
    return rows.map((r) => ({
      ...r.campaigns,
      memberStatus: r.status as CampaignWithMembership["memberStatus"],
    }));
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
