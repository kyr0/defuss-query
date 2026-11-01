#!/usr/bin/env bun
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Why: README.md carries *measured* values — bundle sizes from the build and
 * coverage from the test run. Humans and agents forget to refresh them, so
 * this script is the single source of truth for both readings. It runs at the
 * end of every `build` (sizes, from a fresh dist/stats.json) and at the end
 * of `verify` (sizes + coverage, after tests produced a fresh
 * coverage/coverage-summary.json).
 *
 * When a marked README section is stale, it prints the exact replacement
 * text and exits 1. AGENTS.md instructs the agent to apply the printed
 * section and re-run, never to invent numbers by hand.
 */

const root = resolve(import.meta.dirname, "..");
const readmePath = resolve(root, "README.md");
const readme = readFileSync(readmePath, "utf8");

const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;
const pct = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

// --- expected readings -------------------------------------------------------

const stats = JSON.parse(readFileSync(resolve(root, "dist/stats.json"), "utf8"));
const purposes: Record<string, string> = {
  "all.js":
    "Readable browser ESM + global installation; for CDN-based usage with debugging",
  "all.min.js":
    "Minified browser ESM + global installation (Pareto-optimal when no bundler is used)",
  "global.min.js":
    "Minified classic script; installs `globalThis.df$` without a module/defer race",
};
// The headline figure in the feature list: the minified ESM bundle, gzip.
// VERIFIED: the hand-written figure it replaced said "~4.2 KiB" for 4,203 bytes (4.1 KiB).
const gzipSize = kb(stats.files["all.min.js"].gzip);
const sizeRows = Object.entries(stats.files)
  .map(([name, s]: [string, any]) => {
    const gzip = name === "all.js" ? kb(s.gzip) : `**${kb(s.gzip)}**`;
    return `| \`${name}\` | ${kb(s.bytes)} | ${gzip} | ${purposes[name]} |`;
  })
  .join("\n");

let coverageLine: string | undefined;
const summaryPath = resolve(root, "coverage/coverage-summary.json");
if (existsSync(summaryPath)) {
  const total = JSON.parse(readFileSync(summaryPath, "utf8")).total;
  coverageLine = `${pct(total.statements.pct)}% statement and ${pct(total.lines.pct)}% line coverage of \`src/\` from node and real-Chromium tests`;
} else {
  console.log("readme-sync: no coverage/coverage-summary.json (run `bun run test`), skipping the coverage reading");
}

// --- compare against marked README sections ----------------------------------

const marked = (name: string): string | undefined => {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const i = readme.indexOf(start);
  const j = readme.indexOf(end);
  if (i < 0 || j < 0 || j < i) return undefined;
  return readme.slice(i + start.length, j).trim();
};

const stale: { name: string; expected: string }[] = [];
if (marked("bundle-size") !== sizeRows) stale.push({ name: "bundle-size", expected: sizeRows });
if (marked("gzip-size") !== gzipSize) stale.push({ name: "gzip-size", expected: gzipSize });
if (coverageLine && marked("coverage") !== coverageLine)
  stale.push({ name: "coverage", expected: coverageLine });

if (!stale.length) {
  console.log("readme-sync: README.md bundle-size, gzip-size and coverage sections are fresh");
  process.exit(0);
}

// --- instruct -----------------------------------------------------------------

console.log("");
console.log("=".repeat(76));
console.log("README.md IS STALE — measured values changed.");
console.log("AGENT: follow AGENTS.md: replace the marked section(s) in README.md");
console.log("with the exact content below, then re-run");
console.log("`bun run verify`. Do NOT invent numbers; use only these readings.");
for (const { name, expected } of stale) {
  console.log("=".repeat(76));
  console.log(`Replace everything between <!-- ${name}:start --> and <!-- ${name}:end --> with:`);
  console.log("");
  console.log(expected);
  console.log("");
}
console.log("=".repeat(76));
process.exit(1);
