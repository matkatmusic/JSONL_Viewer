# Handoff: Roadmap item 3 (`structuredPatch` context lines) — PLAN WRITTEN, ready for sign-off + implementation

## Branch
`develop` based on `master`. The committed source tree exists ONLY on
`develop-baseline` (tip `9968536` — "Baseline: source tree before stage-3
tool-suite api/ migration"). On `develop` everything (`api/`, `tools/`,
`tests/`, `plans/`, …) is present but **UNTRACKED** (`git status` shows `??`) —
EXPECTED, not a mistake. Only `.gitignore` is tracked/modified; `git log` on
`develop` shows the single `1a9f098`. Review any change with
`git diff develop-baseline -- <path>`. There is **no `-plate` branch**.

## Goal
Drive the per-line-state reconstruction sidecar toward 100% file reconstruction
by closing event-coverage gaps, one roadmap item at a time
(`plans/roadmap-100-percent-reconstruction.md`). Items 1 (`originalFile`) and 2
(Bash file ops `rm`/`>`/`>>`) are DONE. **Item 3 — emit `structuredPatch`
context (`' '`) lines as per-line Tier-2 observations** — is now fully PLANNED
but NOT implemented. Hard constraint throughout: the sidecar runs BESIDE the
reconstruction pipeline and must never change probe PASS/MISMATCH (A/B
byte-identity).

## Current State
- **Item 3 plan is COMPLETE and written** to
  `/Users/matkatmusicllc/.claude/plans/make-a-plan-for-sparkling-pancake.md`
  (this session). It mirrors the item-2 plan's phase structure.
- **Implementation has NOT started.** The plan was presented for approval via
  ExitPlanMode; the user declined to start coding and asked for this handoff
  instead. So the next agent's first move is: read the plan, get the user's
  sign-off (adjust if they want changes), THEN implement strict red-green TDD.
- **The tree is GREEN; nothing is mid-flight.** Item-2 gates as last verified:
  full suite **43 suites / 483 passed / 0 failed**; detect-rewinds **15/0**;
  probe A/B byte-identical vs `develop-baseline`; sidecar e2e
  (`plate_summary.py`) 247/247 matchedObserved, 0 mismatched, 233 conflicts.
- **Exploration already done this session (don't redo it):**
  - The plan's design is verified against real data: **all 52 `structuredPatch`
    hunks** sampled from live claude-data carry `oldStart`/`oldLines`/
    `newStart`/`newLines`/`lines`. Test fixtures omit the metadata because the
    existing text-matching helper never needed it — but item 3 needs `newStart`
    to compute absolute line numbers, and it IS present in real records.
  - Live hunks contain `"\ No newline at end of file"` marker lines (prefix
    `\`); the hunk walk must SKIP them (no cursor advance, no emit).
  - `readsForFile`/`editsForFile` (the wish-list helpers to relocate in Phase 0)
    are **export-only**; sole real callers are 2 tests in
    `tests/test-file-events-extractors.js`. (The `verify-all-scenarios.js`
    matches are an unrelated local variable — safe to ignore.)
  - `api/file-events-extractors.js` is at **249/250**, so emission wiring needs
    Phase 0 to free cap space first. `api/line-state-evidence.js` is at
    **244/250** (dispatch is +1 line; the materializer body must be a new module).

## What Remains
Execute the item-3 plan (`~/.claude/plans/make-a-plan-for-sparkling-pancake.md`)
in order. After sign-off:

1. **Phase 0 (GATING) — relocate wish-list helpers.** Move `readsForFile`,
   `editsForFile`, `READ_EVENT_KINDS`, `AUTHORED_EVENT_KINDS` verbatim from
   `api/file-events-extractors.js` (lines 25-28, 227-239, exports 247-248) into
   a new `api/file-event-wishlists.js` (imports `extractFileEvents` from
   `./file-events-extractors`, `eventHasAnyKind` from `./file-event-kinds`; no
   re-export shim). Move the 2 wish-list tests into a new
   `tests/test-file-event-wishlists.js` (preserve, don't delete). Gate: both
   suites green; +1 suite, same test total; probe A/B trivially unaffected.
2. **Phase 1 step 1** — add `'patchContext'` to `KIND_NAMES`
   (`api/file-event-kinds.js:14`). RED: name-exists test.
3. **Phase 1 step 2** — `api/structured-patch-events.js` (NEW):
   `patchContextEventsFromEdits(jsonlPath, parsed, edits, statusByLine, aliasPaths)`,
   mirroring `originalFileEventsFromEdits`. Emit ONE `patchContext` event
   (`{}` fields) per kept authored edit that belongs to the file, isn't
   `ignored`, has a timestamp, and whose `structuredPatch` holds ≥1 context
   (`' '`) line. Local timestamp lookup (don't import from
   `file-events-extractors` — cycle).
4. **Phase 1 step 3** — wire it into `extractFileEventsFromText`
   (`api/file-events-extractors.js`, +import +`push.apply` next to the
   `originalFile` push at line 207).
5. **Phase 1 step 4** — `api/structured-patch-evidence.js` (NEW):
   `materializePatchContext(event)` walks hunks computing `newStart`-based
   absolute line numbers (skip `\` markers and `-` lines; `+` advances cursor
   but isn't emitted; `' '` emits + advances), building `{lineNum, text, ref}`
   via `buildStructuredPatchRef(...,'toolUseResult.structuredPatch',hunkIndex,lineIndex)`.
   Use a call-time `lse()` getter (require cycle break, mirror
   `bash-op-evidence.js`). `loadParsedRecord` from `./evidence-record-access`.
6. **Phase 1 step 5** — `api/line-state-evidence.js` `materializeEvent` (line
   199-202): +1 dispatch line
   `if (event.patchContext) { return require('./structured-patch-evidence').materializePatchContext(event); }`.
7. **Phase 1 step 6** — `api/track-line-states.js` `applyOneEvent` (~line 115):
   +1 explicit branch
   `if (m.kind === 'patchContext') { return lb.applyOverlayLines(belief, m.byLine, event.unixMs); }`.
   **No `finishWholeOverlay`** (sparse, extent-neutral). NOT added to
   `isBeaconEvent`. No `kindRank` change (default 2 sorts it after the edit).
8. **Phase 1 step 8** — tests: add `makeEditLineWithHunks(...)` fixture to
   `tests/track-line-states-fixtures.js` (existing `makeEditLineWithPatch` sets
   no `newStart`); new suites `tests/test-structured-patch-events.js`,
   `tests/test-structured-patch-evidence.js`,
   `tests/test-track-line-states-patchcontext.js`. Strict RED-before-GREEN each.
9. **Phase 2 — gates + payoff + roadmap + notes.** Re-run all gates (below).
   Measure the timeline *presumed*-residual collapse on `plate_summary.py` (the
   payoff, mirroring item 1's −41%); confirm final verdict + conflict count
   unchanged. Check item 3 `[x]` in the roadmap. Keep
   `plans/implementation-notes-structuredpatch-context.md`.
10. **Then the rest of the roadmap in order:** item 4 (partial-content bash
    reads), item 5 (native Grep results), items 6–8 (§A), 9–13 (§B), 14–16 (§C),
    17 (§D consolidation). See the roadmap for per-item specs + gotchas.

## Key Files
- **Plan (item 3):** `/Users/matkatmusicllc/.claude/plans/make-a-plan-for-sparkling-pancake.md`
  — the authoritative execution spec. **Read first.**
- **Roadmap (17-item tracker):** `plans/roadmap-100-percent-reconstruction.md`
  — item 2 is `[~]` (rm/`>`/`>>` `[x]`, cp deferred); item 3 is the next `[ ]`.
- **Sidecar spec:** `plans/per-line-state-sidecar-plan.md` — authoritative
  schema the system extends.
- `api/file-event-kinds.js` (41L) — `KIND_NAMES` registry + `createKindEvent`. Add `'patchContext'`.
- `api/file-events-extractors.js` (249L, AT CAP) — emission orchestrator; Phase 0 relocates the wish-list helpers, then +2 wiring lines.
- `api/line-state-evidence.js` (244L) — `materializeEvent` dispatch; `buildStructuredPatchRef` (line 110, exported), `plainLineEntries`/`pairEntriesWithRefs` exported.
- `api/evidence-record-access.js` (87L) — `loadParsedRecord` (16), `findStructuredPatchLine` (71) / `findLineInHunk` (61, includes `' '` context lines). Read-only consumer; do not touch core.
- `api/track-line-states.js` (224L) — `applyOneEvent` (89), `isBeaconEvent` (56), `kindRank` (23), `maxByLineNum` (64).
- `api/line-belief.js` (238L) — `applyOverlayLines` (80, the sparse-overlay apply), `finishWholeOverlay` (111, NOT used by item 3).
- `api/bash-op-events.js` (85L) / `api/bash-op-evidence.js` (138L) — the item-2 extractor+materializer pair to MIRROR (incl. the `lse()` cycle break).
- `tests/track-line-states-fixtures.js` — shared fixtures (`makeEditLineWithPatch`, `trackFixture`, `withTimestamp`); add `makeEditLineWithHunks`.

## Plan File
`/Users/matkatmusicllc/.claude/plans/make-a-plan-for-sparkling-pancake.md`
(item 3). Precedent plans in the same folder:
`~/.claude/plans/plan-item-2-on-agile-crystal.md` (item 2) and
`~/.claude/plans/make-a-plan-for-mutable-donut.md` (item 1).

## Prior-item implementation notes (READ for context on what/how/deviations)
All in `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/`:
- `plans/implementation-notes-bash-op-event-kinds.md` — **item 2** (phase-by-phase
  log, cp spike, 5 open questions, every gate number, the lazy-require cycle break). **Start here.**
- `plans/implementation-notes-originalFile-event-kind.md` — **item 1** (discrete
  event-kind decision, overlay-before-splice ordering tiebreaker, −41% payoff).
- `plans/implementation-notes-per-line-state-sidecar-plan.md` — sidecar foundation build.
- `plans/implementation-notes-tool-suite-migration-plan.md` — the `common/*`→`api/*`
  migration the sidecar sits on (large; skim the path-translation map if an import looks off).

## Context the Next Agent Won't Have
- **Locked conventions (do NOT re-litigate):** ONE condition per `if` (nest;
  never `&&`/`||`; ternary only for value selection); strict red-green TDD (watch
  each test fail first); **no forwarding layers** (one canonical home, import
  directly); **archive = preserve** (relocate test bodies, never delete);
  vocabulary — never "corpus" (say "all JSONL files in the projects folder"),
  "create" never "mint". The non-null kind sub-object IS the kind (no kind strings).
- **250-line WRITE cap is a hard hook gate** — the `jot` post-write hook BLOCKS
  any save > 250 lines AND auto-runs the edited file's matching
  `tests/test-<basename>.js` (free RED/GREEN). Files at/near cap CANNOT grow —
  split into a sibling. This is exactly why Phase 0 must run before the emission
  wiring (`file-events-extractors.js` is at 249).
- **Require-cycle gotcha:** `line-state-evidence` ⇄ a materializer module is a
  cycle (dispatch ↔ shared `buildStructuredPatchRef`). Both reassign
  `module.exports`, so a TOP-LEVEL require captures a stale `{}`. Break it with
  CALL-TIME require on both edges — `lse()` getter in the new module + inline
  `require('./structured-patch-evidence')` in `materializeEvent`. (Item 2 did
  exactly this for `bash-op-evidence`.)
- **Semantic crux (decided in the plan):** context lines describe the
  **POST-edit** file (numbered from `newStart`), so they must apply AFTER the
  edit splice — which the default `kindRank` (originalFile 0 → edit 1 →
  patchContext 2) already guarantees within one record. They are a SPARSE
  overlay: `applyOverlayLines` alone (no `finishWholeOverlay`) corroborates the
  observed lines, conflicts when belief disagrees, bumps `lastLine` only to the
  highest observed line, and never claims EOF. Emit ONLY `' '` context lines —
  `'+'` added lines are already handled by the edit splice + `refForAuthoredEditLine`.
- **Two non-blocking open questions to keep in mind** (see the plan's last
  section): (1) a context line beyond a stale `eofConfirmed` extent bumps
  `lastLine` but leaves the flag — flag if it shows on real data; (2) a floated
  edit can make the `newStart`-based overlay conflict — that conflict is correct
  (surfaces a real differ-vs-splice discrepancy); report the count.
- **Env quirks (cost real debugging time):** the shell wraps `diff`/`grep` with
  status-line injectors — **recursive `grep` gave false "(none)" results this
  session.** Use a `node`/`ctx_execute` fs-walk for codebase searches, and a
  `node -e` JSON compare (delete `generatedAt`) for the probe gate — NOT
  `diff`/`grep`. `node` prints "Debugger listening…" to stderr (filter
  `2>/dev/null`). The full-suite gate is a bash `case` one-liner zsh rejects —
  run via `bash -c`. Run the PROBE only against the FROZEN fixture
  `~/Programming/jot-recovery/probe-fixture-20260615/` (NOT live data — it
  self-contaminates). The sidecar e2e (`tools/track-line-states.js`) IS safe on
  live claude-data (`~/Programming/jot-recovery/claude-data/`, read-only).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng` after each phase
(full commands in `plans/handoff-develop-20260615-1833.md` § How to Verify):
```bash
# Full suite — currently 43 suites / 483 passed / 0 failed (grows with item 3):
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'

# detect-rewinds — expect 15 passed / 0 failed:
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# Probe A/B byte-identity (SAFETY GATE) — frozen fixture, node -e JSON compare (NOT diff/grep):
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# Sidecar e2e (plate_summary.py) — verdict unchanged + measure presumed-residual payoff:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null

# Every new/edited source + test file <= 250 lines (spot-check the files item 3 touches).
```
