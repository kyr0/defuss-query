# defuss-query: the defuss-vae verbs for humans, agents and CI (`make` lists them).
# Every recipe delegates to a package.json script, so `make verify` (CI) and `bun run check` (prepublishOnly) run
# the same steps and cannot drift apart.

.DEFAULT_GOAL := help
.PHONY: help setup build lint typecheck test test-browser test-types coverage e2e docs metrics bench verify check serve clean start stop restart status log

help: ## list the verbs with their usage (default goal)
	@grep -E '^[a-zA-Z0-9_ -]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## install the locked dependencies and the Playwright chromium browser
	bun install --frozen-lockfile
	bunx playwright install --with-deps chromium

build: ## compile ESM + CJS + browser bundles, write dist/stats.json, check the README size table
	bun run build

lint: ## oxlint (warnings fail) and strict tsc over src, scripts and tests
	bun run lint
	bun run typecheck

typecheck: ## strict tsc type-check (no emit)
	bun run typecheck

# The browser suite loads dist/, so every test verb builds first.
test: build ## vitest: node project + real Chromium project, no coverage
	bunx vitest run

test-browser: build ## vitest Chromium project only
	bun run test:browser

test-types: ## compile-only positive/negative API type tests
	bun run test:types

coverage: build ## vitest with v8 coverage on src/; prints the `All files` table
	bun run test

# Consumes what ships: the npm tarball in a clean temp consumer, then the docs site (which serves the built
# bundles) in Chromium, then the static artifact gate. Reports land in output/.
e2e: build ## packed-consumer tests, docs site in Chromium, artifact gate; reports in output/
	bun run test:package
	bun run test:docs
	bun run verify

docs: build ## copy the built bundles and stats into docs/assets (the site serves what ships)
	bun run docs

metrics: build ## raw, gzip and Brotli bytes per browser bundle (dist/stats.json)
	@bun -e 'const s = require("./dist/stats.json"); for (const [n, f] of Object.entries(s.files)) console.log(n, f.bytes, "bytes", f.gzip, "gzip", f.brotli, "brotli")'

bench: ## no performance claim is made; make metrics reports the measured sizes
	@echo "∅ bench: no performance claim; make metrics reports measured artifact sizes"

start stop restart status log: ## no service (library); make serve runs the examples
	@echo "∅ $@: no service (library)"

verify: lint test coverage e2e ## what CI runs: every gate verb, cheapest first

check: ## the prepublishOnly pipeline (same steps as verify)
	bun run check

serve: ## serve the repository at http://127.0.0.1:8080 (examples at /, docs at /docs/)
	bun run serve

clean: ## remove dist/, coverage/ and output/
	node -e "for (const d of ['dist','coverage','output']) require('node:fs').rmSync(d,{recursive:true,force:true})"
