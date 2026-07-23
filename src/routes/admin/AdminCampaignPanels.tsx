import { useState } from "react";
import { Badge, StatCard } from "../../components/shell/PagePrimitives";
import type { CampaignMatrixStatusRow, GrowthReviewWithDetails, NpsReport } from "../../data/types";
import { buildNpsAggregateSnapshot, U24_PILOT_NPS_POLICY } from "../../lib/npsAggregateSnapshot";
import { canShareGrowthReview, getQuadrantInfo } from "../../lib/playerGrowth";
import { growthStatusTone } from "../player/PlayerCampaignPanels";
import type {
  CampaignNpsSurvey,
  CampaignTryoutBriefing,
  EvaluationAuditEvent,
} from "../../types/database";

export function AdminGrowthMatrixPanel({
  briefing,
  reviews,
  onShare,
}: {
  briefing: CampaignTryoutBriefing | null;
  reviews: GrowthReviewWithDetails[];
  onShare: (reviewId: string) => void;
}) {
  const disputed = reviews.filter((review) => review.status === "disputed");
  const welfareReady = reviews.filter(
    (review) => review.status === "shared" || review.status === "closed",
  );

  return (
    <section className="card stack growth-admin-panel">
      <div className="section-title">
        <h2>Player Growth Matrix</h2>
        <Badge tone={briefing?.published ? "ok" : "warn"}>
          {briefing?.published ? "briefing published" : "briefing unpublished"}
        </Badge>
      </div>
      <div className="grid cols-3">
        <StatCard
          label="Reviews"
          value={reviews.length}
          detail="Quarterly matrix placements"
          tone="accent"
        />
        <StatCard
          label="Disputes"
          value={disputed.length}
          detail="Right-of-reply records"
          tone={disputed.length > 0 ? "warn" : "ok"}
        />
        <StatCard
          label="Welfare-board ready"
          value={welfareReady.length}
          detail="Shared placements for report"
          tone="ok"
        />
      </div>
      {reviews.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Player</th>
                <th>Quarter</th>
                <th>Quadrant</th>
                <th>Sign-offs</th>
                <th>Replies</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((review) => (
                <tr key={review.id}>
                  <td>{review.athleteName}</td>
                  <td>{review.quarter_label}</td>
                  <td>{getQuadrantInfo(review.quadrant).label}</td>
                  <td>{review.signoffs.length}/2</td>
                  <td>{review.replies.length}</td>
                  <td>
                    <Badge tone={growthStatusTone(review.status)}>{review.status}</Badge>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={!canShareGrowthReview(review, review.signoffs)}
                      onClick={() => onShare(review.id)}
                    >
                      Share
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No growth matrix reviews have been drafted for this campaign yet.</p>
      )}
      <p className="muted">
        Sharing requires two distinct coach sign-offs. Player replies record disputes for human
        review and do not alter the placement automatically.
      </p>
    </section>
  );
}

export function AdminLiveMatrixPanel({
  rows,
  auditEvents,
}: {
  rows: CampaignMatrixStatusRow[];
  auditEvents: EvaluationAuditEvent[];
}) {
  const playerSubmitted = rows.filter((row) => row.playerSubmittedCount > 0).length;
  const coachSubmitted = rows.reduce((total, row) => total + row.distinctSubmittedCoachCount, 0);

  return (
    <section className="card stack">
      <div className="section-title">
        <h2>U24 live evaluation matrix</h2>
        <Badge>
          {playerSubmitted}/{rows.length || 0} player
        </Badge>
      </div>
      <div className="grid cols-3">
        <StatCard
          label="Player self-evaluations"
          value={playerSubmitted}
          detail="Submitted by campaign athletes"
          tone={playerSubmitted === rows.length ? "ok" : "warn"}
        />
        <StatCard
          label="Coach assessments"
          value={coachSubmitted}
          detail="Distinct coaches with a submitted assessment"
          tone="accent"
        />
        <StatCard
          label="Audit events"
          value={auditEvents.length}
          detail="Matrix create/update/submit trail"
          tone="neutral"
        />
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Player</th>
              <th>Latest status</th>
              <th>Self-evals submitted</th>
              <th>Distinct coaches submitted</th>
              <th>Player notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.athleteId}>
                <td>{row.athleteName}</td>
                <td>{row.playerStatus}</td>
                <td>{row.playerSubmittedCount}</td>
                <td>{row.distinctSubmittedCoachCount}</td>
                <td>{row.playerSubmission?.development_focus ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {auditEvents.length > 0 ? (
        <div className="stack">
          <strong>Recent audit trail</strong>
          <ul className="compact-list">
            {auditEvents.slice(0, 5).map((event) => (
              <li key={event.id}>
                <strong>{event.event_type}</strong>
                <span>
                  {event.entity_type.replaceAll("_", " ")} ·{" "}
                  {new Date(event.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function AdminNpsPanel({
  campaignId,
  report,
  surveys,
  onOpenPost,
  onClosePost,
  onOpenMid,
  onCloseMid,
}: {
  campaignId: string;
  report: NpsReport;
  surveys: CampaignNpsSurvey[];
  onOpenPost: () => void;
  onClosePost: () => void;
  onOpenMid: () => void;
  onCloseMid: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const snapshot = buildNpsAggregateSnapshot(campaignId, report, surveys);
  const post = surveys.find((survey) => survey.survey_window === "post_season");
  const mid = surveys.find((survey) => survey.survey_window === "mid_season");
  const postOpen = post?.status === "open";
  const postCompletion = snapshot.completion.find((row) => row.window === "post_season");

  return (
    <section className="card stack">
      <div className="section-title">
        <h2>Campaign NPS</h2>
        <Badge tone={postOpen ? "ok" : "warn"}>
          {postOpen ? "end survey open" : "end survey closed"}
        </Badge>
      </div>
      <p>
        Pilot primary window is{" "}
        <strong>{U24_PILOT_NPS_POLICY.primaryWindow.replace("_", "-")}</strong>. Open this once at
        campaign end (replaces Google Forms). Mid-season stays optional.
      </p>
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={onOpenPost} disabled={postOpen}>
          Open end-of-campaign NPS
        </button>
        <button type="button" className="btn" onClick={onClosePost} disabled={!postOpen}>
          Close end-of-campaign NPS
        </button>
      </div>
      {postCompletion ? (
        <div className="grid cols-2">
          <StatCard
            label="Coach subjects (end)"
            value={postCompletion.coachSubjects}
            detail={`${postCompletion.coachRowResponses} player→coach responses`}
            tone="accent"
          />
          <StatCard
            label="Player subjects (end)"
            value={postCompletion.playerSubjects}
            detail={`${postCompletion.playerRowResponses} coach→player responses`}
            tone="ok"
          />
        </div>
      ) : null}
      {U24_PILOT_NPS_POLICY.allowMidControls ? (
        <div className="stack">
          <button
            type="button"
            className="btn sm"
            onClick={() => setShowAdvanced((current) => !current)}
          >
            {showAdvanced ? "Hide mid-season controls" : "Advanced: mid-season (optional)"}
          </button>
          {showAdvanced ? (
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                onClick={onOpenMid}
                disabled={mid?.status === "open"}
              >
                Open mid-season NPS
              </button>
              <button
                type="button"
                className="btn"
                onClick={onCloseMid}
                disabled={mid?.status !== "open"}
              >
                Close mid-season
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="stack">
        <strong>Players rating coaches</strong>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Survey</th>
                <th>Coach</th>
                <th>Responses</th>
                <th>Average</th>
                <th>NPS</th>
              </tr>
            </thead>
            <tbody>
              {report.coachRows.map((row) => (
                <tr key={`${row.surveyId}-${row.coachProfileId}`}>
                  <td>{row.surveyTitle}</td>
                  <td>{row.coachName}</td>
                  <td>{row.responseCount}</td>
                  <td>{row.withheld ? "Withheld" : row.averageScore}</td>
                  <td>{row.withheld ? "Threshold not met" : row.nps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="stack">
        <strong>Coaches rating players</strong>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Survey</th>
                <th>Player</th>
                <th>Responses</th>
                <th>Average</th>
                <th>NPS</th>
              </tr>
            </thead>
            <tbody>
              {report.playerRows.map((row) => (
                <tr key={`${row.surveyId}-${row.athleteId}`}>
                  <td>{row.surveyTitle}</td>
                  <td>{row.athleteName}</td>
                  <td>{row.responseCount}</td>
                  <td>{row.withheld ? "Withheld" : row.averageScore}</td>
                  <td>{row.withheld ? "Threshold not met" : row.nps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted">
        Raw responses are never shown here. Aggregates unlock only once each direction&apos;s
        response threshold is met (player-rater and coach-rater thresholds differ because coach
        pools are small). Telegram delivery is not wired yet.
      </p>
    </section>
  );
}
