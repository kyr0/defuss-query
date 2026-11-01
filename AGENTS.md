# AGENTS.md for defuss-query

Notes for LLMs and agents working on `defuss-query`, a standalone repository (`github.com/kyr0/defuss-query`). The architecture is documented in [ARCH.md](ARCH.md); the public contract is [README.md](README.md), and the agent-facing API reference that ships in the npm package is [SKILL.md](SKILL.md).

## Commands

`make` lists the verbs; each delegates to a `package.json` script.

- **Setup:** `make setup` installs the locked dependencies and Chromium.
- **Build:** `make build` compiles ESM and CJS, bundles the browser artifacts, writes `dist/stats.json` and runs the README sync check.
- **Lint:** `make lint` runs oxlint (warnings fail) and strict `tsc` over `src`, `scripts` and `tests`.
- **Test:** `make test` runs vitest (node project and real Chromium project); `make coverage` adds v8 coverage and writes `coverage/coverage-summary.json`.
- **End to end:** `make e2e` runs the packed-consumer tests, the documentation site in Chromium and the artifact gate (`scripts/verify.ts`); reports land in `output/`.
- **Full gate:** `make verify` (lint, test, coverage, e2e) is what CI runs; `bun run check` runs the same steps and is the `prepublishOnly` hook.
- **Docs site:** `make docs` copies the built bundles and `dist/stats.json` into `docs/assets` and highlights the code examples in `docs/index.html` with shiki (`scripts/highlight.ts`). Run it after every source change and after editing a code example or a playground preset in `docs/assets/site.js`: the e2e check fails while a copy or the highlighting is stale. To edit an example, replace the content of its `<code>` (in a `pre` or `mockup-code` with `data-lang`) with plain escaped text, one source line per line, then run `make docs`.

## README sync rule (required after every build or test run)

`README.md` contains **measured** values that change when the code changes:

- the bundle-size table between `<!-- bundle-size:start -->` and `<!-- bundle-size:end -->` (source: `dist/stats.json`)
- the headline size between `<!-- gzip-size:start -->` and `<!-- gzip-size:end -->` (source: `dist/stats.json`)
- the coverage bullet between `<!-- coverage:start -->` and `<!-- coverage:end -->` (source: `coverage/coverage-summary.json`)

`bun run build` and `bun run verify` both run `scripts/readme-sync.ts`, which compares the readings with the marked sections. When a section is stale, the script **exits 1** and prints the exact replacement text. Then:

1. Apply the printed replacement to `README.md` between the markers, verbatim.
2. Re-run `bun run verify` until it passes.

Never invent, round differently or "fix" sizes or coverage numbers by hand; only the readings printed by the script are valid. The documentation site follows the same rule: every element with a `data-stat` attribute in `docs/` must show the value `scripts/docs-e2e.ts` computes from `dist/stats.json`, and the check prints the expected text when one is stale.

## Release

`npm publish` only; `prepublishOnly` runs the full `bun run check` gate. No release folders, no committed reports, no tarballs in the repository. GitHub Pages publishes `docs/`.

## Testing architecture (short version)

- `tests/suite.browser.test.ts`: the DOM suite, executed against each shipped bundle (`all.js`, `all.min.js`, `global.min.js` via blob scripts) **and** once against `/src/all.ts` through the dev server. That last run feeds the v8 coverage on `src/**`.
- `tests/edge.browser.test.ts`, `tests/node.test.ts`, `tests/src-node.test.ts`: API and internal edge paths. They import `../src/*.js` **statically** so the coverage-instrumented module instances are used; dynamic runtime-URL imports bypass instrumentation and create duplicate instances.
- The real morph engine comes from the installed `defuss-morph` peer, served under `/__morph__/` by a plugin in `vitest.config.ts`; there is no vendored snapshot.
- `scripts/docs-e2e.ts` drives `docs/` in Chromium with Playwright, outside vitest, because the pages need a real top-level window and their own iframe.

<!-- defuss-vae:start -->
## defuss-vae
Read `.vae/MEMORY.md` + `.vae/CLI_GIST.md` before engineering work; `grep` `.vae/EPISODES.md` for recurring failures.
Outside skills write plain concise prose.
Evidence > assumption: IF a runtime fact is unknown or contested THEN observe before editing (read → existing test/command → smallest discriminating probe → ask). Temporary probe lines carry `vae:probe` and the gate rejects leftovers; read logs bounded (`make log`, tail, grep); no log spraying.
Layout: `.vae/` agent state; `Makefile` verbs setup start stop status log metrics bench test coverage lint e2e verify (`make` lists them); services only via `make start` → `var/log/<svc>.stdout|.stderr`, `tmp/<svc>.pid` (gitignored); programs read `input/`, write `output/` (both gitignored; commit e2e fixtures via `!input/<file>`).
test=real subsystems in isolation (throwaway db|queue|filesystem|server process, no mocks), never live|production data or services; tests assert VERIFIED requirements only (spec|human|observed contract): HYPOTHESIS → probe, UNKNOWN → ask, neither gets a test; coverage is Pareto: test the untested public behaviors + main error paths, not lines (gate floor 60%); a regression test only for a VERIFIED code defect, never pinning env|config values that worked once (fix + validate at startup instead); e2e=build the publishable artifact and consume it like a user, covering EVERY page|route|screen|component of a UI (real Playwright browser) and EVERY CLI command|API endpoint at least once. The gate fails closed without `.vae/VERIFY.py`, any verb, or `verify` running lint test coverage e2e, and when e2e leaves no fresh file in `output/`. CI runs async: after a push report the run URL and finish, NOT wait for it (`gh run watch`), since the local gate is the proof (`init` writes `.github/workflows/verify.yml`; commands in `CONFIG["ci"]`).
Toolchain: tool versions pinned in `mise.toml` (`make setup` runs `mise install`) and the ecosystem's own pin; new projects and subprojects start on `bun` (JS/TS, `bun init`) or `uv` (Python, `uv init`), never npm/yarn/pnpm/pip/poetry (their new lockfiles fail the gate); other stacks: the plugin's `references/STACKS.md`. An existing toolchain stays unless the human approves migrating; propose it.
Habits: separate concerns (pure core logic; I/O, config and framework glue at the edges) in small single-purpose modules testable with real inputs; split by responsibility, never speculatively. Logs: one line per event, ISO-8601 UTC timestamp first (`2026-10-01T12:00:00.123Z`), then level, message, key=value; never secrets. Config: env vars from a gitignored `.env`, exported by the Makefile to every recipe and the app; every key the code reads stays in `.env.example` without secret values (gate-checked); validate config once at startup, fail fast. Services exit cleanly on SIGTERM.
Long runs: check free disk before big writes, CPU|RAM|GPU before heavy jobs (`vae.py swarm status`); run them detached from the shell (an SSH drop cannot kill them) with a pid file and a log appended per line with an ISO-8601 timestamp: services `make start`, jobs `vae.py swarm spawn`. Local HTTPS|reverse proxy: Caddy's internal CA (`caddy reverse-proxy --from localhost:8443 --to :3000`).
Sub-agents (hard rule): split only into units with disjoint target paths AND explicit contracts, else stay sequential; one git worktree per unit, outside the repo (`../<repo>.wt/<name>`) or, IF writes there are blocked, `tmp/worktrees/<name>` excluded from test discovery (without git: a directory no other agent claims), small chunks, results on disk early; spawned sessions never run `wrap`; register|update|remove only via `vae.py swarm` (`.vae/SWARM_STATUS.yaml`: one entry per live agent, owner-written, re-checked after 3 s); the orchestrator runs `vae.py swarm status` on a timer (harness scheduler|cron) every ~ETA/4, 5 to 30 min, and never trusts silence.
Epistemics: `VERIFIED`=direct evidence; `HYPOTHESIS`=testable inference + falsifier; `UNKNOWN`=not established. Never promote or widen by rhetoric|repetition|recency|detail.
Ponytail: understand → YAGNI → reuse → stdlib → native → installed dependency → minimum code; bug fix=root cause + sibling callers.
Docs: why this design beats a plausible alternative; prefix material claims `VERIFIED:`|`HYPOTHESIS:`|`UNKNOWN:`. Pages (`*.md|*.mdx`) are gated: `vae.py prose --fix`, rewrite the rest by meaning against the plugin's `references/PROSE.md`; schematic content → a rendered Mermaid diagram; `README.md` per package with a CLI|API, `ARCH.md` (why + how, operations, security, privacy) per package with production code, both VERIFIED facts only.
Lessons: test|`.vae/VERIFY.py` rule > MEMORY line > EPISODES line; IF no rule kind (`command`, `file_exists`, `contains`, `regex`, `not_regex`) can express an invariant THEN plan and write a project check `.vae/checks/<id>.py` (stdlib, exits non-zero printing the fix) and a `command` rule that runs it; an entry binds only in its evidenced `[scope]`, below the current request; narrow|rewrite|drop disproved ones.
Stack defaults (plugin `references/STACKS.md`):
js lint: `bunx oxlint --deny-warnings` (plain oxlint exits 0 on findings)
js test: `bun test`; a Vite app: `vitest run`, which shares the Vite config and transforms
js coverage: `bun test --coverage` (vitest: `vitest run --coverage` with `@vitest/coverage-v8`)
js e2e: `bun pm pack`, then `bun add <tgz>` in a clean consumer that runs on `input/`
js pin: `packageManager` in `package.json`; new packages are ESM, libraries build with pkgroll; never npm, yarn or pnpm.
web e2e: the built app, served via `make start`, driven in a real Playwright browser (`bunx playwright install --with-deps chromium` or `uv run playwright install --with-deps chromium`): WebGL2 on GPU-less CI via the launch args `--use-angle=swiftshader --enable-unsafe-swiftshader`, real network, permissions via `context.grantPermissions([...])` (Python `grant_permissions`); fail on console errors and failed requests; the report (`outputDir`) goes to `output/`.
web https: Caddy's internal CA covers `localhost` (trusted on first run): `caddy reverse-proxy --from localhost:8443 --to :3000`, static files `caddy file-server --domain localhost --root <dir>`.
<!-- defuss-vae:end -->
