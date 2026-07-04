import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import type {
  AdminStats,
  CampaignOperatingSummary,
  CampaignReadinessEntry,
  ChangeRequestView,
} from "../../data/types";
import { campaignCapabilities } from "../../lib/campaignCapabilities";
import { pickPrimaryCampaign } from "../../lib/campaignUi";
import type { Campaign } from "../../types/database";
import { pendingReviewRequests } from "./adminReviewHelpers";

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [summary, setSummary] = useState<CampaignOperatingSummary | null>(null);
  const [rows, setRows] = useState<CampaignReadinessEntry[]>([]);
  const [requests, setRequests] = useState<ChangeRequestView[]>([]);

  useEffect(() => {
    void Promise.all([api.getAdminStats(), api.listCampaigns(), api.listChangeRequests()]).then(
      async ([nextStats, campaigns, nextRequests]) => {
        const primaryCampaign = pickPrimaryCampaign(campaigns);
        setStats(nextStats);
        setCampaign(primaryCampaign);
        setRequests(nextRequests);
        const [nextRows, nextSummary] = primaryCampaign
          ? await Promise.all([
              api.getCampaignReadiness(primaryCampaign.id),
              api.getCampaignOperatingSummary(primaryCampaign.id),
            ])
          : [[], null];
        setRows(nextRows);
        setSummary(nextSummary);
      },
    );
  }, []);

  const totalPlayers = rows.length;
  const chaseRows = rows.filter((row) => row.missingFields.length > 0);
  const blockedRows = rows.filter(
    (row) =>
      row.missingFields.length > 0 ||
      row.passportStatus === "expired" ||
      row.passportStatus === "missing",
  );
  const passportRiskRows = rows.filter((row) => row.passportStatus !== "ok");
  const consentRiskRows = rows.filter((row) =>
    row.missingFields.some((field) => field.field === "data_sharing_consent"),
  );
  const pendingEvaluationRows = rows.filter((row) => row.evaluationStatus !== "submitted");
  const readyRows = rows.filter(
    (row) => row.missingFields.length === 0 && row.passportStatus === "ok",
  );
  const readyPercent = totalPlayers > 0 ? Math.round((readyRows.length / totalPlayers) * 100) : 0;
  const pendingRequests = pendingReviewRequests(requests);
  const primaryCaps = campaignCapabilities(campaign);

  return (
    <>
      <PageHead
        title="Admin Dashboard"
        subtitle={
          primaryCaps.liveMatrix || primaryCaps.coachNps
            ? "U24 campaign operations from training start through competition closeout."
            : "Campaign operations from training start through competition closeout."
        }
        eyebrow="Campaign command center"
        actions={
          <>
            <Link className="btn" to="/admin/review">
              Review queue
            </Link>
            <Link
              className="btn primary"
              to={campaign ? `/admin/campaigns/${campaign.id}` : "/admin/campaigns"}
            >
              Open campaign
            </Link>
          </>
        }
      />
      <section className="card control-room stack">
        <div className="control-room-head">
          <div>
            <p className="eyebrow">Primary campaign</p>
            <h2>{campaign?.name ?? "No active campaign"}</h2>
            <p className="muted">
              {campaign
                ? `${campaign.team ?? "Team TBC"} - ${campaign.location ?? "Location TBC"}`
                : "Create or activate a campaign to start tracking readiness."}
            </p>
          </div>
          <div className="readiness-score">
            <strong>
              {readyRows.length}/{totalPlayers || 0}
            </strong>
            <span>players travel-ready</span>
          </div>
        </div>
        <div className="progress" aria-label={`Campaign readiness ${readyPercent}%`}>
          <span style={{ width: `${readyPercent}%` }} />
        </div>
        <div className="ops-metrics">
          <div>
            <strong>{readyRows.length}</strong>
            <span>Ready</span>
          </div>
          <div>
            <strong>{blockedRows.length}</strong>
            <span>Blocked</span>
          </div>
          <div>
            <strong>{chaseRows.length}</strong>
            <span>Needs chase</span>
          </div>
          <div>
            <strong>{passportRiskRows.length + consentRiskRows.length}</strong>
            <span>Passport / consent risk</span>
          </div>
          <div>
            <strong>{pendingEvaluationRows.length}</strong>
            <span>Evaluations pending</span>
          </div>
          {primaryCaps.liveMatrix ? (
            <div>
              <strong>{summary?.playerMatrixSubmittedCount ?? 0}</strong>
              <span>Player matrices submitted</span>
            </div>
          ) : null}
          {primaryCaps.coachNps ? (
            <div>
              <strong>{summary?.openNpsSurveyCount ?? 0}</strong>
              <span>Open NPS surveys</span>
            </div>
          ) : null}
        </div>
        <div className="ops-lanes">
          <section className="ops-lane">
            <div className="section-title">
              <h3>Needs chase</h3>
              <Badge tone={chaseRows.length === 0 ? "ok" : "warn"}>{chaseRows.length}</Badge>
            </div>
            {chaseRows.length > 0 ? (
              <ul className="compact-list">
                {chaseRows.slice(0, 3).map((row) => (
                  <li key={row.athleteId}>
                    <strong>{row.name}</strong>
                    <span>{row.missingFields.map((field) => field.label).join(", ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No player profile chases needed.</p>
            )}
          </section>
          <section className="ops-lane">
            <div className="section-title">
              <h3>Risk checks</h3>
              <Badge
                tone={passportRiskRows.length + consentRiskRows.length === 0 ? "ok" : "danger"}
              >
                {passportRiskRows.length + consentRiskRows.length}
              </Badge>
            </div>
            <ul className="compact-list">
              <li>
                <strong>{passportRiskRows.length}</strong>
                <span>passport records need attention</span>
              </li>
              <li>
                <strong>{consentRiskRows.length}</strong>
                <span>players missing data-sharing consent</span>
              </li>
            </ul>
          </section>
          <section className="ops-lane">
            <div className="section-title">
              <h3>Next admin actions</h3>
              <Badge>ops</Badge>
            </div>
            <div className="action-list">
              <Link to={campaign ? `/admin/campaigns/${campaign.id}` : "/admin/campaigns"}>
                Draft reminders for {chaseRows.length} incomplete player
                {chaseRows.length === 1 ? "" : "s"}
              </Link>
              <Link to="/admin/review">
                Review {pendingRequests.length} pending profile change
                {pendingRequests.length === 1 ? "" : "s"}
              </Link>
              <Link to="/admin/exports">Check export readiness after risks are cleared</Link>
            </div>
          </section>
        </div>
      </section>
      <div className="ops-footer-grid">
        <section className="card stack">
          <div className="section-title">
            <h2>Review lanes</h2>
            <Badge tone={pendingRequests.length === 0 ? "ok" : "warn"}>
              {pendingRequests.length} pending
            </Badge>
          </div>
          <p className="muted">
            Profile updates stay human-reviewed. Assistant drafts do not approve or send anything.
          </p>
        </section>
        <section className="card stack">
          <div className="section-title">
            <h2>Submission pressure</h2>
            <Badge tone={(stats?.pendingEvaluations ?? 0) === 0 ? "ok" : "warn"}>
              {stats?.pendingEvaluations ?? pendingEvaluationRows.length} pending
            </Badge>
          </div>
          <p className="muted">
            Coach evaluations are tracked separately so admin can see when the squad file is ready
            to export.
          </p>
        </section>
      </div>
    </>
  );
}
