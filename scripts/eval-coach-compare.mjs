import { readFile } from "node:fs/promises";

const [championPath, candidatePath] = process.argv.slice(2);
if (!championPath || !candidatePath) {
  throw new Error("Usage: pnpm eval:coach:compare <champion-report.json> <candidate-report.json>");
}

const champion = JSON.parse(await readFile(championPath, "utf8"));
const candidate = JSON.parse(await readFile(candidatePath, "utf8"));

const hardGateFailures = [];
if (candidate.successRate < 0.99) hardGateFailures.push("success rate below 99%");
if (candidate.groundingRate !== 1) hardGateFailures.push("grounding rate below 100%");
if (candidate.decisionSuppressionRate !== 1) {
  hardGateFailures.push("decision suppression below 100%");
}
if (candidate.atomicFactPrecision < 0.98) {
  hardGateFailures.push("atomic-fact precision below 98%");
}
if (candidate.atomicFactRecall < 0.95) hardGateFailures.push("atomic-fact recall below 95%");
if (candidate.p95LatencyMs >= 5_000) hardGateFailures.push("P95 latency is not below 5 seconds");
if (candidate.averageEstimatedCostUsd !== null && candidate.averageEstimatedCostUsd >= 0.03) {
  hardGateFailures.push("average estimated cost is not below US$0.03");
}
if (candidate.maximumRepairCount > 1) hardGateFailures.push("repair count exceeds one");

const regressions = [];
for (const metric of [
  "successRate",
  "groundingRate",
  "decisionSuppressionRate",
  "atomicFactPrecision",
  "atomicFactRecall",
]) {
  if (candidate[metric] < champion[metric] - 0.05) {
    regressions.push(`${metric} regressed by more than five percentage points`);
  }
}

const comparison = {
  champion: championPath,
  candidate: candidatePath,
  hardGateFailures,
  regressions,
  approved: hardGateFailures.length === 0 && regressions.length === 0,
};
process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
if (!comparison.approved) {
  process.exitCode = 1;
}
