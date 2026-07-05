# Handoff: Start Phase 5 (reconstruction) of the tool-suite api migration

## Branch
`develop` based on `master`. NOTE: source files are committed only on the
`develop-baseline` branch (built with git plumbing at phase 0 so HEAD never
moved); `develop`'s working tree holds the sources as UNTRACKED files. Review any
change by diffing the working tree against the baseline:
`git diff develop-baseline -- <path>`. `git status` will keep showing api/,
common/, tools/, tests/ etc. as untracked `??` — that is expected, not a problem.

## Goal
Restructure the RevEng codebase into a base `api/` layer with one canonical home
per capability, plus thin tools/viewers that only call the api. The work proceeds
one phase per session in dependency order (plans/tool-suite-migration-plan.md).
Phases 0–4 are done. This handoff starts **Phase 5 — reconstruction**, the
largest and highest-risk phase: it splits the 553-line `common/replay-edits.js`
and moves the reconstruction engine into `api/`.

## Current State
Phases 0–4 complete and all regression gates green. Verified just now:
- **Full suite: 37 suites / 420 passed / 0 failed** (run via the bash one-liner
  in How to Verify — the project is Node, NOT pytest).
- **detect-rewinds: 15/15** (`node tests/detect-rewinds.test.js`, outside the
  test-*.js glob).
- **Sidecar e2e: 247/247 matchedObserved, 0 mismatched, 0 neverObserved,
  tailUncertain=false, 233 conflicts in ONE cluster @ 2026-05-17T02:02:43.192Z** —
  exact match to the phase-0 baseline.

Phase 4 created three api modules (all under the 300-line cap):
`api/file-events-extractors.js` (294), `api/file-event-observations.js` (279),
`api/split-read-assembly.js` (169). `tools/extract-file-events.js` was archived to
`tools/archive/`. `tools/assemble-split-reads.js` keeps only its CLI (repointed to
`api/split-read-assembly`). `common/extract-file-state.js` was NOT archived: it
keeps `findLastSnapshotContent`/`findLastSnapshotBlob` plus the shared snapshot-IO
helpers and has the four moved extractors as in-place commented tombstones (it
sits at 397 physical lines and trips the 300-line hook WARNING — accepted until
phase 5 archives it, exactly as phase 1 did with jsonl-parse.js).

There are TWO transitional `api→common` imports that Phase 5 must resolve (see
What Remains): both live in code that Phase 5 touches anyway.

## What Remains
Phase 5 — reconstruction (one session; do NOT combine with other phases). New
api modules: `api/edit-stream-extraction.js`, `api/edit-replay.js`,
`api/replay-verification.js`, `api/reconstruction-reference-sources.js`,
`api/git-file-state.js`, `api/line-diff.js`, `api/file-state-history.js`.

1. Read the required docs first, in order: `plans/tool-suite-api-spec.md` (THE
   destination authority — see the `api/edit-stream-extraction.js`,
   `api/edit-replay.js`, `api/replay-verification.js`,
   `api/reconstruction-reference-sources.js`, `api/git-file-state.js`,
   `api/line-diff.js` sections), `plans/tool-suite-function-inventory.md`
   (findings F1/F3 and the per-function caller lists), and
   `plans/tool-suite-api-proposal.md` (layer rules + migration process). Then this
   plan's Phase 5 section (plans/tool-suite-migration-plan.md, the "### Phase 5"
   block) and the Phase 4 post-mortem in
   `plans/implementation-notes-tool-suite-migration-plan.md`.
2. RED first: write the new api modules' test suites (port assertions from the
   suites of the modules being split/moved; new behavior gets new granular
   tests). Watch them fail. The PostToolUse hook runs `tests/test-<basename>.js`
   on every edit; trust a direct `node tests/<suite>.js` run over a lagging hook
   message. Remember the 300-line cap applies to TEST files too (a Phase 4
   test file had to be compacted to fit).
3. Split `common/replay-edits.js` (553 lines) across the first three modules:
   `extractEditsFromJSONL` (+ `extractKeptEditsForFile`, origin tools/reconstruct.js)
   → `api/edit-stream-extraction.js`; `replayEdits`/`applySingleEdit` →
   `api/edit-replay.js`; the verification functions (replayAndVerify, batchVerify,
   formatResults, collectSessionsForFile, replayAndVerifyCumulative) →
   `api/replay-verification.js`. Note: replay-edits' four F1 extractor re-exports
   were ALREADY removed in Phase 4 — do not expect them.
4. Form `api/reconstruction-reference-sources.js` from
   `tools/probe-reference-sources.js` + the `findLastSnapshot*` family currently
   in `common/extract-file-state.js`. Decide the PERMANENT api home for the
   snapshot-IO quartet (`defaultBaseHistoryDir`, `resolveHistoryDir`,
   `readBackupFile`, `getSnapshotBackups`) — both `api/file-event-observations`
   (extractSnapshotEdits) and `api/reconstruction-reference-sources`
   (findLastSnapshot*) need them. Then RESOLVE Phase 4's transitional import:
   `api/file-event-observations.js` currently imports `{resolveHistoryDir,
   readBackupFile, getSnapshotBackups}` from `common/extract-file-state.js` — point
   it at the new permanent home instead.
5. RESOLVE the second transitional import: `api/file-events-extractors.js` imports
   `extractEditsFromJSONL` from `common/replay-edits` — repoint it to
   `api/edit-stream-extraction.js`.
6. Add `fileModifyingEventsInTranscript` to `api/edit-stream-extraction.js` as the
   canonical home for the diff viewer's `groupEditsByFile` logic (deferred from
   Phase 4; spec table row already moved here). It is edit-representation, not
   event-representation. The diff viewer repoints onto it in phase 7, not now.
7. Move the remaining pieces: `common/git-file-state.js` + the
   `tools/find-jsonls-at-commit.js` git helpers → `api/git-file-state.js`;
   `common/diff-engine.js` → `api/line-diff.js`; `common/file-state-history.js` →
   `api/file-state-history.js`; `common/unified-reconstruct*.js` (3 files) move
   UNCHANGED (the unified engine survives, viewer-only, per finding F3). CLI
   behavior in replay-edits and unified-reconstruct moves to `tools/`.
8. REPOINT every caller — grep the inventory's caller lists, do NOT trust the
   plan's summary (every phase so far found MORE callers than the plan named:
   phase 4 surfaced tests/test-cat.js and tests/test-read.js unlisted). Known
   targets: tools/probe-projects-v2.js, tools/reconstruct.js, tools/branch-summary.js
   (archive candidate — check for callers first), the probe CLIs, and the largest
   test repoint set of any phase.
9. ARCHIVE fully-emptied modules: once `common/replay-edits.js` and
   `common/extract-file-state.js` are fully commented out, move them to
   `common/archive/`. Procedure: comment each function out as it moves; when the
   module is fully commented, move it to that directory's `archive/` subfolder.
10. GATE: full suite (per-suite parity, growth only from new api suites) +
    detect-rewinds 15/15 + BOTH e2e gates (sidecar AND probe — see How to Verify).
    Then update the Phase 5 checklist line in plans/tool-suite-migration-plan.md
    and append a Phase 5 post-mortem to the implementation-notes file.

## Key Files
- `plans/tool-suite-migration-plan.md` — the plan; "### Phase 5" block is the
  spec for this session; checklist at the bottom (Phases 0–4 marked [x]).
- `plans/tool-suite-api-spec.md` — THE destination authority for every api module.
- `plans/tool-suite-function-inventory.md` — authoritative per-function caller
  lists (grep these; findings F1 forwarding re-exports, F3 two engines).
- `plans/implementation-notes-tool-suite-migration-plan.md` — running log;
  read the Phase 4 post-mortem (last entry) for the transitional-import state.
- `common/replay-edits.js` (553 lines) — the engine being split.
- `common/extract-file-state.js` (397, tombstoned) — donates findLastSnapshot* +
  the snapshot-IO quartet; gets archived this phase once emptied.
- `tools/probe-reference-sources.js`, `tools/reconstruct.js`,
  `tools/find-jsonls-at-commit.js`, `common/git-file-state.js`,
  `common/diff-engine.js`, `common/file-state-history.js`,
  `common/unified-reconstruct*.js` — Phase 5 sources/movers.
- `api/file-event-observations.js`, `api/file-events-extractors.js` — hold the two
  transitional `api→common` imports Phase 5 must repoint.

## Plan File
`plans/tool-suite-migration-plan.md` (Phase 5 section). Required reading and the
global rules (300-line cap, one-condition-per-if, no forwarding layers, archive
procedure, vocabulary: never "corpus"/"mint") are at the top of that file.

## Context the Next Agent Won't Have
- **Verification is a bash one-liner, not pytest.** The plan's full-suite gate
  command is bash syntax that zsh rejects (a `case` parse error) — run it via
  `bash -c`. See How to Verify for the exact command.
- **The probe e2e gate uses MEASURED phase-0 baselines, not the plan's original
  numbers.** User confirmed 2026-06-12: list1 448 PASS / 11 MISMATCH, list2 367
  PASS / 104 MISMATCH / 69 NOT_FOUND. The plan's regression-gates section already
  quotes these. The dataset under ~/Programming/jot-recovery is verified static.
- **"Numbers must not change" = per-suite parity + growth ONLY from new api
  suites.** Adding RED→GREEN api suites necessarily raises the total; moving tests
  between suites shifts per-suite counts. Verify line-by-line that no UNexplained
  delta appears (every phase has done this).
- **F1's four replay-edits re-exports are already gone** (removed early in Phase 4
  because the extractors' home moved then). Don't plan to remove them again.
- **Suffix-match gotcha (cost a debugging round in an earlier phase):** an alias
  path must be STRICTLY LONGER than `'/'+shortenedKey` to match. Test fixtures
  using `/repo/t.py` against snapshot key `repo/t.py` silently match NOTHING — use
  a longer target like `/work/repo/t.py`.
- **`toolUseResult.originalFile` is sometimes empty — never rely on it alone.**
- **Tombstoned files trip the 300-line hook WARNING** (replay-edits 553,
  extract-file-state 397). That is accepted for tombstones until they are
  archived; it does not block writes. extract-file-state's line-335 deep-nesting
  warning is pre-existing kept code (findBackupByBasename), untouched.
- **Open question still open from Phase 4 (non-blocking, no Phase 5 dependency):**
  `editsForFile` in api/file-events-extractors.js was implemented as the write +
  edit kinds (the spec table said "edit kind"; read as the authored-modification
  partition). `readsForFile` = readFull/readChunk/cat is unambiguous. The user has
  not yet confirmed the editsForFile contract.
- **Hook timing:** the PostToolUse hook can report stale failures mid-flight when
  one logical change spans several edits (e.g. an export referencing a
  not-yet-defined symbol). Final direct `node tests/<suite>.js` runs are the
  source of truth.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

Full suite (expect per-suite parity with phase 4's 37 suites / 420 passed / 0
failed, plus only new-api-suite growth):
```bash
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'
```

detect-rewinds (expect 15 passed, 0 failed):
```bash
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1
```

Sidecar e2e (expect 247/247 matchedObserved, 0 mismatched, 233 conflicts @
2026-05-17T02:02:43.192Z):
```bash
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history \
  --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)'
```

Probe e2e (slow; Phase 5 gate — expect list1 448 PASS / 11 MISMATCH, list2 367
PASS / 104 MISMATCH / 69 NOT_FOUND):
```bash
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history
```
