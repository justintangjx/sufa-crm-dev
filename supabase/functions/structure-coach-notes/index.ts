import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.0";
import {
  PROMPT_VERSION,
  SCHEMA_VERSION,
  validateDraft,
  type CoachNoteDraft,
} from "../_shared/coach-note-contract.ts";
import { OpenAiCompatibleCoachNoteGenerator } from "../_shared/coach-note-provider.ts";
import {
  buildAccumulatedInput,
  COACH_NOTE_MAX_TURNS,
  type CoachNoteRequestPayload,
} from "../_shared/coach-note-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`missing_env_${name.toLowerCase()}`);
  }
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactNotes(notes: string, athleteNames: string[]): string {
  let redacted = notes
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/(?:\+?65[\s-]?)?[689]\d{3}[\s-]?\d{4}\b/g, "[phone redacted]")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "[identifier redacted]",
    );
  for (const name of athleteNames.filter((value) => value.trim().length >= 3)) {
    redacted = redacted.replace(new RegExp(`\\b${escapeRegExp(name.trim())}\\b`, "gi"), "[player]");
  }
  return redacted;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "provider_timeout";
  }
  if (error instanceof Error && /^[a-z0-9_]+$/i.test(error.message)) {
    return error.message.slice(0, 80);
  }
  return "generation_failed";
}

function estimatedCost(inputTokens: number | null, outputTokens: number | null): number | null {
  if (inputTokens === null || outputTokens === null) {
    return null;
  }
  const inputRate = Number(Deno.env.get("COACH_NOTE_INPUT_COST_PER_MILLION") ?? "0");
  const outputRate = Number(Deno.env.get("COACH_NOTE_OUTPUT_COST_PER_MILLION") ?? "0");
  return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
}

function countAmbiguities(draft: CoachNoteDraft): number {
  return draft.ambiguities.length;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return json(401, { error: "authentication_required" });
  }

  const startedAt = Date.now();
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const authenticated = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const {
    data: { user },
  } = await authenticated.auth.getUser();
  if (!user) {
    return json(401, { error: "authentication_required" });
  }

  let payload: CoachNoteRequestPayload;
  try {
    payload = (await request.json()) as CoachNoteRequestPayload;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const campaignId = payload.campaignId?.trim() ?? "";
  const athleteId = payload.athleteId?.trim() ?? "";
  const roughNotes = payload.roughNotes?.trim() ?? "";
  const action = payload.action ?? "structure";
  const sessionId = payload.sessionId?.trim() || null;
  const clarifications = Array.isArray(payload.clarifications) ? payload.clarifications : [];
  const additionalNotes = payload.additionalNotes?.trim() ?? "";
  const section = payload.section?.trim() || undefined;

  if (!campaignId || !athleteId || roughNotes.length === 0 || roughNotes.length > 10_000) {
    return json(400, { error: "invalid_request" });
  }

  const [
    { data: profile, error: profileError },
    { data: assignment, error: assignmentError },
    { data: membership, error: membershipError },
  ] = await Promise.all([
    authenticated.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    authenticated
      .from("campaign_coaches")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("coach_profile_id", user.id)
      .maybeSingle(),
    authenticated
      .from("campaign_members")
      .select("athlete_id")
      .eq("campaign_id", campaignId)
      .eq("athlete_id", athleteId)
      .maybeSingle(),
  ]);

  if (profileError) {
    console.error("assignment_lookup_profiles", profileError);
    return json(500, {
      error: "assignment_lookup_failed",
      stage: "profiles",
      code: profileError.code,
    });
  }
  if (assignmentError) {
    console.error("assignment_lookup_campaign_coaches", assignmentError);
    return json(500, {
      error: "assignment_lookup_failed",
      stage: "campaign_coaches",
      code: assignmentError.code,
    });
  }
  if (membershipError) {
    console.error("assignment_lookup_campaign_members", membershipError);
    return json(500, {
      error: "assignment_lookup_failed",
      stage: "campaign_members",
      code: membershipError.code,
    });
  }
  if (profile?.role !== "coach") {
    return json(403, { error: "coach_role_required" });
  }
  if (!assignment) {
    return json(403, { error: "coach_campaign_assignment_required" });
  }
  if (!membership) {
    return json(403, { error: "athlete_not_in_campaign" });
  }

  const { data: athlete, error: athleteError } = await authenticated
    .from("coach_athlete_view")
    .select("id, legal_name, preferred_name")
    .eq("campaign_id", campaignId)
    .eq("id", athleteId)
    .maybeSingle();
  if (athleteError) {
    console.error("assignment_lookup_coach_athlete_view", athleteError);
    return json(500, {
      error: "assignment_lookup_failed",
      stage: "coach_athlete_view",
      code: athleteError.code,
    });
  }
  if (!athlete) {
    return json(403, { error: "athlete_not_found" });
  }

  const accumulatedInput = buildAccumulatedInput(roughNotes, clarifications, additionalNotes);
  const redactedNotes = redactNotes(
    accumulatedInput,
    [athlete.legal_name, athlete.preferred_name].filter(
      (value): value is string => typeof value === "string",
    ),
  );

  let activeSessionId = sessionId;
  let turnIndex = 0;

  if (sessionId) {
    const { data: existingSession } = await authenticated
      .from("coach_note_sessions")
      .select("id, turn_count, coach_profile_id, campaign_id, athlete_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (
      !existingSession ||
      existingSession.coach_profile_id !== user.id ||
      existingSession.campaign_id !== campaignId ||
      existingSession.athlete_id !== athleteId
    ) {
      return json(403, { error: "coach_session_required" });
    }
    if (existingSession.turn_count >= COACH_NOTE_MAX_TURNS) {
      return json(429, { error: "coach_session_turn_limit" });
    }
    turnIndex = existingSession.turn_count;
  } else {
    const { data: createdSession, error: sessionError } = await authenticated
      .from("coach_note_sessions")
      .insert({
        campaign_id: campaignId,
        athlete_id: athleteId,
        coach_profile_id: user.id,
        accumulated_input: redactedNotes,
        turn_count: 0,
        status: "active",
      })
      .select("id")
      .single();
    if (sessionError || !createdSession) {
      return json(500, { error: "session_write_failed" });
    }
    activeSessionId = createdSession.id;
    turnIndex = 0;
  }

  const provider = new OpenAiCompatibleCoachNoteGenerator(
    requiredEnv("COACH_NOTE_MODEL"),
    requiredEnv("COACH_NOTE_API_URL"),
    requiredEnv("COACH_NOTE_API_KEY"),
  );

  let draft: CoachNoteDraft | null = null;
  let validationErrors: string[] = [];
  let repairCount = 0;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let errorCode: string | null = null;

  async function generateValidated(attempt: number, deadline: number): Promise<void> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new DOMException("Generation timed out", "TimeoutError");
    }
    const generated = await provider.generate(
      redactedNotes,
      validationErrors,
      AbortSignal.timeout(remaining),
      { section, action },
    );
    draft = generated.draft;
    inputTokens = (inputTokens ?? 0) + (generated.usage.inputTokens ?? 0);
    outputTokens = (outputTokens ?? 0) + (generated.usage.outputTokens ?? 0);
    validationErrors = validateDraft(draft, redactedNotes);
    if (validationErrors.length > 0 && attempt === 0) {
      repairCount = 1;
      await generateValidated(1, deadline);
    }
  }

  try {
    await generateValidated(0, startedAt + 5_000);
    if (!draft || validationErrors.length > 0) {
      throw new Error("output_validation_failed");
    }
  } catch (error) {
    errorCode = safeErrorCode(error);
  }

  const ambiguityCount = draft ? countAmbiguities(draft) : null;

  const runPayload = {
    campaign_id: campaignId,
    athlete_id: athleteId,
    coach_profile_id: user.id,
    schema_version: SCHEMA_VERSION,
    prompt_version: PROMPT_VERSION,
    provider: provider.provider,
    model: provider.model,
    source: "llm",
    status: errorCode ? "failed" : "succeeded",
    redacted_input: redactedNotes,
    redacted_output: errorCode ? null : draft,
    validation_errors: validationErrors,
    latency_ms: Date.now() - startedAt,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: estimatedCost(inputTokens, outputTokens),
    repair_count: repairCount,
    error_code: errorCode,
    ambiguity_count: ambiguityCount,
    session_id: activeSessionId,
    turn_index: turnIndex,
  };
  const { data: run, error: runError } = await authenticated
    .from("coach_note_generation_runs")
    .insert(runPayload)
    .select("id")
    .single();
  if (runError) {
    console.error("coach_note_generation_runs_insert", runError);
    return json(500, { error: "telemetry_write_failed", code: runError.code });
  }

  if (activeSessionId) {
    await authenticated.from("coach_note_turns").insert({
      session_id: activeSessionId,
      turn_index: turnIndex,
      action,
      payload: {
        clarifications,
        additionalNotes,
        section: section ?? null,
      },
      draft_snapshot: errorCode ? null : draft,
      run_id: run.id,
    });
    await authenticated
      .from("coach_note_sessions")
      .update({
        accumulated_input: redactedNotes,
        turn_count: turnIndex + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", activeSessionId);
  }

  if (errorCode || !draft) {
    return json(502, { error: errorCode, runId: run.id, sessionId: activeSessionId });
  }

  const latencyMs = Date.now() - startedAt;
  return json(200, {
    runId: run.id,
    source: "llm",
    promptVersion: PROMPT_VERSION,
    model: provider.model,
    latencyMs,
    estimatedCostUsd: estimatedCost(inputTokens, outputTokens),
    repairCount,
    redactedNotes,
    draft,
    ambiguityCount,
    sessionId: activeSessionId,
    turnIndex,
    accumulatedInput: redactedNotes,
  });
});
