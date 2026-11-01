#!/usr/bin/env bun
/**
 * Why: the docs site (docs/, GitHub Pages) must demonstrate the bundle that
 * ships, not a hand-maintained copy. This script copies the built browser
 * bundle, the morph peer bundle it runs on, and dist/stats.json into
 * docs/assets. scripts/docs-e2e.ts imports DOC_ASSETS and fails while any
 * copy differs from its source, so a source change cannot leave the site
 * showing an older build.
 *
 * VERIFIED: scripts/docs-e2e.ts fails with "run `make docs`" after a source
 * change until this script ran again.
 *
 * It also highlights the code examples in docs/index.html with shiki
 * (scripts/highlight.ts), which the e2e run checks the same way.
 *
 * Why copies instead of jsDelivr URLs: a CDN URL serves the last published
 * release, so the site could not show an unreleased change, and the e2e run
 * would test npm instead of this checkout.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { highlightPage } from "./highlight.ts";

const root = resolve(import.meta.dirname, "..");
// require.resolve lands on morph's dist/index.cjs; its browser bundle sits beside it.
const morphDist = dirname(
  createRequire(import.meta.url).resolve("defuss-morph"),
);

/** [source, copy] pairs, absolute paths. */
export const DOC_ASSETS: ReadonlyArray<readonly [string, string]> = [
  [resolve(root, "dist/all.min.js"), resolve(root, "docs/assets/defuss-query.min.js")],
  [resolve(morphDist, "all.min.js"), resolve(root, "docs/assets/defuss-morph.min.js")],
  [resolve(root, "dist/stats.json"), resolve(root, "docs/assets/stats.json")],
];

/** The page whose code examples are highlighted, and the script that holds the playground snippets. */
export const HIGHLIGHTED = { page: resolve(root, "docs/index.html"), site: resolve(root, "docs/assets/site.js") };

if (import.meta.main) {
  mkdirSync(resolve(root, "docs/assets"), { recursive: true });
  for (const [source, copy] of DOC_ASSETS) {
    copyFileSync(source, copy);
    console.log(`docs: ${copy.slice(root.length + 1)} <- ${source.slice(root.length + 1)}`);
  }
  const { page, site } = HIGHLIGHTED;
  writeFileSync(page, await highlightPage(readFileSync(page, "utf8"), readFileSync(site, "utf8")));
  console.log("docs: docs/index.html code examples highlighted");
}
