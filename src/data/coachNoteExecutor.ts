import type { CoachNoteActionRequest, CoachNoteGenerationResult } from "../lib/coachNotes";
import {
  buildAccumulatedInput,
  COACH_NOTE_MAX_TURNS,
  COACH_NOTE_PROMPT_VERSION,
  countAmbiguities,
  createDeterministicCoachNoteDraft,
} from "../lib/coachNotes";

export interface CoachNoteSessionRecord {
  id: string;
  campaign_id: string;
  athlete_id: string;
  coach_profile_id: string;
  accumulated_input: string;
  turn_count: number;
  status: "active" | "completed";
  created_at: string;
  updated_at: string;
}

export interface CoachNotePersistence {
  assertCoachAssignment(
    campaignId: string,
    athleteId: string,
    coachProfileId: string,
  ): Promise<void>;
  findSession(input: {
    sessionId?: string;
    campaignId: string;
    athleteId: string;
    coachProfileId: string;
  }): Promise<CoachNoteSessionRecord | null>;
  createSession(input: {
    campaignId: string;
    athleteId: string;
    coachProfileId: string;
    accumulatedInput: string;
    now: string;
  }): Promise<CoachNoteSessionRecord>;
  updateSession(
    sessionId: string,
    input: { accumulatedInput: string; turnCount: number; now: string },
  ): Promise<void>;
  insertRun(input: {
    campaignId: string;
    athleteId: string;
    coachProfileId: string;
    accumulatedInput: string;
    draft: ReturnType<typeof createDeterministicCoachNoteDraft>;
    ambiguityCount: number;
    sessionId: string;
    turnIndex: number;
    now: string;
  }): Promise<{ id: string }>;
  insertTurn(input: {
    sessionId: string;
    turnIndex: number;
    action: CoachNoteActionRequest["action"];
    payload: Record<string, unknown>;
    draft: ReturnType<typeof createDeterministicCoachNoteDraft>;
    runId: string;
    now: string;
  }): Promise<void>;
}

const DETERMINISTIC_MODEL = "deterministic-structurer";

export async function executeDeterministicCoachNoteAction(
  input: CoachNoteActionRequest,
  coachProfileId: string,
  persistence: CoachNotePersistence,
  now: () => string = () => new Date().toISOString(),
): Promise<CoachNoteGenerationResult> {
  await persistence.assertCoachAssignment(input.campaignId, input.athleteId, coachProfileId);

  const session = await persistence.findSession({
    sessionId: input.sessionId,
    campaignId: input.campaignId,
    athleteId: input.athleteId,
    coachProfileId,
  });
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
  const timestamp = now();

  const activeSession =
    session ??
    (await persistence.createSession({
      campaignId: input.campaignId,
      athleteId: input.athleteId,
      coachProfileId,
      accumulatedInput,
      now: timestamp,
    }));

  const run = await persistence.insertRun({
    campaignId: input.campaignId,
    athleteId: input.athleteId,
    coachProfileId,
    accumulatedInput,
    draft,
    ambiguityCount,
    sessionId: activeSession.id,
    turnIndex,
    now: timestamp,
  });

  await persistence.insertTurn({
    sessionId: activeSession.id,
    turnIndex,
    action: input.action,
    payload: {
      clarifications: input.clarifications ?? [],
      additionalNotes: input.additionalNotes ?? "",
      section: input.section ?? null,
    },
    draft,
    runId: run.id,
    now: timestamp,
  });

  await persistence.updateSession(activeSession.id, {
    accumulatedInput,
    turnCount: turnIndex + 1,
    now: timestamp,
  });

  return {
    runId: run.id,
    source: "deterministic",
    promptVersion: COACH_NOTE_PROMPT_VERSION,
    model: DETERMINISTIC_MODEL,
    latencyMs: 0,
    estimatedCostUsd: 0,
    repairCount: 0,
    redactedNotes: accumulatedInput,
    draft,
    ambiguityCount,
    sessionId: activeSession.id,
    turnIndex,
    accumulatedInput,
  };
}
