# Handoff: Roadmap item 2 (Bash file ops as event kinds) — PLANNED, ready to execute

## Branch
`develop` based on `master`. The source tree is committed ONLY on `develop-baseline`
(tip `9968536`). On `develop` everything (`api/`, `tools/`, `tests/`, `plans/`, …) is
present but **UNTRACKED** (`git status` shows `??`) — EXPECTED. Only `.gitignore` is
tracked/modified; `git log` shows the single `1a9f098`. Review changes with
`git diff develop-baseline -- <path>`. There is no `-plate` branch.

## Goal
Execute roadmap item 2 — surface Bash file operations as first-class sidecar event
kinds so the per-line tracker reasons about shell-mutated files, driving toward 100%
reconstruction. This plan ships **`rm`** (Tier-2 absence), **`>`** (truncate-write with
inline content), and **`>>`** (append). **`cp` is deferred** to a verify-first spike
because its content is already routed by the existing lineage layer (see Context).

## Current State
- **Item 1 (`originalFile`) COMPLETE**, all gates green: 39 suites / 458 passed / 0 failed;
  detect-rewinds 15/0; probe A/B byte-identical vs `develop-baseline`; sidecar e2e
  presumed-residual −41%. Tree is green; **no code is mid-flight.**
- **Item 2 is PLANNED, NOT started.** No item-2 code exists yet. The authoritative,
  phase-by-phase execution spec is written to
  **`/Users/matkatmusicllc/.claude/plans/plan-item-2-on-agile-crystal.md`** (READ FIRST).
- Three design decisions were resolved with the user this session (see Context).
- This session did read-only exploration + planning only; nothing was committed or edited
  besides the plan file.

## What Remains
Execute the plan (`/Users/matkatmusicllc/.claude/plans/plan-item-2-on-agile-crystal.md`),
in order, strict red-green TDD, re-running gates after each phase:
1. **Phase 0 (GATING):** Split `tests/test-track-line-states.js` (271L, over the 250-line
   write cap) — relocate the conflict/verdict tests into a new
   `tests/test-track-line-states-verdict.js` (**preserve bodies, don't delete**); move
   shared helpers so both suites use them (no forwarding re-export). Both suites green,
   file ≤ 250.
2. **Phase 1 — `rm` → `bashRm` (Tier-2 absence):** register `bashRm` in `KIND_NAMES`;
   create `api/bash-op-events.js` (emission, mirrors `originalFileEventsFromEdits`) and
   `api/bash-op-evidence.js` (materialize); add `applyAbsenceObservation` to
   `api/line-belief.js` (returns conflicts, clears belief, NOT a beacon); add explicit
   `bashRm` branch to `applyOneEvent`; wire emission into `file-events-extractors.js`
   (+2 lines only).
3. **Phase 2 — `>` → `bashTruncate`:** add conservative `redirectContentFromCommand`
   (single-quoted echo / heredoc / literal printf; skip ambiguous → null) in
   `api/bash-op-evidence.js`; whole-file-overlay branch (same shape as the `originalFile`
   branch); export `plainLineEntries` from `line-state-evidence.js`.
4. **Phase 3 — `>>` → `bashAppend`:** apply-time extent offset (`offset = belief.lastLine`)
   in `applyOneEvent`; new lines appended beyond current extent.
5. **Phase 4 — `cp` verify-first spike (no new kind, no production code):** measure whether
   the directed alias edge already recovers a real `cp`-created (launch.json-class) file on
   live data; document the divergence + discovery-seed limitations; file a precise-cp
   follow-up roadmap sub-item ONLY if measurement shows a real gap.
6. Mark `rm`/`>`/`>>` sub-boxes in `plans/roadmap-100-percent-reconstruction.md`; leave
   `cp` unchecked with a note. Keep an implementation-notes log per the `jot:implement`
   pattern.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/plan-item-2-on-agile-crystal.md` — **THE PLAN. Read first.**
- `plans/roadmap-100-percent-reconstruction.md` — item-2 spec (lines ~41-46); 17-item tracker.
- `plans/implementation-notes-originalFile-event-kind.md` — the item-1 record; the pattern to mirror.
- `api/file-event-kinds.js` (40L) — `KIND_NAMES` registry; add `bashRm`/`bashTruncate`/`bashAppend`.
- `api/file-events-extractors.js` (247L, **AT CAP**) — orchestrator; emission body goes in the NEW module, only +2 wiring lines here.
- `api/bash-op-events.js`, `api/bash-op-evidence.js` — **NEW** sidecar modules to create.
- `api/line-state-evidence.js` (237L) — `materializeEvent` dispatch; export `plainLineEntries`.
- `api/track-line-states.js` (198L) — `applyOneEvent` (3 new explicit branches), `isBeaconEvent` (add none), `compareEvents`/`kindRank`, `maxByLineNum`.
- `api/line-belief.js` (218L) — add `applyAbsenceObservation`; reuse `applyOverlayLines`/`finishWholeOverlay`.
- `api/extract-bash-file-ops.js` (123L) — the parser; **CONSUME read-only, DO NOT MODIFY** (it is probe-reachable).
- `api/file-historical-lineage.js` — `resolveAgainstCwd` (import it) and the cp directed-edge lineage (the cp insight, lines 24, 159-168).
- `tools/track-line-states.js` — the sidecar CLI driver (e2e + the cp spike); shows alias resolution at lines 31-37, 95-99.
- `tools/probe-projects-v2.js` — the probe A/B gate; imports NONE of the sidecar modules.

## Plan File
`/Users/matkatmusicllc/.claude/plans/plan-item-2-on-agile-crystal.md`

## Context the Next Agent Won't Have
- **Three resolved decisions — do NOT re-litigate:** (1) keep **explicit** per-kind branches
  in `applyOneEvent` (`bashTruncate` gets its own branch like `originalFile`); (2) **split
  `tests/test-track-line-states.js` NOW** as Phase 0; (3) **DEFER `cp`** — verify-first spike,
  no new `cp` kind in item 2.
- **The `cp` insight (why it's deferred):** `cp` content already flows `src → dst` TODAY via
  the **directed** lineage edge `dst → src` (`file-historical-lineage.js:163`) + the
  `resolveAliases` transitive closure the CLI feeds the engine
  (`tools/track-line-states.js:95,99`). The gap is **precision, not capability:** (a) **no
  temporal cut** — `src` edits AFTER the copy bleed into `dst`'s belief; (b) **discovery is
  seeded by `[target]` only** (`tools/track-line-states.js:94`), so `src`-only transcripts are
  missed even though the alias closure knows the edge. Hence a measurement spike, not new code.
- **`rm` and `>`/`>>` ARE genuinely net-new to the tracker:** today they are only `'rm'`/
  `'redirect'` *touches* in `file-historical-lineage.js` (never materialized into belief), and
  redirect **content is extracted nowhere**.
- **Probe-safety is essentially free:** every module item 2 edits is **sidecar-only**;
  `tools/probe-projects-v2.js` imports none of them. **KEEP `api/extract-bash-file-ops.js`
  byte-identical** (it IS in the reconstruction path) — put the new redirect-content parser in
  `api/bash-op-evidence.js`, NOT the parser. Still run the probe A/B gate after each phase
  (expected trivially identical).
- **`rm` must be Tier-2 (non-beacon):** `rm` is INFERRED (can fail, or be followed by a
  recreate a later overlay repopulates), so it contradicts within the current beacon window and
  clears belief but must NOT anchor. The existing `applyFileAbsent` is a Tier-1 **beacon** that
  returns no conflicts — do NOT reuse it for `rm`; add `applyAbsenceObservation` that RETURNS a
  conflict per displaced line and is left OUT of `isBeaconEvent`.
- **`>>` append is apply-time stateful:** the append offset is `belief.lastLine`, known only at
  apply time — compute it in `applyOneEvent`, not at materialization.
- **Content extraction must be CONSERVATIVE:** skip ambiguous echo escaping / variable
  interpolation (emit no event) rather than risk corrupting belief — a missing observation is
  safe, a wrong one is not (the EOF-caution principle).
- **Cap mechanics:** the `jot` post-write hook BLOCKS any save > 250 lines and auto-runs the
  edited file's tests (free RED/GREEN). `file-events-extractors.js` is at 247 — emission body in
  the new module, +2 wiring lines only; if it breaches, relocate `readsForFile`/`editsForFile`
  (lines 225-237) to a sibling.
- **Env quirks (from item 1):** the shell wraps `diff`/`grep` with status-line injectors —
  compare probe JSON with a `node -e` script (`delete generatedAt`; compare `JSON.stringify`),
  NOT `diff`/`grep`. `node` prints "Debugger listening…" to stderr (filter `2>/dev/null`). The
  full-suite gate is a bash `case` one-liner zsh rejects — run via `bash -c`. Run the PROBE only
  against the FROZEN fixture `~/Programming/jot-recovery/probe-fixture-20260615/` (NOT live data —
  it self-contaminates); the sidecar e2e (`track-line-states`) IS safe on live claude-data (read-only).
- **Vocabulary (enforced):** never "corpus" (say "all JSONL files in the projects folder");
  "create", never "mint". **Coding:** ONE condition per `if` (nest; no `&&`/`||`; ternary only for
  value selection); strict red-green TDD (watch it fail first); **no forwarding layers** (one
  canonical home, import directly); **archive = preserve** (relocate test bodies, never delete).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng` (commands carried from the
item-1 handoff "How to Verify"):
```bash
# Full suite — expect >= 39 suites / 458 passed / 0 failed (grows as item 2 adds tests):
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'

# detect-rewinds — expect 15 passed / 0 failed:
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# Probe A/B byte-identity (SAFETY GATE — must stay identical vs develop-baseline):
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null | tail -2
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# Sidecar e2e (plate_summary.py) — verdict unchanged: 247/247 matchedObserved, 0 mismatched, 233 conflicts:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null

# Every new/edited source + test file <= 250 lines (add the new files to this list):
for f in api/file-event-kinds.js api/file-events-extractors.js api/line-state-evidence.js \
  api/track-line-states.js api/line-belief.js api/bash-op-events.js api/bash-op-evidence.js \
  tests/test-track-line-states.js tests/test-track-line-states-verdict.js; do \
  printf "%5s  %s\n" "$(wc -l < "$f" 2>/dev/null | tr -d ' ')" "$f"; done
```
