import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { PageHead, StatCard } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import { orderCampaignsForMvp, pickPrimaryCampaign } from "../../lib/campaignUi";
import type { Campaign, CoachEvaluation } from "../../types/database";

export function CoachDashboard() {
  const { profile } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [evaluations, setEvaluations] = useState<CoachEvaluation[]>([]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    void Promise.all([
      api.getCoachCampaigns(profile.id),
      api.listCoachEvaluations(profile.id),
    ]).then(([nextCampaigns, nextEvaluations]) => {
      setCampaigns(orderCampaignsForMvp(nextCampaigns));
      setEvaluations(nextEvaluations);
    });
  }, [profile]);

  const primaryCampaign = pickPrimaryCampaign(campaigns);

  return (
    <>
      <PageHead
        title="Coach Dashboard"
        subtitle="Assigned campaigns and evaluation progress."
        eyebrow="Coach workspace"
        actions={
          primaryCampaign ? (
            <Link className="btn primary" to={`/coach/campaigns/${primaryCampaign.id}`}>
              Open campaign
            </Link>
          ) : null
        }
      />
      <div className="grid cols-2">
        <StatCard
          label="Assigned campaigns"
          value={campaigns.length}
          tone="accent"
          detail="Coach-safe campaign access"
        />
        <StatCard
          label="Draft evaluations"
          value={evaluations.filter((e) => e.status === "draft").length}
          tone="warn"
          detail="Saved but not submitted"
        />
      </div>
      <section className="card stack">
        <h2>Campaigns</h2>
        {campaigns.map((campaign) => (
          <Link key={campaign.id} className="btn" to={`/coach/campaigns/${campaign.id}`}>
            {campaign.name}
          </Link>
        ))}
      </section>
    </>
  );
}
