# Handoff: flickering-marinating-pike.md conformed to planning.md; next agent executes Phase 1 (git-seed beacon)
Conversation name: Plan 'make engine B the main engine'
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/8769e62c-33d3-4885-8f13-f8c53d377e8d.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; all RevEng source is untracked).
CWD: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

## Goal
Drive Engine B (the per-line sidecar reconstruction engine) toward 100% file-history reconstruction and
consolidate the tool onto a single engine. **This session was documentation-only:** it brought the active
implementation plan `flickering-marinating-pike.md` into conformance with `~/.claude/guides/planning.md` (and the
guides it requires — `tdd.md`, `coding-standards.md`, `single-condition-branching.md`) so the plan can be executed
test-first. The next agent **executes Phase 1 of that plan (the git-seed beacon)**.

## Current State
Documentation work complete and self-verified. **No source code changed; no tests were run** (doc-only task);
branch is still at `1a9f098`.
- Rewrote `/Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md` to conform:
  - **Context** and **Open items** sections kept verbatim.
  - Added a top-level **Build order** section (8-step execution sequence).
  - **Phase 1** restructured into 8 test-first items, each `Behavior → RED test → GREEN implementation`; every test
    now carries `# Scenario:` / `# Steps:` comments and proves one behavior. Added the two missing failure-case
    tests (`test_readGitCommitTimestamp_returnsNullOnUnknownSha`, `test_resolveSeedFromCommit_returnsNullWhenContentMissing`).
  - **Phases 2–4** converted to the same block shape at sketch granularity, keeping roadmap labels + Open-item links.
  - Disambiguated the two vague instructions ("~4 lines" → exact guard block; "print a seed summary line" → exact
    format string); wrote the two compound-condition spots as nested single-condition JS snippets.
- **Conformance verified** (greps + structural review): no `&&`/`||` inside any code snippet, no tabs (4-space
  throughout), RED precedes GREEN in every item, all test names match `test_<behavior>`, Context/Open-items intact.
- Conformance spec written at `/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-structured-island.md`.
- Implementation notes written at `RevEng/plans/implementation-notes-make-engine-b-the-main-engine.md`.

## What Remains
Execute **Phase 1 of `flickering-marinating-pike.md`** in its Build order, strict red-green TDD (write each
`test_<behavior>`, watch it fail, then minimum code to pass):
1. `readGitCommitTimestamp(repoRoot, sha)` in `api/git-file-state.js` (`git show -s --format=%cI` via
   `cp.execFileSync`; ms via `Date.parse`; `null` on failure; export it). Tests → `tests/test-git-seed.js`.
2. `seedBeliefFromGitContent(belief, content, seedMs, sha)` in **new** `api/git-seed.js` (4-space indent).
3. `buildGitSeedRef(sha, lineNum)` in `api/git-seed.js`.
4. `filterEventsAfter(events, seedMs)` in `api/git-seed.js`.
5. `resolveSeedFromCommit(repoRoot, sha, relPath)` in `api/git-seed.js`.
6. Wire `opts.gitSeed` into `trackLineStates` (`api/track-line-states.js`, ~1 guard block after
   `lb.createBelief()`). Tests → `tests/test-track-line-states-git-seed.js`.
7. Add `--seed-commit` to `tools/track-line-states.js` CLI (covered by the E2E proof + no-seed regression, **no
   unit test by design** — documented in the plan).
8. E2E proof on `util_lib.py`: negative control (seed BEFORE the line-3839 edit vs fixture corpus → still
   mismatches) and positive (seed AT/AFTER → `mismatched 0, neverObserved 0`).

Do **not** start Phases 2–4 without answering the 3 **Open items** in the plan (bulk auto-seed algorithm,
category-(b) deleted/moved target, Engine A retirement timing).

## Key Files
- `/Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md` — THE plan (now conformant; Phase 1 detailed, 2–4 sketched, Open items).
- `RevEng/plans/implementation-notes-make-engine-b-the-main-engine.md` — notes on this session's conformance rewrite (design decisions, JSONL path).
- `RevEng/api/git-file-state.js` (~196L) — git content/ref helpers; ADD `readGitCommitTimestamp`, export it.
- `RevEng/api/git-seed.js` — **does not exist yet**; create it (Items 2–5).
- `RevEng/api/track-line-states.js` (234/250) — Engine B tracker; wire `opts.gitSeed` (Item 6).
- `RevEng/api/line-belief.js` (246/250 — AT CAP, do NOT add functions) — reuse `makeClaimEntry` (call only).
- `RevEng/api/line-state-evidence.js` — reuse `splitContentIntoLineSpans`.
- `RevEng/api/final-line-verdict.js` — `buildFinalVerdict` (unchanged; the fix is which belief it sees).
- `RevEng/tools/track-line-states.js` — single-file CLI; add `--seed-commit` (Item 7).
- `RevEng/plans/handoff-develop-20260619-1157.md` — the prior handoff this session continued from.

## Plan File
`/Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md`

## Context the Next Agent Won't Have
- **This session changed only documentation.** The plan's function names, target files, signatures, reuse targets,
  and the util_lib.py proof design are unchanged from the prior handoff — only the document's *structure and
  precision* changed. Trust the plan as written.
- **User decisions made this session:** (a) make ALL phases TDD-conformant (not just Phase 1), but keep Phases 2–4
  labeled as sketches; (b) keep the detailed **Context** section verbatim even though planning.md prefers less
  rationale — do not trim it.
- The JSONL log path for this conversation is in the header above (also recorded in
  `implementation-notes-make-engine-b-the-main-engine.md`).
- **Carried from the prior handoff, still true:**
  - The 252-function rename pass introduced a `require.runMain` (should be `require.main`) dead-entry bug; 2 tools
    were fixed — CHECK other `tools/*.js` for the same pattern.
  - Engine A gate reports **28 MATCH / 1 MISMATCH / 4 SKIP**; the 1 MISMATCH (`celsius_to_fahrenheit`) is
    PRE-EXISTING (likely from the rename pass) — out of scope, triage separately.
  - `tools/probe-results-engine-b.json` reflects the FRESH `~/Programming/jot-recovery/claude-data` corpus (1085
    jsonls, ~1281 identities), not the fixture; the fixture results were backed up to `/tmp` (may not survive reboot).
  - `util_lib.py` was a corpus gap, not an engine bug — the line-3839 edit is absent from the fixture corpus but
    present in the fresh `claude-data` corpus (reconstructs 470/0/0/0 there).
  - **Git-seed design locked with user:** SHA → `git show <SHA>:<path>` content seeds belief as a Tier-1 `observed`
    beacon (eofConfirmed); then replay ONLY JSONL events with `unixMs > committer-date`. No SHA → today's behavior
    (fully opt-in). Defaults: committer date (`%cI`), strictly-after, seeded lines `observed`.
  - **Coding standards** (Stop hook runs tests on edit): 4-space indent, verb-first names, one condition per `if`
    (no `&&`/`||`), 250-line file cap. Exclude `tests/test-output-data.js` from `for f in tests/test-*.js` sweeps.

## How to Verify
This session's deliverable is the conformant plan document; verify it structurally, then verify Phase 1 once built.

```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"

# Verify the plan document is conformant (this session's work):
P=/Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md
grep -nE 'test_[A-Za-z0-9_]+' "$P"        # all names must be test_<behavior>
grep -n '&&\|||' "$P"                       # only prose/bash sweep should match — never a JS `if`

# After building Phase 1 (the remaining work):
node tests/test-git-seed.js
node tests/test-track-line-states-git-seed.js
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" || { echo "FAIL: $f"; exit 1; }; done
python3 -m pytest tests/test_run_all_scenarios.py        # 6 passed (unaffected)
# E2E: util_lib.py negative-control + positive seed runs (see plan Item 8).
# Regression: node tools/track-line-states.js --path <file>  with NO --seed-commit → byte-identical to before.
```
