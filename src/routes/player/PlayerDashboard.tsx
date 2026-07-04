import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import type { CampaignWithMembership, NpsTask } from "../../data/types";
import { orderCampaignsForMvp } from "../../lib/campaignUi";
import { enableCampaignNps } from "../../lib/env";
import { getProfileCompletion, getMissingAthleteFields } from "../../lib/profile";
import type { Athlete } from "../../types/database";

export function PlayerDashboard() {
  const { profile } = useAuth();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignWithMembership[]>([]);
  const [npsTasks, setNpsTasks] = useState<NpsTask[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) {
      return;
    }
    setLoaded(false);
    void Promise.all([
      api.getAthleteForProfile(profile.id),
      api.getCampaignsForProfile(profile.id),
      enableCampaignNps ? api.listPlayerNpsTasks(profile.id) : Promise.resolve([]),
    ]).then(([nextAthlete, nextCampaigns, nextNpsTasks]) => {
      setAthlete(nextAthlete);
      setCampaigns(nextCampaigns);
      setNpsTasks(nextNpsTasks);
      setLoaded(true);
    });
  }, [profile]);

  const missing = useMemo(() => (athlete ? getMissingAthleteFields(athlete) : []), [athlete]);
  const completion = athlete ? getProfileCompletion(athlete) : 0;
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "active");
  const orderedCampaigns = orderCampaignsForMvp(campaigns);
  const submittedReviewCount = athlete?.profile_status === "submitted" ? 1 : 0;
  const blockerCount = missing.length;

  if (!loaded) {
    return (
      <>
        <PageHead
          title="Player Campaign Hub"
          subtitle="Your campaign profile, evaluations, and survey tasks."
          eyebrow="Player workspace"
        />
        <section className="card">
          <p className="muted">Loading player campaign tasks...</p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Player Campaign Hub"
        subtitle="Your campaign profile, evaluations, and survey tasks."
        eyebrow="Player workspace"
        actions={
          <Link className="btn primary" to="/player/profile">
            Update profile
          </Link>
        }
      />
      <section className="card player-readiness stack">
        <div className="readiness-hero">
          <div>
            <p className="eyebrow">Your readiness</p>
            <h2>You're {completion}% ready</h2>
            <p className="muted">
              {blockerCount > 0
                ? `${blockerCount} ${blockerCount === 1 ? "item is" : "items are"} blocking campaign readiness.`
                : "Your required profile details are ready for campaign admin."}
            </p>
          </div>
          <Badge tone={completion === 100 ? "ok" : "warn"}>{completion}%</Badge>
        </div>
        <div className="progress" aria-label={`Profile completion ${completion}%`}>
          <span style={{ width: `${completion}%` }} />
        </div>
        <div className="readiness-metrics">
          <div className="readiness-metric">
            <strong>{blockerCount}</strong>
            <span>Blocking items</span>
          </div>
          <div className="readiness-metric">
            <strong>{submittedReviewCount}</strong>
            <span>Submitted changes awaiting review</span>
          </div>
          <div className="readiness-metric">
            <strong>{activeCampaigns.length}</strong>
            <span>Active campaign assignments</span>
          </div>
          {enableCampaignNps ? (
            <div className="readiness-metric">
              <strong>{npsTasks.length}</strong>
              <span>Open NPS surveys</span>
            </div>
          ) : null}
        </div>
      </section>
      <div className="grid cols-2 role-dashboard-grid">
        <section className="card stack checklist-panel">
          <div className="section-title">
            <h2>Personal checklist</h2>
            <Badge tone={missing.length === 0 ? "ok" : "warn"}>
              {missing.length === 0 ? "clear" : `${missing.length} left`}
            </Badge>
          </div>
          {athlete?.profile_status === "submitted" ? (
            <p className="alert warn">
              Your latest profile submission is waiting for admin review.
            </p>
          ) : null}
          {missing.length > 0 ? (
            <div className="checklist">
              {missing.map((field) => (
                <div className="checklist-item" key={field.field}>
                  <span aria-hidden="true" />
                  <div>
                    <strong>{field.label}</strong>
                    <p className="muted">{field.section}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="checklist-item complete">
              <span aria-hidden="true" />
              <div>
                <strong>Profile details complete</strong>
                <p className="muted">No required admin fields are missing right now.</p>
              </div>
            </div>
          )}
          <Link className="btn" to="/player/profile">
            {missing.length > 0 ? "Complete missing details" : "Review profile"}
          </Link>
        </section>
        <section className="card stack player-campaign-panel">
          <div className="section-title">
            <h2>Campaign readiness</h2>
            <Badge>{campaigns.length} assigned</Badge>
          </div>
          {orderedCampaigns.length > 0 ? (
            <div className="campaign-strip">
              {orderedCampaigns.map((campaign) => (
                <div className="campaign-strip-item" key={campaign.id}>
                  <div>
                    <strong>
                      <Link to={`/player/campaigns/${campaign.id}`}>{campaign.name}</Link>
                    </strong>
                    <p className="muted">
                      {campaign.team ?? "Team TBC"} - {campaign.location ?? "Location TBC"}
                    </p>
                  </div>
                  <Badge tone={campaign.status === "active" ? "accent" : "ok"}>
                    {campaign.memberStatus}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No campaign assignments yet.</p>
          )}
          <div className="note-box">
            {missing.length > 0
              ? `Next best step: update ${missing[0]?.label.toLowerCase()} so admin can clear your readiness.`
              : "You're clear on required profile fields. Watch for campaign-specific requests from admin."}
          </div>
        </section>
      </div>
    </>
  );
}
