# Handoff: Roadmap item 2 (Bash file ops) COMPLETE — ready for item 3

## Branch
`develop` based on `master`. The committed source tree exists ONLY on `develop-baseline`
(tip `9968536` — "Baseline: source tree before stage-3 tool-suite api/ migration"). On
`develop` everything (`api/`, `tools/`, `tests/`, `plans/`, …) is present but **UNTRACKED**
(`git status` shows `??`) — EXPECTED, not a mistake. Only `.gitignore` is tracked/modified;
`git log` on `develop` shows the single `1a9f098`. Review any change with
`git diff develop-baseline -- <path>`. There is no `-plate` branch.

## Goal
Drive the per-line-state reconstruction sidecar toward 100% file reconstruction by closing
event-coverage gaps, one roadmap item at a time
(`plans/roadmap-100-percent-reconstruction.md`). Items 1 (`originalFile`) and 2 (Bash file ops
`rm`/`>`/`>>`) are DONE. The next target is **item 3 — `structuredPatch` context (' ') lines as
observations** (Write/Edit hunks witness neighboring lines at edit time; the plumbing exists but
nothing emits them yet). Hard constraint throughout: the sidecar runs BESIDE the reconstruction
pipeline and must never change probe PASS/MISMATCH.

## Current State
- **Item 2 (Bash file ops) COMPLETE — all gates green:**
  - Full suite **43 suites / 483 passed / 0 failed**; detect-rewinds **15/0**; **probe A/B
    byte-identical** vs `develop-baseline` (frozen fixture); sidecar e2e (`plate_summary.py`)
    unchanged (247/247 matchedObserved, 0 mismatched, 233 conflicts).
  - Shipped three Tier-2 (non-beacon) kinds: **`bashRm`** (absence), **`bashTruncate`** (`>`
    truncate-write), **`bashAppend`** (`>>` append). `cp` DEFERRED (verify-first spike proved
    capability already exists via the directed alias edge; only precision gaps remain).
  - New modules: `api/bash-op-events.js` (emission), `api/bash-op-evidence.js` (materialize +
    conservative `redirectContentFromCommand`). `api/extract-bash-file-ops.js` kept
    **byte-identical** (probe-reachable). Phase 0 split the over-cap tracker test file.
  - `bashRm` verified firing on real data (rm hits 315 distinct paths; `debate_lib_main.py`
    records 1 bashRm / 355 absence conflicts). `bashTruncate`/`bashAppend` correct + tested but
    have 0 extractable hits on the live corpus (latent — real redirects here are command-output /
    double-quoted, which the conservative parser deliberately skips).
- **The tree is GREEN; no code is mid-flight.** All item-2 work is uncommitted (untracked on
  `develop`, like everything else).
- **Item 3 is NOT started.** No plan-of-record for item 3 exists yet (each item gets a plan
  written first — see `~/.claude/plans/plan-item-2-on-agile-crystal.md` for the item-2 precedent).

## What Remains
Execute the roadmap in order (`plans/roadmap-100-percent-reconstruction.md`). The immediate next
item, then the rest:
1. **Item 3 — `structuredPatch` context (' ') lines as observations.** Write/Edit
   `toolUseResult.structuredPatch` hunks carry unchanged context lines (prefix `' '`) AND their
   absolute line numbers (`oldStart`/`newStart` + offset). Emit them as per-line Tier-2
   observations at the edit's timestamp. The dereference plumbing already exists
   (`findStructuredPatchLine` / `buildStructuredPatchRef` in `api/line-state-evidence.js` +
   `api/evidence-record-access.js`); what's missing is an EXTRACTOR that walks each hunk's
   context lines and emits observation events. First write a plan (mirror the item-2 plan's
   phase structure), get user sign-off, then implement strict red-green TDD.
2. **Item 4** — partial-content bash reads (`head`, `tail`, `sed -n A,Bp`, `grep -n`; `wc -l` for
   extent only).
3. **Item 5** — native Grep tool results (`mode:content`, `-n`) as line-addressed observations.
4. **Items 6–8** (§A extraction), **9–13** (§B tracker gaps), **14–16** (§C residuals),
   **17** (§D consolidation). See the roadmap for the full ordered list + per-item gotchas.
- After EACH item: re-run all gates (full suite, detect-rewinds, probe A/B, sidecar e2e), keep a
  `plans/implementation-notes-<item>.md` log, and mark the roadmap checkbox.

## Key Files
- `plans/roadmap-100-percent-reconstruction.md` — **the 17-item tracker** (item 2 now `[~]`:
  rm/`>`/`>>` `[x]`, cp `[ ]` deferred; item 3 is the next `[ ]`; new item 10a added).
- `plans/per-line-state-sidecar-plan.md` — authoritative sidecar schema/spec (the system being extended).
- `api/file-event-kinds.js` (41L) — `KIND_NAMES` registry (now 11 kinds) + `createKindEvent`. Add new kinds here.
- `api/file-events-extractors.js` (249L, **AT CAP**) — the emission orchestrator; new emission
  BODY must go in a sibling module, only ~2 wiring lines here. If it breaches, relocate
  `readsForFile`/`editsForFile` (the wish-list helpers).
- `api/line-state-evidence.js` (244L) — `materializeEvent` dispatch + ref/content-line builders
  (`plainLineEntries`, `pairEntriesWithRefs`, `buildStructuredPatchRef` all exported);
  `findStructuredPatchLine` lives in `api/evidence-record-access.js`.
- `api/track-line-states.js` (224L) — `applyOneEvent` (explicit per-kind branches), `isBeaconEvent`,
  `compareEvents`/`kindRank`, `maxByLineNum`, `shiftByLine`.
- `api/line-belief.js` (238L) — belief primitives (`applyOverlayLines`, `finishWholeOverlay`,
  `applyAbsenceObservation`, etc.). For item 3, context lines are an overlay — `applyOverlayLines` fits.
- `api/edit-stream-extraction.js`, `api/edit-replay.js` — where Edit records + structuredPatch are parsed.
- `api/bash-op-events.js` (85L), `api/bash-op-evidence.js` (138L) — item-2 modules; the pattern
  to MIRROR for a new extractor + materializer pair.
- `tools/track-line-states.js` — the sidecar CLI (e2e driver). `tools/probe-projects-v2.js` — the
  probe A/B gate; imports NONE of the sidecar modules (so sidecar-only edits are probe-safe).

## Implementation-notes folders (READ THESE for prior-item context)
The user explicitly asked that the next agent be able to read what/how previous roadmap items
were built, where they deviated, and what was deferred. All live in **one folder**:

- **`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/`** — every `implementation-notes-*.md`
  and `handoff-develop-*.md` for this project. The reconstruction-roadmap-relevant ones:
  - `plans/implementation-notes-bash-op-event-kinds.md` — **item 2** (this session): phase-by-phase
    log, the cp spike table, the 5 open questions, every gate number. **Start here.**
  - `plans/implementation-notes-originalFile-event-kind.md` — **item 1** (`originalFile` kind):
    the discrete-event-kind decision, the overlay-before-splice ordering tiebreaker, the −41% payoff.
  - `plans/implementation-notes-per-line-state-sidecar-plan.md` — the sidecar foundation build.
  - `plans/implementation-notes-tool-suite-migration-plan.md` — the `common/*`→`api/*` migration
    the sidecar sits on (large; skim the path-translation map if an import looks off).
- **`/Users/matkatmusicllc/.claude/plans/`** — the authoritative per-item EXECUTION plans (the
  spec each item is built against), e.g. `plan-item-2-on-agile-crystal.md` (item 2) and
  `make-a-plan-for-mutable-donut.md` (item 1). Write the item-3 plan here too, then implement.

## Plan File
None yet for item 3 (write one first, in `~/.claude/plans/`, mirroring
`~/.claude/plans/plan-item-2-on-agile-crystal.md`). The roadmap
(`plans/roadmap-100-percent-reconstruction.md`) holds the item-3 one-line spec + payoff note.

## Context the Next Agent Won't Have
- **Locked conventions (do NOT re-litigate):** ONE condition per `if` (nest; never `&&`/`||`;
  ternary only for value selection); strict red-green TDD (watch each test fail first); **no
  forwarding layers** (one canonical home, import directly); **archive = preserve** (relocate test
  bodies, never delete); vocabulary — never "corpus" (say "all JSONL files in the projects folder"),
  "create" never "mint". The non-null kind sub-object IS the kind (no kind strings).
- **The 250-line WRITE cap is a hard hook gate** — the `jot` post-write hook BLOCKS any save > 250
  lines AND auto-runs the edited file's matching `tests/test-<basename>.js` (free RED/GREEN). Files
  at/near cap (`file-events-extractors.js` 249, `line-state-evidence.js` 244, `line-belief.js` 238)
  CANNOT grow — split into a new sibling `api/` module. The hook prints a benign warning when you
  write a non-test helper (no matching test file) — ignore it.
- **The CommonJS require-cycle gotcha (will recur for item 3 if you add a materializer module):**
  `line-state-evidence` ⇄ `bash-op-evidence` is a cycle (dispatch ↔ shared builders). Both modules
  reassign `module.exports`, so a TOP-LEVEL `require` of one inside the other captures a stale `{}`
  (whichever loads second loses). Item 2 broke it with CALL-TIME `require` on both edges (`lse()`
  getter in `bash-op-evidence`; inline `require('./bash-op-evidence')` in `materializeEvent`). If
  item 3's context-line materializer reuses `line-state-evidence` helpers, do the same — or keep
  the materializer INSIDE `line-state-evidence` like `materializeOriginalFile` does (no cycle).
- **Probe-safety is free if you don't touch probe-reachable code.** `tools/probe-projects-v2.js`
  imports none of the sidecar modules. KEEP `api/extract-bash-file-ops.js` and the
  reconstruction-path modules (`unified-reconstruct-steps.js`, `edit-stream-extraction.js` core)
  byte-identical; put new extraction in NEW sidecar modules. For item 3 specifically:
  `structuredPatch` is parsed by `edit-stream-extraction` for reconstruction — DON'T modify that
  parse; ADD a sidecar context-line extractor that consumes the already-parsed records read-only.
- **Env quirks (cost real debugging time):** the shell wraps `diff`/`grep` with status-line
  injectors — compare probe JSON with a `node -e` script (`delete generatedAt`; compare
  `JSON.stringify`), NOT `diff`/`grep`. `node` prints "Debugger listening…" to stderr (filter
  `2>/dev/null`). The full-suite gate is a bash `case` one-liner zsh rejects — run via `bash -c`.
  Run the PROBE only against the FROZEN fixture `~/Programming/jot-recovery/probe-fixture-20260615/`
  (NOT live data — it self-contaminates). The sidecar e2e (`tools/track-line-states.js`) IS safe on
  live claude-data (`~/Programming/jot-recovery/claude-data/`, read-only).
- **One open question from item 2 to keep in mind:** `bashAppend` sets `eofConfirmed=true` via
  `finishWholeOverlay` even when the prior extent was only a prefix (per the item-2 plan). The user
  was told; it's "not blocking." If item-3 work touches extent logic, revisit whether overlay kinds
  should claim EOF on an unconfirmed extent. See open question #1 in the item-2 notes.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`:
```bash
# Full suite — currently 43 suites / 483 passed / 0 failed:
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'

# detect-rewinds — expect 15 passed / 0 failed:
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# Probe A/B byte-identity (SAFETY GATE — must stay identical vs develop-baseline):
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
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

# Every new/edited source + test file <= 250 lines:
for f in api/file-event-kinds.js api/file-events-extractors.js api/line-state-evidence.js \
  api/track-line-states.js api/line-belief.js api/bash-op-events.js api/bash-op-evidence.js; do \
  printf "%5s  %s\n" "$(wc -l < "$f" | tr -d ' ')" "$f"; done
```
