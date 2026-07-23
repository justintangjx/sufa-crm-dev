/** Soft coach assessment cadence for U24 live matrix. DB stays append-only. */

export const SOFT_COACH_ASSESSMENT_TARGET = 2 as const;

export type SoftLimitPhase = "none" | "under" | "at_target" | "over";

export function countOwnSubmittedAssessments(
  history: readonly { status: "draft" | "submitted"; coach_profile_id: string }[],
  coachProfileId: string,
): number {
  return history.filter(
    (row) => row.coach_profile_id === coachProfileId && row.status === "submitted",
  ).length;
}

export function softLimitPhase(
  ownSubmittedCount: number,
  target: typeof SOFT_COACH_ASSESSMENT_TARGET = SOFT_COACH_ASSESSMENT_TARGET,
): SoftLimitPhase {
  if (ownSubmittedCount <= 0) {
    return "none";
  }
  if (ownSubmittedCount < target) {
    return "under";
  }
  if (ownSubmittedCount === target) {
    return "at_target";
  }
  return "over";
}

/** Confirm before starting or submitting another assessment once at/over the soft max. */
export function requiresSoftLimitConfirm(
  ownSubmittedCount: number,
  target: typeof SOFT_COACH_ASSESSMENT_TARGET = SOFT_COACH_ASSESSMENT_TARGET,
): boolean {
  return ownSubmittedCount >= target;
}

export function softLimitCopy(
  phase: SoftLimitPhase,
  ownSubmittedCount: number,
  target: typeof SOFT_COACH_ASSESSMENT_TARGET = SOFT_COACH_ASSESSMENT_TARGET,
): { badge: string; nudge?: string; confirmBody: string } {
  const badge = `${ownSubmittedCount} / ${target} submitted`;
  const confirmBody = `You already have ${ownSubmittedCount} submitted assessment${ownSubmittedCount === 1 ? "" : "s"} for this player (soft maximum ${target}). Continue anyway?`;
  if (phase === "none") {
    return {
      badge,
      nudge: `You have not submitted an assessment for this player yet. Aim for up to ${target} during the campaign.`,
      confirmBody,
    };
  }
  if (phase === "under") {
    return {
      badge,
      nudge: `You have ${ownSubmittedCount} of up to ${target} assessments for this player. You can submit another when ready.`,
      confirmBody,
    };
  }
  if (phase === "at_target") {
    return {
      badge,
      nudge: `You have reached the soft maximum of ${target} assessments for this player. Extra submits need confirmation.`,
      confirmBody,
    };
  }
  return {
    badge,
    nudge: `You are past the soft maximum of ${target} for this player (${ownSubmittedCount} submitted). Extra submits need confirmation.`,
    confirmBody,
  };
}
