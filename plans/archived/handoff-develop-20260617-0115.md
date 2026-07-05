# Handoff: Item 5.6 (bash-reads as discovery touches) is SHIPPED & GREEN; items 7–17 remain
Conversation name: implement item 5.6 (enumerated-strolling-piglet plan)
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree (`api/`,
`tools/`, `tests/`, `plans/`, …) is **UNTRACKED** by design (`git status` → 18 `??`); only
`.gitignore` is tracked (shows `M`, +6 lines — pre-existing, unrelated). Review changes with
`git diff develop-baseline -- <path>`. The committed source tree lives on **`develop-baseline`**
(tip `880b69d`, the Item-5.6 re-baseline). `june17-backup` is a safety branch; no `-plate` branch
exists. If `git status` ever shows files staged (`A`) instead of untracked (`??`), that's a stray
IDE/index artifact — `git reset`.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts, driving toward 100% reconstruction (roadmap:
`plans/roadmap-100-percent-reconstruction.md`, 17 items). Items 1–6 are closed. **Item 7** is next:
records without timestamps are currently dropped *silently* at several points in the pipeline; per
the project's **no-silent-caps** rule, emit an explicit dropped-record COUNT instead of swallowing
them.

## Current State
**Item 5.6 is SHIPPED & CLOSED this session** (strict red-green TDD). All four standing gates GREEN:
- Full suite **58 suites / 586 passed / 0 failed** (was 57/582: +4 tests, +1 suite file).
- detect-rewinds **15 / 0**.
- Sidecar e2e `plate_summary.py` **247/247 matchedObserved, 0 mismatched, conflicts 233**.
- Probe A/B vs `develop-baseline` **`identical: true`** (after the 5.6 re-baseline).
- Every new/edited file ≤ 250 lines.

Work delivered (all UNTRACKED on `develop`):
- NEW `api/bash-read-touches.js` (75 L) — `collectBashReadTouches(parsed, cwd)`: pairs each parseable
  Bash-read `tool_use` (head/tail/sed -n/`wc -l`/`grep -n`) with its `tool_result` by id and emits one
  coarse `{kind:'bashread', path, line}` touch, so a transcript that ONLY bash-reads a file is now
  discoverable. Mirrors `collectGrepTouches` (lazy `resolver()` cycle-break; reuses
  `parseBashReadCommand`). `touch.line` anchors at the **tool_result** record index.
- EDITED `api/file-historical-lineage.js` 243→245 — 3-line wiring (var-decl + require + one
  `Array.prototype.push.apply(touches, collectBashReadTouches(parsed, cwd))` beside the grep call).
- NEW `tests/test-file-historical-lineage-bash.js` (67 L, 4 tests) — split per the 250-cap precedent.
- `develop-baseline` advanced `124dfbc → 880b69d` (mirror of current source; temp-index method).
- Roadmap item 5.6 flipped `[ ]`→`[x]` with a DONE block;
  `plans/implementation-notes-item5.6-bashread-touches.md` written.

## What Remains
Ordered by execution sequence.

1. **Item 7 — dropped-record count for timestampless records (survey/plan FIRST, then red-green).**
   Records lacking a `timestamp` are silently dropped at multiple sites; emit a visible count instead.
   Known drop points to survey (grep first, don't assume completeness):
   - `api/grep-tool-results.js:buildGrepResult` — `if (!record.timestamp) return null;`.
   - `api/bash-read-events.js:emitResultEvent` — `var iso = timestampAt(...); if (!iso) return null;`.
   - `api/file-historical-lineage.js:stampTouchTimestamps` — sets `touch.timestamp = null` (does NOT
     drop, but null-stamped touches lose global ordering — decide if these count).
   - The probe/tracker time-ordering layer (`tools/probe-projects-v2.js`, `api/track-line-states.js`)
     where timestampless events are excluded from the timeline.
   Decide the COUNT's shape (per-transcript? per-file? a single sidecar total?) and where it surfaces
   (probe output? tracker verdict?) — this is a design choice; **do a planning pass and confirm with the
   user before building**. Likely a DISCOVERY/metadata-only change (probe re-baseline may be needed if
   the count lands in probe output; if it's tracker-only, the probe stays identical).
2. **Item 8 — MultiEdit-style records** (`toolUseResult.edits` array). FIRST verify any exist in the
   recovery set (grep the fixture/recovery JSONLs for `"edits"` arrays under `toolUseResult`); if none,
   record NOT-VIABLE like item 6. Otherwise handle in `api/edit-stream-extraction.js:extractEditsFromJSONL`.
3. **Items 9–17** per `plans/roadmap-100-percent-reconstruction.md` §B/§C/§D (replaceAll-across-runs,
   time-aware alias windows, conflict-cascade collapse, git rung on the reference ladder, residual
   investigation, read-scanner unification (item 17 — the natural home to fold `bash-read-touches.js`
   + `grep-tool-results.js` discovery together), §D consolidation).

## Key Files
- `plans/roadmap-100-percent-reconstruction.md` — the 17-item roadmap; **item 7 `[ ]` is next** (items
  1–6 are `[x]`/closed). Constraints section: File-path handling, 250-line cap, one-condition-per-`if`,
  probe gate.
- `plans/implementation-notes-item5.6-bashread-touches.md` — the 5.6 record (decisions, probe-divergence
  evidence, re-baseline how-to, the no-timestampless-drop note that seeds item 7/17).
- `plans/implementation-notes-item5.5-filepath-resolution.md` — the re-baseline MIRROR mechanism in full.
- `plans/handoff-develop-20260616-1858.md` — §How to Verify has the EXACT gate + probe-A/B commands
  (copied verbatim into How to Verify below).
- `api/grep-tool-results.js` (129 L) / `api/bash-read-touches.js` (75 L) — the discovery-collector
  template pair (`resolver()` cycle-break, result-index anchoring) to mirror for any new touch kind.
- `api/bash-read-events.js` (120 L) — the emission counterpart; its `emitResultEvent` is an item-7
  drop site.
- `api/file-historical-lineage.js` (245 L) — `collectTouches` (the discovery wiring hub) +
  `stampTouchTimestamps` (an item-7 null-stamp site). TIGHT at 245/250 — any further wiring needs an
  extraction or a new file.
- `api/edit-stream-extraction.js` (198 L) — `extractEditsFromJSONL`, the item-8 target.

## Plan File
None for item 7 yet — only the roadmap §A stub exists; it needs its own planning/survey pass.
(Item 5.6's completed plan was `/Users/matkatmusicllc/.claude/plans/enumerated-strolling-piglet.md`.)

## Context the Next Agent Won't Have
- **The probe NEVER calls the emission pipeline** — `tools/probe-projects-v2.js` runs only
  `extractEditsFromJSONL` + `replayEdits` + `collectTouches`. So emission-only changes are provably
  probe-safe; ONLY TOUCH/discovery changes move probe output. This determines whether item 7 needs a
  re-baseline (tracker-only count → probe stays `identical`; count in probe output → re-baseline).
- **250-line cap is enforced by a post-write hook on the WHOLE edited file** (test files included). It
  also re-flags PRE-EXISTING deep nesting (>3 indent units / multi-line object literals at indent ≥8) in
  any file you touch — budget for collapsing unrelated builders to single-line form. This is why new
  collectors go in NEW files and why test files get split (e.g. this session's
  `test-file-historical-lineage-bash.js`).
- **Touch-kind vocabulary:** touches carry coarse kinds (`read`/`write`/`edit`/`rm`/`redirect`/`grep`/
  `bashread`); NO consumer switches on `touch.kind` (verified: `file-path-history.js`,
  `transcript-discovery.js` use only `.path`/`.line`/`.timestamp`). The *touch* kind `'bashread'` is
  DISTINCT from the *event* kinds `bashReadChunk`/`bashExtent`/`bashGrep` (those drive per-line
  reconstruction in `file-event-kinds.js`).
- **`touch.line` MUST anchor at the tool_result record's 0-based parsed index**, never the tool_use
  index — only result (user) records carry timestamps, and `stampTouchTimestamps` reads
  `parsed[touch.line].timestamp`. Anchoring at the use index yields `timestamp:null` and silently breaks
  `findEarliestFilePath` ordering while discovery still appears to work. (This is exactly the class of
  silent-drop bug item 7 targets.)
- **`bash-read-touches.js` intentionally does NOT drop timestampless paired results**, unlike
  `grep-tool-results.buildGrepResult`. Harmless today (all `tool_result` records carry timestamps), but
  it's an inconsistency worth unifying in item 7 (count) or item 17 (read-scanner unification).
- **Re-baseline mechanism (temp-index MIRROR)** — use only if a discovery change moves the probe. Build
  via a temp index so `develop`'s all-untracked state is never touched:
  ```
  OLD=$(git rev-parse develop-baseline)            # rollback ref (currently 880b69d)
  export GIT_INDEX_FILE=/tmp/bl-idx
  git read-tree --empty
  git add -- api common tools tests diff jfred unified viewer web-shared \
    copy-scenario-outputs.py jsonl-tree-viewer.ts run-all-scenarios.py LICENSE README.md .gitignore
  TREE=$(git write-tree); unset GIT_INDEX_FILE
  COMMIT=$(git commit-tree "$TREE" -p develop-baseline -m "Re-baseline (item N): …")
  git update-ref refs/heads/develop-baseline "$COMMIT"; rm -f /tmp/bl-idx
  ```
  EXCLUDE: `plans/`, `.claude/`, the `projects` + `test-transcript.jsonl` **symlinks** (point into live
  `~/.claude/projects` — NEVER commit), root `probe-results.json` + `.copy-seen.txt`. Generated probe
  JSONs under `tools/` ARE included. Always **surface the divergence to the user and get sign-off before
  re-baselining** (confirm scoped + no-regression: changed `filesInProject` stay `status PASS`/unchanged,
  reconstruction byte-identical, summary block unchanged). Rollback to pre-5.6:
  `git update-ref refs/heads/develop-baseline 124dfbc`.
- **Probe gotchas:** the A/B writes via `path.join(__dirname,…)` so each tree writes its OWN
  `tools/probe-results-v2.json` — compare with a `node` fs-walk stripping `generatedAt` (recursive
  `grep`/`diff` give FALSE negatives from status-line injectors). NEVER run the probe against live
  claude-data — use the FROZEN fixture `~/Programming/jot-recovery/probe-fixture-20260615/projects` ONLY.
  Process the 1.6M probe JSONs in a sandbox (`ctx_execute`), not by reading them into context.
- **Test runner:** `node tests/test-*.js` (custom `h.run`/`h.summary`; exits 1 on failure). NODE_OPTIONS
  injects a VS Code debugger bootloader printing "Debugger listening…"/"Waiting to disconnect" on
  stderr — filter with `2>/dev/null | grep -E "passed,|FAIL:"`. A Stop hook re-runs tests after edits
  and BLOCKS on red — expected during the RED phase of TDD; push through to GREEN.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`:
```bash
# 1. Full suite (expect 58 suites / 586 passed / 0 failed):
for fkt in tests/test-*.js; do case "$fkt" in tests/test-helpers.js|*output-data.js) continue;; esac; \
  node "$fkt" 2>/dev/null; done | grep -E "passed,|FAIL:" \
  | awk '/FAIL:/{print;next} /passed,/{p+=$1;f+=$3;s++} END{print "TOTAL: "s" suites, "p" passed, "f" failed"}'

# 2. detect-rewinds (expect 15 passed / 0 failed):
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# 3. Probe A/B vs develop-baseline on the FROZEN fixture (expect "identical: true"):
git worktree remove --force /tmp/reveng-baseline 2>/dev/null; rm -rf /tmp/reveng-baseline
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline >/dev/null 2>&1
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# 4. Sidecar e2e (plate_summary.py) — expect perLineStats 247/247, 0 mismatched, conflicts=233:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null

# 5. Every new/edited source + test file <= 250 lines.
```
