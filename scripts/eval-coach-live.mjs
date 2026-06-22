import { readFile, writeFile } from "node:fs/promises";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const cases = (await readFile("src/evals/coach-notes/synthetic.v1.jsonl", "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

const endpoint = requiredEnv("COACH_NOTE_EVAL_URL");
const token = requiredEnv("COACH_NOTE_EVAL_JWT");
const campaignId = requiredEnv("COACH_NOTE_EVAL_CAMPAIGN_ID");
const athleteId = requiredEnv("COACH_NOTE_EVAL_ATHLETE_ID");

const results = await Promise.all(
  cases.map(async (evalCase) => {
    const startedAt = performance.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        campaignId,
        athleteId,
        roughNotes: evalCase.input,
      }),
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const body = await response.json();
    const draft = body.draft;
    const fields = {
      strength: draft?.strengths?.map((item) => item.draftText) ?? [],
      development: draft?.developmentAreas?.map((item) => item.draftText) ?? [],
      overall: draft?.overallObservations?.map((item) => item.draftText) ?? [],
    };
    const expectedFacts = Object.values(evalCase.expected).flat();
    const actualFacts = Object.values(fields).flat();
    const grounded =
      draft &&
      ["strengths", "developmentAreas", "overallObservations"].every((field) =>
        draft[field].every((item) =>
          item.evidenceQuotes.every((quote) => body.redactedNotes.includes(quote)),
        ),
      );
    const decisionsSuppressed =
      !draft ||
      !/\b(selected|select|reserve|recommend(?:ation|ed)?|rating|[1-5]\s*\/\s*5)\b/i.test(
        JSON.stringify(fields),
      );
    return {
      name: evalCase.name,
      tags: evalCase.tags,
      success: response.ok,
      status: response.status,
      latencyMs,
      serverLatencyMs: body.latencyMs ?? null,
      estimatedCostUsd: body.estimatedCostUsd ?? null,
      repairCount: body.repairCount ?? null,
      grounded: Boolean(grounded),
      decisionsSuppressed,
      matchedFacts: actualFacts.filter((fact) => expectedFacts.includes(fact)).length,
      expectedFacts: expectedFacts.length,
      actualFacts: actualFacts.length,
      fields,
      error: response.ok ? null : body.error,
    };
  }),
);

const sortedLatencies = results.map((result) => result.latencyMs).toSorted((a, b) => a - b);
const percentileIndex = Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1);
const matchedFacts = results.reduce((sum, result) => sum + result.matchedFacts, 0);
const expectedFacts = results.reduce((sum, result) => sum + result.expectedFacts, 0);
const actualFacts = results.reduce((sum, result) => sum + result.actualFacts, 0);
const successfulCosts = results
  .filter((result) => result.success && result.estimatedCostUsd !== null)
  .map((result) => result.estimatedCostUsd);
const report = {
  generatedAt: new Date().toISOString(),
  dataset: "synthetic.v1",
  cases: results.length,
  successRate: results.filter((result) => result.success).length / results.length,
  groundingRate: results.filter((result) => result.grounded).length / results.length,
  decisionSuppressionRate:
    results.filter((result) => result.decisionsSuppressed).length / results.length,
  atomicFactPrecision: actualFacts === 0 ? 1 : matchedFacts / actualFacts,
  atomicFactRecall: expectedFacts === 0 ? 1 : matchedFacts / expectedFacts,
  p95LatencyMs: sortedLatencies[percentileIndex] ?? 0,
  averageEstimatedCostUsd:
    successfulCosts.length === 0
      ? null
      : successfulCosts.reduce((sum, cost) => sum + cost, 0) / successfulCosts.length,
  maximumRepairCount: Math.max(...results.map((result) => result.repairCount ?? 0)),
  results,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (process.env.COACH_NOTE_REPORT_PATH) {
  await writeFile(process.env.COACH_NOTE_REPORT_PATH, serialized);
}
process.stdout.write(serialized);

if (
  report.successRate < 0.99 ||
  report.groundingRate < 1 ||
  report.decisionSuppressionRate < 1 ||
  report.atomicFactPrecision < 0.98 ||
  report.atomicFactRecall < 0.95 ||
  report.p95LatencyMs >= 5_000 ||
  (report.averageEstimatedCostUsd !== null && report.averageEstimatedCostUsd >= 0.03) ||
  report.maximumRepairCount > 1
) {
  process.exitCode = 1;
}
