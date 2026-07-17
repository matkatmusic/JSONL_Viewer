## 2026-06-17:01:08:00 — Item 5.6: Bash-reads as discovery touches
Chat title: implement item 5.6 (enumerated-strolling-piglet plan)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/6609664a-74d5-4716-9ccd-2bf374fe48ed.jsonl

### References
- /Users/matkatmusicllc/.claude/plans/enumerated-strolling-piglet.md (THE plan executed)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-0051.md (handoff that scheduled this work)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260616-1858.md (§How to Verify — exact gate + probe-A/B commands)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-item5.5-filepath-resolution.md (re-baseline mechanism + 5.5 record)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/roadmap-100-percent-reconstruction.md (17-item roadmap; 5.6 flipped [x] this session)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/api/grep-tool-results.js (the EXACT template mirrored — collectGrepTouches + resolver() cycle-break)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/api/bash-read-events.js (emission counterpart; register/close iteration style)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/api/bash-read-commands.js (parseBashReadCommand, imported unchanged)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/test-file-events-extractors-bash.js (the split-file template)

### Design decisions
- **Touch kind `'bashread'` (user choice).** A single coarse touch kind for all three bash-read flavors
  (head/tail/sed `bashReadChunk`, `wc -l` `bashExtent`, single-file `grep -n` `bashGrep`). Verified no
  consumer switches on `touch.kind` (`file-path-history.js`, `transcript-discovery.js` use only
  `.path`/`.line`/`.timestamp`), so reusing `'read'` would be behaviorally identical — the user chose a
  new kind for observability/separability. NOTE: the *touch* kind `'bashread'` is DISTINCT from the
  *event* kinds `bashReadChunk`/`bashExtent`/`bashGrep` that drive per-line reconstruction.
- **New file `api/bash-read-touches.js`.** Forced by the 250-line cap (`file-historical-lineage.js` was
  at 243) and mirrors the grep precedent (discovery in `grep-tool-results.js`, emission in
  `bash-read-events.js`). NOT folded into `bash-read-commands.js` (parser-only) or `bash-read-events.js`
  (emission). Obvious fold-in point for future item 17 (read-scanner unification).
- **`touch.line` anchors at the tool_result record's 0-based parsed index.** `stampTouchTimestamps` reads
  `parsed[touch.line].timestamp`, and only tool_result (user) records carry timestamps. Anchoring at the
  tool_use index would yield `timestamp:null` and silently break `findEarliestFilePath` ordering while
  discovery still "worked" (masking the bug). The head test asserts `line` AND `timestamp` precisely to
  guard this.
- **Hybrid implementation shape.** Single-pass register-then-close over `parsed` (the `bash-read-events`
  iteration style: `registerBashRead` stashes a parseable Bash `tool_use` by id, `touchForResult` closes
  a pending id on its `tool_result`) PLUS grep's lazy `resolver()` cycle-break (fetch
  `resolveAgainstCwd` at CALL time — `file-historical-lineage` load-time-requires this module, so a
  top-level require back would capture `undefined`).
- **No stdout/validity/aliasSet guards.** Discovery only: the path is known from the command; the
  tool_result is paired purely to anchor the timestamp. A read with no paired result emits nothing.

### Deviations
- **`api/bash-read-touches.js` is 75 lines, not the plan's ~37 estimate.** The extra lines are a fuller
  header comment (matching `grep-tool-results.js`'s documentation density) and one-condition-per-`if`
  guard style — no functional difference; well under the 250 cap.
- **No timestampless-result drop (differs from grep).** `grep-tool-results.buildGrepResult` drops a
  paired result that lacks a timestamp (`if (!record.timestamp) return null`). The plan's `touchForResult`
  signature `(item, resultIndex, pending, cwd, resolveAgainstCwd)` deliberately omits the `record`, so no
  timestamp guard is applied — a bashread touch is emitted on pairing alone. In real transcripts every
  tool_result carries a timestamp, so this is theoretical; followed the plan's locked signature. (See
  Open questions.)
- **Probe diverged across 23 files, far broader than 5.5's 4.** The plan said "WILL likely diverge"
  without a count; bash-reads are much more common than relative cats, so the discovery enrichment is
  wider. Still entirely benign (see Probe A/B outcome).

### Implementation results (RED → GREEN)
- **Step 1 (RED)** — NEW `tests/test-file-historical-lineage-bash.js` (67 L), 4 cases via the public
  `lineage.collectTouches` API. Pre-wiring: 3 positive cases failed `0 !== 1` (no `'bashread'` touch
  exists), negative control passed. Confirmed RED.
- **Step 2 (GREEN)** — NEW `api/bash-read-touches.js` (75 L): `collectBashReadTouches(parsed, cwd)` +
  `getMessageContent`/`registerBashRead`/`touchForResult` + `resolver()`.
- **Step 3 (GREEN)** — `api/file-historical-lineage.js` 243→245: var-decl `+collectBashReadTouches`,
  `require('./bash-read-touches')`, one `Array.prototype.push.apply(touches, collectBashReadTouches(parsed, cwd))`
  beside the grep call. New test 4/4; `test-file-historical-lineage.js` 19/0 (no regression).

### Probe A/B outcome (Step 4 — DIVERGED, the intentional case)
`probe A/B identical: false` vs `develop-baseline` (`124dfbc`) on the FROZEN fixture
(`~/Programming/jot-recovery/probe-fixture-20260615/projects`). Characterized in the sandbox:
- `filesInProject` 315→315, `filesNotInProject` 435→435; **summary block byte-identical** (list1 261
  PASS / 54 MISMATCH / 82.9%; list2 unchanged).
- **23** `filesInProject` entries changed, **all DISCOVERY-ONLY**: 0 status flips (every entry
  PASS→PASS or MISMATCH→MISMATCH), 0 reconstruction-field changes
  (`replayedLines`/`replayedChars`/`totalKeptEdits` identical for all 23).
- `transcriptsUsed` deltas: **11** entries each gained exactly one transcript (every added transcript
  **kept=0** → contributes no edits → reconstruction provably unaffected — transcripts that ONLY
  bash-read the file, the exact gap 5.6 closes); **12** entries gained no transcript but had **21**
  in-both shifts, **all** pulling `earliestTimestamp` EARLIER (enrichment); **0** transcripts removed.

Surfaced to the user (AskUserQuestion); user chose **Re-baseline now**.

### develop-baseline re-baseline (MIRROR via temp index)
Advanced `refs/heads/develop-baseline` `124dfbc → 880b69d` using the temp-index method so `develop`'s
intentional all-untracked tree is never touched (verified after: still 18 `??` + 1 `M`):
`GIT_INDEX_FILE=/tmp/bl-idx git read-tree --empty; git add -- <mirror set>; git write-tree;
git commit-tree -p develop-baseline; git update-ref`. Mirror set: `api common tools tests diff jfred
unified viewer web-shared copy-scenario-outputs.py jsonl-tree-viewer.ts run-all-scenarios.py LICENSE
README.md .gitignore`. Excluded: `plans/`, `.claude/`, the `projects`/`test-transcript.jsonl` symlinks,
root `probe-results.json` + `.copy-seen.txt`. New baseline tree = 208 files (206 + the 2 new 5.6
files). Source diff `124dfbc→880b69d` is EXACTLY: `api/bash-read-touches.js` (new), `api/file-historical-lineage.js`
(+3/−1), `tests/test-file-historical-lineage-bash.js` (new). Re-ran A/B → **`identical: true`** (gate
re-armed). **Rollback: `git update-ref refs/heads/develop-baseline 124dfbc`.**

### Tradeoffs
- **Tested through the public `collectTouches` API**, not a dedicated `tests/test-bash-read-touches.js`.
  Matches the grep precedent (`collectGrepTouches` is tested via `collectTouches` in
  `test-file-historical-lineage.js`; `grep-tool-results.js` has no same-named test file). The post-write
  hook's "No test file found for api/bash-read-touches.js" warning is accepted as consistent with that
  precedent.
- **Sequential, no subagent fan-out** (same reasoning as 5.5): surgical single-convention change, strict
  red-green needs tests run between steps, tight line budget, and a delicate probe re-baseline gate —
  parallelism would add coordination risk without speedup.

### Open questions
- **None blocking.** The no-timestampless-drop divergence from grep (Deviations) is theoretical — all
  tool_result records carry timestamps. If a future fixture ever produces a timestampless bash-read
  result, it would yield a touch with `timestamp:null` (discovery still works; global ordering would
  sort it as null). Natural place to unify timestampless-result handling across grep and bashread:
  **item 17 (read-scanner unification)**.

### Final state (item 5.6 COMPLETE — 2026-06-17)
- **Code (all ≤250):** NEW `api/bash-read-touches.js` 75; `api/file-historical-lineage.js` 245.
- **Tests (all ≤250):** NEW `tests/test-file-historical-lineage-bash.js` 67 (4 tests).
- **Gates:** full suite **58 suites / 586 passed / 0 failed** (was 57/582: +4 tests, +1 suite);
  detect-rewinds **15/0**; sidecar e2e `plate_summary.py` **247/247**, 0 mismatched, conflicts **233**;
  probe A/B **`identical: true`** after the mirror re-baseline.
- **Roadmap:** item 5.6 flipped `[ ]`→`[x]` with DONE block.
- **develop-baseline:** advanced `124dfbc → 880b69d` (mirror). Rollback: `git update-ref
  refs/heads/develop-baseline 124dfbc`. `develop` working tree unchanged (18 `??` + 1 `M`).
- **Next:** item 7 — dropped-record count for timestampless records.
