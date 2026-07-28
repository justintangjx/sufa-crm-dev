import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import type { CampaignOperatingSummary } from "../../data/types";
import { buildCampaignAdminActions } from "../../lib/adminCampaignActions";
import { campaignCapabilities } from "../../lib/campaignCapabilities";
import { orderCampaignsForMvp } from "../../lib/campaignUi";
import type { Campaign } from "../../types/database";

interface CampaignSnapshot {
  campaign: Campaign;
  summary: CampaignOperatingSummary;
  coachCount: number;
}

function campaignMeta(campaign: Campaign): string {
  const team = campaign.team ?? "Team TBC";
  const location = campaign.location ?? "Location TBC";
  return `${team} · ${location}`;
}

export function AdminDashboard() {
  const [snapshots, setSnapshots] = useState<CampaignSnapshot[]>([]);

  useEffect(() => {
    void (async () => {
      const campaigns = orderCampaignsForMvp(await api.listCampaigns());
      const nextSnapshots = await Promise.all(
        campaigns.map(async (campaign) => {
          const [summary, coaches] = await Promise.all([
            api.getCampaignOperatingSummary(campaign.id),
            api.listCampaignCoaches(campaign.id),
          ]);
          return {
            campaign,
            summary,
            coachCount: coaches.length,
          };
        }),
      );
      setSnapshots(nextSnapshots);
    })();
  }, []);

  return (
    <>
      <PageHead
        title="Admin Dashboard"
        subtitle="Open a campaign and work through the next steps for roster, coaches, and surveys."
        eyebrow="Campaign workspace"
        actions={
          <>
            <Link className="btn" to="/admin/campaigns">
              All campaigns
            </Link>
            <Link className="btn" to="/admin/review">
              Review queue
            </Link>
          </>
        }
      />
      {snapshots.length === 0 ? (
        <section className="card stack">
          <p className="muted">No campaigns yet.</p>
          <Link className="btn primary" to="/admin/campaigns">
            Create a campaign
          </Link>
        </section>
      ) : (
        <div className="campaign-dashboard-list">
          {snapshots.map(({ campaign, summary, coachCount }) => {
            const actions = buildCampaignAdminActions({
              campaignId: campaign.id,
              summary,
              coachCount,
              capabilities: campaignCapabilities(campaign),
            });
            const campaignPath = `/admin/campaigns/${campaign.id}`;

            return (
              <section key={campaign.id} className="card stack campaign-dashboard-card">
                <div className="campaign-dashboard-head">
                  <div>
                    <h2>
                      <Link to={campaignPath}>{campaign.name}</Link>
                    </h2>
                    <p className="muted">{campaignMeta(campaign)}</p>
                  </div>
                  <div className="campaign-dashboard-head-actions">
                    <Badge tone={campaign.status === "active" ? "ok" : "warn"}>
                      {campaign.status}
                    </Badge>
                    <Link className="btn primary" to={campaignPath}>
                      Open campaign
                    </Link>
                  </div>
                </div>
                <div className="stack">
                  <h3>Next admin actions</h3>
                  {actions.length > 0 ? (
                    <div className="action-list">
                      {actions.map((action) => (
                        <Link key={action.label} to={action.to}>
                          {action.label}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">
                      No pending steps. Open the campaign to manage roster, coaches, and NPS.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
