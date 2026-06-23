import type { CoachNoteActionRequest, CoachNoteGenerationResult } from "../lib/coachNotes";
import { buildAccumulatedInput } from "../lib/coachNotes";
import { ensureDemoCoachSupabaseClient, mapDemoCoachNoteIds } from "../lib/demoCoachLlm";
import { demoCoachLlmConfigError } from "../lib/demoCoachLlmConfig";
import { useMockBackend } from "../lib/env";
import { supabase } from "../lib/supabase";

async function coachNoteClient() {
  if (useMockBackend) {
    return ensureDemoCoachSupabaseClient();
  }
  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }
  return supabase;
}

export async function invokeCoachNoteAction(
  input: CoachNoteActionRequest,
): Promise<CoachNoteGenerationResult> {
  if (useMockBackend && demoCoachLlmConfigError) {
    throw new Error(demoCoachLlmConfigError);
  }
  const client = await coachNoteClient();
  const mapped = mapDemoCoachNoteIds(input);
  const accumulatedInput = buildAccumulatedInput(
    mapped.roughNotes,
    mapped.clarifications ?? [],
    mapped.additionalNotes ?? "",
  );
  const { data, error } = await client.functions.invoke("structure-coach-notes", {
    body: {
      campaignId: mapped.campaignId,
      athleteId: mapped.athleteId,
      roughNotes: mapped.roughNotes,
      action: mapped.action,
      sessionId: mapped.sessionId,
      clarifications: mapped.clarifications ?? [],
      additionalNotes: mapped.additionalNotes ?? "",
      section: mapped.section,
    },
  });
  if (error) {
    throw error;
  }
  const result = data as CoachNoteGenerationResult;
  return {
    ...result,
    accumulatedInput: result.accumulatedInput ?? accumulatedInput,
  };
}

export async function submitRemoteCoachNoteFeedback(input: {
  runId: string;
  feedback: "useful" | "incorrect" | "missing_context";
}): Promise<void> {
  const client = await coachNoteClient();
  const { error } = await client
    .from("coach_note_generation_runs")
    .update({
      feedback: input.feedback,
      feedback_at: new Date().toISOString(),
    })
    .eq("id", input.runId);
  if (error) {
    throw error;
  }
}

export async function recordRemoteCoachNoteEditMetrics(input: {
  runId: string;
  fieldEditCount: number;
  normalizedEditDistance: number;
}): Promise<void> {
  const client = await coachNoteClient();
  const { error } = await client
    .from("coach_note_generation_runs")
    .update({
      field_edit_count: input.fieldEditCount,
      normalized_edit_distance: input.normalizedEditDistance,
    })
    .eq("id", input.runId);
  if (error) {
    throw error;
  }
}
