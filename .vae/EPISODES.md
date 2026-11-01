# Episodes

<!-- Newest last. The gate appends FAIL|DONE|FINDING; past 100 entries it trims only its own oldest DONE|FAIL|learned
FINDING (git keeps them). Leads (LESSON, FINDING learn=none) stay until wrap settles them; doctor fails above 30.
Agents append `<UTC ISO> s=<session> LESSON <VAE-DIALECT>` only for a falsified HYPOTHESIS, a dead end, or a root cause.
Session start injects the 3 newest open entries: LESSON, FINDING learn=none, FAIL without a later DONE.
Wrap: EVERY lead becomes a test | .vae/VERIFY.py rule | one MEMORY line with BC, then delete; OR delete BC evidence. -->

2026-10-31T16:51:19Z s=eb20f35d FAIL prose,layout,wiring,env.example,package,lint=?,tests.e2e=?,coverage=?
2026-10-31T17:15:10Z s=eb20f35d FAIL lint
2026-10-31T17:17:01Z s=eb20f35d FAIL tests.e2e.1
2026-10-31T17:22:21Z s=eb20f35d DONE fp=09d44df5e3b0 cov=100.0% paths=.github/workflows/verify.yml,AGENTS.md,ARCH.md,Makefile(+41)
2026-10-31T17:22:21Z s=eb20f35d FINDING README.md:125|ARCH.md:21 learn=verifier: .vae/VERIFY.py rule docs.peer-range runs .vae/checks/peer_range.py over README, ARCH, SKILL, AGENTS and docs/**/*.html
2026-10-31T17:22:21Z s=eb20f35d FINDING README.md:28 (quick start) learn=none: README snippets are not executed by a test; docs/index.html shows the same setup and docs-e2e runs that page
2026-10-31T17:22:21Z s=eb20f35d FINDING ARCH.md section 5|SKILL.md Events|src/query.ts header learn=none: semantic doc drift; the on(): native cases in tests/suite.browser.test.ts pin the behavior the docs now describe
2026-10-31T17:22:21Z s=eb20f35d FINDING SKILL.md:55|README.md Why learn=none: engine behavior (defuss-morph moves with insertBefore); ARCH says query never patches the engine; no test pins an upstream limitation
2026-10-31T17:22:21Z s=eb20f35d FINDING README.md:17 learn=verifier: scripts/readme-sync.ts checks the gzip-size marker on every build and verify
2026-10-31T17:22:21Z s=eb20f35d FINDING src/query.ts:381 removeClass(names) learn=test: tests/suite.browser.test.ts classes case now removes named tokens and checks the kept one
2026-10-31T17:22:21Z s=eb20f35d FINDING src/query.ts:719 df$(fn) while loading learn=test: tests/edge.browser.test.ts: ready callback waits for DOMContentLoaded while the document is loading (document.open on a frame)
2026-10-31T17:22:21Z s=eb20f35d FINDING src/query.ts (6 ternary statements)|scripts/build.ts:17|scripts/package-tests.ts:55 learn=verifier: make lint (oxlint --deny-warnings + tsc) is now a gate verb
2026-10-31T17:22:21Z s=eb20f35d FINDING scripts/readme-sync.ts|AGENTS.md:4 learn=memory: project memory defuss-query-standalone-repo records the move
2026-10-31T17:22:21Z s=eb20f35d FINDING README.md Self-hosted section learn=none: one-time doc correction
2026-10-31T17:22:21Z s=eb20f35d FINDING README.md Size|ARCH.md section 6 learn=none: docs now list each budget as verify.ts checks it
2026-10-31T17:22:21Z s=eb20f35d FINDING scripts/package-tests.ts:41 learn=test: package-tests runs in make e2e and writes output/package-tests.json with the packed file list
2026-11-01T01:38:54Z s=eb20f35d DONE fp=304fff9f8389 cov=100.0% paths=.github/workflows/verify.yml,AGENTS.md,ARCH.md,Makefile(+42)
2026-11-01T01:38:54Z s=eb20f35d FINDING docs/assets/site.css:83|syntax color rule learn=test: docs-e2e measures every token's color and contrast in both schemes
2026-11-01T01:38:54Z s=eb20f35d FINDING docs/index.html:167|hero click handler learn=test: docs-e2e extracts the hero's application script from the page, runs it on a fixture list and checks keep, reorder and the click result
2026-11-01T01:38:54Z s=eb20f35d FINDING scripts/highlight.ts:sourceOf learn=test: docs-e2e static check highlights 'if (a < 3)' and requires the '<'
2026-11-01T01:38:54Z s=eb20f35d FINDING scripts/highlight.ts:highlightPage mockup regex learn=test: docs-e2e now flags any non-empty pre[data-lang] or [data-lang] > pre without tokens
2026-11-01T01:38:54Z s=eb20f35d FINDING docs/assets/site.css|empty code lines learn=none: visual layout detail; no rendered-height check would be more than a pinned pixel value
2026-11-01T01:42:10Z s=eb20f35d DONE fp=9cd35c681abb cov=100.0% paths=.github/workflows/verify.yml,AGENTS.md,ARCH.md,Makefile(+42)
2026-11-01T01:42:10Z s=eb20f35d FINDING docs/index.html:577|CTA title learn=none: copy change by the maintainer, nothing to verify mechanically
2026-11-01T01:47:40Z s=eb20f35d DONE fp=ec967898137a cov=100.0% paths=Makefile
2026-11-01T01:47:40Z s=eb20f35d FINDING Makefile:lint|typecheck|test-types learn=memory: .vae/MEMORY.md: CI starts without dist/; verbs that read dist/ depend on build; check with git clone + make verify
