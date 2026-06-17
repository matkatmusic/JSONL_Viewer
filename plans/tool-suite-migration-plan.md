# Tool Suite — stage 3 migration plan

Executable from cold: this document plus the three required-reading docs below
contain everything needed. One phase per session, in order.

## Required reading (in this order)
1. plans/tool-suite-api-spec.md — the approved contract: every api/ module and
   which existing functions move into it. THE authority on destinations.
2. plans/tool-suite-function-inventory.md — every export with callers; findings
   F1–F6 (forwarding layers, duplicates, two engines, cap-forced splits).
3. plans/tool-suite-api-proposal.md — layer rules and migration process.

## Global rules (enforced by hooks and user directives — violations get rejected)
- Strict red-green TDD: for any new or changed behavior, write
  tests/test-<basename>.js first and watch it fail before writing code. A
  PostToolUse hook runs the matching test file on every edit; trust a direct
  `node tests/<suite>.js` run over the last hook message (hook runs can lag).
- 300-line cap per source file (hook REJECTS larger writes). One condition per
  `if` (nest, never && / ||; ternaries only for value selection). Nesting >3
  deep rejected — extract helpers.
- NO forwarding layers: functions MOVE to their api/ home; every caller imports
  the home directly. Never re-export, never delegate through a new interface.
- Archive procedure (user-defined): comment out each function in the old module
  as it moves; when an old module is fully commented out, move it to an
  archive/ subfolder of the directory it lived in.
- Vocabulary: never "corpus" (say "all JSONL files in the projects folder");
  "create", never "mint". Schemas are annotated JS literals with intent
  comments and NO example values; the non-null sub-object IS the kind.
- `toolUseResult.originalFile` is sometimes empty — never rely on it alone.

## Regression gates (run after EVERY phase; numbers must not change)
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
# Full suite — expect 385+ passed, 0 failed across all suites:
for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) echo "$t: $(node "$t" 2>/dev/null | grep -E 'passed, [0-9]+ failed')";; esac; done
# Sidecar e2e (after phases 4, 5, 6) — expect 247/247 matchedObserved, 0
# mismatched, 233 conflicts in one cluster at 2026-05-17T02:02:43Z:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history \
  --out /tmp/plate-check.json | head -5
# Probe e2e (after phases 5 and 8; slow) — runs against the FROZEN, read-only
# fixture, NOT live claude-data. Live claude-data self-contaminates: it contains
# the RevEng project's OWN session transcripts, so every migration session grew
# the corpus and drifted the numbers (the old 448/11 & 367/104/69 were a
# 2026-06-12 snapshot and no longer hold). Fixture built 2026-06-15 by rsync of
# claude-data EXCLUDING the two migration project folders
# (-Users-...-Desktop-claude-code-src and -Users-...-Desktop-claude-code-src-RevEng),
# then chmod -R a-w. Re-measured on the fixture: develop-baseline and the working
# tree produce BYTE-IDENTICAL probe-results-v2.json (1,687,159 bytes, ignoring
# meta.generatedAt). Expect:
#   list1 filesInProject:    count 315 — 287 PASS / 28 MISMATCH / 0 NOT_FOUND
#   list2 filesNotInProject: count 435 — 268 PASS / 103 MISMATCH / 64 NOT_FOUND
# To rebuild the fixture (e.g. on a new machine), see the "probe-gate dataset
# resolution" entry in implementation-notes for the exact rsync recipe.
node tools/probe-projects-v2.js \
  --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects \
  --snapshots   ~/Programming/jot-recovery/probe-fixture-20260615/file-history
```

## Per-capability procedure (repeat for every phase)
1. RED: write the api module's test suite (port assertions from the old
   module's suite where the function moves unchanged; new behavior gets new
   granular tests). Run it; watch it fail (module does not exist yet).
2. GREEN: create the api/ module(s); move the function bodies verbatim unless
   the spec says otherwise. Comment out the moved functions in the old module.
3. REPOINT: update every caller listed for the phase (inventory has the full
   lists); old module's own tests repoint or move with the code.
4. ARCHIVE: any old module now fully commented out moves to its directory's
   archive/ subfolder.
5. GATE: run the full suite + the phase's e2e checks. All numbers unchanged.
6. Update the checklist at the bottom of this document; if ending the session,
   create a handoff (/handoff-prompt) naming the next phase.

## Phases (one per session; dependency order; spec sections name the exports)

### Phase 0 — baseline
Confirm with the user, then commit the current tree (almost everything is
untracked; file moves need a tracked baseline to be reviewable). Record the
full-suite count and both e2e baselines.

### Phase 1 — api/transcript-parsers.js + api/rewind-classification.js
Sources fully emptied: common/jsonl-parse.js (334 lines, splits across the two
modules), common/classify-edits.js (→ rewind-classification);
extractSessionMetadata leaves common/git-file-state.js.
Repoint: tools/detect-rewinds.js, tools/turn-analyzer.js, tools/reconstruct.js,
tools/probe-projects-v2.js, common/replay-edits.js (analyzeJSONL).
Viewer HTML script tags WAIT until phase 7 — until then the old files keep the
commented-out originals, so move jsonl-parse.js/classify-edits.js to archive/
only in phase 7 if viewer pages still reference them (check script tags first).

### Phase 2 — api/transcript-discovery.js + api/subagent-transcript-discovery.js
Sources: discovery half of common/collect-touches.js (301 lines, frozen),
discoverProjects/cwdFromFolderName from tools/probe-projects.js,
groupFilesByFolder from tools/probe-v2-report.js, all of
common/subagent-jsonls.js (moves unchanged).
Bonus: moving both sides kills the lazy-require cycle between collect-touches
and probe-projects (inventory notes it).
Repoint: tools/find-jsonls-for-file.js, tools/track-line-states.js,
tools/probe-projects-v2.js, tools/find-jsonls-at-commit.js, tests.

### Phase 3 — api/file-historical-lineage.js + api/file-path-history.js + api/extract-bash-file-ops.js
Sources: lineage half of collect-touches.js (collect-touches then fully
commented → archive), editBelongsToFile from tools/probe-v2-assembly.js,
common/file-path-history.js and common/extract-bash-file-ops.js move unchanged.
Repoint: tools/probe-projects-v2.js, tools/probe-v2-assembly.js, tests.
Gotcha (spec records it): suffix matching requires the alias path to be
STRICTLY LONGER than '/'+key — test fixtures must use targets like
/work/repo/t.py, never /repo/t.py against key repo/t.py.

### Phase 4 — api/file-events-extractors.js (+ api/file-event-observations.js, + a 3rd sibling only if the 300-line cap forces it)
Source: tools/extract-file-events.js (268 lines) moves — extractFileEvents,
extractFileEventsFromText, authoredEventsFromKeptEdits, readProvedEof (CLI stays
a thin repointed wrapper in tools/).
Absorbs the four extract-file-state.js extractors (stripCatLineNumbers,
extractBashCatEdits, extractReadEdits, extractSnapshotEdits) — EXPORTED from the
api home, NOT internals (decision 2026-06-13): replay-edits.js,
unified-reconstruct-steps.js, and api/file-historical-lineage.js still consume
them and repoint here this phase (those modules don't move to api/ until phase 5).
Absorbs tools/assemble-split-reads.js: assembleSplitReads (exported);
extractReadEvents moves in but is INTERNAL (unexported) — its only external
caller was extract-file-events. assemble-split-reads CLI stays a thin wrapper in
tools/. extractReadEvents is NOT a true F2 duplicate (decision 2026-06-13): it
keeps per-chunk metadata (offset/limit, parsed line numbers) that assembleSplitReads
and the read-event kinds need, while extractReadEdits returns whole-content records
that replay/lineage need — neither serves the other's callers. Unifying the two
read-scanners is added to the roadmap as item 17 (handoff-develop-20260611-1727.md
§D), deferred per the spec's two-representations decision.
NEW behavior (red tests first): readsForFile, editsForFile (wish-list items 2, 3
— thin per-file filters over extractFileEventsFromText).
fileModifyingEventsInTranscript is NOT built here (decision 2026-06-13): the diff
viewer already provides it via extractEditsFromJSONL + groupEditsByFile
(diff/jfred-diff-main.js:16-22, common/jfred-load-helpers.js:26), an
edit-representation capability whose pieces move in phases 5 and 7 — an
event-based twin now would duplicate it. It moves to phase 5 beside
extractEditsFromJSONL instead (one representation, one home; diff viewer repoints
onto it in phase 7). Amend the spec's file-events-extractors export table to move
that row to phase 5.
Stays put until phase 5 (extract-file-state.js is NOT archived this phase):
findLastSnapshot* and the snapshot-IO trio (defaultBaseHistoryDir,
resolveHistoryDir, readBackupFile) — extractSnapshotEdits and findLastSnapshot*
both use the trio, so it stays in common/ and extractSnapshotEdits imports it
transitionally from there (the phase-2 api→common precedent, repointed in phase
5). extractEditsFromJSONL likewise still imported from common/replay-edits until
phase 5.
Repoint: tools/track-line-states.js, common/replay-edits.js,
common/unified-reconstruct-steps.js, api/file-historical-lineage.js,
tools/extract-file-events.js's own internal requires, tests — grep the
inventory's caller lists (every phase so far found more callers than the plan
named).
Sidecar e2e gate applies (hard requirement this phase).

### Phase 5 — reconstruction: api/edit-stream-extraction.js, api/edit-replay.js, api/replay-verification.js, api/reconstruction-reference-sources.js, api/git-file-state.js, api/line-diff.js, api/file-state-history.js, unified engine moves
The 553-line replay-edits.js splits across the first three (its 4 forwarding
re-exports die — F1); probe-reference-sources + findLastSnapshot* form
reconstruction-reference-sources; git-file-state merges the
find-jsonls-at-commit git helpers; diff-engine → line-diff;
unified-reconstruct*.js move unchanged. CLI behavior in replay-edits and
unified-reconstruct moves to tools/.
Carried forward from phase 4 (decisions 2026-06-13): (a) fileModifyingEventsInTranscript
lands here as the canonical home for groupEditsByFile's logic, beside
extractEditsFromJSONL in api/edit-stream-extraction.js (phase 7 repoints the diff
viewer onto it); (b) the snapshot-IO trio (defaultBaseHistoryDir,
resolveHistoryDir, readBackupFile) gets its permanent api home decided HERE — both
api/file-events-extractors (extractSnapshotEdits) and
api/reconstruction-reference-sources (findLastSnapshot*) need it; phase 4's
transitional api→common imports of the trio and of extractEditsFromJSONL resolve
once this phase lands.
Repoint: tools/probe-projects-v2.js, tools/reconstruct.js,
tools/branch-summary.js (archive candidate — check first), tools/probe CLIs,
tests (largest repoint set — grep the inventory's caller lists).
BOTH e2e gates apply. This is the highest-risk phase; do not combine with
anything else.

### Phase 6 — per-line sidecar moves
api/line-belief.js, api/edit-splice.js, api/line-state-evidence.js,
api/final-line-verdict.js move unchanged; trackLineStates moves from
tools/track-line-states.js to api/track-line-states.js (CLI stays in tools/).
line-state-evidence.js is EXACTLY 300 lines — move it byte-identical.
Repoint: tools/track-line-states.js CLI, tests. Sidecar e2e gate applies.

### Phase 7 — viewers
common/jfred-*.js (9 files) → web-shared/; delete unified/'s 3 re-export shims
(repoint the HTML imports to the real homes); repoint every page's script tags
common/* → api/* per the inventory's script-tag lists; viewer-diff.js LCS
replaced by api/line-diff.js. Archive any phase-1/5 leftovers the pages were
still holding alive. No automated tests exist for browser code: verify by
opening jfred/jfred.html, unified/jfred-unified.html, diff/jfred-diff.html,
viewer/jsonl-tree-viewer.html and loading a sample JSONL in each.

### Phase 8 — probe repoint + archive sweep
Remove the 6 re-exports from tools/probe-projects-v2.js (its 6 test suites
import the real homes). Confirm v2 parity (probe e2e gate — now against the
frozen fixture: list1 315 287/28/0, list2 435 268/103/64), then archive
tools/probe-projects.js v1, tools/branch-summary.js,
tools/snapshot-reconstruction.js per the spec's confirmed archive list —
verifying no hidden callers (lazy require, script tags) before each move.
Final: full suite + both e2e gates + update plans/tool-suite-api-proposal.md
stage 3 status to DONE.

## Phase checklist (update as you go)
- [x] Phase 0 — baseline (2026-06-12: develop-baseline branch @ 9968536; full
  suite 33 suites / 385 passed / 0 failed; sidecar 247/247 matchedObserved,
  0 mismatched, 233 conflicts @ 2026-05-17T02:02:43Z; probe list1 448 PASS /
  11 MISMATCH, list2 367 PASS / 104 MISMATCH / 69 NOT_FOUND — measured
  baselines supersede the stale numbers quoted above, dataset verified static)
- [x] Phase 1 — transcript-parsers + rewind-classification (2026-06-12: 35
  suites / 409 passed / 0 failed — both new api suites green (12+14), per-suite
  parity with baseline verified line-by-line (only change: git-file-state
  20→18, its 2 extractSessionMetadata tests moved to test-transcript-parsers);
  detect-rewinds scenario tests 15/15; sidecar e2e re-checked: 247/247
  matchedObserved, 0 mismatched, 233 conflicts — unchanged)
- [x] Phase 2 — transcript-discovery + subagent-transcript-discovery
  (2026-06-12: 36 suites / 412 passed / 0 failed — new api suites green (8+6);
  per-suite parity with phase 1 verified line-by-line, every delta is a moved
  test (collect-touches 13→10, probe-helpers 19→18, probe-v2-report 7→6,
  test-subagent-jsonls renamed to test-subagent-transcript-discovery 6→6) plus
  3 brand-new granular tests for previously untested discoverProjects /
  enumerateJsonlFiles / collectAllJsonls; detect-rewinds scenario tests 15/15;
  sidecar e2e unchanged: 247/247 matchedObserved, 0 mismatched, 233 conflicts;
  collect-touches↔probe-projects lazy-require cycle eliminated;
  common/subagent-jsonls.js archived to common/archive/)
- [x] Phase 3 — file-historical-lineage + file-path-history + extract-bash-file-ops
  (2026-06-12: 36 suites / 418 passed / 0 failed — new test-file-historical-lineage
  green (17: 10 moved from deleted test-collect-touches, 1 moved from
  test-probe-v2-assembly 8→7, 6 brand-new granular tests for previously
  untested resolveAgainstCwd / gatherAllOps / editBelongsToFile branches);
  test-bash-file-ops renamed test-extract-bash-file-ops 27→27; per-suite parity
  with phase 2 verified, no unexplained delta; detect-rewinds scenario tests
  15/15; sidecar e2e unchanged: 247/247 matchedObserved, 0 mismatched, 233
  conflicts; phase-2 transitional import in api/transcript-discovery.js
  repointed; collect-touches.js, file-path-history.js, extract-bash-file-ops.js
  all fully tombstoned and archived to common/archive/)
- [x] Phase 4 — file-events-extractors (2026-06-13: 37 suites / 420 passed / 0
  failed — cap forced a 3-module split: api/file-events-extractors.js (294,
  event layer + readsForFile/editsForFile), api/file-event-observations.js (279,
  the 4 extractors), api/split-read-assembly.js (169, extractReadEvents +
  assembleSplitReads); +2 tests vs phase 3 are exactly the 2 new filter tests,
  all else relocations (new test-file-events-extractors 16, test-split-read-assembly
  5, test-file-event-observations 15; test-cat 11→3, test-read 8→6→2,
  test-extract-file-state 5→4; test-extract-file-events + test-assemble-split-reads
  deleted); tools/extract-file-events.js archived to tools/archive/;
  assemble-split-reads keeps its CLI, extract-file-state keeps findLastSnapshot* +
  shared snapshot-IO quartet (transitional api→common import, phase-5 cleanup);
  F1's 4 replay-edits re-exports killed early (home moved now); extractReadEvents
  stays exported (CLI + cross-module consumer) — unify deferred to roadmap #17;
  fileModifyingEventsInTranscript deferred to phase 5; detect-rewinds 15/15;
  sidecar e2e 247/247 matchedObserved, 0 mismatched, 233 conflicts @
  2026-05-17T02:02:43.192Z — unchanged; viewers unaffected (no viewer uses the
  moved extractors). Open Q: editsForFile = write+edit kinds, confirm.)
- [x] Phase 5 — reconstruction (2026-06-15: 36 suites / 443 passed / 0 failed —
  9 new api modules: edit-stream-extraction, edit-replay, replay-verification,
  reconstruction-reference-sources, git-file-state, line-diff, file-state-history,
  snapshot-store-io (cap-driven, holds the snapshot-IO quartet), + the
  unified-reconstruct trio moved; the +23 tests vs phase 4 are EXACTLY the new
  granular tests (snapshot-store-io 10, reconstruction-reference-sources +6,
  edit-replay +3, edit-stream-extraction +4), every other suite delta is a
  relocation with assertions preserved (verified line-by-line); both phase-4
  transitional api→common imports resolved (zero api→common requires remain);
  replay-edits/unified-reconstruct CLIs → tools/; common/ replay-edits,
  extract-file-state, git-file-state, diff-engine, file-state-history,
  unified-reconstruct* left as in-place tombstones (viewer script tags — phase 7
  archives, per the phase-1 precedent, NOT archived now despite the handoff);
  tools/probe-reference-sources.js archived to tools/archive/; detect-rewinds
  15/15; sidecar e2e 247/247 matchedObserved, 0 mismatched, 233 conflicts @
  2026-05-17T02:02:43.192Z — exact baseline match; probe e2e is behavior-IDENTICAL
  to the phase-0 baseline code run on the SAME current dataset (worktree A/B:
  both list1 477/448 PASS/29 MISMATCH, list2 558/380 PASS/109 MISMATCH/69 NF) —
  the deviation from the recorded 448/11 & 367/104/69 is 100% dataset drift, NOT
  the migration: the probe dataset includes the -RevEng project's own session
  transcripts, which grew as phases 1-5 ran. RESOLVED 2026-06-15: probe gate now
  runs against the frozen read-only fixture ~/Programming/jot-recovery/
  probe-fixture-20260615 (claude-data minus the two migration project folders);
  re-baselined to list1 315: 287 PASS / 28 MISMATCH / 0 NF, list2 435: 268 PASS /
  103 MISMATCH / 64 NF, with develop-baseline vs working tree byte-identical — see
  the regression-gates section above and implementation-notes.)
- [x] Phase 6 — per-line sidecar (2026-06-15: 36 suites / 443 passed / 0 failed —
  no test-count change, the modules moved unchanged. 4 modules copied
  byte-identical to api/ (line-belief, edit-splice, line-state-evidence at the
  300-line cap, final-line-verdict), each diff-verified identical; their same-dir
  relative requires (edit-splice→line-belief, final-line-verdict→line-state-
  evidence) resolved in api/ with zero path edits. trackLineStates + its private
  helpers (compareEvents..applyEventGroup) extracted to api/track-line-states.js
  (~185L); tools/track-line-states.js slimmed to a pure CLI requiring
  trackLineStates from api/, no library exports. All 5 test suites repointed
  common/→api/ (RED→GREEN each). Caller set was EXACTLY the inventory —
  self-contained, no viewer/probe/lazy entanglement (first phase where actual ==
  inventory). 4 common originals removed; header tombstones in common/archive/
  (the full-commented-original form would breach the cap for the at-cap module —
  bodies preserved byte-identical in api/ + git). detect-rewinds 15/15; sidecar
  e2e (HARD): 247/247 matchedObserved, 0 mismatched, 0 neverObserved, 233
  conflicts in ONE cluster @ 2026-05-17T02:02:43.192Z — exact baseline match.)
- [x] Phase 7 — viewers (2026-06-15: full suite 36/443/0, detect-rewinds 15/15,
  sidecar e2e 247/247 matchedObserved / 0 mismatched / 233 conflicts @
  2026-05-17T02:02:43.192Z — all unchanged. 9 common/jfred-*.js + json-inspector.js
  + jfred-styles.css moved BYTE-IDENTICAL (cp) to the NEW web-shared/ (json-inspector
  home decided web-shared/ — user 2026-06-15 — it is DOM/HTML presentation, not base
  api/); page-loader ES imports + HTML module <script> tags repointed
  ../common/→../web-shared/. The 3 unified/ re-export shims (jfred-adapter,
  jfred-unified-filter, jfred-unified-panes) DELETED — nothing imported them; their
  HTML tags removed. Every page's classic engine <script> tags repointed common/*→
  api/* in DEPENDENCY ORDER (one old tag often → several api/ files; git-file-state /
  replay-verification / reconstruction-reference-sources tags DROPPED — no viewer uses
  them). api/edit-stream-extraction.js made browser-dual (guarded its bare top-level
  requires — a phase-5 browser-safety gap the spec's layer rules require closing;
  behavior-identical in Node, re-gated). v2-dev dev-harness's 2 common/ tags repointed
  (web-shared/json-inspector + api/line-diff); the generator jsonl-tree-viewer.ts
  needed NO change (it emits self-contained output, references nothing in common/);
  v2/monolith reference nothing in common/. viewer-diff.js F2 dedup DEFERRED (user
  decision — its LCS diverged from api/line-diff: 2500-cap+toast, <span> wrapper).
  common/ now FULLY EMPTIED of source — all 20 modules + the css archived to
  common/archive/ (12 .js + css as concise header tombstones per the phase-6 form; 8
  prior short tombstones moved in). tests/test-json-inspector.js repointed to
  web-shared (17/0). VERIFIED IN A REAL BROWSER via Playwright headless: all 4 pages
  (jfred/unified/diff/viewer) load + auto-load a sample JSONL + drive file-selection /
  unified engine / diff-tree with ZERO page/console errors — the pre-migration
  baseline threw "ReferenceError: extractEditsFromJSONL is not defined" on all 3 jfred
  pages.)
- [x] Phase 8 — probe repoint + archive sweep (2026-06-15: FINAL phase. Full suite
  35 suites / 437 passed / 0 failed — DOWN from 36/443 by exactly the archived v1
  dead-code tests (−1 buildNotTestable + −5 test-probe-projects = −6 tests; −1 suite),
  an explained delta; the 5 shared helpers' 17 tests preserved in the new
  test-probe-v2-shared.js. detect-rewinds 15/15. Sidecar e2e 247/247 matchedObserved,
  0 mismatched, 233 conflicts @ 2026-05-17T02:02:43.192Z — exact baseline. Viewers
  Playwright all 4 PASS. Probe e2e on the frozen fixture: list1 315 286/29/0, list2
  435 268/103/64 — parity PROVEN by back-to-back A/B: develop-baseline === working
  tree, BYTE-IDENTICAL probe-results-v2.json (1,687,131 bytes, ignoring top-level
  generatedAt). The list1 287/28→286/29 drift from the recorded gate is live on-disk
  reference drift (the fixture freezes transcripts+snapshots, NOT the live repos
  list1 verifies against), affecting baseline AND working tree identically — NOT the
  migration. Work: removed the 7 forwarding re-exports from probe-projects-v2.js
  (spec said 6) + repointed 4 test suites to the real homes (assembly / report /
  api-reconstruction-reference-sources); moved v1's 5 shared CLI/summary helpers to
  the NEW tools/probe-v2-shared.js (kept in tools/ per user decision — api/ forbids
  argv) and severed v2's last dependency on v1; archived tools/probe-projects.js
  (v1, full 666-line body), tools/branch-summary.js, tools/snapshot-reconstruction.js
  to tools/archive/, and the 2 obsolete v1 test suites to the NEW tests/archive/
  (user-directed full-body moves, not deletions). plans/tool-suite-api-proposal.md
  stage-3 status set to DONE. probe-projects-v2.js is 289 lines — over the jot hook's
  250 limit but under the plan's documented 300 cap, and pre-existing (298 at the
  Phase-7 handoff); accepted. MIGRATION COMPLETE — all 8 phases done.)
