import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { RatingField, TextAreaField, TextField } from "../../components/shell/FormFields";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import type { CampaignMatrixStatusRow, GrowthReviewWithDetails } from "../../data/types";
import { campaignCapabilities } from "../../lib/campaignCapabilities";
import type { Campaign, CoachAthleteView, MatrixSubmissionStatus } from "../../types/database";
import {
  coachMatrixFormFromAssessment,
  coachMatrixInputFromForm,
  emptyCoachMatrixForm,
  type CoachMatrixFormState,
} from "./coachMatrixForm";
import { emptyGrowthMatrixForm, type GrowthMatrixFormState } from "./coachGrowthMatrixForm";

export function CoachCampaignPage() {
  const { campaignId = "" } = useParams();
  const { profile } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [athletes, setAthletes] = useState<CoachAthleteView[]>([]);
  const [matrixRows, setMatrixRows] = useState<CampaignMatrixStatusRow[]>([]);
  const [coachMatrixForm, setCoachMatrixForm] =
    useState<CoachMatrixFormState>(emptyCoachMatrixForm);
  const [growthReviews, setGrowthReviews] = useState<GrowthReviewWithDetails[]>([]);
  const [growthForm, setGrowthForm] = useState<GrowthMatrixFormState>(emptyGrowthMatrixForm);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) {
      return;
    }
    const nextCampaign = await api.getCampaign(campaignId);
    const nextCaps = campaignCapabilities(nextCampaign);
    const [nextAthletes, nextGrowthReviews, nextMatrixRows] = await Promise.all([
      api.getCoachAthletes(campaignId),
      nextCaps.growthMatrix
        ? api.getCoachGrowthReviews(campaignId, profile.id)
        : Promise.resolve([]),
      nextCaps.liveMatrix ? api.getCampaignMatrixStatus(campaignId) : Promise.resolve([]),
    ]);
    setCampaign(nextCampaign);
    setAthletes(nextAthletes);
    setGrowthReviews(nextGrowthReviews);
    setMatrixRows(nextMatrixRows);
    setGrowthForm((current) => ({
      ...current,
      athleteId: current.athleteId || nextAthletes[0]?.id || "",
    }));
    setCoachMatrixForm((current) => ({
      ...current,
      athleteId: current.athleteId || nextAthletes[0]?.id || "",
    }));
  }, [campaignId, profile]);

  useEffect(() => {
    void load();
  }, [load]);

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
    const assessment = await api.getCoachMatrixAssessment(campaignId, athleteId, profile.id);
    setCoachMatrixForm(coachMatrixFormFromAssessment(assessment, athleteId));
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
    const saved = await api.saveCoachMatrixAssessment(
      coachMatrixInputFromForm(coachMatrixForm, {
        campaignId,
        coachProfileId: profile.id,
        status,
      }),
    );
    setCoachMatrixForm(coachMatrixFormFromAssessment(saved, saved.athlete_id));
    setMessage(status === "submitted" ? "Matrix assessment submitted." : "Matrix draft saved.");
    await load();
  }

  const latestReviewByAthlete = new Map<string, GrowthReviewWithDetails>();
  for (const review of growthReviews) {
    if (!latestReviewByAthlete.has(review.athlete_id)) {
      latestReviewByAthlete.set(review.athlete_id, review);
    }
  }
  const coachCaps = campaignCapabilities(campaign);
  const showCampaignMatrix = coachCaps.liveMatrix;

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
              <th>Phone</th>
              <th>Profile</th>
              {showCampaignMatrix ? <th>Player matrix</th> : null}
              {showCampaignMatrix ? <th>Coach matrix</th> : null}
              {coachCaps.growthMatrix ? <th>Growth Matrix</th> : null}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => {
              const growthReview = latestReviewByAthlete.get(athlete.id);
              const matrixRow = matrixRows.find((row) => row.athleteId === athlete.id);
              return (
                <tr key={athlete.id}>
                  <td>{athlete.preferred_name || athlete.legal_name || "Unknown athlete"}</td>
                  <td>{athlete.phone ?? "-"}</td>
                  <td>{athlete.profile_status}</td>
                  {showCampaignMatrix ? <td>{matrixRow?.playerStatus ?? "not_started"}</td> : null}
                  {showCampaignMatrix ? (
                    <td>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => void selectCoachMatrixAthlete(athlete.id)}
                      >
                        {matrixRow?.coachAssessments.find(
                          (assessment) => assessment.coach_profile_id === profile?.id,
                        )?.status ?? "draft"}
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
                  <td>
                    <Link className="btn sm" to={`/coach/evaluations/${campaignId}/${athlete.id}`}>
                      Evaluate
                    </Link>
                  </td>
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
              {coachMatrixForm.status}
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
              {matrixRows.find((row) => row.athleteId === coachMatrixForm.athleteId)
                ?.playerSubmission?.strengths ??
                "Player self-evaluation has not been submitted yet."}
            </div>
          </div>
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
              Save matrix draft
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => void saveCoachMatrix("submitted")}
            >
              Submit matrix assessment
            </button>
          </div>
          <p className="muted">
            Each save is recorded in the evaluation audit trail. This does not expose admin
            sensitive player fields.
          </p>
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
          {message ? <p className="alert ok">{message}</p> : null}
          <p className="muted">
            Coaches draft placement and rationale only. Admin sharing is blocked until two distinct
            coaches sign.
          </p>
        </section>
      ) : null}
    </>
  );
}
