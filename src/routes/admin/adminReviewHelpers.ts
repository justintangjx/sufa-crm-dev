import type { ChangeRequestView } from "../../data/types";

type ReviewRisk = "high" | "low" | "medium";

const lowRiskReviewFields = new Set([
  "preferred_name",
  "phone",
  "telegram_handle",
  "media_consent",
]);
const mediumRiskReviewFields = new Set(["emergency_contact_name", "emergency_contact_phone"]);
const highRiskReviewFields = new Set([
  "legal_name",
  "date_of_birth",
  "passport_expiry",
  "data_sharing_consent",
]);

export function classifyReviewRisk(fieldName: string): ReviewRisk {
  if (highRiskReviewFields.has(fieldName)) {
    return "high";
  }
  if (mediumRiskReviewFields.has(fieldName)) {
    return "medium";
  }
  if (lowRiskReviewFields.has(fieldName)) {
    return "low";
  }
  return "medium";
}

export function reviewRiskTone(risk: ReviewRisk): "danger" | "ok" | "warn" {
  if (risk === "high") {
    return "danger";
  }
  if (risk === "medium") {
    return "warn";
  }
  return "ok";
}

export function pendingReviewRequests(requests: readonly ChangeRequestView[]): ChangeRequestView[] {
  return requests.filter((request) => request.status === "pending");
}

export function summarizeReviewQueue(requests: readonly ChangeRequestView[]): string {
  const pending = pendingReviewRequests(requests);
  if (pending.length === 0) {
    return "No pending profile changes need admin review.";
  }
  const high = pending.filter((request) => classifyReviewRisk(request.fieldName) === "high").length;
  const medium = pending.filter(
    (request) => classifyReviewRisk(request.fieldName) === "medium",
  ).length;
  const low = pending.filter((request) => classifyReviewRisk(request.fieldName) === "low").length;
  return `${pending.length} pending ${pending.length === 1 ? "change needs" : "changes need"} review: ${high} high risk, ${medium} medium risk, ${low} low risk.`;
}

export function reviewRiskReport(requests: readonly ChangeRequestView[]): string {
  const pending = pendingReviewRequests(requests);
  if (pending.length === 0) {
    return "No pending changes to risk-review.";
  }
  return pending
    .map((request) => {
      const risk = classifyReviewRisk(request.fieldName);
      const reason =
        risk === "high"
          ? "affects identity, travel readiness, or consent"
          : risk === "medium"
            ? "affects emergency contact reliability"
            : "is a routine contact/profile update";
      return `- ${request.athleteName}: ${request.fieldName} is ${risk} risk because it ${reason}.`;
    })
    .join("\n");
}

export function suggestReviewDecisions(requests: readonly ChangeRequestView[]): string {
  const pending = pendingReviewRequests(requests);
  if (pending.length === 0) {
    return "No pending changes need suggested decisions.";
  }
  return pending
    .map((request) => {
      const risk = classifyReviewRisk(request.fieldName);
      const suggestion =
        risk === "high"
          ? "verify supporting context before approving"
          : risk === "medium"
            ? "approve if the new contact detail is plausible"
            : "approve if the value looks current";
      return `- ${request.athleteName}: ${request.fieldName} changed from "${request.oldValue ?? "-"}" to "${request.newValue ?? "-"}". Recommendation: ${suggestion}.`;
    })
    .join("\n");
}
