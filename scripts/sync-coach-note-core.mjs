#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "shared/coach-note-core.ts");
const banner =
  "// @generated from shared/coach-note-core.ts — edit the source file, then run pnpm sync:coach-note-core\n\n";
const sourceBody = readFileSync(source, "utf8");

const targets = [
  join(root, "src/shared/coach-note-core.ts"),
  join(root, "supabase/functions/_shared/coach-note-core.ts"),
];

for (const target of targets) {
  const next = `${banner}${sourceBody}`;
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {
    // target may not exist yet
  }
  if (current !== next) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, next);
    console.log(`synced ${target}`);
  }
}
