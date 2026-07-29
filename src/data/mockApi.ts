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
  DEFAULT_NPS_MIN_COACH_RATER_COUNT,
  DEFAULT_NPS_MIN_PLAYER_RATER_COUNT,
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
  AdminAthletePatch,
  AdminStats,
  Api,
  AthletePatch,
  CampaignCoachAssignment,
  CampaignCoachView,
  CampaignMemberUnassignment,
  CampaignMatrixStatusRow,
  CampaignOperatingSummary,
  CampaignReadinessEntry,
  CampaignRosterImportInput,
  CampaignWithMembership,
  CampaignQuestionnaireImportInput,
  ChangeRequestView,
  CoachMatrixInput,
  CreateAthleteInput,
  CreateCoachProfileInput,
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
  RosterImportCommitResult,
  SignInResult,
  TryoutBriefingInput,
} from "./types";
import { planRosterImport } from "../lib/rosterImport";
import {
  isCoachOnCampaign,
  isPlayerOnCampaign,
  shouldDropPendingNpsAssignment,
} from "../lib/campaignMembership";
import { athleteFieldsFromCreateInput, normalizeEmail } from "./payloads/athlete";
import { briefingFieldsFromInput } from "./payloads/briefing";
import { displayName } from "./payloads/display";
import {
  coachMatrixFieldsFromInput,
  matrixSubmittedAt,
  playerMatrixFieldsFromInput,
} from "./payloads/matrix";
import { generateId, getCurrentUserId, getData, saveData, setCurrentUserId } from "./store";
import {
  mockCloseSurveyInstance,
  mockCommitQuestionnaireImport,
  mockGetMySurveyAssignment,
  mockGetSurveySectionAggregates,
  mockListSurveyCompletion,
  mockOpenSurveyInstance,
  mockPublishSurveyTemplate,
  mockSaveSurveyAnswers,
} from "./surveyMockOps";

function now(): string {
  return new Date().toISOString();
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
    ...briefingFieldsFromInput(input, updatedBy),
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
    ...playerMatrixFieldsFromInput(input),
    submitted_at: matrixSubmittedAt(input.status, existing?.submitted_at, timestamp),
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
    ...coachMatrixFieldsFromInput(input),
    submitted_at: matrixSubmittedAt(input.status, existing?.submitted_at, timestamp),
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  };
}

function latestFirst<T extends { submitted_at: string | null; updated_at: string }>(
  rows: T[],
): T[] {
  return rows.toSorted((left, right) =>
    (right.submitted_at ?? right.updated_at).localeCompare(left.submitted_at ?? left.updated_at),
  );
}

function findPlayerMatrixDraft(campaignId: string, athleteId: string) {
  return (
    getData().playerMatrixSubmissions.find(
      (submission) =>
        submission.campaign_id === campaignId &&
        submission.athlete_id === athleteId &&
        submission.status === "draft",
    ) ?? null
  );
}

function findCoachMatrixDraft(campaignId: string, athleteId: string, coachProfileId: string) {
  return (
    getData().coachMatrixAssessments.find(
      (assessment) =>
        assessment.campaign_id === campaignId &&
        assessment.athlete_id === athleteId &&
        assessment.coach_profile_id === coachProfileId &&
        assessment.status === "draft",
    ) ?? null
  );
}

function buildMatrixStatusRows(campaignId: string): CampaignMatrixStatusRow[] {
  const data = getData();
  return data.campaignMembers
    .filter((member) => member.campaign_id === campaignId)
    .map((member): CampaignMatrixStatusRow | null => {
      const athlete = findAthlete(member.athlete_id);
      if (!athlete) {
        return null;
      }
      const playerRows = latestFirst(
        data.playerMatrixSubmissions.filter(
          (submission) =>
            submission.campaign_id === campaignId && submission.athlete_id === athlete.id,
        ),
      );
      // Latest activity wins: an open draft, otherwise the newest submitted row.
      const playerSubmission =
        playerRows.find((submission) => submission.status === "draft") ?? playerRows[0] ?? null;
      const coachRows = data.coachMatrixAssessments.filter(
        (assessment) =>
          assessment.campaign_id === campaignId && assessment.athlete_id === athlete.id,
      );
      const latestPerCoach = new Map<string, CoachMatrixAssessment>();
      for (const assessment of latestFirst(coachRows)) {
        const current = latestPerCoach.get(assessment.coach_profile_id);
        if (!current || (assessment.status === "draft" && current.status !== "draft")) {
          latestPerCoach.set(assessment.coach_profile_id, assessment);
        }
      }
      return {
        athleteId: athlete.id,
        athleteName: displayName(athlete),
        memberStatus: member.status,
        playerSubmission,
        coachAssessments: [...latestPerCoach.values()],
        playerStatus: playerSubmission?.status ?? "not_started",
        playerSubmittedCount: playerRows.filter((row) => row.status === "submitted").length,
        distinctSubmittedCoachCount: new Set(
          coachRows
            .filter((assessment) => assessment.status === "submitted")
            .map((assessment) => assessment.coach_profile_id),
        ).size,
      };
    })
    .filter((row): row is CampaignMatrixStatusRow => row !== null);
}

function buildNpsTasks(
  raterKind: "player" | "coach",
  raterProfileId: string,
  raterAthleteId: string | null,
  campaignId?: string,
): NpsTask[] {
  const data = getData();
  const assignments = data.npsAssignments.filter((assignment) =>
    raterKind === "player"
      ? assignment.athlete_id === raterAthleteId
      : assignment.coach_profile_id === raterProfileId,
  );
  return assignments
    .map((assignment): NpsTask | null => {
      const survey = data.npsSurveys.find((row) => row.id === assignment.survey_id);
      if (
        !survey ||
        survey.status !== "open" ||
        (campaignId && survey.campaign_id !== campaignId)
      ) {
        return null;
      }
      if (
        raterKind === "player"
          ? !raterAthleteId ||
            !isPlayerOnCampaign(data.campaignMembers, survey.campaign_id, raterAthleteId)
          : !isCoachOnCampaign(data.campaignCoaches, survey.campaign_id, raterProfileId)
      ) {
        return null;
      }
      const targets: NpsTaskTarget[] =
        raterKind === "player"
          ? data.campaignCoaches
              .filter((coach) => coach.campaign_id === survey.campaign_id)
              .map((coach) => ({
                id: coach.coach_profile_id,
                kind: "coach" as const,
                name: profileName(coach.coach_profile_id),
                alreadyResponded: data.npsResponses.some(
                  (response) =>
                    response.survey_id === survey.id &&
                    response.rater_profile_id === raterProfileId &&
                    response.subject_coach_profile_id === coach.coach_profile_id,
                ),
              }))
          : data.campaignMembers
              .filter((member) => member.campaign_id === survey.campaign_id)
              .map((member) => {
                const athlete = findAthlete(member.athlete_id);
                return {
                  id: member.athlete_id,
                  kind: "player" as const,
                  name: athlete ? displayName(athlete) : "Unknown athlete",
                  alreadyResponded: data.npsResponses.some(
                    (response) =>
                      response.survey_id === survey.id &&
                      response.rater_profile_id === raterProfileId &&
                      response.subject_athlete_id === member.athlete_id,
                  ),
                };
              });
      return {
        survey,
        assignmentId: assignment.id,
        status: assignment.status,
        targets,
      };
    })
    .filter((task): task is NpsTask => task !== null);
}

function cleanupPendingNpsAssignmentsInMock(params: {
  campaignId: string;
  athleteId?: string;
  coachProfileId?: string;
}) {
  const data = getData();
  const openSurveyIds = new Set(
    data.npsSurveys
      .filter((survey) => survey.campaign_id === params.campaignId && survey.status === "open")
      .map((survey) => survey.id),
  );
  data.npsAssignments = data.npsAssignments.filter((assignment) => {
    if (!openSurveyIds.has(assignment.survey_id)) {
      return true;
    }
    if (params.athleteId) {
      if (assignment.athlete_id !== params.athleteId) {
        return true;
      }
    } else if (params.coachProfileId) {
      if (assignment.coach_profile_id !== params.coachProfileId) {
        return true;
      }
    } else {
      return true;
    }
    const survey = data.npsSurveys.find((row) => row.id === assignment.survey_id);
    return !shouldDropPendingNpsAssignment(assignment, survey, data.npsResponses);
  });
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
    const data = getData();
    const normalized = normalizeEmail(email);
    const profile = data.profiles.find((p) => p.email.toLowerCase() === normalized);
    if (profile) {
      setCurrentUserId(profile.id);
      return { status: "signed_in", profile };
    }
    // Closed-roster first login: an admin-created athlete with this email gets
    // a player profile linked on the spot (mirrors handle_new_user on Supabase).
    const rosterAthlete = data.athletes.find(
      (athlete) => !athlete.profile_id && athlete.email?.toLowerCase() === normalized,
    );
    if (!rosterAthlete) {
      return { status: "unknown_email" };
    }
    const timestamp = now();
    const newProfile = {
      id: generateId("p"),
      email: rosterAthlete.email ?? normalized,
      full_name: rosterAthlete.legal_name,
      preferred_name: rosterAthlete.preferred_name,
      role: "player" as const,
      created_at: timestamp,
      updated_at: timestamp,
    };
    data.profiles.push(newProfile);
    rosterAthlete.profile_id = newProfile.id;
    rosterAthlete.updated_at = timestamp;
    for (const member of data.campaignMembers) {
      if (member.athlete_id === rosterAthlete.id && member.status === "invited") {
        member.status = "registered";
      }
    }
    saveData(data);
    setCurrentUserId(newProfile.id);
    return { status: "signed_in", profile: newProfile };
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

  async createAthlete(input: CreateAthleteInput) {
    const data = getData();
    const fields = athleteFieldsFromCreateInput(input);
    if (!fields.email) {
      throw new Error("Player email is required");
    }
    const emailTaken =
      data.athletes.some((athlete) => athlete.email?.toLowerCase() === fields.email) ||
      data.profiles.some((profile) => profile.email.toLowerCase() === fields.email);
    if (emailTaken) {
      throw new Error("A player or account with this email already exists");
    }
    const timestamp = now();
    const created: Athlete = {
      id: generateId("a"),
      profile_id: null,
      ...fields,
      phone: null,
      telegram_handle: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      passport_expiry: null,
      data_sharing_consent: false,
      media_consent: false,
      profile_status: "incomplete",
      created_at: timestamp,
      updated_at: timestamp,
    };
    data.athletes.push(created);
    saveData(data);
    return created;
  },

  async commitCampaignRosterImport(
    input: CampaignRosterImportInput,
  ): Promise<RosterImportCommitResult> {
    const data = getData();
    const memberAthleteIds = new Set(
      data.campaignMembers
        .filter((member) => member.campaign_id === input.campaignId)
        .map((member) => member.athlete_id),
    );
    const plan = planRosterImport({
      campaignId: input.campaignId,
      rows: input.rows,
      athletes: data.athletes,
      memberAthleteIds,
    });

    let createdAthletes = 0;
    let assignedMembers = 0;
    // Sequential on purpose: each create must land before later rows can match by email.
    for (const action of plan.rows) {
      if (action.kind === "create_and_assign") {
        // eslint-disable-next-line no-await-in-loop -- roster rows must commit in order
        const created = await mockApi.createAthlete(action.fields);
        // eslint-disable-next-line no-await-in-loop -- roster rows must commit in order
        await mockApi.assignCampaignMember({
          campaignId: input.campaignId,
          athleteId: created.id,
          status: action.memberStatus,
        });
        createdAthletes += 1;
        assignedMembers += 1;
        memberAthleteIds.add(created.id);
      } else if (action.kind === "assign_only") {
        // eslint-disable-next-line no-await-in-loop -- roster rows must commit in order
        await mockApi.assignCampaignMember({
          campaignId: input.campaignId,
          athleteId: action.athleteId,
          status: action.memberStatus,
        });
        assignedMembers += 1;
      }
    }

    return {
      plan,
      createdAthletes,
      assignedMembers,
      skipped: plan.counts.skip,
      errors: plan.counts.error,
    };
  },

  async updateAthleteAsAdmin(athleteId: string, patch: AdminAthletePatch) {
    const data = getData();
    const athlete = data.athletes.find((row) => row.id === athleteId);
    if (!athlete) {
      throw new Error("Athlete not found");
    }
    if (patch.email !== undefined) {
      const nextEmail = patch.email ? normalizeEmail(patch.email) : null;
      if (nextEmail !== (athlete.email?.toLowerCase() ?? null) && athlete.profile_id) {
        throw new Error("Email cannot be changed after the player has logged in");
      }
      patch = { ...patch, email: nextEmail };
    }
    Object.assign(athlete, patch);
    athlete.updated_at = now();
    saveData(data);
    return athlete;
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

  async unassignCampaignMember(input: CampaignMemberUnassignment) {
    const data = getData();
    const index = data.campaignMembers.findIndex(
      (member) => member.campaign_id === input.campaignId && member.athlete_id === input.athleteId,
    );
    if (index === -1) {
      throw new Error("Player is not on this campaign roster");
    }
    data.campaignMembers.splice(index, 1);
    cleanupPendingNpsAssignmentsInMock({
      campaignId: input.campaignId,
      athleteId: input.athleteId,
    });
    saveData(data);
  },

  async listCoachProfiles() {
    return getData().profiles.filter((profile) => profile.role === "coach");
  },

  async listCampaignCoaches(campaignId: string): Promise<CampaignCoachView[]> {
    const data = getData();
    return data.campaignCoaches
      .filter((row) => row.campaign_id === campaignId)
      .map((row) => {
        const profile = findProfile(row.coach_profile_id);
        return {
          id: row.id,
          campaignId: row.campaign_id,
          coachProfileId: row.coach_profile_id,
          coachRole: row.coach_role,
          email: profile?.email ?? "",
          name: profile ? profileName(row.coach_profile_id) : row.coach_profile_id,
        };
      });
  },

  async assignCampaignCoach(input: CampaignCoachAssignment) {
    const data = getData();
    const profile = findProfile(input.coachProfileId);
    if (!profile || profile.role !== "coach") {
      throw new Error("Coach profile not found");
    }
    const existing = data.campaignCoaches.find(
      (row) =>
        row.campaign_id === input.campaignId && row.coach_profile_id === input.coachProfileId,
    );
    if (existing) {
      existing.coach_role = "coach";
      saveData(data);
      return;
    }
    data.campaignCoaches.push({
      id: generateId("cc"),
      campaign_id: input.campaignId,
      coach_profile_id: input.coachProfileId,
      coach_role: "coach",
      created_at: now(),
    });
    saveData(data);
  },

  async unassignCampaignCoach(input: CampaignCoachAssignment) {
    const data = getData();
    const index = data.campaignCoaches.findIndex(
      (row) =>
        row.campaign_id === input.campaignId && row.coach_profile_id === input.coachProfileId,
    );
    if (index === -1) {
      throw new Error("Coach is not assigned to this campaign");
    }
    data.campaignCoaches.splice(index, 1);
    cleanupPendingNpsAssignmentsInMock({
      campaignId: input.campaignId,
      coachProfileId: input.coachProfileId,
    });
    saveData(data);
  },

  async createCoachProfile(input: CreateCoachProfileInput) {
    const data = getData();
    const email = normalizeEmail(input.email);
    if (!email) {
      throw new Error("Coach email is required");
    }
    if (!input.fullName.trim()) {
      throw new Error("Coach name is required");
    }
    const emailTaken =
      data.profiles.some((profile) => profile.email.toLowerCase() === email) ||
      data.athletes.some((athlete) => athlete.email?.toLowerCase() === email);
    if (emailTaken) {
      throw new Error("An account with this email already exists");
    }
    const timestamp = now();
    const created = {
      id: generateId("p"),
      email,
      full_name: input.fullName.trim(),
      preferred_name: null,
      role: "coach" as const,
      created_at: timestamp,
      updated_at: timestamp,
    };
    data.profiles.push(created);
    saveData(data);
    return created;
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
        (total, row) => total + row.distinctSubmittedCoachCount,
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

  async getPlayerMatrixDraft(campaignId: string, athleteId: string) {
    return findPlayerMatrixDraft(campaignId, athleteId);
  },

  async listPlayerMatrixSubmissions(campaignId: string, athleteId: string) {
    return latestFirst(
      getData().playerMatrixSubmissions.filter(
        (submission) =>
          submission.campaign_id === campaignId &&
          submission.athlete_id === athleteId &&
          submission.status === "submitted",
      ),
    );
  },

  async savePlayerMatrixSubmission(input: PlayerMatrixInput) {
    assertCampaignMember(input.campaignId, input.athleteId);
    assertOwnAthlete(input.submittedBy, input.athleteId);
    const data = getData();
    // Saves always target the open draft; submitted rows are immutable history.
    const draft = findPlayerMatrixDraft(input.campaignId, input.athleteId);
    const eventType = auditEventForSave(draft, input.status);
    const next = playerMatrixPayload(input, draft ?? undefined);
    if (draft) {
      Object.assign(draft, next);
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

  async getCoachMatrixDraft(campaignId: string, athleteId: string, coachProfileId: string) {
    return findCoachMatrixDraft(campaignId, athleteId, coachProfileId);
  },

  async listCoachMatrixAssessments(campaignId: string, athleteId: string) {
    return latestFirst(
      getData().coachMatrixAssessments.filter(
        (assessment) =>
          assessment.campaign_id === campaignId &&
          assessment.athlete_id === athleteId &&
          assessment.status === "submitted",
      ),
    );
  },

  async saveCoachMatrixAssessment(input: CoachMatrixInput) {
    assertCampaignMember(input.campaignId, input.athleteId);
    assertAssignedCoach(input.campaignId, input.coachProfileId);
    const data = getData();
    const draft = findCoachMatrixDraft(input.campaignId, input.athleteId, input.coachProfileId);
    const eventType = auditEventForSave(draft, input.status);
    const next = coachMatrixPayload(input, draft ?? undefined);
    if (draft) {
      Object.assign(draft, next);
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
      min_player_rater_count: input.minPlayerRaterCount ?? DEFAULT_NPS_MIN_PLAYER_RATER_COUNT,
      min_coach_rater_count: input.minCoachRaterCount ?? DEFAULT_NPS_MIN_COACH_RATER_COUNT,
      created_by: existing?.created_by ?? input.createdBy,
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
    };
    if (existing) {
      Object.assign(existing, survey);
    } else {
      data.npsSurveys.push(survey);
    }

    // Every roster player rates each coach; every campaign coach rates each player.
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
          rater_kind: "player",
          athlete_id: member.athlete_id,
          coach_profile_id: null,
          status: "pending",
          completed_at: null,
          created_at: timestamp,
        });
      }
    }
    const coaches = data.campaignCoaches.filter((coach) => coach.campaign_id === input.campaignId);
    for (const coach of coaches) {
      const alreadyAssigned = data.npsAssignments.some(
        (assignment) =>
          assignment.survey_id === survey.id &&
          assignment.coach_profile_id === coach.coach_profile_id,
      );
      if (!alreadyAssigned) {
        data.npsAssignments.push({
          id: generateId("npsa"),
          survey_id: survey.id,
          rater_kind: "coach",
          athlete_id: null,
          coach_profile_id: coach.coach_profile_id,
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
    return athlete ? buildNpsTasks("player", profileId, athlete.id, campaignId) : [];
  },

  async listCoachNpsTasks(coachProfileId: string, campaignId?: string) {
    return buildNpsTasks("coach", coachProfileId, null, campaignId);
  },

  async submitNpsResponse(input: NpsResponseInput) {
    if (input.score < 0 || input.score > 10) {
      throw new Error("NPS score must be between 0 and 10");
    }
    if (!input.subjectCoachProfileId === !input.subjectAthleteId) {
      throw new Error("NPS response needs exactly one subject");
    }
    const data = getData();
    const assignment = data.npsAssignments.find(
      (row) => row.id === input.assignmentId && row.survey_id === input.surveyId,
    );
    const survey = data.npsSurveys.find((row) => row.id === input.surveyId);
    if (!assignment || !survey || survey.status !== "open") {
      throw new Error("NPS survey is not open for this rater");
    }
    if (assignment.rater_kind === "player") {
      const athlete = data.athletes.find((row) => row.profile_id === input.raterProfileId);
      if (!athlete || !isPlayerOnCampaign(data.campaignMembers, survey.campaign_id, athlete.id)) {
        throw new Error("You are not on this campaign roster");
      }
    } else if (!isCoachOnCampaign(data.campaignCoaches, survey.campaign_id, input.raterProfileId)) {
      throw new Error("You are not assigned to this campaign");
    }
    const existing = data.npsResponses.find(
      (response) =>
        response.survey_id === input.surveyId &&
        response.rater_profile_id === input.raterProfileId &&
        (input.subjectCoachProfileId
          ? response.subject_coach_profile_id === input.subjectCoachProfileId
          : response.subject_athlete_id === input.subjectAthleteId),
    );
    const timestamp = now();
    const response = {
      id: existing?.id ?? generateId("npsr"),
      survey_id: input.surveyId,
      assignment_id: input.assignmentId,
      rater_profile_id: input.raterProfileId,
      subject_athlete_id: input.subjectAthleteId ?? null,
      subject_coach_profile_id: input.subjectCoachProfileId ?? null,
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

    const targetCount =
      assignment.rater_kind === "player"
        ? data.campaignCoaches.filter((coach) => coach.campaign_id === survey.campaign_id).length
        : data.campaignMembers.filter((member) => member.campaign_id === survey.campaign_id).length;
    const responseCount = data.npsResponses.filter(
      (row) => row.survey_id === survey.id && row.rater_profile_id === input.raterProfileId,
    ).length;
    if (targetCount > 0 && responseCount >= targetCount) {
      assignment.status = "completed";
      assignment.completed_at = timestamp;
    }
    saveData(data);
  },

  async getNpsReport(campaignId: string): Promise<NpsReport> {
    const data = getData();
    const surveys = data.npsSurveys.filter((survey) => survey.campaign_id === campaignId);
    const coaches = data.campaignCoaches.filter((coach) => coach.campaign_id === campaignId);
    const members = data.campaignMembers.filter((member) => member.campaign_id === campaignId);
    const coachRows = surveys.flatMap((survey) =>
      coaches.map((coach) => {
        const responses = data.npsResponses.filter(
          (response) =>
            response.survey_id === survey.id &&
            response.subject_coach_profile_id === coach.coach_profile_id,
        );
        const aggregate = aggregateNps(responses, survey.min_player_rater_count);
        return Object.assign(
          {
            surveyId: survey.id,
            surveyTitle: survey.title,
            surveyWindow: survey.survey_window,
            coachProfileId: coach.coach_profile_id,
            coachName: profileName(coach.coach_profile_id),
          },
          aggregate,
        );
      }),
    );
    const playerRows = surveys.flatMap((survey) =>
      members.map((member) => {
        const athlete = findAthlete(member.athlete_id);
        const responses = data.npsResponses.filter(
          (response) =>
            response.survey_id === survey.id && response.subject_athlete_id === member.athlete_id,
        );
        const aggregate = aggregateNps(responses, survey.min_coach_rater_count);
        return Object.assign(
          {
            surveyId: survey.id,
            surveyTitle: survey.title,
            surveyWindow: survey.survey_window,
            athleteId: member.athlete_id,
            athleteName: athlete ? displayName(athlete) : "Unknown athlete",
          },
          aggregate,
        );
      }),
    );
    return { coachRows, playerRows };
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
          gender: a.gender,
          positions: a.positions,
          date_of_birth: a.date_of_birth,
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

  async commitQuestionnaireImport(input: CampaignQuestionnaireImportInput) {
    const data = getData();
    const result = mockCommitQuestionnaireImport(data, input, () => generateId("survey"));
    saveData(data);
    return result;
  },

  async listSurveyTemplates(campaignId: string) {
    return getData()
      .surveyTemplates.filter((template) => template.campaign_id === campaignId)
      .toSorted((a, b) => a.audience.localeCompare(b.audience) || b.version - a.version);
  },

  async getSurveyTemplateBundle(templateId: string) {
    const data = getData();
    const template = data.surveyTemplates.find((row) => row.id === templateId);
    if (!template) {
      return null;
    }
    const sections = data.surveySections
      .filter((section) => section.template_id === templateId)
      .toSorted((a, b) => a.sort_order - b.sort_order);
    const sectionIds = new Set(sections.map((section) => section.id));
    const questions = data.surveyQuestions
      .filter((question) => sectionIds.has(question.section_id))
      .toSorted((a, b) => a.sort_order - b.sort_order);
    return { template, sections, questions };
  },

  async publishSurveyTemplate(templateId: string, publishedBy: string) {
    const data = getData();
    const bundle = mockPublishSurveyTemplate(data, templateId, publishedBy);
    saveData(data);
    return bundle;
  },

  async listSurveyInstances(campaignId: string) {
    return getData()
      .surveyInstances.filter((instance) => instance.campaign_id === campaignId)
      .toSorted((a, b) => a.audience.localeCompare(b.audience));
  },

  async openSurveyInstance(input) {
    const data = getData();
    const instance = mockOpenSurveyInstance(data, input, () => generateId("survey"));
    saveData(data);
    return instance;
  },

  async closeSurveyInstance(instanceId: string) {
    const data = getData();
    const instance = mockCloseSurveyInstance(data, instanceId);
    saveData(data);
    return instance;
  },

  async listSurveyCompletion(campaignId: string) {
    return mockListSurveyCompletion(getData(), campaignId);
  },

  async getSurveySectionAggregates(campaignId, audience) {
    return mockGetSurveySectionAggregates(getData(), campaignId, audience);
  },

  async getMySurveyAssignment(profileId: string, campaignId: string) {
    return mockGetMySurveyAssignment(getData(), profileId, campaignId);
  },

  async saveSurveyAnswers(input) {
    const data = getData();
    const bundle = mockSaveSurveyAnswers(data, input, () => generateId("survey"));
    saveData(data);
    return bundle;
  },
};
