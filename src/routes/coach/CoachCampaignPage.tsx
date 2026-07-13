import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { RatingField, TextAreaField, TextField } from "../../components/shell/FormFields";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import type { CampaignMatrixStatusRow, GrowthReviewWithDetails, NpsTask } from "../../data/types";
import { campaignCapabilities } from "../../lib/campaignCapabilities";
import { optionalText } from "../../lib/form";
import type {
  Campaign,
  CoachAthleteView,
  CoachMatrixAssessment,
  MatrixSubmissionStatus,
  PlayerMatrixSubmission,
} from "../../types/database";
import {
  coachMatrixFormFromAssessment,
  coachMatrixInputFromForm,
  emptyCoachMatrixForm,
  type CoachMatrixFormState,
} from "./coachMatrixForm";
import { emptyGrowthMatrixForm, type GrowthMatrixFormState } from "./coachGrowthMatrixForm";

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function scoreSummary(scores: (number | null)[]): string {
  return scores.map((score) => score ?? "-").join(" / ");
}

export function CoachCampaignPage() {
  const { campaignId = "" } = useParams();
  const { profile } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [athletes, setAthletes] = useState<CoachAthleteView[]>([]);
  const [matrixRows, setMatrixRows] = useState<CampaignMatrixStatusRow[]>([]);
  const [coachMatrixForm, setCoachMatrixForm] =
    useState<CoachMatrixFormState>(emptyCoachMatrixForm);
  const [assessmentEditorOpen, setAssessmentEditorOpen] = useState(false);
  const [playerHistory, setPlayerHistory] = useState<PlayerMatrixSubmission[]>([]);
  const [ownAssessmentHistory, setOwnAssessmentHistory] = useState<CoachMatrixAssessment[]>([]);
  const [growthReviews, setGrowthReviews] = useState<GrowthReviewWithDetails[]>([]);
  const [growthForm, setGrowthForm] = useState<GrowthMatrixFormState>(emptyGrowthMatrixForm);
  const [npsTasks, setNpsTasks] = useState<NpsTask[]>([]);
  const [npsScores, setNpsScores] = useState<Record<string, string>>({});
  const [npsComments, setNpsComments] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const loadAthleteAssessmentContext = useCallback(
    async (athleteId: string, coachProfileId: string) => {
      const [draft, nextPlayerHistory, assessments] = await Promise.all([
        api.getCoachMatrixDraft(campaignId, athleteId, coachProfileId),
        api.listPlayerMatrixSubmissions(campaignId, athleteId),
        api.listCoachMatrixAssessments(campaignId, athleteId),
      ]);
      const ownHistory = assessments.filter(
        (assessment) => assessment.coach_profile_id === coachProfileId,
      );
      setPlayerHistory(nextPlayerHistory);
      setOwnAssessmentHistory(ownHistory);
      setCoachMatrixForm(coachMatrixFormFromAssessment(draft, athleteId));
      setAssessmentEditorOpen(draft !== null || ownHistory.length === 0);
    },
    [campaignId],
  );

  const load = useCallback(async () => {
    if (!profile) {
      return;
    }
    const nextCampaign = await api.getCampaign(campaignId);
    const nextCaps = campaignCapabilities(nextCampaign);
    const [nextAthletes, nextGrowthReviews, nextMatrixRows, nextNpsTasks] = await Promise.all([
      api.getCoachAthletes(campaignId),
      nextCaps.growthMatrix
        ? api.getCoachGrowthReviews(campaignId, profile.id)
        : Promise.resolve([]),
      nextCaps.liveMatrix ? api.getCampaignMatrixStatus(campaignId) : Promise.resolve([]),
      nextCaps.coachNps ? api.listCoachNpsTasks(profile.id, campaignId) : Promise.resolve([]),
    ]);
    setCampaign(nextCampaign);
    setAthletes(nextAthletes);
    setGrowthReviews(nextGrowthReviews);
    setMatrixRows(nextMatrixRows);
    setNpsTasks(nextNpsTasks);
    setGrowthForm((current) => ({
      ...current,
      athleteId: current.athleteId || nextAthletes[0]?.id || "",
    }));
  }, [campaignId, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  // Select the first player once the roster arrives so the assessment panel
  // has context without an explicit click.
  useEffect(() => {
    if (!profile || coachMatrixForm.athleteId || athletes.length === 0) {
      return;
    }
    const firstAthleteId = athletes[0].id;
    setCoachMatrixForm((current) => ({ ...current, athleteId: firstAthleteId }));
    void loadAthleteAssessmentContext(firstAthleteId, profile.id);
  }, [athletes, coachMatrixForm.athleteId, loadAthleteAssessmentContext, profile]);

  function updateGrowthForm(field: keyof GrowthMatrixFormState, value: string) {
    setGrowthForm((current) => ({ ...current, [field]: value }));
  }

  function updateCoachMatrixForm(field: keyof CoachMatrixFormState, value: string) {
    setCoachMatrixForm((current) => ({ ...current, [field]: value }));
  }

  async function selectCoachMatrixAthlete(athleteId: string) {
    if (!profile) {
      return;
    }
    await loadAthleteAssessmentContext(athleteId, profile.id);
  }

  function startNewAssessment() {
    // Prefill from the latest submitted assessment so coaches adjust, not retype.
    const latest = ownAssessmentHistory[0] ?? null;
    setCoachMatrixForm({
      ...coachMatrixFormFromAssessment(latest, coachMatrixForm.athleteId),
      id: undefined,
      status: "draft",
    });
    setAssessmentEditorOpen(true);
    setMessage(null);
  }

  function editGrowthReview(review: GrowthReviewWithDetails) {
    setGrowthForm({
      id: review.id,
      athleteId: review.athlete_id,
      quarterLabel: review.quarter_label,
      skillScore: String(review.skill_score),
      growthPotentialScore: String(review.growth_potential_score),
      rationale: review.rationale,
    });
  }

  async function saveGrowthDraft() {
    if (!profile || !growthForm.athleteId || !growthForm.rationale.trim()) {
      setMessage("Choose a player and add a written rationale before saving.");
      return;
    }
    const saved = await api.saveGrowthReviewDraft({
      id: growthForm.id,
      campaignId,
      athleteId: growthForm.athleteId,
      coachProfileId: profile.id,
      quarterLabel: growthForm.quarterLabel,
      skillScore: Number(growthForm.skillScore),
      growthPotentialScore: Number(growthForm.growthPotentialScore),
      rationale: growthForm.rationale,
    });
    editGrowthReview(saved);
    setMessage("Growth matrix draft saved. It still needs two-coach sign-off before sharing.");
    await load();
  }

  async function signGrowthReview() {
    if (!profile || !growthForm.id) {
      setMessage("Save or select a growth review before signing.");
      return;
    }
    const signed = await api.signGrowthReview(growthForm.id, profile.id);
    editGrowthReview(signed);
    setMessage(
      signed.signoffs.length >= 2
        ? "Second sign-off recorded. Admin can now share this placement."
        : "Sign-off recorded. A second coach must sign before sharing.",
    );
    await load();
  }

  async function saveCoachMatrix(status: MatrixSubmissionStatus) {
    if (!profile || !coachMatrixForm.athleteId) {
      setMessage("Choose a player before saving a matrix assessment.");
      return;
    }
    await api.saveCoachMatrixAssessment(
      coachMatrixInputFromForm(coachMatrixForm, {
        campaignId,
        coachProfileId: profile.id,
        status,
      }),
    );
    setMessage(
      status === "submitted"
        ? "Assessment submitted. It is now a permanent entry in this player's evidence log."
        : "Draft saved. You can keep editing until you submit.",
    );
    const nextMatrixRows = await api.getCampaignMatrixStatus(campaignId);
    setMatrixRows(nextMatrixRows);
    await loadAthleteAssessmentContext(coachMatrixForm.athleteId, profile.id);
  }

  async function submitNps(task: NpsTask, athleteId: string) {
    if (!profile) {
      return;
    }
    const key = `${task.survey.id}:${athleteId}`;
    const score = Number(npsScores[key]);
    if (!Number.isInteger(score) || score < 0 || score > 10) {
      setMessage("Choose an NPS score from 0 to 10 before submitting.");
      return;
    }
    await api.submitNpsResponse({
      surveyId: task.survey.id,
      assignmentId: task.assignmentId,
      raterProfileId: profile.id,
      subjectAthleteId: athleteId,
      score,
      comment: optionalText(npsComments[key]),
    });
    setMessage("Player NPS response submitted anonymously into aggregate reporting.");
    setNpsTasks(await api.listCoachNpsTasks(profile.id, campaignId));
  }

  const latestReviewByAthlete = new Map<string, GrowthReviewWithDetails>();
  for (const review of growthReviews) {
    if (!latestReviewByAthlete.has(review.athlete_id)) {
      latestReviewByAthlete.set(review.athlete_id, review);
    }
  }
  const coachCaps = campaignCapabilities(campaign);
  const showCampaignMatrix = coachCaps.liveMatrix;
  const latestPlayerSelfEvaluation = playerHistory[0] ?? null;

  return (
    <>
      <PageHead
        title={campaign ? `${campaign.name} players` : "Assigned Players"}
        subtitle="Coach-safe player list for this campaign."
        eyebrow="Coach"
      />
      <section className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Player</th>
              <th>Positions</th>
              <th>Profile</th>
              {showCampaignMatrix ? <th>Self-evals</th> : null}
              {showCampaignMatrix ? <th>Your assessment</th> : null}
              {coachCaps.growthMatrix ? <th>Growth Matrix</th> : null}
              {!showCampaignMatrix ? <th>Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => {
              const growthReview = latestReviewByAthlete.get(athlete.id);
              const matrixRow = matrixRows.find((row) => row.athleteId === athlete.id);
              const ownAssessment = matrixRow?.coachAssessments.find(
                (assessment) => assessment.coach_profile_id === profile?.id,
              );
              return (
                <tr key={athlete.id}>
                  <td>{athlete.preferred_name || athlete.legal_name || "Unknown athlete"}</td>
                  <td>{athlete.positions.length > 0 ? athlete.positions.join(", ") : "-"}</td>
                  <td>{athlete.profile_status}</td>
                  {showCampaignMatrix ? (
                    <td>{matrixRow ? `${matrixRow.playerSubmittedCount} submitted` : "-"}</td>
                  ) : null}
                  {showCampaignMatrix ? (
                    <td>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => void selectCoachMatrixAthlete(athlete.id)}
                      >
                        {ownAssessment?.status ?? "not started"}
                      </button>
                    </td>
                  ) : null}
                  {coachCaps.growthMatrix ? (
                    <td>
                      {growthReview ? (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => editGrowthReview(growthReview)}
                        >
                          {growthReview.status}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() =>
                            setGrowthForm((current) => ({ ...current, athleteId: athlete.id }))
                          }
                        >
                          Draft matrix
                        </button>
                      )}
                    </td>
                  ) : null}
                  {!showCampaignMatrix ? (
                    <td>
                      <Link
                        className="btn sm"
                        to={`/coach/evaluations/${campaignId}/${athlete.id}`}
                      >
                        Evaluate
                      </Link>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {showCampaignMatrix ? (
        <section className="card stack">
          <div className="section-title">
            <h2>U24 coach matrix assessment</h2>
            <Badge tone={coachMatrixForm.status === "submitted" ? "ok" : "warn"}>
              {assessmentEditorOpen ? coachMatrixForm.status : "submitted"}
            </Badge>
          </div>
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="coach-matrix-athlete">Player</label>
              <select
                id="coach-matrix-athlete"
                value={coachMatrixForm.athleteId}
                onChange={(event) => void selectCoachMatrixAthlete(event.target.value)}
              >
                {athletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.preferred_name || athlete.legal_name || "Unknown athlete"}
                  </option>
                ))}
              </select>
            </div>
            <div className="note-box">
              {latestPlayerSelfEvaluation ? (
                <>
                  <strong>
                    Latest self-evaluation ({formatDate(latestPlayerSelfEvaluation.submitted_at)})
                  </strong>
                  <p>
                    Scores:{" "}
                    {scoreSummary([
                      latestPlayerSelfEvaluation.skill_score,
                      latestPlayerSelfEvaluation.growth_score,
                      latestPlayerSelfEvaluation.readiness_score,
                      latestPlayerSelfEvaluation.confidence_score,
                    ])}{" "}
                    (skill / growth / readiness / confidence)
                  </p>
                  <p>{latestPlayerSelfEvaluation.strengths ?? "No strengths noted."}</p>
                  <p>
                    {latestPlayerSelfEvaluation.development_focus ?? "No development focus noted."}
                  </p>
                </>
              ) : (
                "This player has not submitted a self-evaluation yet."
              )}
            </div>
          </div>
          {playerHistory.length > 1 ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Self-evaluation</th>
                    <th>Skill / Growth / Readiness / Confidence</th>
                    <th>Development focus</th>
                  </tr>
                </thead>
                <tbody>
                  {playerHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.submitted_at)}</td>
                      <td>
                        {scoreSummary([
                          entry.skill_score,
                          entry.growth_score,
                          entry.readiness_score,
                          entry.confidence_score,
                        ])}
                      </td>
                      <td>{entry.development_focus ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {assessmentEditorOpen ? (
            <>
              <div className="grid cols-4">
                <RatingField
                  label="Skill"
                  value={coachMatrixForm.skillScore}
                  onChange={(value) => updateCoachMatrixForm("skillScore", value)}
                />
                <RatingField
                  label="Growth"
                  value={coachMatrixForm.growthScore}
                  onChange={(value) => updateCoachMatrixForm("growthScore", value)}
                />
                <RatingField
                  label="Readiness"
                  value={coachMatrixForm.readinessScore}
                  onChange={(value) => updateCoachMatrixForm("readinessScore", value)}
                />
                <RatingField
                  label="Tactical"
                  value={coachMatrixForm.tacticalScore}
                  onChange={(value) => updateCoachMatrixForm("tacticalScore", value)}
                />
              </div>
              <TextAreaField
                label="Strengths observed"
                value={coachMatrixForm.strengths}
                onChange={(value) => updateCoachMatrixForm("strengths", value)}
              />
              <TextAreaField
                label="Development focus"
                value={coachMatrixForm.developmentFocus}
                onChange={(value) => updateCoachMatrixForm("developmentFocus", value)}
              />
              <TextAreaField
                label="Coach notes"
                value={coachMatrixForm.coachNotes}
                onChange={(value) => updateCoachMatrixForm("coachNotes", value)}
              />
              <div className="btn-row">
                <button type="button" className="btn" onClick={() => void saveCoachMatrix("draft")}>
                  Save draft
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void saveCoachMatrix("submitted")}
                >
                  Submit assessment
                </button>
              </div>
            </>
          ) : (
            <div className="btn-row">
              <button type="button" className="btn primary" onClick={startNewAssessment}>
                Start new assessment
              </button>
            </div>
          )}
          {ownAssessmentHistory.length > 0 ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Your assessment</th>
                    <th>Skill / Growth / Readiness / Tactical</th>
                    <th>Development focus</th>
                  </tr>
                </thead>
                <tbody>
                  {ownAssessmentHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.submitted_at)}</td>
                      <td>
                        {scoreSummary([
                          entry.skill_score,
                          entry.growth_score,
                          entry.readiness_score,
                          entry.tactical_score,
                        ])}
                      </td>
                      <td>{entry.development_focus ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="muted">
            Submitted assessments are immutable and visible to the player and admin. Each save is
            recorded in the evaluation audit trail.
          </p>
        </section>
      ) : null}
      {coachCaps.coachNps && npsTasks.length > 0 ? (
        <section className="card stack">
          <div className="section-title">
            <h2>Player NPS</h2>
            <Badge>{npsTasks.length} open</Badge>
          </div>
          {npsTasks.map((task) => (
            <div className="nps-task" key={task.assignmentId}>
              <strong>{task.survey.title}</strong>
              <p className="muted">
                Scores are reported only in anonymous aggregate views once the response threshold is
                met.
              </p>
              {task.targets.map((target) => {
                const key = `${task.survey.id}:${target.id}`;
                return (
                  <div className="nps-coach-row" key={target.id}>
                    <div>
                      <strong>{target.name}</strong>
                      <p className="muted">
                        {target.alreadyResponded ? "Response received" : "Score 0-10"}
                      </p>
                    </div>
                    <div className="field compact-field">
                      <label htmlFor={`nps-${key}`}>Score</label>
                      <select
                        id={`nps-${key}`}
                        value={npsScores[key] ?? ""}
                        onChange={(event) =>
                          setNpsScores((current) => ({ ...current, [key]: event.target.value }))
                        }
                        disabled={target.alreadyResponded}
                      >
                        <option value="">-</option>
                        {Array.from({ length: 11 }, (_, score) => (
                          <option key={score} value={score}>
                            {score}
                          </option>
                        ))}
                      </select>
                    </div>
                    <TextField
                      label={`NPS comment ${target.name}`}
                      value={npsComments[key] ?? ""}
                      onChange={(value) =>
                        setNpsComments((current) => ({ ...current, [key]: value }))
                      }
                      placeholder="Optional"
                    />
                    <button
                      type="button"
                      className="btn sm"
                      disabled={target.alreadyResponded}
                      onClick={() => void submitNps(task, target.id)}
                    >
                      Submit NPS
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ) : null}
      {coachCaps.growthMatrix ? (
        <section className="card stack">
          <div className="section-title">
            <h2>Growth Matrix review</h2>
            <Badge>two-coach sign-off</Badge>
          </div>
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="growth-athlete">Player</label>
              <select
                id="growth-athlete"
                value={growthForm.athleteId}
                onChange={(event) => updateGrowthForm("athleteId", event.target.value)}
              >
                {athletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.preferred_name || athlete.legal_name || "Unknown athlete"}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label="Quarter label"
              value={growthForm.quarterLabel}
              onChange={(value) => updateGrowthForm("quarterLabel", value)}
              required
            />
            <RatingField
              label="Current skill score"
              value={growthForm.skillScore}
              onChange={(value) => updateGrowthForm("skillScore", value)}
            />
            <RatingField
              label="Growth potential score"
              value={growthForm.growthPotentialScore}
              onChange={(value) => updateGrowthForm("growthPotentialScore", value)}
            />
          </div>
          <TextAreaField
            label="Written rationale"
            value={growthForm.rationale}
            onChange={(value) => updateGrowthForm("rationale", value)}
          />
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => void saveGrowthDraft()}>
              Save matrix draft
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!growthForm.id}
              onClick={() => void signGrowthReview()}
            >
              Sign matrix review
            </button>
          </div>
          <p className="muted">
            Coaches draft placement and rationale only. Admin sharing is blocked until two distinct
            coaches sign.
          </p>
        </section>
      ) : null}
      {message ? <p className="alert ok">{message}</p> : null}
    </>
  );
}
