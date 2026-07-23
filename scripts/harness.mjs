#!/usr/bin/env node
/**
 * Deploy / pilot harness runner.
 * Source of truth: harness/manifest.json
 *
 *   pnpm harness --profile pilot-u24
 *   pnpm harness --profile pilot-u24 --run
 *   pnpm harness --list-evals
 *   pnpm harness --list-profiles
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "harness", "manifest.json");

function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function parseArgs(argv) {
  const args = {
    profile: "baseline",
    run: false,
    listEvals: false,
    listProfiles: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--run") {
      args.run = true;
    } else if (arg === "--list-evals") {
      args.listEvals = true;
    } else if (arg === "--list-profiles") {
      args.listProfiles = true;
    } else if (arg === "--profile") {
      args.profile = argv[i + 1] ?? "";
      i += 1;
    } else if (arg.startsWith("--profile=")) {
      args.profile = arg.slice("--profile=".length);
    }
  }
  return args;
}

function printHelp() {
  console.log(`SUFA CRM harness — go/no-go for deploy and pilots

Source of truth: harness/manifest.json
Guide:           docs/harness.md

Usage:
  pnpm harness --profile <id>       Print checklist (default: baseline)
  pnpm harness --profile <id> --run Run automated suites; print remaining manual work
  pnpm harness --list-profiles      List profiles
  pnpm harness --list-evals         List eval suites and paths
  pnpm harness --help
`);
}

function missingEnv(names) {
  return names.filter((name) => !process.env[name]);
}

function runSuite(suite) {
  if (suite.kind === "live") {
    const missing = missingEnv(suite.requiresEnv ?? []);
    if (missing.length > 0) {
      console.error(`SKIP/FAIL ${suite.id}: missing env ${missing.join(", ")}`);
      return false;
    }
  }
  console.log(`\n▶ ${suite.id}: ${suite.command}`);
  const result = spawnSync(suite.command, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: process.env,
  });
  const ok = result.status === 0;
  console.log(ok ? `✓ ${suite.id} passed` : `✗ ${suite.id} failed (exit ${result.status})`);
  return ok;
}

function collectSuites(manifest, profile, includeLive) {
  const ids = [...profile.automatedSuites, ...(includeLive ? (profile.liveSuites ?? []) : [])];
  const unique = [...new Set(ids)];
  return unique.map((id) => {
    const suite = manifest.evalSuites[id];
    if (!suite) {
      throw new Error(`Unknown eval suite "${id}" referenced by profile ${profile.id}`);
    }
    return suite;
  });
}

function printFlagBlock(manifest, flagName) {
  const flag = manifest.flags[flagName];
  if (!flag) {
    console.log(`  (unknown flag ${flagName})`);
    return;
  }
  console.log(`\n### Flag ${flagName}`);
  console.log(`  default=${flag.default}  mockAutoOn=${flag.mockAutoOn}`);
  if (flag.supabase?.migrationsInOrder?.length) {
    console.log("  Supabase migrations (apply in order):");
    for (const file of flag.supabase.migrationsInOrder) {
      console.log(`    - supabase/migrations/${file}`);
    }
  }
  if (flag.supabase?.edgeFunctions?.length) {
    console.log(`  Edge Functions: ${flag.supabase.edgeFunctions.join(", ")}`);
  }
  if (flag.supabase?.edgeSecrets?.length) {
    console.log(`  Edge secrets: ${flag.supabase.edgeSecrets.join(", ")}`);
  }
  if (flag.supabase?.notes) {
    console.log(`  Supabase note: ${flag.supabase.notes}`);
  }
  if (flag.cloudflare?.pagesEnv) {
    console.log("  Cloudflare Pages env:");
    for (const [key, value] of Object.entries(flag.cloudflare.pagesEnv)) {
      console.log(`    ${key}=${value}`);
    }
  }
  if (flag.cloudflare?.notes) {
    console.log(`  Cloudflare note: ${flag.cloudflare.notes}`);
  }
  console.log(`  Go/no-go: ${flag.goNoGo}`);
}

function printProfile(manifest, profile) {
  console.log(`\n======== PROFILE: ${profile.id} ========`);
  console.log(profile.description);
  console.log(`\nVerdict rule: ${profile.verdictRule}`);

  console.log("\n## Flags");
  if (profile.requiresFlagsOn.length === 0) {
    console.log("  ON:  (none)");
  } else {
    console.log(`  ON:  ${profile.requiresFlagsOn.join(", ")}`);
  }
  if (profile.requiresFlagsOff.length === 0) {
    console.log("  OFF: (none required)");
  } else {
    console.log(`  OFF: ${profile.requiresFlagsOff.join(", ")}`);
  }

  for (const flagName of profile.requiresFlagsOn) {
    printFlagBlock(manifest, flagName);
  }
  if (profile.requiresFlagsOff.length > 0) {
    console.log("\n## Flags that must stay OFF");
    for (const flagName of profile.requiresFlagsOff) {
      printFlagBlock(manifest, flagName);
      console.log(`  Keep Cloudflare Pages ${flagName}=false (or unset) for this profile.`);
    }
  }

  console.log("\n## MACHINE checks (automated suites)");
  for (const id of profile.automatedSuites) {
    const suite = manifest.evalSuites[id];
    console.log(`  - ${id}: ${suite?.command ?? "MISSING"}`);
  }
  if (profile.liveSuites?.length) {
    console.log("\n## Live suites (need env + deployed infra)");
    for (const id of profile.liveSuites) {
      const suite = manifest.evalSuites[id];
      console.log(`  - ${id}: ${suite?.command ?? "MISSING"}`);
      if (suite?.requiresEnv?.length) {
        console.log(`      env: ${suite.requiresEnv.join(", ")}`);
      }
    }
  }

  console.log("\n## HUMAN checks (not auto-verified)");
  const flagManual = profile.requiresFlagsOn.flatMap(
    (name) => manifest.flags[name]?.manualChecks ?? [],
  );
  const allManual = [...new Set([...flagManual, ...profile.manualChecks])];
  for (const item of allManual) {
    console.log(`  [ ] ${item}`);
  }

  console.log("\n## Acceptance (pilot / feature proof — human)");
  for (const item of profile.acceptance) {
    console.log(`  [ ] ${item}`);
  }

  console.log("\n## Agent rules");
  for (const rule of manifest.agentRules) {
    console.log(`  - ${rule}`);
  }

  console.log(`\nRun automated gates:\n  pnpm harness --profile ${profile.id} --run\n`);
}

function listEvals(manifest) {
  console.log("Eval suites (explicit sources)\n");
  for (const suite of Object.values(manifest.evalSuites)) {
    console.log(`${suite.id} [${suite.kind}]`);
    console.log(`  ${suite.description}`);
    console.log(`  command: ${suite.command}`);
    for (const path of suite.paths ?? []) {
      console.log(`  path: ${path}`);
    }
    if (suite.requiresEnv?.length) {
      console.log(`  requiresEnv: ${suite.requiresEnv.join(", ")}`);
    }
    console.log("");
  }
}

function listProfiles(manifest) {
  console.log("Profiles\n");
  for (const profile of Object.values(manifest.profiles)) {
    console.log(`${profile.id}`);
    console.log(`  ${profile.description}`);
    console.log(
      `  flags on=[${profile.requiresFlagsOn.join(", ") || "—"}] off=[${profile.requiresFlagsOff.join(", ") || "—"}]`,
    );
    console.log("");
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const manifest = loadManifest();

  if (args.listEvals) {
    listEvals(manifest);
    process.exit(0);
  }
  if (args.listProfiles) {
    listProfiles(manifest);
    process.exit(0);
  }

  const profile = manifest.profiles[args.profile];
  if (!profile) {
    console.error(
      `Unknown profile "${args.profile}". Known: ${Object.keys(manifest.profiles).join(", ")}`,
    );
    process.exit(2);
  }

  if (!args.run) {
    printProfile(manifest, profile);
    process.exit(0);
  }

  console.log(`Running automated suites for profile "${profile.id}"…`);
  const suites = collectSuites(manifest, profile, true);
  let failed = false;
  for (const suite of suites) {
    const ok = runSuite(suite);
    if (!ok) {
      failed = true;
    }
  }

  const flagManual = profile.requiresFlagsOn.flatMap(
    (name) => manifest.flags[name]?.manualChecks ?? [],
  );
  const allManual = [...new Set([...flagManual, ...profile.manualChecks])];

  console.log("\n======== MANUAL REMAINING (not auto-verified) ========");
  console.log("Supabase / Cloudflare / roster ops must be confirmed by a human.");
  for (const item of allManual) {
    console.log(`  [ ] ${item}`);
  }
  console.log("\nAcceptance still required:");
  for (const item of profile.acceptance) {
    console.log(`  [ ] ${item}`);
  }

  if (failed) {
    console.error(`\nNO-GO: automated suite failure for profile "${profile.id}".`);
    process.exit(1);
  }

  console.log(
    `\nAUTOMATED GO for "${profile.id}". Full GO only after manual checks + acceptance above.`,
  );
  process.exit(0);
}

main();
