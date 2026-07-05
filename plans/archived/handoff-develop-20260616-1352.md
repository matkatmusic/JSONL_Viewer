# Handoff: Roadmap item 4 (partial-content Bash reads) — implementation plan COMPLETE & de-ambiguated; ready to execute (NO code written yet)
Conversation name: RevEng — plan roadmap item 4 (partial-content bash reads)
JSONL: (omitted — ephemeral per handoff rules)

## Branch
`develop` based on `master`. The committed source tree exists ONLY on
`develop-baseline` (tip `9968536` — "Baseline: source tree before stage-3
tool-suite api/ migration"). On `develop` everything (`api/`, `tools/`,
`tests/`, `plans/`, …) is present but **UNTRACKED** (`git status` → `??`) —
EXPECTED, not a mistake. Only `.gitignore` is tracked/modified; `git log` on
`develop` shows the single `1a9f098`. Review any change with
`git diff develop-baseline -- <path>`. There is **no `-plate` branch**.

## Goal
Implement roadmap item 4 (`plans/roadmap-100-percent-reconstruction.md`): extract
partial-content Bash reads — `head`, `tail`, `sed -n A,Bp`, `grep -n`, `wc -l` —
as per-line-state observations so the reconstruction sidecar gains line-addressed
corroboration between beacons, shrinking presumed carry-forward (esp. where
`originalFile` is absent — the majority of edits). Items 1 (`originalFile`),
2 (Bash `rm`/`>`/`>>`), 3 (`structuredPatch` context) are DONE; item 4 is the
next `[ ]`. Hard constraint: the sidecar runs BESIDE the reconstruction pipeline
and must NEVER change probe PASS/MISMATCH (A/B byte-identity vs `develop-baseline`).

## Current State
- **This session ONLY PLANNED — zero code written, zero source/test files
  changed.** The tree is unchanged from the prior session and still GREEN
  (handoff-develop-20260616-1204.md gates: full suite **47 suites / 493 passed /
  0 failed**; detect-rewinds 15/0; probe A/B byte-identical vs `develop-baseline`
  on the frozen fixture; sidecar e2e verdict unchanged 247/247, 0 new conflicts).
- Produced a detailed, copy-from-here implementation plan and then **reviewed it
  for ambiguities at the user's request and tightened it** (record-topology
  constraint made explicit, require-cycle avoidance, concrete stdout guards,
  concrete grep/extent parsers, enumerated command forms). Plan file:
  `~/.claude/plans/make-a-plan-for-cheeky-lampson.md`.
- **User-confirmed scope: FULL item 4** — content reads (`head`/`sed`/`tail`)
  PLUS `wc -l` extent PLUS bash `grep -n`, structured as three independently-
  shippable phases (A/B/C below).
- Nothing is mid-flight. No open tasks. The next agent should EXECUTE the plan.

## What Remains
Execute the plan, one phase at a time, strict RED-before-GREEN, re-running ALL
gates after each phase. Three new event kinds, each a near-exact twin of an
existing apply path (observations → OVERLAY belief, never REPLACE; `kindRank` 2;
NOT beacons → no `isBeaconEvent` change).

**Phase A — `bashReadChunk`** (`head [-n N]`, `sed -n A,Bp`, `tail -n +N`):
1. `api/bash-read-commands.js` (NEW) — pure parsers. `parseBashReadCommand(cmd)`
   → `{kind:'bashReadChunk', path, firstLine, requested}` (`requested:null` for
   reads-to-EOF forms `tail -n +N` / `sed -n 'A,$p'`), or `null`. Geometry:
   `head -n N`→firstLine=1,requested=N (bare head⇒10); `sed -n A,Bp`→firstLine=A,
   requested=B−A+1 (single-line `Np`⇒A=B=N); `tail -n +N`→firstLine=N,EOF; anchor
   regexes `^…$` so pipes/redirects don't match. DEFER (return null): `tail -n N`,
   bare `tail` (last-N, un-positionable).
2. `api/bash-read-events.js` (NEW) — emission `bashReadEventsForFile(jsonlPath,
   jsonlText, parsed, aliasSet)`. Inline a ~15-line tool_use↔tool_result pairing
   loop (model: `scanToolUseResults`, file-event-observations.js:106-119 — NOT
   exported, file is 279L > cap, so duplicate). Match `parsedCmd.path` raw against
   `aliasSet` (mirror cat, no cwd-resolution). Read stdout (`item.content` string,
   else `record.toolUseResult.stdout`). Guard out `is_error`, empty, and error-
   prefixed stdout. Emit at the RESULT record's `index+1` with the result record's
   timestamp via a LOCAL `timestampAt` (copy bash-op-events.js:19-27). Sub-object
   `{firstLine, lineCount, hitEof}` where `lineCount=splitContentLines(stdout)
   .length`, `hitEof = requested===null ? true : lineCount<requested`.
3. `api/bash-read-evidence.js` (NEW) — `materializeBashReadChunk(event)`:
   `findToolResultText`→{property,text}; entries numbered from
   `event.bashReadChunk.firstLine` via `lse().splitContentLines`+`contentLineSpans`;
   `lse().pairEntriesWithRefs`. Use the call-time `lse()` cycle break + inline
   require (copy `structured-patch-evidence.js`).
4. Wire: add `'bashReadChunk'` to `KIND_NAMES` (file-event-kinds.js:16);
   +1 require & +1 `Array.prototype.push.apply` in file-events-extractors.js
   (~24, ~206); +1 dispatch in `materializeEvent` (line-state-evidence.js ~204);
   +1 apply branch in `applyOneEvent` — **copy track-line-states.js:96-100
   verbatim, swap `event.readChunk` → `event.bashReadChunk`**.
5. Tests (RED first): `tests/test-bash-read-commands.js`, `test-bash-read-events.js`,
   `test-bash-read-evidence.js`; extend `test-track-line-states.js`,
   `test-line-state-evidence.js`, `test-file-events-extractors.js`,
   `test-file-event-kinds.js`.

**Phase B — `bashExtent`** (`wc -l`): add `'bashExtent'` kind; parser returns
`{kind:'bashExtent', path}`; `materializeBashExtent` parses the leading integer →
`{kind:'bashExtent', lineCount:N}` (NO byLine, NO ref — ref-less like `fileAbsent`).
Apply branch: `lb.ensureImpliedLines(belief, m.lineCount); return []` — **extend-
only, NEVER `eofConfirmed`** (wc -l counts newlines → lower bound; a no-trailing-
newline file undercounts by one). Do NOT use `finishChunk`/`finishWholeOverlay`.

**Phase C — `bashGrep`** (single-file `grep -n`, incl `-A/-B/-C`): add `'bashGrep'`
kind; parser `{kind:'bashGrep', path}` — single-file only, require `-n`, skip
`-r`/`-R`/multi-file (that is item 5). `materializeBashGrep` walks stdout rows
with `/^(\d+)([:-])/` (model on `numberedEntries`+`buildNumberedEntry`,
line-state-evidence.js:46-66): lineNum=group1, text=`raw.slice(match[0].length)`,
span via running offset; `--` and non-matching rows skip for free. Apply branch:
`return lb.applyOverlayLines(belief, m.byLine, event.unixMs)` — sparse only, NO
`finishChunk` (grep never witnesses extent — identical to `patchContext`,
track-line-states.js:127-133).

## Key Files
- **Plan (full, refined):** `~/.claude/plans/make-a-plan-for-cheeky-lampson.md`
  — read FIRST. (Transient plan-mode file; if absent/overwritten, this handoff's
  What Remains + Context reproduce its essentials.)
- **Roadmap (17-item tracker):** `plans/roadmap-100-percent-reconstruction.md` —
  item 4 is the next `[ ]`. Source spec: `plans/handoff-develop-20260611-1727.md`
  §A item 4.
- **Prior-session handoff (gate baseline):** `plans/handoff-develop-20260616-1204.md`.
- **Patterns to mirror:** `api/bash-op-events.js` (emission incl. local
  `timestampAt`), `api/structured-patch-evidence.js` (materializer + `lse()`
  cycle break), `api/file-event-observations.js` (`scanToolUseResults` pairing,
  `extractBashCatEdits`, `isValidReadContent`).
- **Sidecar core to edit (mind caps):** `api/file-event-kinds.js` (`KIND_NAMES`
  :16); `api/file-events-extractors.js` (229L); `api/line-state-evidence.js`
  (~245L — tight); `api/track-line-states.js` (232L — if +3 branches exceed 250,
  extract `applyOneEvent` body to a new `api/apply-one-event.js`);
  `api/line-belief.js` (`applyOverlayLines`/`finishChunk`/`ensureImpliedLines`,
  all exported); `api/evidence-record-access.js` (`loadParsedRecord`/
  `findToolResultText`).
- `tests/track-line-states-fixtures.js` — add `makeBashReadResult`-style fixture
  helpers (pair a Bash command line with a Bash result line).

## Plan File
`~/.claude/plans/make-a-plan-for-cheeky-lampson.md` (the refined item-4 plan).
Standing tracker: `plans/roadmap-100-percent-reconstruction.md`.

## Context the Next Agent Won't Have
- **Record topology = THE load-bearing gotcha.** A Bash command (`tool_use`,
  `input.command`) and its output (`tool_result`, stdout) are in TWO SEPARATE
  JSONL records, linked by `tool_use_id`. Emit the event at the **tool_result**
  line (materialization does `findToolResultText(loadParsedRecord(jsonl,
  jsonlLine))`). The materializer sees ONLY the result record, NEVER the command
  — so ALL geometry (`firstLine`) MUST be computed at EMISSION and carried on the
  sub-object. This is what distinguishes item 4 from item-3's edit-driven kinds.
- **Cannot reuse the `readChunk` kind:** its materializer (`numberedLineEntries`)
  reads absolute positions from the Read tool's `N\t` prefixes; raw `head`/`sed`/
  `tail` stdout has none → new kind numbering from `firstLine`. Same sub-object
  shape + same apply branch though.
- **Require-cycle traps (cost real debugging):** (a) `line-state-evidence` ⇄
  `bash-read-evidence` — break with the call-time `lse()` getter in the
  materializer + the inline `require('./bash-read-evidence')` in `materializeEvent`
  (mirror `structured-patch-evidence`). (b) Do NOT import `recordTimestampAt`
  from `file-events-extractors` (it imports the new module) — define a LOCAL
  `timestampAt` (copy bash-op-events.js:19-27), exactly as bash-op-events does.
- **Unexported helpers must be replicated, not imported:** `scanToolUseResults`
  and `isValidReadContent` live in `file-event-observations.js`, which is 279
  lines (OVER the 250 cap) so it cannot be edited to add exports → duplicate the
  ~15-line pairing loop and the 3 error-prefix checks ("Error", "File does not
  exist", "Wasted call").
- **`wc -l` is a LOWER BOUND, not EOF proof** (counts newlines; undercounts a
  file lacking a trailing newline). Apply extend-only via `ensureImpliedLines`;
  never set `eofConfirmed`.
- **Path matching mirrors `cat`** (raw captured path vs `aliasSet`, no cwd
  resolution) — relative-path misses accepted; cwd-resolution is a future refinement.
- **`grep` scope:** bash single-file `grep -n` only here; recursive/multi-file
  (`file:line:text`) is item 5 (native Grep tool).
- **User decisions this session:** (1) chose FULL item-4 scope incl. `grep -n`
  (over "content reads only" / "+wc -l"); (2) flagged the original "why a new
  kind" rationale as too vague and asked for a full ambiguity pass — the plan now
  spells out record topology, cycle avoidance, and copy-from-here parser/guard
  detail.
- **Locked conventions (do NOT re-litigate):** ONE condition per `if` (nest;
  never `&&`/`||`; ternary only for value selection, >3-deep nesting rejected);
  250-line WRITE cap is a hard hook gate (auto-runs `tests/test-<basename>.js`);
  archive=preserve (relocate to `archive/`, never delete); no forwarding shims;
  vocabulary — never "corpus" (say "all JSONL files in the projects folder"),
  "create" never "mint"; the non-null sub-object IS the kind (no kind strings).
- **Probe gate ONLY against the FROZEN fixture**
  `~/Programming/jot-recovery/probe-fixture-20260615/` — NEVER live `projects/`
  (self-contaminates as you work). Recursive `grep`/`diff` give FALSE NEGATIVES
  in this shell (status-line injectors) — use a `node` fs-walk + `node -e` JSON
  compare. `node` prints "Debugger listening…" to stderr — filter `2>/dev/null`.

## How to Verify
NOTE: nothing to verify yet (no code written) — these are the per-phase gates to
run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng` after EACH phase.
```bash
# Full suite (currently 47 suites / 493 passed / 0 failed; expect 493 + new):
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'

# detect-rewinds — expect 15 passed / 0 failed:
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# Probe A/B byte-identity (SAFETY GATE) — FROZEN fixture, node -e JSON compare (NOT diff/grep):
git worktree remove --force /tmp/reveng-baseline 2>/dev/null; rm -rf /tmp/reveng-baseline
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# Sidecar e2e (plate_summary.py) — verdict unchanged + 0 NEW conflicts + new kinds appear:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null

# Every new/edited source + test file <= 250 lines.
```
