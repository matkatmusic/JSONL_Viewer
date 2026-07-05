# Handoff: Roadmap item 4 (partial-content bash reads) SHIPPED & GREEN; items 5–17 remain
Conversation name: RevEng — implement roadmap item 4 (partial-content bash reads)
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
The per-line-state reconstruction sidecar (`RevEng/`) drives toward 100% file
reconstruction by turning JSONL evidence the main pipeline ignores into per-line
"belief" observations. Item 4 (partial-content bash reads) is now shipped; the
next agent continues the 17-item roadmap (item 5 is next), each item adding
line-addressed corroboration that shrinks presumed carry-forward. **Hard
constraint:** the sidecar runs BESIDE the reconstruction pipeline and must NEVER
change probe PASS/MISMATCH (A/B byte-identity vs `develop-baseline`).

## Current State
**Item 4 COMPLETE and GREEN** (items 1–3 — `originalFile`, bash `rm`/`>`/`>>`,
`structuredPatch` context — were already done). Verified final gates:
- Full suite: **52 suites / 556 passed / 0 failed** (was 47/493 at item-4 start).
- detect-rewinds: **15/0**.
- Probe A/B **byte-identical** vs `develop-baseline` (frozen fixture) — held after
  every phase (the safety gate).
- Sidecar e2e `plate_summary.py`: 247/247 matchedObserved, 0 mismatched,
  conflicts 233 (0 new).
- Every new/edited source + test file ≤ 250 lines.

Item 4 shipped THREE sparse-overlay event kinds (strict RED→GREEN, one phase
each): `bashReadChunk` (head / sed -n A,Bp / tail -n +N), `bashExtent` (wc -l,
extend-only), `bashGrep` (single-file grep -n). New modules + full wiring;
`applyOneEvent` was extracted to `api/apply-one-event.js` (the 250-cap
contingency). Roadmap item 4 is marked `[x]`. Nothing is mid-flight.

## What Remains
(Roadmap execution order; **item 5 is the next `[ ]`**.)
1. **Item 5 — Native Grep tool results** (mode: content, `-n` true): `file:line:text`
   rows as line-addressed observations across MANY files at once. DISTINCT from
   item-4's `bashGrep` (single-file `line:text`). **NOTE:** item 5 broadens probe
   touch-collection (grep-inclusive), so the A/B baseline INTENTIONALLY shifts —
   read the roadmap's "Probe gate (Item 5 onward)" section first.
2. **Item 6** — MCP-tool file reads in subagent transcripts (survey before building).
3. **Item 7** — Dropped-record count for timestampless records.
4. **Items 8–17** — MultiEdit records, replaceAll across all runs, time-aware alias
   windows, `floatingOverKnownRegion`, **item 12: collapse conflict cascades**, git
   reference rung, trailing-extent mismatch, promote per-line verdict into probe,
   run over list2, unify the two read scanners. See roadmap for each.
Per item: strict RED-before-GREEN, re-run ALL gates after, keep every file ≤250.

## Key Files
- **Roadmap (17-item tracker):** `plans/roadmap-100-percent-reconstruction.md` —
  item 5 is the next `[ ]`; read the "Probe gate (Item 5 onward)" notes near the end.
- **Item-4 notes:** `plans/implementation-notes-item4-bash-reads.md` — decisions,
  deviations, conflict attribution, final gates.
- **Item-4 modules (mirror these for item 5):** `api/bash-read-commands.js` (pure
  parsers), `api/bash-read-events.js` (emission: inline tool_use↔tool_result pairing
  + local `timestampAt`), `api/bash-read-evidence.js` (materializers + call-time
  `lse()` cycle break), `api/apply-one-event.js` (per-event apply dispatch — ADD new
  apply branches HERE, not in track-line-states).
- **Sidecar core (mind caps):** `api/file-event-kinds.js` (`KIND_NAMES` +
  `createKindEvent`); `api/file-events-extractors.js` (extractor wiring, push.apply
  block); `api/line-state-evidence.js` (`materializeEvent` dispatch — **248L, only ~2
  lines headroom**); `api/track-line-states.js` (tracker, 153L); `api/line-belief.js`
  (`applyOverlayLines`/`finishChunk`/`finishWholeOverlay`/`ensureImpliedLines`);
  `api/evidence-record-access.js` (`loadParsedRecord`/`findToolResultText`).
- **Tests:** `tests/test-helpers.js` (builders incl. `makeBashCommandLine`,
  `makeBashCatToolResult`); `tests/track-line-states-fixtures.js` (TS/MS,
  `withTimestamp`, `trackFixture`).

## Plan File
`plans/roadmap-100-percent-reconstruction.md` (standing tracker). The item-4 plan
(`~/.claude/plans/make-a-plan-for-cheeky-lampson.md`) is a transient plan-mode file,
now superseded by the item-4 notes.

## Context the Next Agent Won't Have
- **Bash stdout EOF is UNRELIABLE — NEVER `finishChunk` on a Bash line count.** The
  Bash harness strips stdout's trailing newline, so `splitContentLines` undercounts
  by one when the last witnessed line is blank. ALL three item-4 kinds are
  sparse/extend-only and never claim EOF. This DEVIATES from the item-4 plan (which
  said "copy readChunk's finishChunk verbatim") — real data (`sed -n '179,189p'` on
  plate_cli.py) proved `finishChunk` truncated belief 207→188 (corruption). Any
  future bash-content kind (incl. item 5) must follow this rule. The Read tool's
  counts ARE reliable, so `readChunk` keeps `finishChunk` — bash is the exception.
- **User decision (load-bearing): bash reads are Source-Of-Truth objects → treated
  as FULL observations** (overwrite belief + record conflicts on disagreement), same
  tier/rules as `cat`/Read. "Soft" / corroboration-only was explicitly REJECTED.
  Apply this to item-5 grep observations too.
- **Conflicts on edited files are EXPECTED, not a bug.** They are drift surfacing
  (belief pinned at the read instant vs a later beacon/observation); the final
  verdict is unaffected. Proven by attribution: `plate_lib.py` conflicts 43508
  baseline === 43508 current (11 bashGrep + 4 bashExtent events added ZERO);
  `plate_cli.py` 0→34 (one untracked insertion → snapshot-verify cascade). The
  per-line cascade noise (one insertion → N records) is roadmap **item 12** — do NOT
  try to fix it inside another item.
- **`api/apply-one-event.js` exists because `track-line-states.js` hit the 250 cap.**
  Add new apply branches THERE. `line-state-evidence.js` is at 248L — adding the
  item-5 `materializeEvent` dispatch line may force an extraction; plan for it.
- **Probe gate mechanics (this shell):** recursive `grep`/`diff` give FALSE NEGATIVES
  (status-line injectors) — use a `node` fs-walk + `node -e` JSON compare. `node`
  prints "Debugger listening…" to stderr — filter `2>/dev/null`. Gate ONLY against
  the FROZEN fixture `~/Programming/jot-recovery/probe-fixture-20260615/projects`
  (NEVER live `projects/` — it self-contaminates). The combined probe one-liner can
  fail if `/tmp/reveng-baseline` wasn't cleaned — always
  `git worktree remove --force /tmp/reveng-baseline; rm -rf /tmp/reveng-baseline` first.
- **Hook behavior:** a post-write hook enforces the 250-line cap (BLOCKS over-cap
  writes) and auto-runs `tests/test-<basename>.js`; a missing test file is a
  non-blocking WARNING. Write RED tests first — the hook reports failures at each Stop.
- **Locked conventions:** ONE condition per `if` (nest; no `&&`/`||`; ternary only for
  value selection); the non-null sub-object IS the kind (no kind strings); replicate
  unexported helpers rather than importing (`file-event-observations.js` is over-cap);
  path matching mirrors `cat` (raw captured path vs `aliasSet`, no cwd resolution) —
  relative-path misses accepted (a noted future refinement, not a bug).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng` after each phase.
```bash
# Full suite (currently 52 suites / 556 passed / 0 failed):
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'

# detect-rewinds — expect 15 passed / 0 failed:
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# Probe A/B byte-identity (SAFETY GATE) — FROZEN fixture, node -e JSON compare.
# NOTE: item 5 onward intentionally shifts this baseline (grep-inclusive touch
# collection) — read the roadmap's "Probe gate (Item 5 onward)" before treating a
# difference as a regression.
git worktree remove --force /tmp/reveng-baseline 2>/dev/null; rm -rf /tmp/reveng-baseline
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline >/dev/null 2>&1
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# Sidecar e2e (plate_summary.py) — verdict unchanged + 0 NEW conflicts:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null

# Every new/edited source + test file <= 250 lines.
```
