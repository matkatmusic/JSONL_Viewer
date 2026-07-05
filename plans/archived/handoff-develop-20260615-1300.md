# Handoff: Phase 5 done + RESOLVE the self-contaminating probe e2e dataset before Phase 8

## Branch
`develop` based on `master`. NOTE (unchanged from prior handoffs): source files are
committed only on the `develop-baseline` branch (built with git plumbing at phase 0 so
HEAD never moved); `develop`'s working tree holds the sources as UNTRACKED files. `git
status` shows api/, common/, tools/, tests/ etc. as `??` — expected, not a problem.
Review any change with `git diff develop-baseline -- <path>`.

## Goal
Restructure the RevEng codebase into a base `api/` layer (one canonical home per
capability) plus thin tools/viewers that only call the api, one phase per session in
dependency order (plans/tool-suite-migration-plan.md). Phases 0–5 are COMPLETE. This
handoff (a) records that Phase 5 landed and is verified, and (b) hands off ONE open
decision the user surfaced: the probe end-to-end gate's dataset is self-contaminating,
so its recorded pass/fail numbers no longer hold. That must be resolved before Phase 8
(which reuses the probe gate). Phases 6 and 7 do NOT depend on it.

## Current State
Phase 5 (reconstruction) complete; all four gates verified 2026-06-15 (this is a Node
project — there is NO pytest; gate commands are in How to Verify):
- **Full suite: 36 suites / 443 passed / 0 failed.** Net +23 tests vs phase 4's
  37/420 is EXACTLY the new granular tests (snapshot-store-io 10, the previously
  untested quartet; reconstruction-reference-sources +6 chooseReferenceSource/
  distinctBasenames; edit-replay +3 applySingleEdit; edit-stream-extraction +4
  extractKeptEditsForFile + fileModifyingEventsInTranscript). Suite count 37→36:
  −9 deleted + 8 new (reconciled line-by-line in implementation-notes).
- **detect-rewinds: 15/15** (`node tests/detect-rewinds.test.js`, outside the glob).
- **Sidecar e2e: 247/247 matchedObserved, 0 matchedPresumed, 0 mismatched, 0
  neverObserved, 233 conflicts in ONE cluster @ 2026-05-17T02:02:43.192Z** — exact
  phase-0 match.
- **Probe e2e: PASSES as behavior-equivalence, NOT as the recorded numbers** — see
  the dedicated section below. This is the open item.

Phase 5 created 9 api modules + moved the unified trio:
`api/edit-stream-extraction.js` (extractEditsFromJSONL, extractKeptEditsForFile,
NEW fileModifyingEventsInTranscript), `api/edit-replay.js` (replayEdits,
applySingleEdit), `api/replay-verification.js` (replayAndVerify,
replayAndVerifyCumulative, batchVerify, formatResults, collectSessionsForFile —
exactly 300 lines), `api/reconstruction-reference-sources.js`
(gather/chooseReferenceSource, distinctBasenames, findLastSnapshotContent/Blob),
`api/snapshot-store-io.js` (NEW leaf: defaultBaseHistoryDir, resolveHistoryDir,
readBackupFile, getSnapshotBackups), `api/git-file-state.js` (common/git-file-state +
the 4 find-jsonls-at-commit git-rename helpers), `api/line-diff.js`,
`api/file-state-history.js`, `api/unified-reconstruct{,-steps,-patch}.js`. Both
phase-4 transitional api→common imports are resolved (zero api→common requires
remain). CLIs moved to `tools/replay-edits.js` and `tools/unified-reconstruct.js`.
`tools/probe-reference-sources.js` archived to `tools/archive/`. The emptied common/
modules (replay-edits, extract-file-state, git-file-state, diff-engine,
file-state-history, unified-reconstruct*) are IN-PLACE header-only tombstones (still
script-tag-loaded by jfred/unified/diff viewers — phase 7 repoints + archives them).

## THE OPEN ISSUE — probe e2e dataset has extra JSONLs not in the phase-0 baseline
**Symptom.** `node tools/probe-projects-v2.js` no longer returns the recorded gate
numbers (list1 459: 448 PASS / 11 MISMATCH; list2 540: 367 PASS / 104 MISMATCH /
69 NOT_FOUND). Today it returns **list1 477: 448 PASS / 29 MISMATCH / 0 NOT_FOUND;
list2 558: 380 PASS / 109 MISMATCH / 69 NOT_FOUND.** The COUNTS rose (459→477,
540→558), which a verbatim refactor cannot cause.

**Root cause — the dataset is NOT static (the handoff's "verified static" is stale).**
`~/Programming/jot-recovery/claude-data/projects` is the probe corpus, and it CONTAINS
the RevEng project's OWN session transcripts. 13 JSONL files there are newer than the
2026-06-12 phase-0 measurement; the newest are from 2026-06-15 and include THIS
migration's sessions, e.g.
`projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/4cb86804-...jsonl`
(and `9500a7be-...`, `da970623-...`), plus `-Users-matkatmusicllc-Desktop-claude-code-src/`
and `-Users-matkatmusicllc-Programming-jot-recovery/` folders. Those transcripts
AUTHORED the new api/ + test files across phases 1–5, so the probe now enumerates ~18
more file identities per list and reconstructs them (with the expected mismatch rate).
Every migration session grows the corpus.

**PROOF the migration code is correct (do this to re-confirm at any time).** A/B test:
run the phase-0 baseline code AND the working tree against the SAME current dataset —
they produce BYTE-IDENTICAL probe output (both list1 477/448/29/0, list2 558/380/109/69).
So the migration changed nothing in the probe pipeline; 100% of the drift is the
dataset. Commands:
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
git worktree add /tmp/reveng-baseline develop-baseline
for tree in /tmp/reveng-baseline .; do (cd "$tree" && node tools/probe-projects-v2.js \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots   ~/Programming/jot-recovery/claude-data/file-history 2>/dev/null | grep '^list'); done
git worktree remove /tmp/reveng-baseline --force
```

**The probe v2 has NO allowlist / folder-exclude flag.** Confirmed by reading
runProbeV2 (probe-projects-v2.js:238–261): it consumes only `opts.projectsDir` +
`resolveSnapshotDir(opts)`; the scan `td.loadAllJsonlFilesInProjectsFolder` loads
everything; `collectAuthoredPaths` (78–89) filters only temp paths. CLI usage is
`--projects-dir [--snapshots]`. So "restrict to a list of files" is NOT available
without a code change.

**Three options presented to the user (decision PENDING — ask before implementing):**
1. **Freeze a dataset fixture (recommended).** rsync the corpus to a read-only dir
   EXCLUDING the self-referential folders (so it's both stable AND clean — a naive
   freeze would lock in today's contamination), re-measure the baseline once on the
   frozen copy (working tree and develop-baseline will agree), and repoint the gate
   command + plans/tool-suite-migration-plan.md regression-gates section at it:
   ```bash
   DEST=~/Programming/jot-recovery/probe-fixture-20260615
   rsync -a --delete \
     --exclude '-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/' \
     --exclude '-Users-matkatmusicllc-Desktop-claude-code-src/' \
     ~/Programming/jot-recovery/claude-data/projects/ "$DEST/projects/"
   rsync -a ~/Programming/jot-recovery/claude-data/file-history/ "$DEST/file-history/"
   chmod -R a-w "$DEST"
   ```
   CONFIRM the exclude list with the user first (the two `claude-code-src*` folders are
   the migration's own sessions; the `-Programming-jot-recovery` folder is the real
   historical corpus and should STAY — but verify whether its 06-15 file is self-work).
2. **Add an exclude/allowlist flag to the probe (the only way to do "option 2").** Small
   code change: honor e.g. `--exclude-folder` in scanProjectsFolderOnce /
   collectAuthoredPaths, or filter discoverProjects. Keeps a live (non-frozen) gate.
3. **A/B equivalence gate.** Make the gate "working tree == develop-baseline on the same
   dataset" (the proof commands above). Drift-immune; needs the baseline branch kept;
   strip non-deterministic fields (meta.generatedAt) before diffing. Downside: only ever
   says "same as baseline," never an absolute pass rate.

User leaned toward option 2 IF the probe already supported a file list (it does not), so
the live choice is 1, 3, or implementing 2. Recommend option 1 with self-folder exclusion.

## What Remains
1. **RESOLVE the probe-gate dataset issue above** (user decision pending). If option 1:
   confirm the exclude list, build the fixture, re-baseline both code versions on it,
   update the gate command + the regression-gates section of
   plans/tool-suite-migration-plan.md (and this issue's resolution in
   implementation-notes). If option 2: implement the exclude flag with RED-green TDD.
   If option 3: rewrite the gate section to the A/B procedure.
2. **Phase 6 — per-line sidecar** (next migration phase; does NOT need item 1). Move
   common/line-belief.js, common/edit-splice.js, common/line-state-evidence.js
   (EXACTLY 300 lines — move byte-identical), common/final-line-verdict.js UNCHANGED to
   api/; move trackLineStates from tools/track-line-states.js to api/track-line-states.js
   (CLI stays in tools/). Repoint tools/track-line-states.js CLI + tests. Sidecar e2e
   gate applies. Follow the per-capability RED-green procedure; grep the inventory's
   caller lists (every phase found MORE callers than the plan named).
3. **Phase 7 — viewers.** common/jfred-*.js (9 files) → web-shared/; delete unified/'s 3
   re-export shims; repoint every page's script tags common/* → api/* (this is where the
   phase-1/5 in-place tombstones — jsonl-parse, classify-edits, replay-edits,
   extract-file-state, git-file-state, diff-engine, file-state-history,
   unified-reconstruct* — finally get archived); viewer-diff.js LCS replaced by
   api/line-diff.js. No automated browser tests — verify by opening each viewer HTML.
4. **Phase 8 — probe repoint + archive sweep.** REQUIRES item 1 resolved first. Remove
   the 6 re-exports from tools/probe-projects-v2.js; confirm v2 parity on the (now fixed)
   probe gate; archive tools/probe-projects.js v1, tools/branch-summary.js,
   tools/snapshot-reconstruction.js.

## Key Files
- `plans/tool-suite-migration-plan.md` — the plan; Phase 5 checklist now [x] with the
  probe-drift note; "### Phase 6" block is the next session's spec; regression-gates
  section holds the probe gate command that item 1 will update.
- `plans/implementation-notes-tool-suite-migration-plan.md` — running log; the LAST
  entry (2026-06-15T13:30) is the full Phase 5 post-mortem + the probe-contamination
  OPEN QUESTION with all three options.
- `plans/tool-suite-api-spec.md` — destination authority for every api module (Phase 6
  per-line sidecar + track-line-states sections).
- `plans/tool-suite-function-inventory.md` — authoritative per-function caller lists
  (grep these; F-findings).
- `tools/probe-projects-v2.js` — the probe (runProbeV2:238–261; no exclude flag today).
  v1 `tools/probe-projects.js` is an archive candidate (phase 8), still over the
  300-line cap (pre-existing warning, accepted).
- `tools/track-line-states.js`, `common/line-belief.js`, `common/edit-splice.js`,
  `common/line-state-evidence.js` (300 lines), `common/final-line-verdict.js` — Phase 6
  sources/movers.

## Plan File
`plans/tool-suite-migration-plan.md` (Phase 6 is next; global rules — 300-line cap incl.
test files, one-condition-per-if, no forwarding layers, archive procedure, vocabulary:
never "corpus"/"mint" — are at the top).

## Context the Next Agent Won't Have
- **Verification is a bash one-liner, NOT pytest** — the plan's full-suite gate is bash
  syntax zsh rejects (a `case` parse error); run via `bash -c`. See How to Verify.
- **The probe gate's "static dataset" assumption is BROKEN** (the whole open issue). Do
  NOT treat 448/11 & 367/104/69 as still valid — they were a 2026-06-12 snapshot and the
  corpus has grown every RevEng session since. Resolve item 1 before trusting the probe.
- **Tombstone FORM decision (user-confirmed):** emptied script-tag-loaded common/ files
  are header-only tombstones kept IN PLACE until phase 7 (NOT archived now, overriding
  the prior handoff's step-9). Full prior bodies are recoverable from develop-baseline.
  This deviates from the earlier handoff on purpose — the plan's phase-1 precedent wins.
- **snapshot-store-io.js is a NEW module not named in the spec** (user-confirmed) — the
  cap + a layering-inversion ruled out folding the IO quartet into either consumer; same
  cap-driven-extra-module pattern as phase 4's split-read-assembly.js.
- **extractKeptEditsForFile was a name collision:** reconstruct.js's path-based
  {kept,ignored,total} version is the canonical api export (edit-stream-extraction);
  replay-edits' private text→array version became the private keptEditsArrayFromText in
  replay-verification. Don't try to reconcile them (different signatures, out of scope).
- **The unified engine "moves unchanged" but its 576-line test was SPLIT** into
  test-unified-reconstruct{,-steps,-patch}.js (one suite per moved module; the hook runs
  test-<basename>.js, and the 300-line cap applies to test files). 67 tests preserved.
- **Hook timing / line caps:** the PostToolUse hook reports stale failures mid-multi-edit
  and warns on pre-existing over-cap files (probe-projects.js 666, verify-all-scenarios.js
  deep-nesting) — both pre-existing, accepted. Trust a direct `node tests/<suite>.js` run
  over a lagging hook message.
- **Suffix-match gotcha (still live for Phase 6 fixtures):** an alias path must be
  STRICTLY LONGER than `'/'+shortenedKey` to match — use `/work/repo/t.py`, never
  `/repo/t.py` against key `repo/t.py`.
- **`toolUseResult.originalFile` is sometimes empty — never rely on it alone.**
- **Open (non-blocking, from phase 4):** the editsForFile contract (write+edit kinds) is
  still unconfirmed by the user; no phase-6 dependency.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

Full suite (expect 36 suites / 443 passed / 0 failed; per-suite parity, growth only from
new api suites):
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
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)'
```

Probe e2e (CURRENTLY drifts — until item 1 is resolved, verify via the A/B equivalence
commands in THE OPEN ISSUE section above, NOT against fixed numbers).
```

```
