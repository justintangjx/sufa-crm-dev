import type { CoachNotePersistence } from "./coachNoteExecutor";
import { generateId, getData, saveData } from "./store";
import type { CoachNoteGenerationRun, CoachNoteSession, CoachNoteTurn } from "../types/database";

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

export function createMockCoachNotePersistence(coachProfileId: string): CoachNotePersistence {
  return {
    async assertCoachAssignment(campaignId, athleteId) {
      assertCoachAssignment(campaignId, athleteId, coachProfileId);
    },

    async findSession({ sessionId, campaignId, athleteId }) {
      if (!sessionId) {
        return null;
      }
      const session = getData().coachNoteSessions.find(
        (row) =>
          row.id === sessionId &&
          row.coach_profile_id === coachProfileId &&
          row.campaign_id === campaignId &&
          row.athlete_id === athleteId,
      );
      return session ?? null;
    },

    async createSession({ campaignId, athleteId, coachProfileId: ownerId, accumulatedInput, now }) {
      const session: CoachNoteSession = {
        id: generateId("coach-session"),
        campaign_id: campaignId,
        athlete_id: athleteId,
        coach_profile_id: ownerId,
        accumulated_input: accumulatedInput,
        turn_count: 0,
        status: "active",
        created_at: now,
        updated_at: now,
      };
      getData().coachNoteSessions.push(session);
      saveData(getData());
      return session;
    },

    async updateSession(sessionId, { accumulatedInput, turnCount, now }) {
      const session = getData().coachNoteSessions.find((row) => row.id === sessionId);
      if (!session) {
        throw new Error("Coach note session not found");
      }
      session.accumulated_input = accumulatedInput;
      session.turn_count = turnCount;
      session.updated_at = now;
      saveData(getData());
    },

    async insertRun({
      campaignId,
      athleteId,
      coachProfileId: ownerId,
      accumulatedInput,
      draft,
      ambiguityCount,
      sessionId,
      turnIndex,
      now,
    }) {
      const run: CoachNoteGenerationRun = {
        id: generateId("coach-note"),
        campaign_id: campaignId,
        athlete_id: athleteId,
        coach_profile_id: ownerId,
        schema_version: 1,
        prompt_version: "coach-notes-v1",
        provider: "mock",
        model: "deterministic-structurer",
        source: "deterministic",
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
        session_id: sessionId,
        turn_index: turnIndex,
        created_at: now,
      };
      getData().coachNoteGenerationRuns.push(run);
      saveData(getData());
      return { id: run.id };
    },

    async insertTurn({ sessionId, turnIndex, action, payload, draft, runId, now }) {
      const turn: CoachNoteTurn = {
        id: generateId("coach-turn"),
        session_id: sessionId,
        turn_index: turnIndex,
        action,
        payload,
        draft_snapshot: draft,
        run_id: runId,
        created_at: now,
      };
      getData().coachNoteTurns.push(turn);
      saveData(getData());
    },
  };
}
