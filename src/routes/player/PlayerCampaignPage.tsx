import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { RatingField, TextAreaField, TextField } from "../../components/shell/FormFields";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import type { NpsTask, PlayerCampaignFlow } from "../../data/types";
import { campaignCapabilities, hasAnyCampaignFeature } from "../../lib/campaignCapabilities";
import { optionalText } from "../../lib/form";
import type { Athlete, MatrixSubmissionStatus, PlayerMatrixSubmission } from "../../types/database";
import {
  GrowthMatrixExplainer,
  GrowthReviewSummary,
  growthStatusTone,
  TryoutBriefingPanel,
} from "./PlayerCampaignPanels";
import {
  emptyPlayerMatrixForm,
  playerMatrixFormFromSubmission,
  playerMatrixInputFromForm,
  type PlayerMatrixFormState,
} from "./playerMatrixForm";

export function PlayerCampaignPage() {
  const { campaignId = "" } = useParams();
  const { profile } = useAuth();
  const [flow, setFlow] = useState<PlayerCampaignFlow | null>(null);
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [matrixSubmission, setMatrixSubmission] = useState<PlayerMatrixSubmission | null>(null);
  const [matrixForm, setMatrixForm] = useState<PlayerMatrixFormState>(emptyPlayerMatrixForm);
  const [npsTasks, setNpsTasks] = useState<NpsTask[]>([]);
  const [npsScores, setNpsScores] = useState<Record<string, string>>({});
  const [npsComments, setNpsComments] = useState<Record<string, string>>({});
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) {
      return;
    }
    setLoading(true);
    const [nextFlow, nextAthlete] = await Promise.all([
      api.getPlayerCampaignFlow(profile.id, campaignId),
      api.getAthleteForProfile(profile.id),
    ]);
    const nextCaps = campaignCapabilities(nextFlow?.campaign);
    const nextNpsTasks = nextCaps.coachNps
      ? await api.listPlayerNpsTasks(profile.id, campaignId)
      : [];
    setFlow(nextFlow);
    setAthlete(nextAthlete);
    setNpsTasks(nextNpsTasks);
    if (nextAthlete && nextCaps.liveMatrix) {
      const nextSubmission = await api.getPlayerMatrixSubmission(campaignId, nextAthlete.id);
      setMatrixSubmission(nextSubmission);
      setMatrixForm(playerMatrixFormFromSubmission(nextSubmission));
    } else {
      setMatrixSubmission(null);
      setMatrixForm(emptyPlayerMatrixForm);
    }
    setLoading(false);
  }, [campaignId, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReply(reviewId: string) {
    if (!profile || reply.trim().length === 0) {
      return;
    }
    await api.submitGrowthReply(reviewId, profile.id, reply);
    setReply("");
    setMessage("Reply submitted. Your placement is unchanged while the dispute is reviewed.");
    await load();
  }

  function updateMatrixForm(field: keyof PlayerMatrixFormState, value: string) {
    setMatrixForm((current) => ({ ...current, [field]: value }));
  }

  async function saveMatrix(status: MatrixSubmissionStatus) {
    if (!profile || !athlete) {
      return;
    }
    const saved = await api.savePlayerMatrixSubmission(
      playerMatrixInputFromForm(matrixForm, {
        id: matrixSubmission?.id,
        campaignId,
        athleteId: athlete.id,
        submittedBy: profile.id,
        status,
      }),
    );
    setMatrixSubmission(saved);
    setMatrixForm(playerMatrixFormFromSubmission(saved));
    setMessage(status === "submitted" ? "Self-evaluation submitted." : "Self-evaluation saved.");
  }

  async function submitNps(task: NpsTask, coachProfileId: string) {
    if (!athlete) {
      return;
    }
    const key = `${task.survey.id}:${coachProfileId}`;
    const score = Number(npsScores[key]);
    if (!Number.isInteger(score) || score < 0 || score > 10) {
      setMessage("Choose an NPS score from 0 to 10 before submitting.");
      return;
    }
    await api.submitNpsResponse({
      surveyId: task.survey.id,
      assignmentId: task.assignmentId,
      athleteId: athlete.id,
      targetCoachProfileId: coachProfileId,
      score,
      comment: optionalText(npsComments[key]),
    });
    setMessage("Coach NPS response submitted anonymously into aggregate reporting.");
    await load();
  }

  if (!hasAnyCampaignFeature()) {
    return (
      <>
        <PageHead title="Campaign Readiness" subtitle="Campaign-specific player checklist." />
        <section className="card">
          <p className="muted">
            Player Growth Matrix is disabled for this deployment until the supporting database
            tables are provisioned.
          </p>
        </section>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageHead title="Campaign Readiness" subtitle="Campaign-specific player checklist." />
        <section className="card">
          <p className="muted">Loading campaign flow...</p>
        </section>
      </>
    );
  }

  if (!flow) {
    return (
      <>
        <PageHead title="Campaign Readiness" subtitle="Campaign-specific player checklist." />
        <section className="card">
          <p className="muted">This campaign is not assigned to your player profile.</p>
        </section>
      </>
    );
  }

  const latestReview = flow.reviews[0] ?? null;
  const caps = campaignCapabilities(flow.campaign);
  const showCampaignMatrix = caps.liveMatrix;
  const showCampaignNps = caps.coachNps;

  return (
    <>
      <PageHead
        title={flow.campaign.name}
        subtitle={
          caps.liveMatrix || caps.coachNps
            ? "U24 campaign tasks from training start through competition closeout."
            : "Campaign readiness tasks from training start through competition closeout."
        }
        eyebrow="Player campaign hub"
      />
      {showCampaignMatrix ? (
        <section className="card stack">
          <div className="section-title">
            <h2>Live self-evaluation matrix</h2>
            <Badge tone={matrixSubmission?.status === "submitted" ? "ok" : "warn"}>
              {matrixSubmission?.status ?? "not started"}
            </Badge>
          </div>
          <div className="grid cols-4">
            <RatingField
              label="Current skill"
              value={matrixForm.skillScore}
              onChange={(value) => updateMatrixForm("skillScore", value)}
            />
            <RatingField
              label="Growth potential"
              value={matrixForm.growthScore}
              onChange={(value) => updateMatrixForm("growthScore", value)}
            />
            <RatingField
              label="Competition readiness"
              value={matrixForm.readinessScore}
              onChange={(value) => updateMatrixForm("readinessScore", value)}
            />
            <RatingField
              label="Confidence"
              value={matrixForm.confidenceScore}
              onChange={(value) => updateMatrixForm("confidenceScore", value)}
            />
          </div>
          <TextAreaField
            label="Strengths"
            value={matrixForm.strengths}
            onChange={(value) => updateMatrixForm("strengths", value)}
          />
          <TextAreaField
            label="Development focus"
            value={matrixForm.developmentFocus}
            onChange={(value) => updateMatrixForm("developmentFocus", value)}
          />
          <TextAreaField
            label="Support needed"
            value={matrixForm.supportNeeded}
            onChange={(value) => updateMatrixForm("supportNeeded", value)}
          />
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => void saveMatrix("draft")}>
              Save self-evaluation
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => void saveMatrix("submitted")}
            >
              Submit self-evaluation
            </button>
          </div>
          <p className="muted">
            Coaches can use this as context, but coach assessments remain separate and audited.
          </p>
        </section>
      ) : null}
      {showCampaignNps && npsTasks.length > 0 ? (
        <section className="card stack">
          <div className="section-title">
            <h2>Coach NPS</h2>
            <Badge>{npsTasks.length} open</Badge>
          </div>
          {npsTasks.map((task) => (
            <div className="nps-task" key={task.assignmentId}>
              <strong>{task.survey.title}</strong>
              <p className="muted">
                Scores are reported only in anonymous aggregate views once the response threshold is
                met.
              </p>
              {task.coaches.map((coach) => {
                const key = `${task.survey.id}:${coach.profileId}`;
                return (
                  <div className="nps-coach-row" key={coach.profileId}>
                    <div>
                      <strong>{coach.name}</strong>
                      <p className="muted">
                        {coach.alreadyResponded ? "Response received" : "Score 0-10"}
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
                        disabled={coach.alreadyResponded}
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
                      label={`NPS comment ${coach.name}`}
                      value={npsComments[key] ?? ""}
                      onChange={(value) =>
                        setNpsComments((current) => ({ ...current, [key]: value }))
                      }
                      placeholder="Optional"
                    />
                    <button
                      type="button"
                      className="btn sm"
                      disabled={coach.alreadyResponded}
                      onClick={() => void submitNps(task, coach.profileId)}
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
      {message ? <p className="alert ok">{message}</p> : null}
      {caps.growthMatrix ? (
        <>
          <div className="grid cols-2">
            <TryoutBriefingPanel briefing={flow.briefing} />
            <GrowthMatrixExplainer />
          </div>
          <section className="card stack growth-review-card">
            <div className="section-title">
              <h2>Latest quarterly placement</h2>
              <Badge tone={latestReview ? growthStatusTone(latestReview.status) : "warn"}>
                {latestReview?.status ?? "not shared"}
              </Badge>
            </div>
            {latestReview ? (
              <>
                <GrowthReviewSummary review={latestReview} />
                <div className="note-box">{latestReview.rationale}</div>
                <p className="muted">
                  Signed by {latestReview.signoffs.length} coach
                  {latestReview.signoffs.length === 1 ? "" : "es"}. Results are shared with you and
                  available for admin welfare-board reporting.
                </p>
                {latestReview.replies.length > 0 ? (
                  <div className="stack">
                    <strong>Your replies</strong>
                    {latestReview.replies.map((growthReply) => (
                      <p className="note-box" key={growthReply.id}>
                        {growthReply.body}
                      </p>
                    ))}
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="growth-right-of-reply">Formal right-of-reply</label>
                  <textarea
                    id="growth-right-of-reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Add context if you dispute this placement..."
                  />
                  <p className="hint">
                    Submitting a reply records a dispute for human review. It does not change the
                    placement automatically.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn primary"
                  disabled={reply.trim().length === 0}
                  onClick={() => void submitReply(latestReview.id)}
                >
                  Submit reply
                </button>
              </>
            ) : (
              <p className="muted">
                No matrix placement has been shared yet. Drafts and one-coach sign-offs are not
                visible to players.
              </p>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
