import { useState, type ChangeEvent } from "react";
import { Badge } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import type { RosterImportPlan } from "../../data/types";
import {
  parseRosterCsv,
  planRosterImport,
  ROSTER_CSV_TEMPLATE,
  type RosterImportSourceRow,
} from "../../lib/rosterImport";
import type { Athlete } from "../../types/database";

function downloadTemplate() {
  const blob = new Blob([ROSTER_CSV_TEMPLATE + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "sufa-roster-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminRosterImportPanel({
  campaignId,
  athletes,
  memberAthleteIds,
  onImported,
}: {
  campaignId: string;
  athletes: Athlete[];
  memberAthleteIds: ReadonlySet<string>;
  onImported: () => Promise<void>;
}) {
  const [sourceRows, setSourceRows] = useState<RosterImportSourceRow[]>([]);
  const [plan, setPlan] = useState<RosterImportPlan | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  function rebuildPlan(rows: RosterImportSourceRow[]) {
    setPlan(
      planRosterImport({
        campaignId,
        rows,
        athletes,
        memberAthleteIds,
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
    const parsed = parseRosterCsv(text);
    setHeaderError(parsed.headerError);
    setSourceRows(parsed.rows);
    if (parsed.headerError) {
      setPlan(null);
      return;
    }
    rebuildPlan(parsed.rows);
  }

  async function handleCommit() {
    if (!plan || plan.counts.error > 0 || plan.counts.create + plan.counts.assign === 0) {
      return;
    }
    setCommitting(true);
    setMessage(null);
    try {
      const result = await api.commitCampaignRosterImport({
        campaignId,
        rows: sourceRows,
      });
      setMessage(
        `Import committed: ${result.createdAthletes} created, ${result.assignedMembers} assigned, ${result.skipped} skipped, ${result.errors} errors.`,
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
    plan !== null &&
    plan.counts.error === 0 &&
    plan.counts.create + plan.counts.assign > 0 &&
    !committing;

  return (
    <section className="card stack">
      <div className="section-title">
        <h2>Import roster CSV</h2>
        <Badge>one campaign</Badge>
      </div>
      <p className="muted">
        Load players for this campaign only (email is the match key). Download the template, fill
        ~22 rows, preview, then commit. Coaches are assigned separately. Use one file per team.
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
          {committing ? "Committing..." : "Commit import"}
        </button>
      </div>
      {headerError ? <p className="alert warn">{headerError}</p> : null}
      {message ? <p className="alert ok">{message}</p> : null}
      {plan ? (
        <>
          <div className="grid cols-4">
            <div className="stat">
              <div className="stat-value">{plan.counts.create}</div>
              <div className="stat-label">Create</div>
            </div>
            <div className="stat">
              <div className="stat-value">{plan.counts.assign}</div>
              <div className="stat-label">Assign</div>
            </div>
            <div className="stat">
              <div className="stat-value">{plan.counts.skip}</div>
              <div className="stat-label">Skip</div>
            </div>
            <div className="stat">
              <div className="stat-value">{plan.counts.error}</div>
              <div className="stat-label">Errors</div>
            </div>
          </div>
          {plan.counts.error > 0 ? (
            <p className="alert warn">
              Fix CSV errors before committing. Nothing has been written.
            </p>
          ) : null}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Action</th>
                  <th>Email</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.kind}-${row.email ?? ""}`}>
                    <td>{row.rowNumber}</td>
                    <td>{row.kind}</td>
                    <td>{row.email ?? "—"}</td>
                    <td>
                      {row.kind === "create_and_assign"
                        ? `${row.fields.legalName} → ${row.memberStatus}`
                        : row.kind === "assign_only"
                          ? `existing → ${row.memberStatus}`
                          : row.kind === "skip"
                            ? row.reason
                            : row.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
