import { Badge } from "../../components/shell/PagePrimitives";
import { getQuadrantInfo } from "../../lib/playerGrowth";
import type { CampaignTryoutBriefing } from "../../types/database";
import type { GrowthReviewWithDetails } from "../../data/types";

export function growthStatusTone(status: string): "accent" | "danger" | "ok" | "warn" {
  if (status === "shared" || status === "closed") {
    return "ok";
  }
  if (status === "disputed") {
    return "danger";
  }
  if (status === "awaiting_second_signoff") {
    return "accent";
  }
  return "warn";
}

export function TryoutBriefingPanel({ briefing }: { briefing: CampaignTryoutBriefing | null }) {
  if (!briefing) {
    return (
      <section className="card stack">
        <div className="section-title">
          <h2>Before tryouts</h2>
          <Badge tone="warn">unpublished</Badge>
        </div>
        <p className="muted">The org chart and schedule have not been published yet.</p>
      </section>
    );
  }
  const rows = [
    ["Head coach", briefing.head_coach],
    ["Selectors", briefing.selectors],
    ["Welfare committee", briefing.welfare_committee],
    ["Liaison", briefing.liaison],
    ["Training", briefing.training_schedule],
    ["Camps", briefing.camps_schedule],
    ["Competitions", briefing.competitions_schedule],
    ["Time commitment", briefing.time_commitment],
  ];
  return (
    <section className="card stack">
      <div className="section-title">
        <h2>Before tryouts</h2>
        <Badge tone="ok">published</Badge>
      </div>
      <div className="definition-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value || "TBC"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function GrowthMatrixExplainer() {
  return (
    <section className="card stack">
      <div className="section-title">
        <h2>Growth Matrix</h2>
        <Badge>quarterly</Badge>
      </div>
      <div className="matrix-explainer">
        <div>
          <strong>X-axis: current skill</strong>
          <p className="muted">Physical output, tactical execution, performance under pressure.</p>
        </div>
        <div>
          <strong>Y-axis: growth potential</strong>
          <p className="muted">Trainability, feedback attitude, improvement rate, resilience.</p>
        </div>
      </div>
      <p className="muted">
        Each placement needs two-coach sign-off and a written rationale before it is shared.
      </p>
    </section>
  );
}

export function GrowthReviewSummary({ review }: { review: GrowthReviewWithDetails }) {
  const quadrant = getQuadrantInfo(review.quadrant);
  return (
    <div className="growth-summary">
      <div>
        <span>Skill</span>
        <strong>{review.skill_score}/5</strong>
      </div>
      <div>
        <span>Growth potential</span>
        <strong>{review.growth_potential_score}/5</strong>
      </div>
      <div>
        <span>Quadrant</span>
        <strong>{quadrant.label}</strong>
      </div>
      <div>
        <span>Quarter</span>
        <strong>{review.quarter_label}</strong>
      </div>
    </div>
  );
}
