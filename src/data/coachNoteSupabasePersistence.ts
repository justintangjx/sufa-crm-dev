import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachNotePersistence } from "./coachNoteExecutor";

export function createSupabaseCoachNotePersistence(client: SupabaseClient): CoachNotePersistence {
  return {
    async assertCoachAssignment(campaignId, athleteId, coachProfileId) {
      const [{ data: profile }, { data: assignment }, { data: athlete }] = await Promise.all([
        client.from("profiles").select("role").eq("id", coachProfileId).maybeSingle(),
        client
          .from("campaign_coaches")
          .select("id")
          .eq("campaign_id", campaignId)
          .eq("coach_profile_id", coachProfileId)
          .maybeSingle(),
        client
          .from("coach_athlete_view")
          .select("id")
          .eq("campaign_id", campaignId)
          .eq("id", athleteId)
          .maybeSingle(),
      ]);
      if (profile?.role !== "coach" || !assignment || !athlete) {
        throw new Error("Coach is not assigned to this athlete");
      }
    },

    async findSession({ sessionId, campaignId, athleteId, coachProfileId }) {
      if (!sessionId) {
        return null;
      }
      const { data, error } = await client
        .from("coach_note_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("coach_profile_id", coachProfileId)
        .eq("campaign_id", campaignId)
        .eq("athlete_id", athleteId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data;
    },

    async createSession({ campaignId, athleteId, coachProfileId, accumulatedInput, now }) {
      const { data, error } = await client
        .from("coach_note_sessions")
        .insert({
          campaign_id: campaignId,
          athlete_id: athleteId,
          coach_profile_id: coachProfileId,
          accumulated_input: accumulatedInput,
          turn_count: 0,
          status: "active",
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return data;
    },

    async updateSession(sessionId, { accumulatedInput, turnCount, now }) {
      const { error } = await client
        .from("coach_note_sessions")
        .update({
          accumulated_input: accumulatedInput,
          turn_count: turnCount,
          updated_at: now,
        })
        .eq("id", sessionId);
      if (error) {
        throw error;
      }
    },

    async insertRun({
      campaignId,
      athleteId,
      coachProfileId,
      accumulatedInput,
      draft,
      ambiguityCount,
      sessionId,
      turnIndex,
      now,
    }) {
      const { data, error } = await client
        .from("coach_note_generation_runs")
        .insert({
          campaign_id: campaignId,
          athlete_id: athleteId,
          coach_profile_id: coachProfileId,
          schema_version: 1,
          prompt_version: "coach-notes-v1",
          provider: "client",
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
          ambiguity_count: ambiguityCount,
          session_id: sessionId,
          turn_index: turnIndex,
          created_at: now,
        })
        .select("id")
        .single();
      if (error) {
        throw error;
      }
      return { id: data.id };
    },

    async insertTurn({ sessionId, turnIndex, action, payload, draft, runId, now }) {
      const { error } = await client.from("coach_note_turns").insert({
        session_id: sessionId,
        turn_index: turnIndex,
        action,
        payload,
        draft_snapshot: draft,
        run_id: runId,
        created_at: now,
      });
      if (error) {
        throw error;
      }
    },
  };
}
