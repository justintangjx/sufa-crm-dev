import { useEffect, useState } from "react";
import { Badge, StatCard } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import type {
  CampaignSurveyInstance,
  CampaignSurveyTemplate,
  SurveyAudience,
} from "../../types/database";
import type { SurveyCompletionRow } from "../../data/types";
import {
  formatSurveyChaseMessage,
  formatSurveyCloseConfirm,
  formatSurveyOpenConfirm,
  surveyCompletionLabel,
  surveyPrerequisitesMet,
  type SurveyAdminReadiness,
} from "../../lib/adminCampaignSurveyOps";
import {
  downloadCsv,
  slugifyCampaignName,
  surveyAggregatesToCsv,
  surveyExportFilename,
  surveyResponsesToCsv,
} from "../../lib/surveyExport";

export function AdminSurveyPanel({
  campaignId,
  campaignName,
  rosterCount,
  coachCount,
  templates,
  instances,
  completion,
  profileId,
  onChanged,
}: {
  campaignId: string;
  campaignName: string;
  rosterCount: number;
  coachCount: number;
  templates: CampaignSurveyTemplate[];
  instances: CampaignSurveyInstance[];
  completion: SurveyCompletionRow[];
  profileId: string;
  onChanged: () => Promise<void>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [playerAggregates, setPlayerAggregates] = useState<
    Awaited<ReturnType<typeof api.getSurveySectionAggregates>>
  >([]);
  const [coachAggregates, setCoachAggregates] = useState<
    Awaited<ReturnType<typeof api.getSurveySectionAggregates>>
  >([]);

  const playerTemplate = templates.find((row) => row.audience === "player");
  const coachTemplate = templates.find((row) => row.audience === "coach");
  const playerInstance = instances.find((row) => row.audience === "player");
  const coachInstance = instances.find((row) => row.audience === "coach");

  const readiness: SurveyAdminReadiness = {
    rosterCount,
    coachCount,
    playerTemplateStatus: playerTemplate?.status ?? "missing",
    coachTemplateStatus: coachTemplate?.status ?? "missing",
    playerInstanceStatus: playerInstance?.status ?? "none",
    coachInstanceStatus: coachInstance?.status ?? "none",
    playerSubmitted: completion.filter(
      (row) => row.audience === "player" && row.status === "submitted",
    ).length,
    playerTotal: completion.filter((row) => row.audience === "player").length,
    coachSubmitted: completion.filter(
      (row) => row.audience === "coach" && row.status === "submitted",
    ).length,
    coachTotal: completion.filter((row) => row.audience === "coach").length,
  };

  const playerInProgress = completion.filter(
    (row) => row.audience === "player" && row.status === "in_progress",
  ).length;
  const coachInProgress = completion.filter(
    (row) => row.audience === "coach" && row.status === "in_progress",
  ).length;

  const hasOpenInstance = instances.some((row) => row.status === "open");

  useEffect(() => {
    void Promise.all([
      api.getSurveySectionAggregates(campaignId, "player"),
      api.getSurveySectionAggregates(campaignId, "coach"),
    ]).then(([player, coach]) => {
      setPlayerAggregates(player);
      setCoachAggregates(coach);
    });
  }, [campaignId, completion.length]);

  async function handlePublish(audience: SurveyAudience) {
    const template = audience === "player" ? playerTemplate : coachTemplate;
    if (!template) {
      return;
    }
    await api.publishSurveyTemplate(template.id, profileId);
    setMessage(`${audience} questionnaire published.`);
    await onChanged();
  }

  async function handleOpen(audience: SurveyAudience) {
    const count = audience === "player" ? rosterCount : coachCount;
    if (!window.confirm(formatSurveyOpenConfirm({ campaignName, audience, count }))) {
      return;
    }
    await api.openSurveyInstance({ campaignId, audience, createdBy: profileId });
    setMessage(`${audience} questionnaire opened.`);
    await onChanged();
  }

  async function handleClose(audience: SurveyAudience) {
    const instance = audience === "player" ? playerInstance : coachInstance;
    if (!instance) {
      return;
    }
    const submitted = audience === "player" ? readiness.playerSubmitted : readiness.coachSubmitted;
    const total = audience === "player" ? readiness.playerTotal : readiness.coachTotal;
    if (!window.confirm(formatSurveyCloseConfirm({ audience, submitted, total }))) {
      return;
    }
    await api.closeSurveyInstance(instance.id);
    setMessage(`${audience} questionnaire closed.`);
    await onChanged();
  }

  function handleChase(audience: SurveyAudience) {
    const row = completion.find((entry) => entry.audience === audience);
    const questionCount = row?.questionCount ?? (audience === "player" ? 51 : 43);
    void navigator.clipboard.writeText(
      formatSurveyChaseMessage({
        campaignName,
        campaignId,
        audience,
        questionCount,
      }),
    );
    setMessage("Chase message copied. Paste into WhatsApp or Telegram.");
  }

  async function handleExportResponses(audience: SurveyAudience) {
    const instance = instances.find((row) => row.audience === audience);
    const template = templates.find((row) => row.audience === audience);
    if (!instance || !template) {
      return;
    }
    const bundle = await api.getSurveyTemplateBundle(template.id);
    if (!bundle) {
      return;
    }
    const rows = completion
      .filter((row) => row.audience === audience)
      .map((row) => ({
        campaignName,
        audience,
        raterName: row.name,
        raterEmail: row.email,
        status: row.status,
        submittedAt: row.submittedAt,
        answers: {} as Record<string, string | number | null>,
      }));
    downloadCsv(
      surveyExportFilename(slugifyCampaignName(campaignName), "responses"),
      surveyResponsesToCsv(bundle.questions, bundle.sections, rows),
    );
  }

  function handleExportSummary() {
    const slug = slugifyCampaignName(campaignName);
    if (playerAggregates.length > 0) {
      downloadCsv(
        surveyExportFilename(`${slug}-player`, "summary"),
        surveyAggregatesToCsv(playerAggregates),
      );
    }
    if (coachAggregates.length > 0) {
      downloadCsv(
        surveyExportFilename(`${slug}-coach`, "summary"),
        surveyAggregatesToCsv(coachAggregates),
      );
    }
  }

  return (
    <section id="survey" className="card stack campaign-survey-panel">
      <div className="section-title">
        <h2>End-of-campaign questionnaire</h2>
        <Badge tone={hasOpenInstance ? "ok" : "warn"}>
          {hasOpenInstance ? "survey open" : "survey closed"}
        </Badge>
      </div>
      <p className="muted">
        Roster: {rosterCount} · Coaches: {coachCount}. Replaces Google Forms for the tournament
        retrospective (Likert + NPS).
      </p>

      <div className="stack">
        <TemplateRow
          label="Player form"
          template={playerTemplate}
          onPublish={() => void handlePublish("player")}
        />
        <TemplateRow
          label="Coach form"
          template={coachTemplate}
          onPublish={() => void handlePublish("coach")}
        />
      </div>

      <div className="grid cols-2">
        <SurveyControlColumn
          title="Player survey"
          audience="player"
          template={playerTemplate}
          instance={playerInstance}
          statusLabel={surveyCompletionLabel(
            readiness.playerSubmitted,
            readiness.playerTotal,
            playerInProgress,
          )}
          canOpen={
            playerTemplate?.status === "published" &&
            surveyPrerequisitesMet(readiness, "player") &&
            playerInstance?.status !== "open"
          }
          canClose={playerInstance?.status === "open"}
          onOpen={() => void handleOpen("player")}
          onClose={() => void handleClose("player")}
          onChase={() => handleChase("player")}
        />
        <SurveyControlColumn
          title="Coach survey"
          audience="coach"
          template={coachTemplate}
          instance={coachInstance}
          statusLabel={surveyCompletionLabel(
            readiness.coachSubmitted,
            readiness.coachTotal,
            coachInProgress,
          )}
          canOpen={
            coachTemplate?.status === "published" &&
            surveyPrerequisitesMet(readiness, "coach") &&
            coachInstance?.status !== "open"
          }
          canClose={coachInstance?.status === "open"}
          onOpen={() => void handleOpen("coach")}
          onClose={() => void handleClose("coach")}
          onChase={() => handleChase("coach")}
        />
      </div>

      {!surveyPrerequisitesMet(readiness, "player") ||
      !surveyPrerequisitesMet(readiness, "coach") ? (
        <p className="alert warn">
          Import roster players and assign coaches before opening surveys.
        </p>
      ) : null}

      <div className="stack">
        <strong>Who has responded</strong>
        {completion.length === 0 ? (
          <p className="muted">Publish and open a survey to start collecting responses.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Survey</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {completion.map((row) => (
                  <tr key={`${row.audience}-${row.profileId}`}>
                    <td>{row.name}</td>
                    <td>{row.audience === "player" ? "Player" : "Coach"}</td>
                    <td>{row.status.replaceAll("_", " ")}</td>
                    <td>
                      {row.status === "submitted"
                        ? `${row.questionCount}/${row.questionCount}`
                        : row.answeredCount > 0
                          ? `${row.answeredCount}/${row.questionCount}`
                          : "—"}
                    </td>
                    <td>{row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="stack">
        <strong>Summary</strong>
        <p className="muted">
          Section averages only. Raw text answers are not shown here. Small groups are withheld.
        </p>
        <AggregateTable title="Players" rows={playerAggregates} />
        <AggregateTable title="Coaches" rows={coachAggregates} />
      </div>

      <div className="btn-row">
        <button type="button" className="btn" onClick={() => void handleExportResponses("player")}>
          Download player responses (CSV)
        </button>
        <button type="button" className="btn" onClick={() => void handleExportResponses("coach")}>
          Download coach responses (CSV)
        </button>
        <button type="button" className="btn" onClick={handleExportSummary}>
          Download summary (CSV)
        </button>
      </div>

      {message ? <p className="alert ok">{message}</p> : null}
    </section>
  );
}

function TemplateRow({
  label,
  template,
  onPublish,
}: {
  label: string;
  template: CampaignSurveyTemplate | undefined;
  onPublish: () => void;
}) {
  if (!template) {
    return <p className="muted">{label}: not loaded — upload a CSV above.</p>;
  }
  return (
    <div className="template-row">
      <div>
        <strong>{label}</strong>
        <span className="muted">
          {" "}
          · {template.status} · v{template.version}
        </span>
      </div>
      {template.status === "draft" ? (
        <button type="button" className="btn sm primary" onClick={onPublish}>
          Publish
        </button>
      ) : (
        <span className="badge ok">ready</span>
      )}
    </div>
  );
}

function SurveyControlColumn({
  title,
  instance,
  statusLabel,
  canOpen,
  canClose,
  onOpen,
  onClose,
  onChase,
}: {
  title: string;
  audience: SurveyAudience;
  template: CampaignSurveyTemplate | undefined;
  instance: CampaignSurveyInstance | undefined;
  statusLabel: string;
  canOpen: boolean;
  canClose: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChase: () => void;
}) {
  return (
    <div className="survey-col stack">
      <div className="section-title">
        <h3>{title}</h3>
        <Badge tone={instance?.status === "open" ? "ok" : "warn"}>
          {instance?.status ?? "not open"}
        </Badge>
      </div>
      <p className="muted">{statusLabel}</p>
      <div className="btn-row">
        <button type="button" className="btn sm primary" disabled={!canOpen} onClick={onOpen}>
          Open
        </button>
        <button type="button" className="btn sm" disabled={!canClose} onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn sm" onClick={onChase}>
          Copy chase message
        </button>
      </div>
    </div>
  );
}

function AggregateTable({
  title,
  rows,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof api.getSurveySectionAggregates>>;
}) {
  if (rows.length === 0) {
    return <p className="muted">{title}: no submitted responses yet.</p>;
  }
  return (
    <div className="stack">
      <h4>{title}</h4>
      <div className="grid cols-2">
        {rows.map((row) => (
          <StatCard
            key={row.sectionTitle}
            label={row.sectionTitle}
            value={row.withheld ? "Withheld" : String(row.average ?? "—")}
            detail={`${row.responseCount} responses`}
            tone={row.withheld ? "warn" : "ok"}
          />
        ))}
      </div>
    </div>
  );
}
