# Handoff: Roadmap item 3 (`patchContext`) COMPLETE + `originalFile` population research done — next is roadmap item 4
Conversation name: RevEng — roadmap item 3 (structuredPatch context lines) + originalFile scan
JSONL: (omitted — ephemeral per handoff rules)

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
(`plans/roadmap-100-percent-reconstruction.md`). Items 1 (`originalFile`),
2 (Bash `rm`/`>`/`>>`), and 3 (`structuredPatch` context lines) are DONE. Hard
constraint throughout: the sidecar runs BESIDE the reconstruction pipeline and
must never change probe PASS/MISMATCH (A/B byte-identity).

## Current State
- **Item 3 (`patchContext`) is COMPLETE and shipped.** New Tier-2 sparse-overlay
  event kind: emit one `patchContext` event per kept Edit whose `structuredPatch`
  carries ≥1 unchanged context (`' '`) line; materialize those lines at their
  POST-edit absolute positions (numbered from each hunk's `newStart`, skipping
  `'+'`/`'-'`/`'\'` lines); apply AFTER the edit splice (default `kindRank` 2) as
  a sparse overlay (`applyOverlayLines`, **no** `finishWholeOverlay`, not a
  beacon). Strict red-green TDD throughout.
- **Gates (last verified this session):** full suite **47 suites / 493 passed /
  0 failed**; detect-rewinds **15/0**; **probe A/B byte-identical** vs
  `develop-baseline` (frozen fixture); sidecar e2e (`plate_summary.py`) verdict
  unchanged (247/247 matchedObserved, 0 mismatched), **0 new conflicts**. Every
  new/edited source + test file ≤ 250 lines (largest: line-state-evidence 245,
  track-line-states 232, file-events-extractors 229).
- **Item 3 payoff caveat:** marginal presumed-residual reduction *on top of item
  1* is **0** on plate_summary.py — all 13 patchContext events there share coords
  with an `originalFile` event, which (whole-file) subsumes the sparse context
  lines. Standalone, item 3 still collapses 8104 → 8032. Shipped as-is (user
  decision) because `originalFile` is absent on the MAJORITY of edits (see below)
  — patchContext is the live fallback there. NOT representative of wider data.
- **`originalFile` population research is COMPLETE** (see Key Files + the
  Context section). New: `plans/research/properties/originalFile/findings.md`
  (+ reusable `scan.js`).
- **The tree is GREEN; nothing is mid-flight.** No open tasks.

## What Remains
Continue the roadmap (`plans/roadmap-100-percent-reconstruction.md`) in order.
Mirror the item-1/2/3 pattern each time: new event kind in `KIND_NAMES`, an
emission module (`*-events.js`), a materializer module (`*-evidence.js`,
call-time `lse()` cycle break), +1 dispatch in `line-state-evidence.js`, +1 apply
branch in `track-line-states.js`, strict RED-before-GREEN, then re-run all gates.

1. **Item 4 — Partial-content bash reads** (`head`, `tail`, `sed -n A,Bp`,
   `grep`-context). Read the roadmap entry for the spec. These are partial
   overlays (like readChunk), NOT whole-file — be careful about extent/EOF.
2. **Item 5 — Native Grep tool results** (mode: content, `-n` true) —
   `file:line:text` per-line observations.
3. **Items 6–8 (§A), 9–13 (§B), 14–16 (§C), 17 (§D consolidation)** — see the
   roadmap for per-item specs + gotchas. Item 2's `cp` is DEFERRED (`[ ]` under
   item 2); item 10a is a related follow-up.
4. **Optional `originalFile` follow-ups** (filed in the findings doc, not
   roadmap items): (a) correlate `originalFile` null-vs-populated with
   `newString`/file length to confirm the size-threshold hypothesis; (b) count
   how many null-`originalFile` Edits have context-bearing hunks (where item 3
   actually recovers) vs pure insertions.

## Key Files
- **Roadmap (17-item tracker):** `plans/roadmap-100-percent-reconstruction.md` —
  items 1,2(partial),3 done; **item 4 is the next `[ ]`**.
- **Item 3 impl notes:** `plans/implementation-notes-structuredpatch-context.md`
  — full phase log, gate numbers, the payoff measurement, resolved open questions.
- **`originalFile` research:** `plans/research/properties/originalFile/findings.md`
  (the report) + `plans/research/properties/originalFile/scan.js`
  (`node scan.js <projects-dir>` to reproduce).
- **Item 3 modules (the pattern to mirror):**
  - `api/structured-patch-events.js` (emission, mirrors `bash-op-events.js`)
  - `api/structured-patch-evidence.js` (materialize, call-time `lse()` cycle break)
  - `api/file-event-wishlists.js` (Phase-0 relocation of `readsForFile`/`editsForFile`)
- **Sidecar core:** `api/file-event-kinds.js` (`KIND_NAMES` + `createKindEvent`);
  `api/file-events-extractors.js` (emission orchestrator, at 229L);
  `api/line-state-evidence.js` (`materializeEvent` dispatch + ref builders, 245L);
  `api/track-line-states.js` (`applyOneEvent`, `isBeaconEvent`, `kindRank`, 232L);
  `api/line-belief.js` (`applyOverlayLines` sparse apply vs `finishWholeOverlay`);
  `api/evidence-record-access.js` (`loadParsedRecord`, `findStructuredPatchLine`).
- `tests/track-line-states-fixtures.js` — shared fixtures (`makeEditLineWithHunks`
  is the item-3 addition).

## Plan File
`plans/roadmap-100-percent-reconstruction.md` (the standing tracker). Item-3's
own plan (`~/.claude/plans/make-a-plan-for-sparkling-pancake.md`) is fully
executed — no longer needed.

## Context the Next Agent Won't Have

### `originalFile` is NOT reliably populated (definitive — scanned all 1808 JSONLs)
Full report: `plans/research/properties/originalFile/findings.md`. Headline:
- Across **4885** Edit/Write records, only **~38%** carry a non-empty
  `toolUseResult.originalFile`; **62% are `null`**. The key is ALWAYS present
  (never `absent`); empty-string is negligible (3 records). The real "not usable"
  state is `null`.
- **By record kind:** `Write(create)` → **always `null`** (0/983; correct — no
  pre-edit content); `Edit` → usable **~46%**; `Write(update)` → ~79%.
- **NOT version-gated:** usable% fluctuates **9–78%** across versions
  2.1.119–2.1.178 with no trend (the one 100% Edit version, 2.1.163, is an
  isolated anomaly its neighbours don't share). Likely a file-SIZE threshold
  (large files omit originalFile to bound transcript size), not versioned.
- **Trust rule (the only safe one):** treat `originalFile` as usable IFF
  `toolUseResult.originalFile` is a non-empty string, per-record — which is
  exactly what item-1 emission already guards. Item 1 is correct; it just fires
  on a minority of edits. **This is why items 3+ (per-edit fallbacks) matter.**
- Scan method (faithful): literal substring match for `"originalFile":"` first
  (no JSON-tree walk to locate the property), plus `"structuredPatch"` as a
  second literal marker to catch the `null` cases the first can't see; parse only
  matched lines. The 1861 literal matches == nonEmpty+empty totals (consistency
  check passed).

### Locked conventions (do NOT re-litigate)
ONE condition per `if` (nest; never `&&`/`||` in conditions; ternary only for
value selection); strict red-green TDD (watch each test fail first); **no
forwarding layers** (one canonical home, import directly — no re-export shims);
**archive = preserve** (relocate test/code bodies to an `archive/` subfolder,
never delete); vocabulary — never "corpus" (say "all JSONL files in the projects
folder"), "create" never "mint". The non-null kind sub-object IS the kind (no
separate kind strings).

### Engine/tooling gotchas (cost real debugging time)
- **250-line WRITE cap is a hard hook gate** — the `jot` post-write hook BLOCKS
  any save > 250 lines AND auto-runs the edited file's matching
  `tests/test-<basename>.js` (free RED/GREEN). Files at/near cap must be SPLIT
  into a sibling (that is why item-3 Phase 0 relocated the wish-list helpers).
  The hook also flags deep nesting (>3× indent) — extract functions.
- **Require-cycle gotcha:** `line-state-evidence` ⇄ a materializer module is a
  cycle (dispatch ↔ shared `buildStructuredPatchRef`). Both reassign
  `module.exports`, so a TOP-LEVEL require captures a stale `{}`. Break it with a
  CALL-TIME require on both edges (`lse()` getter in the materializer module +
  inline `require('./<materializer>')` in `materializeEvent`).
- **Env quirks:** the shell wraps `diff`/`grep` with status-line injectors —
  recursive `grep` gives **false negatives**. Use a `node` fs-walk for codebase
  searches and a `node -e` JSON compare (delete `generatedAt`) for the probe gate
  — NOT `diff`/`grep`. `node` prints "Debugger listening…" to stderr (filter
  `2>/dev/null`). The full-suite gate is a bash `case` one-liner zsh rejects —
  run via `bash -c`.
- **`projects/` contains the LIVE session transcript** — any scan/probe over it
  (and over live claude-data) self-contaminates as you work (counts drift by a
  few records). Run the PROBE gate ONLY against the FROZEN fixture
  `~/Programming/jot-recovery/probe-fixture-20260615/` (never live data). The
  sidecar e2e (`tools/track-line-states.js`) IS safe on live claude-data
  (read-only).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng` after each phase:
```bash
# Full suite — currently 47 suites / 493 passed / 0 failed:
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'

# detect-rewinds — expect 15 passed / 0 failed:
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# Probe A/B byte-identity (SAFETY GATE) — frozen fixture, node -e JSON compare (NOT diff/grep):
git worktree remove --force /tmp/reveng-baseline 2>/dev/null; rm -rf /tmp/reveng-baseline
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# Sidecar e2e (plate_summary.py) — verdict unchanged + measure presumed-residual:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null

# Every new/edited source + test file <= 250 lines.
```
