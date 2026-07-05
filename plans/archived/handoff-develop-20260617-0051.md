# Handoff: Item 5.6 (bash-reads as discovery touches) is FULLY PLANNED and ready to implement
Conversation name: plan the implementation of Item 5.6
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree (`api/`,
`tools/`, `tests/`, `plans/`, …) is **UNTRACKED** (`git status` → 18 `??`) by design — only
`.gitignore` is tracked (currently shows `M`, +6 lines; pre-existing, unrelated). Review changes
with `git diff develop-baseline -- <path>`. The committed source tree lives on **`develop-baseline`**
(tip `124dfbc`, the Item-5.5 re-baseline). No `-plate` branch exists. If `git status` ever shows
files staged (`A`) instead of untracked (`??`), that's a stray IDE/index artifact — `git reset`.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts, driving toward 100% reconstruction (roadmap:
`plans/roadmap-100-percent-reconstruction.md`). **Item 5.6** closes a discovery-coverage gap:
bash-reads (`head`/`tail`/`sed -n`/`grep -n`/`wc -l`) do NOT currently register a file as a
*discovery touch*, so a transcript that ONLY bash-reads a file never discovers it (`cat` and the
native Grep tool already produce touches). The fix mirrors the grep discovery path: add
`collectBashReadTouches(parsed, cwd)` and wire it into `collectTouches`.

## Current State
**Item 5.6 was PLANNED this session — NOT implemented.** No source/test files were changed (working
tree identical to session start: 18 `??` + 1 `M` on `.gitignore`). A complete, executable design
exists at the plan file (see **Plan File** below); `ExitPlanMode` was offered and the user did NOT
approve execution in this session — hence this handoff so a fresh session can implement it.

Item 5.5 (the prior item) is SHIPPED & CLOSED: three RAW-path match sites resolve via
`resolveAgainstCwd(sessionCwd, rawPath)`; `develop-baseline` was re-baselined `9968536 → 124dfbc`;
all gates GREEN (57 suites / 582 / 0; detect-rewinds 15/0; `plate_summary.py` 247/247, conflicts
233; probe A/B `identical: true`).

Facts verified this session (current, accurate):
- `api/file-historical-lineage.js` = **243** lines (wiring adds +2 → 245, under the 250 cap).
- `tests/test-file-historical-lineage.js` = **246** lines (a ~13-line test would breach 250 → split).
- `api/grep-tool-results.js` = 129, `api/bash-read-commands.js` = 128, `api/bash-read-events.js` = 120.
- Neither touch consumer (`api/file-path-history.js`, `api/transcript-discovery.js`) references
  `touch.kind` — confirmed by grep. (Touch `.kind` is metadata only; consumers use `.path`/`.line`/
  `.timestamp`.)

## What Remains
Implement Item 5.6 strictly red-green (failing test FIRST), per the plan file. Ordered steps:

1. **RED — new split test file `tests/test-file-historical-lineage-bash.js`** (mirror
   `tests/test-file-events-extractors-bash.js`: header comment, `var run = h.run`,
   `var f = require('./track-line-states-fixtures')`, `var lineage = require('../api/file-historical-lineage')`,
   end `h.summary();`). No new helpers — `h.makeSystemLine`, `h.makeBashCommandLine`,
   `h.makeBashCatToolResult`, `f.withTimestamp`, `f.TS1` already exist. Minimal case: a session at
   cwd `/abs/proj` that ONLY runs `head -n 5 sub/f.py` (relative) must produce exactly one touch at
   `/abs/proj/sub/f.py` with `kind === 'bashread'`, `line === 2` (the RESULT record index),
   `timestamp === f.TS1`, and NO touch at raw `sub/f.py`. Add 3 more: `wc -l sub/f.py`
   (`bashExtent`), `grep -n foo sub/f.py` (single-file `bashGrep`), and a negative control
   `head -5 sub/f.py` (no `-n` → parser returns null → ZERO touch). Confirm it FAILS
   (`node tests/test-file-historical-lineage-bash.js` → touches empty pre-wiring).
2. **GREEN — create `api/bash-read-touches.js`** (~37 lines), mirroring `api/grep-tool-results.js`
   incl. the lazy `resolver()` cycle-break (`file-historical-lineage` load-time-requires this
   module, so fetch `resolveAgainstCwd` at CALL time, never top-level). Import
   `parseBashReadCommand` from `./bash-read-commands`. Helpers: `getMessageContent(record)`,
   `registerBashRead(item, pending)` (Bash `tool_use` → stash parsedCmd by `id`),
   `touchForResult(item, resultIndex, pending, cwd, resolveAgainstCwd)` → on a `tool_result` that
   closes a pending id, return `{ kind: 'bashread', path: resolveAgainstCwd(cwd, parsedCmd.path),
   line: resultIndex }` (else null). `collectBashReadTouches(parsed, cwd)`: one pass over `parsed`,
   register + try-close per content item, push non-null touches. No stdout/validity/aliasSet guards
   (discovery only); emit only when the paired result exists. Export `collectBashReadTouches`.
3. **GREEN — wire into `collectTouches` (`api/file-historical-lineage.js`, 243→245):**
   - Line 13 (edit in place): add `, collectBashReadTouches` to
     `var extractSessionMetadata, collectGrepTouches;`.
   - After line 21: `    collectBashReadTouches = require('./bash-read-touches').collectBashReadTouches;`
   - After line 132 (adjacent to the `collectGrepTouches` call):
     `  Array.prototype.push.apply(touches, collectBashReadTouches(parsed, cwd));`
   Confirm GREEN (new test passes; rerun `tests/test-file-historical-lineage.js` for no regression).
4. **Gates + probe A/B** (this is a DISCOVERY change → the probe WILL likely diverge). Run the four
   standing gates (commands under **How to Verify**). If the probe diverges: confirm scoped +
   no-regression (changed `filesInProject` entries stay `status PASS`, reconstruction byte-identical
   — only discovery metadata moves), **surface the diff to the user**, then re-baseline
   `develop-baseline` via the temp-index mirror method (see Context below). Record the old SHA for
   rollback. Expect suite count **57→58** (new split file) and +4 passing tests.
5. **Close out:** flip roadmap `5.6 [ ]`→`[x]` in `plans/roadmap-100-percent-reconstruction.md` with
   a DONE block (summary, files, gate results, probe outcome + new baseline SHA); write
   `plans/implementation-notes-item5.6-bashread-touches.md`.
6. **After 5.6:** items 7–17 per the roadmap (next up: item 7, dropped-record count for
   timestampless records).

## Key Files
- `/Users/matkatmusicllc/.claude/plans/enumerated-strolling-piglet.md` — the full Item-5.6 plan
  (exact code sketches, line math, decisions). **Read this first.**
- `plans/roadmap-100-percent-reconstruction.md` — 17-item roadmap; **5.6 `[ ]` is next** (right after
  5.5 `[x]`).
- `api/grep-tool-results.js` — the EXACT template to mirror (`collectGrepTouches`, `resolver()`
  cycle-break, result-index anchoring).
- `api/bash-read-commands.js` — `parseBashReadCommand(cmd)` → null | `{kind:'bashReadChunk',path,…}`
  | `{kind:'bashExtent',path}` | `{kind:'bashGrep',path}`; all carry `.path` (unquoted). Imported,
  unchanged.
- `api/bash-read-events.js` — the emission counterpart; shows how to locate Bash-read `tool_use`
  records in `parsed` (`registerBashRead`, `getMessageContent`) — mirror its iteration.
- `api/file-historical-lineage.js` (243, tight) — `collectTouches` wiring target; the 5.5 cat-touch
  in `appendEditTouches` is the `resolveAgainstCwd` pattern.
- `tests/test-file-historical-lineage.js` (246, tight) — grep-touch test (~107–123) and cat-relative
  test (~217–231) are the style to mirror; do NOT grow this file.
- `tests/test-file-events-extractors-bash.js` (93) — the split-file template (header + harness).
- `plans/implementation-notes-item5.5-filepath-resolution.md` + `plans/handoff-develop-20260617-0028.md`
  — the re-baseline how-to and the 5.5 record.

## Plan File
`/Users/matkatmusicllc/.claude/plans/enumerated-strolling-piglet.md` (this session's Item-5.6 plan).

## Context the Next Agent Won't Have
- **Touch kind is `'bashread'` by explicit USER CHOICE.** The safe default was reusing `'read'`
  (matches cat; zero new vocabulary). I verified no consumer switches on `touch.kind`, so both are
  behaviorally identical — the user nonetheless chose a NEW `'bashread'` kind for observability /
  separability. Use `'bashread'` (a single coarse touch kind for all three bash-read flavors). Note:
  the *touch* kind `'bashread'` is DISTINCT from the *event* kinds `bashReadChunk`/`bashExtent`/
  `bashGrep` (those drive per-line reconstruction in `file-event-kinds.js`; touches are coarser).
- **`touch.line` MUST anchor at the tool_result record index, NOT the tool_use index.**
  `stampTouchTimestamps` does `parsed[touch.line].timestamp`, and only tool_result (user) records
  carry timestamps in the fixtures/convention (cat, grep, and Read all anchor at the result index).
  Anchoring at the tool_use index would yield `timestamp: null` and silently break
  `findEarliestFilePath` ordering (discovery would still work — masking the bug). The test asserts
  `line` and `timestamp` precisely to guard this.
- **The new function MUST live in a NEW file `api/bash-read-touches.js`.** `file-historical-lineage.js`
  (243) has no room; `bash-read-commands.js` is parser-only (header forbids record logic);
  `bash-read-events.js` is the emission layer (keep discovery vs emission split, matching grep). The
  new file is the obvious fold-in point for future item 17 (read-scanner unification).
- **The `resolver()` lazy cycle-break is mandatory** — a top-level
  `require('./file-historical-lineage').resolveAgainstCwd` captures `undefined` (circular load).
  Mirror grep: fetch at call time.
- **No double-counting risk:** `parseBashReadCommand` skips bare `cat` (handled by
  `appendEditTouches`) and rejects pipes (`^…$` anchored); single-file Bash `grep -n` (path in
  command) never collides with native-Grep `'grep'` touches (paths from result rows) — different
  records.
- **Probe gotchas (from 5.5):** the A/B writes via `path.join(__dirname,…)` so each tree writes its
  OWN `tools/probe-results-v2.json` — compare with a `node` fs-walk stripping `generatedAt` (a
  read-only `grep`/`diff` gives false negatives from status-line injectors). NEVER run the probe
  against live claude-data — use the FROZEN fixture
  `~/Programming/jot-recovery/probe-fixture-20260615/projects` ONLY. The probe never calls the
  emission pipeline — only TOUCH/discovery changes (like all of 5.6) move probe output.
- **Re-baseline mechanism** (use if the probe diverges) — build via a temp index so `develop`'s
  all-untracked state is never touched:
  ```
  OLD=$(git rev-parse develop-baseline)            # rollback ref
  export GIT_INDEX_FILE=/tmp/bl-idx
  git read-tree --empty
  git add -- api common tools tests diff jfred unified viewer web-shared \
    copy-scenario-outputs.py jsonl-tree-viewer.ts run-all-scenarios.py LICENSE README.md .gitignore
  TREE=$(git write-tree); unset GIT_INDEX_FILE
  COMMIT=$(git commit-tree "$TREE" -p develop-baseline -m "Re-baseline (item 5.6): …")
  git update-ref refs/heads/develop-baseline "$COMMIT"; rm -f /tmp/bl-idx
  ```
  EXCLUDE: `plans/`, `.claude/`, the `projects` + `test-transcript.jsonl` **symlinks** (point into
  live `~/.claude/projects` — NEVER commit), root `probe-results.json` + `.copy-seen.txt`. Generated
  probe JSONs under `tools/` ARE included. Current baseline `124dfbc`; rollback to pre-5.5: `git
  update-ref refs/heads/develop-baseline 9968536`.
- **250-line cap is enforced by a post-write hook on the WHOLE edited file** (test files included) —
  this is why the test goes in a new split file.
- **Test runner:** `node tests/test-*.js` (custom `h.run`/`h.summary`; exits 1 on failure).
  NODE_OPTIONS injects a VS Code debugger bootloader printing "Debugger listening…"/"Waiting to
  disconnect" on stderr — filter with `2>/dev/null | grep -E "passed,|FAIL:"`.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`:
1. **RED proof (first):** `node tests/test-file-historical-lineage-bash.js` FAILS before Steps 2–3.
2. **Full suite** (currently 57/582/0 → expect **58 suites / 586 / 0** after +4 tests + the split):
   loop over `tests/test-*.js` excluding `test-helpers.js` and `*output-data.js` — exact loop in
   `plans/handoff-develop-20260616-1858.md` §How to Verify #1; filter with
   `2>/dev/null | grep -E "passed,|FAIL:"`.
3. **detect-rewinds:** `node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1`
   → 15 passed / 0 failed.
4. **Probe A/B** vs `develop-baseline` on the FROZEN fixture (handoff-1858 §3:
   `node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects`,
   compare worktree vs `develop-baseline` stripping `generatedAt`) → `identical: true`, OR
   re-baselined with a scoped, no-regression, user-confirmed diff.
5. **Sidecar e2e (`plate_summary.py`):** handoff-1858 §4 → perLineStats 247/247, 0 mismatched,
   conflicts 233.
6. **Line caps:** `wc -l` every edited/new file ≤ 250 (`file-historical-lineage.js`→245;
   `bash-read-touches.js`~37; new test file ~70–90).
