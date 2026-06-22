// In-memory implementation of the data Api. Used offline (dev + tests).
import { getMissingAthleteFields } from "../lib/profile";
import { getPassportStatus } from "../lib/passport";
import {
  COACH_NOTE_MAX_TURNS,
  COACH_NOTE_PROMPT_VERSION,
  buildAccumulatedInput,
  countAmbiguities,
  createDeterministicCoachNoteDraft,
  type CoachNoteActionRequest,
  type CoachNoteGenerationRequest,
} from "../lib/coachNotes";
import type {
  AssistantDraft,
  Athlete,
  Campaign,
  ChangeRequest,
  CoachAthleteView,
  CoachEvaluation,
  CoachNoteGenerationRun,
  CoachNoteSession,
  CoachNoteTurn,
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
  NewAssistantDraft,
  NewCampaign,
  SignInResult,
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

function assertCoachAssignment(
  campaignId: string,
  athleteId: string,
  coachProfileId: string,
): void {
  const data = getData();
  const profile = data.profiles.find((row) => row.id === coachProfileId);
  const assignedCampaign = data.campaignCoaches.some(
    (row) => row.campaign_id === campaignId && row.coach_profile_id === coachProfileId,
  );
  const assignedAthlete = data.campaignMembers.some(
    (row) => row.campaign_id === campaignId && row.athlete_id === athleteId,
  );
  if (!coachProfileId || profile?.role !== "coach" || !assignedCampaign || !assignedAthlete) {
    throw new Error("Coach is not assigned to this athlete");
  }
}

function findCampaignName(campaignId: string): string {
  return getData().campaigns.find((campaign) => campaign.id === campaignId)?.name ?? campaignId;
}

function latestEvaluation(campaignId: string, athleteId: string): CoachEvaluation | null {
  const matches = getData().evaluations.filter(
    (e) => e.campaign_id === campaignId && e.athlete_id === athleteId,
  );
  return matches.length > 0 ? matches[matches.length - 1] : null;
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
    const data = getData();
    const coachProfileId = getCurrentUserId();
    assertCoachAssignment(input.campaignId, input.athleteId, coachProfileId ?? "");

    let session: CoachNoteSession | undefined = input.sessionId
      ? data.coachNoteSessions.find(
          (row) =>
            row.id === input.sessionId &&
            row.coach_profile_id === coachProfileId &&
            row.campaign_id === input.campaignId &&
            row.athlete_id === input.athleteId,
        )
      : undefined;
    if (input.sessionId && !session) {
      throw new Error("Coach note session not found");
    }
    if (session && session.turn_count >= COACH_NOTE_MAX_TURNS) {
      throw new Error("Coach note session turn limit reached");
    }

    const accumulatedInput = buildAccumulatedInput(
      input.roughNotes,
      input.clarifications ?? [],
      input.additionalNotes ?? "",
    );
    const turnIndex = session?.turn_count ?? 0;
    const draft = createDeterministicCoachNoteDraft(accumulatedInput);
    const ambiguityCount = countAmbiguities(draft);

    if (!session) {
      session = {
        id: generateId("coach-session"),
        campaign_id: input.campaignId,
        athlete_id: input.athleteId,
        coach_profile_id: coachProfileId!,
        accumulated_input: accumulatedInput,
        turn_count: 0,
        status: "active",
        created_at: now(),
        updated_at: now(),
      };
      data.coachNoteSessions.push(session);
    }

    const run: CoachNoteGenerationRun = {
      id: generateId("coach-note"),
      campaign_id: input.campaignId,
      athlete_id: input.athleteId,
      coach_profile_id: coachProfileId!,
      schema_version: 1,
      prompt_version: COACH_NOTE_PROMPT_VERSION,
      provider: "mock",
      model: "deterministic-eval-double",
      source: "llm",
      status: "succeeded",
      redacted_input: accumulatedInput,
      redacted_output: draft,
      validation_errors: [],
      latency_ms: 0,
      input_tokens: null,
      output_tokens: null,
      estimated_cost_usd: 0,
      repair_count: 0,
      error_code: null,
      feedback: null,
      feedback_at: null,
      field_edit_count: null,
      normalized_edit_distance: null,
      ambiguity_count: ambiguityCount,
      session_id: session.id,
      turn_index: turnIndex,
      created_at: now(),
    };
    data.coachNoteGenerationRuns.push(run);

    const turn: CoachNoteTurn = {
      id: generateId("coach-turn"),
      session_id: session.id,
      turn_index: turnIndex,
      action: input.action,
      payload: {
        clarifications: input.clarifications ?? [],
        additionalNotes: input.additionalNotes ?? "",
        section: input.section ?? null,
      },
      draft_snapshot: draft,
      run_id: run.id,
      created_at: now(),
    };
    data.coachNoteTurns.push(turn);

    session.accumulated_input = accumulatedInput;
    session.turn_count = turnIndex + 1;
    session.updated_at = now();

    saveData(data);
    return {
      runId: run.id,
      source: "llm" as const,
      promptVersion: run.prompt_version,
      model: run.model,
      latencyMs: run.latency_ms ?? 0,
      estimatedCostUsd: run.estimated_cost_usd,
      repairCount: run.repair_count,
      redactedNotes: run.redacted_input,
      draft,
      ambiguityCount,
      sessionId: session.id,
      turnIndex,
      accumulatedInput,
    };
  },

  async generateCoachNoteDraft(input: CoachNoteGenerationRequest) {
    return mockApi.coachNoteAction({ ...input, action: "structure" });
  },

  async submitCoachNoteFeedback(input) {
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
