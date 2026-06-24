// In-memory implementation of the data Api. Used offline (dev + tests).
import { getMissingAthleteFields } from "../lib/profile";
import {
  calculateMatrixQuadrant,
  hasTwoCoachSignoff,
  nextGrowthReviewStatus,
} from "../lib/playerGrowth";
import { getPassportStatus } from "../lib/passport";
import { clearDemoCoachSession } from "../lib/demoCoachLlm";
import { demoCoachLlm, useRemoteCoachLlm } from "../lib/env";
import type { CoachNoteActionRequest, CoachNoteGenerationRequest } from "../lib/coachNotes";
import {
  invokeCoachNoteAction,
  recordRemoteCoachNoteEditMetrics,
  submitRemoteCoachNoteFeedback,
} from "./coachNoteRemote";
import { executeDeterministicCoachNoteAction } from "./coachNoteExecutor";
import { createMockCoachNotePersistence } from "./coachNoteMockPersistence";
import type {
  AssistantDraft,
  Athlete,
  Campaign,
  CampaignTryoutBriefing,
  ChangeRequest,
  CoachAthleteView,
  CoachEvaluation,
  PlayerGrowthReply,
  PlayerGrowthReview,
  PriorCoachEvaluation,
} from "../types/database";
import type {
  AdminStats,
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
import { generateId, getCurrentUserId, getData, saveData, setCurrentUserId } from "./store";

function now(): string {
  return new Date().toISOString();
}

function displayName(a: Pick<Athlete, "preferred_name" | "legal_name">): string {
  return a.preferred_name || a.legal_name || "Unknown athlete";
}

function findAthlete(athleteId: string): Athlete | undefined {
  return getData().athletes.find((a) => a.id === athleteId);
}

function findProfile(profileId: string) {
  return getData().profiles.find((profile) => profile.id === profileId);
}

function findCampaignName(campaignId: string): string {
  return getData().campaigns.find((campaign) => campaign.id === campaignId)?.name ?? campaignId;
}

function isAssignedCoach(campaignId: string, coachProfileId: string): boolean {
  return getData().campaignCoaches.some(
    (coach) => coach.campaign_id === campaignId && coach.coach_profile_id === coachProfileId,
  );
}

function assertAssignedCoach(campaignId: string, coachProfileId: string) {
  if (!isAssignedCoach(campaignId, coachProfileId)) {
    throw new Error("Coach is not assigned to this campaign");
  }
}

function assertAdmin(profileId: string) {
  if (findProfile(profileId)?.role !== "admin") {
    throw new Error("Admin access required");
  }
}

function latestEvaluation(campaignId: string, athleteId: string): CoachEvaluation | null {
  const matches = getData().evaluations.filter(
    (e) => e.campaign_id === campaignId && e.athlete_id === athleteId,
  );
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

function growthReviewDetails(review: PlayerGrowthReview): GrowthReviewWithDetails {
  const data = getData();
  const athlete = findAthlete(review.athlete_id);
  return {
    ...review,
    athleteName: athlete ? displayName(athlete) : "Unknown athlete",
    signoffs: data.growthSignoffs.filter((signoff) => signoff.review_id === review.id),
    replies: data.growthReplies.filter((reply) => reply.review_id === review.id),
  };
}

function findGrowthReview(reviewId: string): PlayerGrowthReview {
  const review = getData().growthReviews.find((row) => row.id === reviewId);
  if (!review) {
    throw new Error("Growth review not found");
  }
  return review;
}

function publishedPlayerGrowthStatuses(status: PlayerGrowthReview["status"]): boolean {
  return status === "shared" || status === "disputed" || status === "closed";
}

function briefingPayload(
  input: TryoutBriefingInput,
  updatedBy: string,
  existing?: CampaignTryoutBriefing,
): CampaignTryoutBriefing {
  const timestamp = now();
  return {
    id: existing?.id ?? generateId("tb"),
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
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  };
}

export const mockApi: Api = {
  async getCurrentProfile() {
    const id = getCurrentUserId();
    if (!id) {
      return null;
    }
    return getData().profiles.find((p) => p.id === id) ?? null;
  },

  async signIn(email: string): Promise<SignInResult> {
    const profile = getData().profiles.find(
      (p) => p.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!profile) {
      return { status: "unknown_email" };
    }
    setCurrentUserId(profile.id);
    return { status: "signed_in", profile };
  },

  async signOut() {
    setCurrentUserId(null);
    if (demoCoachLlm) {
      await clearDemoCoachSession();
    }
  },

  async getAthleteForProfile(profileId: string) {
    return getData().athletes.find((a) => a.profile_id === profileId) ?? null;
  },

  async updateOwnAthlete(profileId: string, patch: AthletePatch) {
    const data = getData();
    const athlete = data.athletes.find((a) => a.profile_id === profileId);
    if (!athlete) {
      throw new Error("Athlete not found for profile");
    }
    for (const [key, value] of Object.entries(patch) as [keyof AthletePatch, unknown][]) {
      const previous = athlete[key];
      if (previous === value) {
        continue;
      }
      const audit: ChangeRequest = {
        id: generateId("cr"),
        athlete_id: athlete.id,
        submitted_by: profileId,
        field_name: key,
        old_value: previous === null || previous === undefined ? null : String(previous),
        new_value: value === null || value === undefined ? null : String(value),
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        created_at: now(),
      };
      data.changeRequests.push(audit);
      (athlete as unknown as Record<string, unknown>)[key] = value;
    }
    athlete.updated_at = now();
    saveData(data);
    return athlete;
  },

  async getCampaignsForProfile(profileId: string): Promise<CampaignWithMembership[]> {
    const data = getData();
    const athlete = data.athletes.find((a) => a.profile_id === profileId);
    if (!athlete) {
      return [];
    }
    return data.campaignMembers
      .filter((m) => m.athlete_id === athlete.id)
      .map((m) => {
        const campaign = data.campaigns.find((c) => c.id === m.campaign_id);
        return campaign
          ? Object.assign({}, campaign, { memberStatus: m.status } satisfies {
              memberStatus: CampaignWithMembership["memberStatus"];
            })
          : null;
      })
      .filter((c): c is CampaignWithMembership => c !== null);
  },

  async listAthletes() {
    return [...getData().athletes];
  },

  async getAdminStats(): Promise<AdminStats> {
    const data = getData();
    const incomplete = data.athletes.filter((a) => getMissingAthleteFields(a).length > 0);
    const expiring = data.athletes.filter(
      (a) => getPassportStatus(a.passport_expiry) === "expiring_soon",
    );
    const coachedCampaignIds = new Set(data.campaignCoaches.map((c) => c.campaign_id));
    const pendingEvaluations = data.campaignMembers.filter((m) => {
      if (!coachedCampaignIds.has(m.campaign_id)) {
        return false;
      }
      const ev = latestEvaluation(m.campaign_id, m.athlete_id);
      return !ev || ev.status !== "submitted";
    }).length;
    return {
      totalAthletes: data.athletes.length,
      activeCampaigns: data.campaigns.filter((c) => c.status === "active").length,
      incompleteProfiles: incomplete.length,
      passportExpiringSoon: expiring.length,
      pendingEvaluations,
      pendingReviewItems: data.changeRequests.filter((r) => r.status === "pending").length,
    };
  },

  async listCampaigns() {
    return [...getData().campaigns];
  },

  async getCampaign(id: string) {
    return getData().campaigns.find((c) => c.id === id) ?? null;
  },

  async createCampaign(input: NewCampaign, createdBy: string): Promise<Campaign> {
    const data = getData();
    const campaign: Campaign = {
      id: generateId("c"),
      name: input.name,
      team: input.team ?? null,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      location: input.location ?? null,
      status: input.status ?? "draft",
      created_by: createdBy,
      created_at: now(),
      updated_at: now(),
    };
    data.campaigns.push(campaign);
    saveData(data);
    return campaign;
  },

  async assignCampaignMember(input) {
    const data = getData();
    const existing = data.campaignMembers.find(
      (member) => member.campaign_id === input.campaignId && member.athlete_id === input.athleteId,
    );
    if (existing) {
      existing.status = input.status;
    } else {
      data.campaignMembers.push({
        id: generateId("m"),
        campaign_id: input.campaignId,
        athlete_id: input.athleteId,
        status: input.status,
        created_at: now(),
      });
    }
    saveData(data);
  },

  async getCampaignReadiness(campaignId: string): Promise<CampaignReadinessEntry[]> {
    const data = getData();
    return data.campaignMembers
      .filter((m) => m.campaign_id === campaignId)
      .map((m) => {
        const athlete = findAthlete(m.athlete_id);
        if (!athlete) {
          return null;
        }
        const ev = latestEvaluation(campaignId, m.athlete_id);
        const entry: CampaignReadinessEntry = {
          athleteId: athlete.id,
          name: displayName(athlete),
          missingFields: getMissingAthleteFields(athlete),
          passportStatus: getPassportStatus(athlete.passport_expiry),
          profileStatus: athlete.profile_status,
          memberStatus: m.status,
          hasEvaluation: ev !== null,
          evaluationStatus: ev ? ev.status : null,
        };
        return entry;
      })
      .filter((e): e is CampaignReadinessEntry => e !== null);
  },

  async listChangeRequests(): Promise<ChangeRequestView[]> {
    const data = getData();
    return data.changeRequests.map((r) => {
      const athlete = findAthlete(r.athlete_id);
      return {
        id: r.id,
        athleteId: r.athlete_id,
        athleteName: athlete ? displayName(athlete) : "Unknown athlete",
        fieldName: r.field_name,
        oldValue: r.old_value,
        newValue: r.new_value,
        status: r.status,
        createdAt: r.created_at,
      };
    });
  },

  async reviewChangeRequest(id, decision, reviewerId) {
    const data = getData();
    const request = data.changeRequests.find((r) => r.id === id);
    if (!request) {
      throw new Error("Change request not found");
    }
    request.status = decision;
    request.reviewed_by = reviewerId;
    request.reviewed_at = now();
    saveData(data);
  },

  async listAssistantDrafts(createdBy: string) {
    return getData().assistantDrafts.filter((d) => d.created_by === createdBy);
  },

  async createAssistantDraft(input: NewAssistantDraft): Promise<AssistantDraft> {
    const data = getData();
    const draft: AssistantDraft = {
      id: generateId("ad"),
      created_by: input.createdBy,
      draft_type: input.draftType,
      target_profile_id: input.targetProfileId ?? null,
      campaign_id: input.campaignId ?? null,
      content: input.content,
      status: "draft",
      created_at: now(),
    };
    data.assistantDrafts.push(draft);
    saveData(data);
    return draft;
  },

  async getTryoutBriefing(campaignId: string) {
    return (
      getData().tryoutBriefings.find((briefing) => briefing.campaign_id === campaignId) ?? null
    );
  },

  async saveTryoutBriefing(input: TryoutBriefingInput, updatedBy: string) {
    assertAdmin(updatedBy);
    const data = getData();
    const existing = data.tryoutBriefings.find(
      (briefing) => briefing.campaign_id === input.campaignId,
    );
    const next = briefingPayload(input, updatedBy, existing);
    if (existing) {
      Object.assign(existing, next);
    } else {
      data.tryoutBriefings.push(next);
    }
    saveData(data);
    return next;
  },

  async getPlayerCampaignFlow(profileId: string, campaignId: string) {
    const data = getData();
    const athlete = data.athletes.find((row) => row.profile_id === profileId);
    if (!athlete) {
      return null;
    }
    const membership = data.campaignMembers.find(
      (row) => row.campaign_id === campaignId && row.athlete_id === athlete.id,
    );
    const campaign = data.campaigns.find((row) => row.id === campaignId);
    if (!membership || !campaign) {
      return null;
    }
    return {
      campaign,
      memberStatus: membership.status,
      briefing:
        data.tryoutBriefings.find(
          (briefing) => briefing.campaign_id === campaignId && briefing.published,
        ) ?? null,
      reviews: data.growthReviews
        .filter(
          (review) =>
            review.campaign_id === campaignId &&
            review.athlete_id === athlete.id &&
            publishedPlayerGrowthStatuses(review.status),
        )
        .toSorted((left, right) => right.updated_at.localeCompare(left.updated_at))
        .map(growthReviewDetails),
    };
  },

  async getCampaignGrowthReviews(campaignId: string) {
    return getData()
      .growthReviews.filter((review) => review.campaign_id === campaignId)
      .toSorted((left, right) => right.updated_at.localeCompare(left.updated_at))
      .map(growthReviewDetails);
  },

  async getCoachGrowthReviews(campaignId: string, coachProfileId: string) {
    assertAssignedCoach(campaignId, coachProfileId);
    return getData()
      .growthReviews.filter((review) => review.campaign_id === campaignId)
      .toSorted((left, right) => right.updated_at.localeCompare(left.updated_at))
      .map(growthReviewDetails);
  },

  async saveGrowthReviewDraft(input: GrowthReviewInput) {
    assertAssignedCoach(input.campaignId, input.coachProfileId);
    const data = getData();
    const timestamp = now();
    const existing = input.id
      ? data.growthReviews.find((review) => review.id === input.id)
      : data.growthReviews.find(
          (review) =>
            review.campaign_id === input.campaignId &&
            review.athlete_id === input.athleteId &&
            review.quarter_label === input.quarterLabel,
        );
    if (existing && publishedPlayerGrowthStatuses(existing.status)) {
      throw new Error("Shared growth reviews cannot be edited by coaches");
    }
    const review: PlayerGrowthReview = {
      id: existing?.id ?? generateId("gr"),
      campaign_id: input.campaignId,
      athlete_id: input.athleteId,
      quarter_label: input.quarterLabel.trim(),
      skill_score: input.skillScore,
      growth_potential_score: input.growthPotentialScore,
      quadrant: calculateMatrixQuadrant(input.skillScore, input.growthPotentialScore),
      rationale: input.rationale.trim(),
      status: existing?.status ?? "draft",
      created_by: existing?.created_by ?? input.coachProfileId,
      shared_at: existing?.shared_at ?? null,
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
    };
    if (existing) {
      Object.assign(existing, review);
    } else {
      data.growthReviews.push(review);
    }
    saveData(data);
    return growthReviewDetails(review);
  },

  async signGrowthReview(reviewId: string, coachProfileId: string) {
    const data = getData();
    const review = findGrowthReview(reviewId);
    assertAssignedCoach(review.campaign_id, coachProfileId);
    if (
      !data.growthSignoffs.some(
        (signoff) => signoff.review_id === reviewId && signoff.coach_profile_id === coachProfileId,
      )
    ) {
      data.growthSignoffs.push({
        id: generateId("gs"),
        review_id: reviewId,
        coach_profile_id: coachProfileId,
        signed_at: now(),
      });
    }
    const signoffs = data.growthSignoffs.filter((signoff) => signoff.review_id === reviewId);
    review.status = nextGrowthReviewStatus(review, signoffs);
    review.updated_at = now();
    saveData(data);
    return growthReviewDetails(review);
  },

  async shareGrowthReview(reviewId: string, adminProfileId: string) {
    assertAdmin(adminProfileId);
    const data = getData();
    const review = findGrowthReview(reviewId);
    const signoffs = data.growthSignoffs.filter((signoff) => signoff.review_id === reviewId);
    if (!hasTwoCoachSignoff(signoffs)) {
      throw new Error("Two coach sign-offs are required before sharing");
    }
    review.status = "shared";
    review.shared_at = now();
    review.updated_at = now();
    saveData(data);
    return growthReviewDetails(review);
  },

  async submitGrowthReply(reviewId: string, athleteProfileId: string, body: string) {
    const data = getData();
    const review = findGrowthReview(reviewId);
    const athlete = data.athletes.find((row) => row.id === review.athlete_id);
    if (!athlete || athlete.profile_id !== athleteProfileId) {
      throw new Error("Player cannot reply to this growth review");
    }
    if (review.status !== "shared" && review.status !== "disputed") {
      throw new Error("Only shared growth reviews can receive replies");
    }
    const reply: PlayerGrowthReply = {
      id: generateId("grr"),
      review_id: reviewId,
      athlete_id: athlete.id,
      submitted_by: athleteProfileId,
      body: body.trim(),
      status: "open",
      created_at: now(),
      updated_at: now(),
    };
    data.growthReplies.push(reply);
    review.status = "disputed";
    review.updated_at = now();
    saveData(data);
    return reply;
  },

  async getCoachCampaigns(coachProfileId: string) {
    const data = getData();
    const campaignIds = new Set(
      data.campaignCoaches
        .filter((c) => c.coach_profile_id === coachProfileId)
        .map((c) => c.campaign_id),
    );
    return data.campaigns.filter((c) => campaignIds.has(c.id));
  },

  async getCoachAthletes(campaignId: string): Promise<CoachAthleteView[]> {
    const data = getData();
    return data.campaignMembers
      .filter((m) => m.campaign_id === campaignId)
      .map((m) => {
        const a = findAthlete(m.athlete_id);
        if (!a) {
          return null;
        }
        const view: CoachAthleteView = {
          id: a.id,
          legal_name: a.legal_name,
          preferred_name: a.preferred_name,
          phone: a.phone,
          profile_status: a.profile_status,
          created_at: a.created_at,
          updated_at: a.updated_at,
          campaign_id: campaignId,
        };
        return view;
      })
      .filter((v): v is CoachAthleteView => v !== null);
  },

  async getEvaluation(campaignId, athleteId, coachProfileId) {
    return (
      getData().evaluations.find(
        (e) =>
          e.campaign_id === campaignId &&
          e.athlete_id === athleteId &&
          e.coach_profile_id === coachProfileId,
      ) ?? null
    );
  },

  async saveEvaluation(input: EvaluationInput): Promise<CoachEvaluation> {
    const data = getData();
    const existing = data.evaluations.find(
      (e) =>
        (input.id && e.id === input.id) ||
        (e.campaign_id === input.campaignId &&
          e.athlete_id === input.athleteId &&
          e.coach_profile_id === input.coachProfileId),
    );
    const base: CoachEvaluation = existing ?? {
      id: generateId("eval"),
      campaign_id: input.campaignId,
      athlete_id: input.athleteId,
      coach_profile_id: input.coachProfileId,
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
      created_at: now(),
      updated_at: now(),
    };
    const updated: CoachEvaluation = {
      ...base,
      throwing_rating: input.throwing_rating ?? base.throwing_rating,
      cutting_rating: input.cutting_rating ?? base.cutting_rating,
      defense_rating: input.defense_rating ?? base.defense_rating,
      fitness_rating: input.fitness_rating ?? base.fitness_rating,
      game_iq_rating: input.game_iq_rating ?? base.game_iq_rating,
      communication_rating: input.communication_rating ?? base.communication_rating,
      coachability_rating: input.coachability_rating ?? base.coachability_rating,
      strengths: input.strengths ?? base.strengths,
      development_areas: input.development_areas ?? base.development_areas,
      overall_notes: input.overall_notes ?? base.overall_notes,
      recommendation: input.recommendation ?? base.recommendation,
      status: input.status,
      updated_at: now(),
    };
    if (existing) {
      Object.assign(existing, updated);
    } else {
      data.evaluations.push(updated);
    }
    saveData(data);
    return updated;
  },

  async listCoachEvaluations(coachProfileId: string) {
    return getData().evaluations.filter((e) => e.coach_profile_id === coachProfileId);
  },

  async listOwnSubmittedEvaluations(coachProfileId, athleteId, limit = 3) {
    return getData()
      .evaluations.filter(
        (evaluation) =>
          evaluation.coach_profile_id === coachProfileId &&
          evaluation.athlete_id === athleteId &&
          evaluation.status === "submitted",
      )
      .toSorted((left, right) => right.updated_at.localeCompare(left.updated_at))
      .slice(0, limit)
      .map(
        (evaluation): PriorCoachEvaluation => ({
          id: evaluation.id,
          campaignId: evaluation.campaign_id,
          campaignName: findCampaignName(evaluation.campaign_id),
          submittedAt: evaluation.updated_at,
          strengths: evaluation.strengths,
          developmentAreas: evaluation.development_areas,
          overallNotes: evaluation.overall_notes,
          recommendation: evaluation.recommendation,
        }),
      );
  },

  async coachNoteAction(input: CoachNoteActionRequest) {
    const coachProfileId = getCurrentUserId();
    if (!coachProfileId) {
      throw new Error("Coach is not assigned to this athlete");
    }
    if (useRemoteCoachLlm) {
      return invokeCoachNoteAction(input);
    }
    return executeDeterministicCoachNoteAction(
      input,
      coachProfileId,
      createMockCoachNotePersistence(coachProfileId),
      now,
    );
  },

  async generateCoachNoteDraft(input: CoachNoteGenerationRequest) {
    return mockApi.coachNoteAction({ ...input, action: "structure" });
  },

  async submitCoachNoteFeedback(input) {
    if (useRemoteCoachLlm) {
      return submitRemoteCoachNoteFeedback(input);
    }
    const data = getData();
    const coachProfileId = getCurrentUserId();
    const run = data.coachNoteGenerationRuns.find(
      (row) => row.id === input.runId && row.coach_profile_id === coachProfileId,
    );
    if (!run) {
      throw new Error("Coach note generation run not found");
    }
    run.feedback = input.feedback;
    run.feedback_at = now();
    saveData(data);
  },

  async recordCoachNoteEditMetrics(input) {
    if (useRemoteCoachLlm) {
      return recordRemoteCoachNoteEditMetrics(input);
    }
    const data = getData();
    const coachProfileId = getCurrentUserId();
    const run = data.coachNoteGenerationRuns.find(
      (row) => row.id === input.runId && row.coach_profile_id === coachProfileId,
    );
    if (!run) {
      throw new Error("Coach note generation run not found");
    }
    run.field_edit_count = input.fieldEditCount;
    run.normalized_edit_distance = input.normalizedEditDistance;
    saveData(data);
  },
};
