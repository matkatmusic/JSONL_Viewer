# Handoff: roadmap item 1 (`originalFile` event kind) DONE — resume the 100%-reconstruction roadmap

## Branch
`develop` based on `master`. The source tree is committed ONLY on `develop-baseline`
(tip `9968536`). On `develop` everything (`api/`, `tools/`, `tests/`, `plans/`, …) is present
but **UNTRACKED** (`git status` shows `??`) — that is EXPECTED. Only `.gitignore` is
tracked/modified; `git log` shows the single `1a9f098`. Review any change with
`git diff develop-baseline -- <path>`. There is no `-plate` branch.

## Goal
Drive the per-line state sidecar toward 100% file reconstruction by closing the
event-coverage gaps in `plans/roadmap-100-percent-reconstruction.md`. **Item 1 is now complete**
(`toolUseResult.originalFile` surfaced as a first-class `originalFile` event kind). The next agent
either (a) resolves the two small open decisions below, and/or (b) starts **roadmap item 2** (Bash
file ops as event kinds). No code is mid-flight — the tree is green and self-consistent.

## Current State
- **Item 1 COMPLETE, all gates GREEN:**
  - Full suite: **39 suites / 458 passed / 0 failed** (baseline was 35/437 → +4 suites, +21 tests,
    zero regressions).
  - detect-rewinds: **15 passed / 0 failed**.
  - **Probe A/B byte-identical** vs `develop-baseline` (1,242,467 chars ignoring `generatedAt`) —
    the sidecar change did NOT leak into reconstruction (the safety gate).
  - Every edited/new file **≤ 250 lines** (largest `api/file-events-extractors.js` at **247**).
  - Sidecar e2e (`plate_summary.py`, live claude-data): final verdict UNCHANGED (247/247
    matchedObserved, 0 mismatched, 233 conflicts — no regression); **presumed-line residual across
    the timeline collapsed 8104 → 4785 (−41%)** from 13 `originalFile` overlays — the intended payoff.
- **What item 1 added (Design A — a first-class `originalFile` event kind, a whole-file OVERLAY,
  NOT a beacon):**
  - 3 NEW modules (cap-driven extractions, behavior-preserving): `api/file-event-kinds.js`
    (`KIND_NAMES`+`createKindEvent`+`eventHasAnyKind`), `api/snapshot-events.js` (the snapshot/
    fileAbsent cluster), `api/evidence-record-access.js` (`loadParsedRecord`+`findToolResultText`+
    `findStructuredPatchLine`).
  - `api/file-events-extractors.js`: `'originalFile'` registered in `KIND_NAMES`;
    `originalFileEventsFromEdits` emits one event per qualifying edit; kept OUT of
    `READ_EVENT_KINDS`/`AUTHORED_EVENT_KINDS`.
  - `api/line-state-evidence.js`: `materializeOriginalFile` + one dispatch line.
  - `api/track-line-states.js`: explicit `originalFile` overlay branch in `applyOneEvent`; a
    `kindRank` tiebreaker in `compareEvents` so the overlay applies BEFORE its own edit's splice.
  - 4 NEW test suites: `tests/test-file-event-kinds.js`, `tests/test-snapshot-events.js`,
    `tests/test-evidence-record-access.js`, `tests/test-track-line-states-originalfile.js`.
- Roadmap item 1 is marked `[x]` (with outcome) in `plans/roadmap-100-percent-reconstruction.md`.

## What Remains
1. **(Decision, ~2 min) Resolve open question #1 — explicit branch vs fallthrough.**
   `applyOneEvent` (`api/track-line-states.js`) has an explicit `if (m.kind === 'originalFile')`
   branch that duplicates the 3-line `readFull`/`cat` overlay tail. Behavior-identical. Keep it
   (spec asked for it) OR delete it and extend the fallthrough comment to
   "readFull / cat / originalFile". Ask the user; default = keep.
2. **(Cleanup, flagged debt) Split `tests/test-track-line-states.js` (currently 271 lines, OVER the
   250 cap).** It pre-dates the cap (the hook only fires on write), so it sits over-limit until
   something edits it — at which point the `jot` post-write hook will BLOCK the save. Pre-emptively
   split it (e.g. move the conflict/verdict tests into a `tests/test-track-line-states-verdict.js`,
   relocating the shared helpers) so the next tracker change isn't blocked. Same situation already
   handled for `tests/test-file-events-extractors.js` (was 292L → 231L by relocating snapshot
   integration tests to `test-snapshot-events.js`).
3. **(Next feature) Roadmap item 2 — Bash file ops as event kinds.** Reuse
   `api/extract-bash-file-ops.js`. Add kinds: `rm` → absence evidence (like `fileAbsent` but Tier
   2); `>` redirect → truncate-write (inline content for echo/printf/heredoc sources); `>>` →
   append (extends extent); `cp` → dst content = src's believed content at that instant. Likely the
   only recovery path for zero-content-event files (launch.json class). **Budget warning:**
   `api/file-events-extractors.js` is at **247/250** — adding a new kind's emission there will
   exceed the cap; extract first (the established pattern — e.g. a `api/bash-op-events.js` sibling
   that builds via `createKindEvent` from `api/file-event-kinds.js`). Register the new kind name(s)
   in `api/file-event-kinds.js`'s `KIND_NAMES`, materialize in `api/line-state-evidence.js`, consume
   in `api/track-line-states.js`, and re-run the probe A/B gate (it MUST stay byte-identical).
4. **After any tracker/extractor change, re-run all gates** (commands in "How to Verify"). The probe
   A/B byte-identity is the non-negotiable safety gate.

## Key Files
- `plans/implementation-notes-originalFile-event-kind.md` — **READ FIRST.** Full item-1 record:
  every phase, the cap-forced deviations, gate numbers, and the 3 open questions/FYIs (verbatim
  below in "Context").
- `plans/roadmap-100-percent-reconstruction.md` — the 17-item progress tracker; item 1 is `[x]`,
  items 2–17 open. Item 2 spec is at lines ~30–35.
- `api/file-event-kinds.js` (40L) — the canonical kind registry; EVERY new kind (items 2–8)
  registers its name in `KIND_NAMES` here and builds via `createKindEvent`.
- `api/file-events-extractors.js` (247L, AT CAP) — emission orchestrator
  (`extractFileEventsFromText`); `originalFileEventsFromEdits` is the pattern to mirror for new
  edit-derived kinds. Near the cap — extract before adding.
- `api/snapshot-events.js` (77L), `api/evidence-record-access.js` (87L) — extracted clusters; room
  to grow.
- `api/line-state-evidence.js` (237L) — `materializeEvent` dispatch + `materializeOriginalFile`;
  add new `materialize<Kind>` here.
- `api/track-line-states.js` (198L) — `applyOneEvent` (per-kind apply), `compareEvents`+`kindRank`
  (ordering), `isBeaconEvent`. Consume new kinds here.
- `api/edit-stream-extraction.js` (197L) — `buildReplaceEdit` already captures `originalFile`; the
  edit-object shape new edit-derived kinds read from.
- `api/extract-bash-file-ops.js` — the parser item 2 reuses.
- `tools/probe-projects-v2.js` — the reconstruction probe (the A/B gate). Imports NONE of the
  sidecar modules, which is WHY the sidecar changes can't move probe output.

## Plan File
`plans/roadmap-100-percent-reconstruction.md` (the live tracker). Item-1 detail lives in
`plans/implementation-notes-originalFile-event-kind.md`. The original item-1 design handoff was
`plans/handoff-develop-20260615-1925.md` (now fully executed).

## Context the Next Agent Won't Have
- **`jot` post-write hook enforces a 250-line cap on EVERY write** and auto-runs the edited file's
  test suite after each edit (giving free RED/GREEN feedback). It only fires on write, so files can
  pre-exist over the cap: **`tests/test-track-line-states.js` is 271L right now and WILL block the
  next edit to it** (see What Remains #2). When editing an at-cap file, plan the extraction so the
  single resulting write lands ≤ 250 (you cannot save an intermediate over-cap state).
- **Design A was locked WITH THE USER** (a first-class event kind, not folded into edit
  processing) and **`originalFile` is an OVERLAY, not a beacon** (`isBeaconEvent` returns false —
  treating it as a beacon would reset the conflict window at every edit and HIDE drift). Do not
  re-litigate.
- **The ordering tie is the one real subtlety:** an `originalFile` event and its edit event come
  from the SAME record → identical `(unixMs, jsonl, jsonlLine)`. The overlay MUST apply before the
  splice; solved by `kindRank` in `compareEvents` (originalFile=0, edit=1, else=2). Without it the
  changed line comes out `observed`(pre-edit) instead of `authored` — a real RED that was observed.
- **`createKindEvent` MUST live in the shared `api/file-event-kinds.js`** (not be imported by
  `snapshot-events.js` from `file-events-extractors.js`) — the latter forms a CommonJS require
  cycle yielding `undefined` at load. Any new kind module follows this: import `createKindEvent`
  from `file-event-kinds`.
- **Sidecar e2e numbers did NOT shift in the FINAL verdict for `plate_summary.py`** (the handoff
  that spawned item 1 predicted they would). Reason: that file ends fully pinned by a terminal
  beacon (no presumed residual AT THE END to collapse) and all 13 overlays AGREED with belief (no
  drift → 0 new conflicts). The payoff is real but lands in the INTERMEDIATE timeline residual
  (−41%), not the headline. No regression — this is expected, not a bug.
- **Test-organization deviations (forced by the cap, user approved "it's fine, keep going"):**
  snapshot integration tests were RELOCATED (not deleted) from `test-file-events-extractors.js` into
  `test-snapshot-events.js`; the `originalFile` tracker tests went into a NEW dedicated suite rather
  than the over-cap `test-track-line-states.js`. Net coverage strictly increased.
- **Env quirks:** this shell wraps `diff`/`grep` with custom tools that inject status lines (e.g.
  `[ok] Files are identical`, `grep: '<pat>' in <file>`) into stdout — they pollute pipes and
  hashes. Compare probe JSON with a `node -e` script (parse, `delete generatedAt`, compare
  `JSON.stringify`), NOT `diff`/`grep`. `node` prints "Debugger listening…" to stderr (filter
  `2>/dev/null`). The full-suite gate is a bash `case` one-liner that zsh rejects — run via
  `bash -c`. Do NOT run the PROBE against live claude-data (self-contaminates); A/B against the
  frozen fixture `~/Programming/jot-recovery/probe-fixture-20260615/`. The sidecar e2e
  (track-line-states.js) IS safe against live claude-data (it only reads).
- **Vocabulary (enforced):** never "corpus" (say "all JSONL files in the projects folder");
  "create", never "mint". Schemas are annotated JS literals with NO example values; the non-null
  sub-object IS the kind. **Coding:** ONE condition per `if` (nest; no `&&`/`||`; ternaries only for
  value selection); strict red-green TDD (watch it fail first).

### Open questions / FYIs carried forward (the user asked these be included)
1. **Explicit `originalFile` branch vs fallthrough (cosmetic, not blocking).** `applyOneEvent`'s
   `readFull`/`cat` overlays use the unguarded function tail; I added an explicit
   `if (m.kind === 'originalFile')` branch (per spec) that duplicates that 3-line body. Identical
   behavior. Alternative: drop the branch, extend the fallthrough comment to
   "readFull / cat / originalFile". Awaiting user preference; current code keeps the explicit branch.
2. **`tests/test-track-line-states.js` is still 271L (over the 250 cap) — migration debt.** Untouched
   by item 1. The next edit to it will be hook-blocked until it is split (see What Remains #2).
3. **Probe artifacts overwritten.** Running the probe gate rewrote the untracked
   `tools/probe-results-v2.json` + `tools/probe-mismatches-v2.json` with the frozen-fixture run
   (regenerable build artifacts). Left as-is.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.
```bash
# Full suite — expect 39 suites / 458 passed / 0 failed (item-1 baseline):
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'

# detect-rewinds — expect 15 passed, 0 failed:
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# Probe A/B byte-identity (SAFETY GATE — must stay identical vs develop-baseline):
node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null | tail -2
cp tools/probe-results-v2.json /tmp/probe-cur.json
git worktree add /tmp/reveng-baseline develop-baseline
( cd /tmp/reveng-baseline && node tools/probe-projects-v2.js --projects-dir ~/Programming/jot-recovery/probe-fixture-20260615/projects 2>/dev/null >/dev/null )
node -e 'var fs=require("fs");function L(p){var o=JSON.parse(fs.readFileSync(p,"utf8"));delete o.generatedAt;return JSON.stringify(o);}console.log("probe A/B identical:", L("/tmp/reveng-baseline/tools/probe-results-v2.json")===L("/tmp/probe-cur.json"));'
git worktree remove --force /tmp/reveng-baseline

# Sidecar e2e (plate_summary.py) — final verdict 247/247 matchedObserved, 0 mismatched, 233 conflicts:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null

# Confirm every sidecar source + new test file is <= 250 lines:
for f in api/file-events-extractors.js api/line-state-evidence.js api/track-line-states.js \
  api/file-event-kinds.js api/snapshot-events.js api/evidence-record-access.js \
  tests/test-track-line-states.js; do printf "%5s  %s\n" "$(wc -l < "$f" | tr -d ' ')" "$f"; done
```
