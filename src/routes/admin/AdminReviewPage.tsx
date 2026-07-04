import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import type { ChangeRequestView } from "../../data/types";
import {
  classifyReviewRisk,
  reviewRiskReport,
  reviewRiskTone,
  suggestReviewDecisions,
  summarizeReviewQueue,
} from "./adminReviewHelpers";

export function AdminReviewPage() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<ChangeRequestView[]>([]);
  const [assistantResponse, setAssistantResponse] = useState<string | null>(null);

  async function load() {
    setRequests(await api.listChangeRequests());
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(id: string, decision: "approved" | "rejected") {
    if (!profile) {
      return;
    }
    await api.reviewChangeRequest(id, decision, profile.id);
    await load();
  }

  return (
    <>
      <PageHead title="Review Queue" subtitle="Player-submitted profile changes." eyebrow="Admin" />
      <section className="card stack assistant-card">
        <div className="section-title">
          <h2>Assistant</h2>
          <Badge>triage</Badge>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => setAssistantResponse(summarizeReviewQueue(requests))}
          >
            Summarize queue
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setAssistantResponse(reviewRiskReport(requests))}
          >
            Review risk
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => setAssistantResponse(suggestReviewDecisions(requests))}
          >
            Suggest decisions
          </button>
        </div>
        {assistantResponse ? <pre className="note-box">{assistantResponse}</pre> : null}
        <p className="muted">Assistant suggestions do not approve or reject changes.</p>
      </section>
      <section className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Athlete</th>
              <th>Field</th>
              <th>Risk</th>
              <th>Old</th>
              <th>New</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.athleteName}</td>
                <td>{request.fieldName}</td>
                <td>
                  <Badge tone={reviewRiskTone(classifyReviewRisk(request.fieldName))}>
                    {classifyReviewRisk(request.fieldName)}
                  </Badge>
                </td>
                <td>{request.oldValue ?? "-"}</td>
                <td>{request.newValue ?? "-"}</td>
                <td>{request.status}</td>
                <td>
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => void review(request.id, "approved")}
                      disabled={request.status !== "pending"}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => void review(request.id, "rejected")}
                      disabled={request.status !== "pending"}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
