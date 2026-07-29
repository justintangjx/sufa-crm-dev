import { useState, type ChangeEvent } from "react";
import { Badge } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import type { QuestionnaireImportPlan } from "../../lib/questionnaireImport";
import {
  parseQuestionnaireCsv,
  planQuestionnaireImport,
  QUESTIONNAIRE_CSV_TEMPLATE,
  type QuestionnaireImportSourceRow,
} from "../../lib/questionnaireImport";

function downloadTemplate() {
  const blob = new Blob([QUESTIONNAIRE_CSV_TEMPLATE + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "sufa-questionnaire-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminQuestionnaireImportPanel({
  campaignId,
  campaignName,
  createdBy,
  hasOpenInstance,
  onImported,
}: {
  campaignId: string;
  campaignName: string;
  createdBy: string;
  hasOpenInstance: boolean;
  onImported: () => Promise<void>;
}) {
  const [sourceRows, setSourceRows] = useState<QuestionnaireImportSourceRow[]>([]);
  const [plan, setPlan] = useState<QuestionnaireImportPlan | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  function rebuildPlan(rows: QuestionnaireImportSourceRow[]) {
    setPlan(
      planQuestionnaireImport({
        campaignId,
        campaignName,
        rows,
        hasOpenInstance,
      }),
    );
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setMessage(null);
    if (!file) {
      return;
    }
    const text = await file.text();
    const parsed = parseQuestionnaireCsv(text);
    setHeaderError(parsed.headerError);
    setSourceRows(parsed.rows);
    if (parsed.headerError) {
      setPlan(null);
      return;
    }
    rebuildPlan(parsed.rows);
  }

  async function handleCommit() {
    if (!plan || plan.counts.error > 0 || plan.playerQuestionCount === 0) {
      return;
    }
    setCommitting(true);
    setMessage(null);
    try {
      await api.commitQuestionnaireImport({
        campaignId,
        rows: sourceRows,
        createdBy,
      });
      setMessage(
        `Questionnaire committed: player ${plan.playerQuestionCount} questions · coach ${plan.coachQuestionCount} questions.`,
      );
      setSourceRows([]);
      setPlan(null);
      await onImported();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setCommitting(false);
    }
  }

  const canCommit =
    plan !== null && plan.counts.error === 0 && plan.playerQuestionCount > 0 && !committing;

  return (
    <section className="card stack">
      <div className="section-title">
        <h2>Questionnaire definition</h2>
        <Badge>CSV import</Badge>
      </div>
      <p className="muted">
        Upload one CSV — player and coach forms are created automatically. Questions marked
        player_only (e.g. coach leadership items) are omitted from the coach form.
      </p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={downloadTemplate}>
          Download CSV template
        </button>
        <label className="btn">
          Choose CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void handleFile(event)}
            hidden
          />
        </label>
        <button
          type="button"
          className="btn primary"
          disabled={!canCommit}
          onClick={() => void handleCommit()}
        >
          {committing ? "Committing..." : "Commit questionnaire"}
        </button>
      </div>
      {headerError ? <p className="alert warn">{headerError}</p> : null}
      {message ? <p className="alert ok">{message}</p> : null}
      {plan ? (
        <>
          <p>
            <strong>
              Player template: {plan.playerQuestionCount} questions · Coach template:{" "}
              {plan.coachQuestionCount} questions
            </strong>
          </p>
          {plan.counts.error > 0 ? (
            <p className="alert warn">
              Fix CSV errors before committing. Nothing has been written.
            </p>
          ) : null}
        </>
      ) : (
        <p className="muted">Choose a CSV file to preview before committing.</p>
      )}
    </section>
  );
}
