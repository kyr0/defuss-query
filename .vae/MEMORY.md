# Agent memory

<!-- One tagged line per durable fact NOT derivable from code, git or docs:
- VERIFIED[scope] fact BC evidence
- HYPOTHESIS[scope] claim BC observation; falsifier=`cmd`
- UNKNOWN[scope] gap BC missing evidence
[scope] = the narrowest path|module|command|condition the evidence covers, not a topic: the entry decides nothing
outside it, and recurrence inside one subsystem never widens it.
Every line carries its BC and stays within 240 chars. Replace stale lines instead of appending.
Mechanizable lessons belong in tests or .vae/VERIFY.py.
Budget 4 KiB (`vae.py doctor --repo .`); entries are injected at session start. -->
- VERIFIED[make verify@CI] CI starts from a fresh checkout without dist/ or coverage/; a verb that reads dist/ must depend on build BC run 41262277402 failed in make lint (tests import ../dist); check with git clone + make verify
