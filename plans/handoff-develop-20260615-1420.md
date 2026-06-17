# Handoff: Phase 6 (per-line sidecar) DONE + probe-gate frozen — Phase 7 (viewers) is next

## Branch
`develop` based on `master`. CRITICAL (unchanged across all handoffs): the source
files are committed only on the `develop-baseline` branch (built with git plumbing
at phase 0 so HEAD never moved). On `develop`, the sources (`api/`, `common/`,
`tools/`, `tests/`, `jfred/`, `unified/`, `diff/`, `viewer/`, `plans/`, etc.) are
present as **UNTRACKED** files — `git status` shows them as `??`. That is EXPECTED,
not a problem. Review any change with `git diff develop-baseline -- <path>`.
`develop-baseline` tip = `9968536`.

## Goal
Restructure the RevEng codebase into a base `api/` layer (one canonical home per
capability) plus thin tools/viewers that only call the api, one phase per session
in dependency order (`plans/tool-suite-migration-plan.md`). Phases 0–6 are COMPLETE.
This session finished Phase 6 (per-line sidecar) and earlier resolved the probe-gate
self-contamination blocker. The next phase is **Phase 7 — viewers** (does NOT depend
on the probe gate). Phase 8 (probe repoint + archive sweep) follows and DOES rely on
the now-frozen probe fixture.

## Current State
All four gates verified GREEN at the close of Phase 6 (this is a Node project — there
is NO pytest; gate commands are in How to Verify):
- **Full suite: 36 suites / 443 passed / 0 failed** — identical to phase 5 (the
  phase-6 modules moved unchanged, so no tests were added or removed).
- **detect-rewinds: 15/15** (`node tests/detect-rewinds.test.js`, outside the glob).
- **Sidecar e2e (HARD — this is the engine phase 6 split): 247/247 matchedObserved,
  0 matchedPresumed, 0 mismatched, 0 neverObserved, 233 conflicts in ONE cluster @
  2026-05-17T02:02:43.192Z** — exact baseline match.
- **Probe e2e: now runs against the FROZEN read-only fixture** (resolved this
  session): `~/Programming/jot-recovery/probe-fixture-20260615/{projects,file-history}`.
  Numbers: list1 315 (287 PASS / 28 MISMATCH / 0 NF), list2 435 (268 PASS / 103
  MISMATCH / 64 NF). develop-baseline vs working tree produce BYTE-IDENTICAL
  probe-results-v2.json on it. (Phase 7 doesn't need this; Phase 8 does.)

Phase 6 changes (all in the untracked working tree):
- Created `api/line-belief.js`, `api/edit-splice.js`, `api/line-state-evidence.js`
  (at the 300-line cap), `api/final-line-verdict.js` — byte-identical copies of the
  former `common/` modules (`diff`-verified). Their same-dir relative requires
  (`edit-splice`→`./line-belief`, `final-line-verdict`→`./line-state-evidence`)
  resolve in `api/` with zero edits.
- Created `api/track-line-states.js` (~185L): `trackLineStates` + its private
  helpers, requiring lb/es/flv/evidence from `./` (api same-dir).
- Slimmed `tools/track-line-states.js` to a PURE CLI (parseArgs, resolveAliasPaths,
  discoverJsonls, latestSnapshotBlob, chooseReference, print*, main) that requires
  `trackLineStates` from `../api/track-line-states`. NO library exports (was
  `{trackLineStates, parseArgs}` → removed; nothing imported parseArgs).
- Repointed all 5 test suites `common/→api/` (test-line-belief, test-edit-splice,
  test-final-line-verdict, test-line-state-evidence, test-track-line-states).
- Removed the 4 `common/` originals; wrote concise header tombstones to
  `common/archive/{line-belief,edit-splice,line-state-evidence,final-line-verdict}.js`.

## What Remains
**Phase 7 — viewers** (ordered; the entire next session). The repoint set was
confirmed by grepping the viewer HTML; do the same to re-confirm before editing.
1. **Create `web-shared/` and move the 9 `common/jfred-*.js` files into it**
   (browser UI, not base api — folder name decided 2026-06-12): jfred-state,
   jfred-adapter, jfred-alllines (300L, at cap — move byte-identical), jfred-filter,
   jfred-layout, jfred-load-helpers, jfred-panes, jfred-steps, jfred-viewer-panes.
   These are script-tag globals (no `require()`), so no internal import edits.
2. **Delete unified/'s 3 re-export shims** — `unified/jfred-adapter.js`,
   `unified/jfred-unified-filter.js`, `unified/jfred-unified-panes.js` (finding F1;
   they re-export common/jfred-adapter/filter/panes). KEEP `unified/jfred-unified-load.js`
   (the real loader). Repoint `unified/jfred-unified.html` script tags to the real
   homes (web-shared/jfred-*).
3. **Repoint every viewer page's `../common/*` script tags → `api/*` (engine) or
   `web-shared/*` (jfred UI).** Pages: `jfred/jfred.html`, `unified/jfred-unified.html`,
   `diff/jfred-diff.html`, `viewer/jsonl-tree-viewer.html`. The current `../common/`
   srcs to repoint (count = pages using each): json-inspector(4), diff-engine(4),
   replay-edits(3), jsonl-parse(3), git-file-state(3), file-state-history(3),
   extract-file-state(3), classify-edits(3), unified-reconstruct{,-steps,-patch}(2
   each), jfred-layout(2), jfred-alllines(2). NOTE: one old common/ tag may map to
   SEVERAL api/ files now — e.g. `common/replay-edits.js` split into
   `api/edit-stream-extraction.js` + `api/edit-replay.js` (+ replay-verification) in
   phase 5; `common/diff-engine.js` LCS → `api/line-diff.js`. Check each module's
   `module.exports` in its api/ home to see which file(s) the page actually needs.
4. **Replace `viewer/viewer-diff.js`'s LCS half with `api/line-diff.js`** (finding
   F2 duplicate) — confirm api/line-diff exports the LCS/render surface the viewer
   used before deleting the local copy.
5. **Archive the now-orphaned `common/` script-tag modules** once no HTML/JS loads
   them: the SHORT tombstones (replay-edits 16L, extract-file-state 13L,
   git-file-state 11L, diff-engine 6L, file-state-history 6L, unified-reconstruct
   7L, unified-reconstruct-steps 6L, unified-reconstruct-patch 6L) move to
   `common/archive/`; AND the still-FULL files (see gotcha below) jsonl-parse.js
   (342L) + classify-edits.js (102L) must be deduped vs their api/ homes, then
   archived. Also decide json-inspector.js's destination (see gotcha).
6. **Verify by opening each viewer in a browser** and loading a sample JSONL (e.g.
   `test-transcript.jsonl` at repo root): jfred/jfred.html, unified/jfred-unified.html,
   diff/jfred-diff.html, viewer/jsonl-tree-viewer.html. There are NO automated
   browser tests — this manual check is the only gate for steps 1–5. Then re-run the
   3 node gates (full suite, detect-rewinds, sidecar) to confirm nothing regressed.

**Phase 8 — probe repoint + archive sweep** (the session AFTER phase 7): remove the
6 re-exports from `tools/probe-projects-v2.js` (its 6 test suites import the real
homes); confirm v2 parity against the FROZEN fixture (list1 315 287/28/0, list2 435
268/103/64); archive `tools/probe-projects.js` v1, `tools/branch-summary.js`,
`tools/snapshot-reconstruction.js` (verify no hidden callers first); set
`plans/tool-suite-api-proposal.md` stage-3 status to DONE.

## Key Files
- `plans/tool-suite-migration-plan.md` — the plan; "### Phase 7 — viewers" is the
  next spec; checklist now has Phase 6 `[x]`; regression-gates section points the
  probe gate at the frozen fixture.
- `plans/tool-suite-api-spec.md` — destination authority; "## Viewer layer after
  migration" (jfred-*→web-shared/, delete unified shims, script tags common/*→api/*,
  jsonl-tree-viewer.ts stays at root) and "## Archive" sections.
- `plans/tool-suite-function-inventory.md` — "## Viewer code" section (lines ~359-388)
  lists each jfred-*.js with which pages require it, and the viewer-page data flow.
- `plans/implementation-notes-tool-suite-migration-plan.md` — **READ THIS FIRST.**
  The running design/deviation log for the whole migration. The last three entries
  are the most relevant: the probe-gate resolution (`2026-06-15T13:45`), the full
  Phase 6 post-mortem (`2026-06-15T14:15`), and the Phase 7 scoping findings appended
  at session wrap (the jsonl-parse/classify-edits "not tombstones" gotcha,
  json-inspector's undecided home, the unified shims, generated viewer pages, and the
  one-tag→many-api-files split). Every "Context the Next Agent Won't Have" item below
  is captured there in more detail.
- Viewer dirs to edit: `jfred/`, `unified/`, `diff/`, `viewer/`; create `web-shared/`.
- `viewer/viewer-diff.js` — LCS duplicate to replace with `api/line-diff.js`.

## Plan File
`plans/tool-suite-migration-plan.md` (Phase 7 is next; global rules at the top —
300-line cap incl. test files, one-condition-per-if, no forwarding layers, archive
procedure, vocabulary: never "corpus"/"mint").

## Context the Next Agent Won't Have
- **PRIOR HANDOFF MISLABEL — jsonl-parse.js and classify-edits.js are NOT
  tombstones.** The 2026-06-15-1300 handoff listed them among the "in-place
  tombstones," but they are still FULL files: `common/jsonl-parse.js` 342L,
  `common/classify-edits.js` 102L. They were kept full because the viewers load them
  via script tag and phase 1/2 did not tombstone script-tag-loaded files. Phase 7
  must determine whether their content is duplicated in the api/ phase-1/2 homes
  (api/transcript-parsers, api/rewind-classification, api/classify-edits?) or has
  diverged, repoint the script tags, then dedup + archive. Do NOT assume "just move a
  tombstone."
- **json-inspector.js destination is UNDECIDED.** `common/json-inspector.js` (esc,
  syntaxHighlight, addJumpLinks, renderInspector) is browser UI loaded by 4 pages but
  is NOT a jfred-* file and is NOT explicitly placed by the api-spec. It is browser
  code, so web-shared/ is the natural home (alongside jfred-*), but CONFIRM with the
  user or the spec's intent before moving — it's the one viewer module the plan left
  unaddressed.
- **One old common/ script tag often maps to MULTIPLE api/ files** (phase 4/5 splits):
  replay-edits → edit-stream-extraction + edit-replay (+ replay-verification);
  diff-engine LCS → api/line-diff; extract-file-state's pieces are spread across
  api/ now. Read each api/ home's exports before repointing a `<script>` tag.
- **viewer/ has GENERATED pages** — `jsonl-tree-viewer-monolith.html`,
  `JSONL-tree-viewer-v2.html`, `JSONL-tree-viewer-v2-dev.html` are OUTPUT of the
  root generator `jsonl-tree-viewer.ts` (which STAYS at repo root). Edit the
  generator and regenerate; do not hand-patch generated HTML. Only
  `viewer/jsonl-tree-viewer.html` is a hand-maintained page.
- **No automated browser tests exist.** Steps 1–5 of Phase 7 can only be verified by
  opening the HTML pages in a real browser. This is the riskiest verification gap in
  the whole migration — budget time to actually open all four and load a JSONL.
- **Verification is a bash one-liner, NOT pytest** — the full-suite gate uses bash
  `case` syntax that zsh rejects (parse error); run it via `bash -c '...'`. See How
  to Verify.
- **The PostToolUse hook runs `test-<basename>.js` on each edit** and can lag /
  report stale failures mid-multi-edit; it also warns on pre-existing over-cap files
  (probe-projects.js 666L, verify-all-scenarios.js) — both pre-existing, accepted.
  Trust a direct `node tests/<suite>.js` over a lagging hook message.
- **For byte-identical MOVES use `cp`, not Write.** `cp` guarantees the bytes AND
  bypasses the 300-line write-hook (which would reject an at-cap file like
  jfred-alllines.js 300L). `diff old new` to verify, then repoint, then archive.
- **node has `--inspect` in NODE_OPTIONS here** — CLI runs print "Debugger
  listening…/Debugger attached" to stderr. Filter it (`2>/dev/null` or
  `grep -v Debugger`) when parsing CLI output.
- **Archive form (phase-6 precedent):** the at-cap modules can't be archived as
  full-commented originals (commenting breaches the 300-line cap), so phase 6 used
  concise header tombstones in common/archive/ pointing to the api/ home (bodies live
  byte-identical in api/ + git). Reuse this form for any at-cap phase-7 archive.
- **Open (non-blocking, from phase 4):** the editsForFile contract (write+edit kinds)
  is still unconfirmed by the user; no phase-7 dependency.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

Full suite (expect 36 suites / 443 passed / 0 failed):
```bash
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'
```

detect-rewinds (expect 15 passed, 0 failed):
```bash
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1
```

Sidecar e2e (expect 247/247 matchedObserved, 0 mismatched, 233 conflicts):
```bash
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null
```

Probe e2e against the FROZEN fixture (Phase 8 gate; expect list1 315 287/28/0,
list2 435 268/103/64):
```bash
node tools/probe-projects-v2.js \
  --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects \
  --snapshots   ~/Programming/jot-recovery/probe-fixture-20260615/file-history 2>/dev/null | grep '^list'
```

Phase 7 viewer check (no automated test — open each in a browser, load a JSONL):
`jfred/jfred.html`, `unified/jfred-unified.html`, `diff/jfred-diff.html`,
`viewer/jsonl-tree-viewer.html`.
