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
import {
  aggregateNps,
  auditEventForSave,
  DEFAULT_NPS_MIN_RESPONSE_COUNT,
} from "../lib/campaignManagement";
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
  CoachMatrixAssessment,
  EvaluationAuditEvent,
  PlayerMatrixSubmission,
  PlayerGrowthReply,
  PlayerGrowthReview,
  PriorCoachEvaluation,
} from "../types/database";
import type {
  AdminStats,
  Api,
  AthletePatch,
  CampaignMatrixStatusRow,
  CampaignOperatingSummary,
  CampaignReadinessEntry,
  CampaignWithMembership,
  ChangeRequestView,
  CoachMatrixInput,
  EvaluationInput,
  GrowthReviewInput,
  GrowthReviewWithDetails,
  NewAssistantDraft,
  NewCampaign,
  NpsCoachReportRow,
  NpsResponseInput,
  NpsSurveyInput,
  NpsTask,
  PlayerMatrixInput,
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

function findCampaign(campaignId: string): Campaign | null {
  return getData().campaigns.find((campaign) => campaign.id === campaignId) ?? null;
}

function assertCampaignMember(campaignId: string, athleteId: string) {
  const isMember = getData().campaignMembers.some(
    (member) => member.campaign_id === campaignId && member.athlete_id === athleteId,
  );
  if (!isMember) {
    throw new Error("Athlete is not assigned to this campaign");
  }
}

function assertOwnAthlete(profileId: string, athleteId: string) {
  const athlete = findAthlete(athleteId);
  if (!athlete || athlete.profile_id !== profileId) {
    throw new Error("Player cannot access this athlete record");
  }
}

function profileName(profileId: string): string {
  const profile = findProfile(profileId);
  return profile?.preferred_name || profile?.full_name || profile?.email || "Unknown coach";
}

function recordEvaluationAudit(
  data: ReturnType<typeof getData>,
  input: {
    campaignId: string;
    athleteId: string;
    actorProfileId: string;
    actorRole: EvaluationAuditEvent["actor_role"];
    eventType: EvaluationAuditEvent["event_type"];
    entityType: EvaluationAuditEvent["entity_type"];
    entityId: string;
  },
) {
  data.evaluationAuditEvents.push({
    id: generateId("eae"),
    campaign_id: input.campaignId,
    athlete_id: input.athleteId,
    actor_profile_id: input.actorProfileId,
    actor_role: input.actorRole,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: {},
    created_at: now(),
  });
}

function playerMatrixPayload(
  input: PlayerMatrixInput,
  existing?: PlayerMatrixSubmission,
): PlayerMatrixSubmission {
  const timestamp = now();
  return {
    id: existing?.id ?? generateId("pms"),
    campaign_id: input.campaignId,
    athlete_id: input.athleteId,
    submitted_by: input.submittedBy,
    skill_score: input.skillScore ?? null,
    growth_score: input.growthScore ?? null,
    readiness_score: input.readinessScore ?? null,
    confidence_score: input.confidenceScore ?? null,
    strengths: input.strengths ?? null,
    development_focus: input.developmentFocus ?? null,
    support_needed: input.supportNeeded ?? null,
    status: input.status,
    submitted_at:
      input.status === "submitted"
        ? (existing?.submitted_at ?? timestamp)
        : (existing?.submitted_at ?? null),
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  };
}

function coachMatrixPayload(
  input: CoachMatrixInput,
  existing?: CoachMatrixAssessment,
): CoachMatrixAssessment {
  const timestamp = now();
  return {
    id: existing?.id ?? generateId("cma"),
    campaign_id: input.campaignId,
    athlete_id: input.athleteId,
    coach_profile_id: input.coachProfileId,
    skill_score: input.skillScore ?? null,
    growth_score: input.growthScore ?? null,
    readiness_score: input.readinessScore ?? null,
    tactical_score: input.tacticalScore ?? null,
    strengths: input.strengths ?? null,
    development_focus: input.developmentFocus ?? null,
    coach_notes: input.coachNotes ?? null,
    status: input.status,
    submitted_at:
      input.status === "submitted"
        ? (existing?.submitted_at ?? timestamp)
        : (existing?.submitted_at ?? null),
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  };
}

function buildMatrixStatusRows(campaignId: string): CampaignMatrixStatusRow[] {
  const data = getData();
  return data.campaignMembers
    .filter((member) => member.campaign_id === campaignId)
    .map((member) => {
      const athlete = findAthlete(member.athlete_id);
      if (!athlete) {
        return null;
      }
      const playerSubmission =
        data.playerMatrixSubmissions.find(
          (submission) =>
            submission.campaign_id === campaignId && submission.athlete_id === athlete.id,
        ) ?? null;
      const coachAssessments = data.coachMatrixAssessments.filter(
        (assessment) =>
          assessment.campaign_id === campaignId && assessment.athlete_id === athlete.id,
      );
      return {
        athleteId: athlete.id,
        athleteName: displayName(athlete),
        memberStatus: member.status,
        playerSubmission,
        coachAssessments,
        playerStatus: playerSubmission?.status ?? "not_started",
        submittedCoachCount: coachAssessments.filter(
          (assessment) => assessment.status === "submitted",
        ).length,
      };
    })
    .filter((row): row is CampaignMatrixStatusRow => row !== null);
}

function buildNpsTasksForAthlete(athlete: Athlete, campaignId?: string): NpsTask[] {
  const data = getData();
  const assignments = data.npsAssignments.filter(
    (assignment) => assignment.athlete_id === athlete.id,
  );
  return assignments
    .map((assignment) => {
      const survey = data.npsSurveys.find((row) => row.id === assignment.survey_id);
      if (
        !survey ||
        survey.status !== "open" ||
        (campaignId && survey.campaign_id !== campaignId)
      ) {
        return null;
      }
      const coachIds = data.campaignCoaches
        .filter((coach) => coach.campaign_id === survey.campaign_id)
        .map((coach) => coach.coach_profile_id);
      return {
        survey,
        assignmentId: assignment.id,
        status: assignment.status,
        coaches: coachIds.map((coachProfileId) => ({
          profileId: coachProfileId,
          name: profileName(coachProfileId),
          alreadyResponded: data.npsResponses.some(
            (response) =>
              response.survey_id === survey.id &&
              response.athlete_id === athlete.id &&
              response.target_coach_profile_id === coachProfileId,
          ),
        })),
      };
    })
    .filter((task): task is NpsTask => task !== null);
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

  async getCampaignOperatingSummary(campaignId: string): Promise<CampaignOperatingSummary> {
    const [readinessRows, matrixRows, surveys] = await Promise.all([
      mockApi.getCampaignReadiness(campaignId),
      mockApi.getCampaignMatrixStatus(campaignId),
      mockApi.listNpsSurveys(campaignId),
    ]);
    return {
      campaign: findCampaign(campaignId),
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

  async getCampaignMatrixStatus(campaignId: string) {
    return buildMatrixStatusRows(campaignId);
  },

  async listEvaluationAuditEvents(campaignId: string) {
    return getData()
      .evaluationAuditEvents.filter((event) => event.campaign_id === campaignId)
      .toSorted((left, right) => right.created_at.localeCompare(left.created_at));
  },

  async getPlayerMatrixSubmission(campaignId: string, athleteId: string) {
    return (
      getData().playerMatrixSubmissions.find(
        (submission) =>
          submission.campaign_id === campaignId && submission.athlete_id === athleteId,
      ) ?? null
    );
  },

  async savePlayerMatrixSubmission(input: PlayerMatrixInput) {
    assertCampaignMember(input.campaignId, input.athleteId);
    assertOwnAthlete(input.submittedBy, input.athleteId);
    const data = getData();
    const existing = data.playerMatrixSubmissions.find(
      (submission) =>
        (input.id && submission.id === input.id) ||
        (submission.campaign_id === input.campaignId && submission.athlete_id === input.athleteId),
    );
    const eventType = auditEventForSave(existing ?? null, input.status);
    const next = playerMatrixPayload(input, existing);
    if (existing) {
      Object.assign(existing, next);
    } else {
      data.playerMatrixSubmissions.push(next);
    }
    recordEvaluationAudit(data, {
      campaignId: input.campaignId,
      athleteId: input.athleteId,
      actorProfileId: input.submittedBy,
      actorRole: "player",
      eventType,
      entityType: "player_matrix_submission",
      entityId: next.id,
    });
    saveData(data);
    return next;
  },

  async getCoachMatrixAssessment(campaignId: string, athleteId: string, coachProfileId: string) {
    return (
      getData().coachMatrixAssessments.find(
        (assessment) =>
          assessment.campaign_id === campaignId &&
          assessment.athlete_id === athleteId &&
          assessment.coach_profile_id === coachProfileId,
      ) ?? null
    );
  },

  async saveCoachMatrixAssessment(input: CoachMatrixInput) {
    assertCampaignMember(input.campaignId, input.athleteId);
    assertAssignedCoach(input.campaignId, input.coachProfileId);
    const data = getData();
    const existing = data.coachMatrixAssessments.find(
      (assessment) =>
        (input.id && assessment.id === input.id) ||
        (assessment.campaign_id === input.campaignId &&
          assessment.athlete_id === input.athleteId &&
          assessment.coach_profile_id === input.coachProfileId),
    );
    const eventType = auditEventForSave(existing ?? null, input.status);
    const next = coachMatrixPayload(input, existing);
    if (existing) {
      Object.assign(existing, next);
    } else {
      data.coachMatrixAssessments.push(next);
    }
    recordEvaluationAudit(data, {
      campaignId: input.campaignId,
      athleteId: input.athleteId,
      actorProfileId: input.coachProfileId,
      actorRole: "coach",
      eventType,
      entityType: "coach_matrix_assessment",
      entityId: next.id,
    });
    saveData(data);
    return next;
  },

  async listNpsSurveys(campaignId: string) {
    return getData()
      .npsSurveys.filter((survey) => survey.campaign_id === campaignId)
      .toSorted((left, right) => left.survey_window.localeCompare(right.survey_window));
  },

  async saveNpsSurvey(input: NpsSurveyInput) {
    assertAdmin(input.createdBy);
    const data = getData();
    const timestamp = now();
    const existing = data.npsSurveys.find(
      (survey) => survey.campaign_id === input.campaignId && survey.survey_window === input.window,
    );
    const survey = {
      id: existing?.id ?? generateId("nps"),
      campaign_id: input.campaignId,
      title: input.title,
      survey_window: input.window,
      status: input.status,
      opens_at: input.opensAt ?? null,
      closes_at: input.closesAt ?? null,
      min_response_count: input.minResponseCount ?? DEFAULT_NPS_MIN_RESPONSE_COUNT,
      created_by: existing?.created_by ?? input.createdBy,
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
    };
    if (existing) {
      Object.assign(existing, survey);
    } else {
      data.npsSurveys.push(survey);
    }

    const members = data.campaignMembers.filter(
      (member) => member.campaign_id === input.campaignId,
    );
    for (const member of members) {
      const alreadyAssigned = data.npsAssignments.some(
        (assignment) =>
          assignment.survey_id === survey.id && assignment.athlete_id === member.athlete_id,
      );
      if (!alreadyAssigned) {
        data.npsAssignments.push({
          id: generateId("npsa"),
          survey_id: survey.id,
          athlete_id: member.athlete_id,
          status: "pending",
          completed_at: null,
          created_at: timestamp,
        });
      }
    }

    saveData(data);
    return survey;
  },

  async listPlayerNpsTasks(profileId: string, campaignId?: string) {
    const athlete = getData().athletes.find((row) => row.profile_id === profileId);
    return athlete ? buildNpsTasksForAthlete(athlete, campaignId) : [];
  },

  async submitNpsResponse(input: NpsResponseInput) {
    if (input.score < 0 || input.score > 10) {
      throw new Error("NPS score must be between 0 and 10");
    }
    const data = getData();
    const assignment = data.npsAssignments.find(
      (row) =>
        row.id === input.assignmentId &&
        row.survey_id === input.surveyId &&
        row.athlete_id === input.athleteId,
    );
    const survey = data.npsSurveys.find((row) => row.id === input.surveyId);
    if (!assignment || !survey || survey.status !== "open") {
      throw new Error("NPS survey is not open for this player");
    }
    const existing = data.npsResponses.find(
      (response) =>
        response.survey_id === input.surveyId &&
        response.athlete_id === input.athleteId &&
        response.target_coach_profile_id === input.targetCoachProfileId,
    );
    const timestamp = now();
    const response = {
      id: existing?.id ?? generateId("npsr"),
      survey_id: input.surveyId,
      assignment_id: input.assignmentId,
      athlete_id: input.athleteId,
      target_coach_profile_id: input.targetCoachProfileId,
      score: input.score,
      comment: input.comment ?? null,
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
    };
    if (existing) {
      Object.assign(existing, response);
    } else {
      data.npsResponses.push(response);
    }

    const coachCount = data.campaignCoaches.filter(
      (coach) => coach.campaign_id === survey.campaign_id,
    ).length;
    const responseCount = data.npsResponses.filter(
      (row) => row.survey_id === survey.id && row.athlete_id === input.athleteId,
    ).length;
    if (coachCount > 0 && responseCount >= coachCount) {
      assignment.status = "completed";
      assignment.completed_at = timestamp;
    }
    saveData(data);
  },

  async getNpsReport(campaignId: string): Promise<NpsCoachReportRow[]> {
    const data = getData();
    const surveys = data.npsSurveys.filter((survey) => survey.campaign_id === campaignId);
    const coaches = data.campaignCoaches.filter((coach) => coach.campaign_id === campaignId);
    return surveys.flatMap((survey) =>
      coaches.map((coach) => {
        const responses = data.npsResponses.filter(
          (response) =>
            response.survey_id === survey.id &&
            response.target_coach_profile_id === coach.coach_profile_id,
        );
        const aggregate = aggregateNps(responses, survey.min_response_count);
        return {
          surveyId: survey.id,
          surveyTitle: survey.title,
          surveyWindow: survey.survey_window,
          coachProfileId: coach.coach_profile_id,
          coachName: profileName(coach.coach_profile_id),
          responseCount: aggregate.responseCount,
          averageScore: aggregate.averageScore,
          nps: aggregate.nps,
          promoterCount: aggregate.promoterCount,
          passiveCount: aggregate.passiveCount,
          detractorCount: aggregate.detractorCount,
          withheld: aggregate.withheld,
        };
      }),
    );
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
