# Handoff: implement roadmap item 1 — `toolUseResult.originalFile` as a first-class `originalFile` event kind

## Branch
`develop` based on `master`. The source tree is committed ONLY on `develop-baseline`
(tip `9968536`). On `develop` everything (`api/`, `tools/`, `tests/`, `plans/`, …) is
present but **UNTRACKED** (`git status` shows `??`) — that is EXPECTED. Only `.gitignore`
is tracked/modified; `git log` shows the single `1a9f098`. Review any change with
`git diff develop-baseline -- <path>`.

## Goal
Resume the 100%-reconstruction roadmap (`plans/roadmap-100-percent-reconstruction.md`,
tracker created this session). This handoff covers **item 1 only**, which is fully designed
and ready to implement: surface the entire pre-edit file content carried in every Edit
record's `toolUseResult.originalFile` as a new **`originalFile` event kind** — a whole-file
**observation** the per-line state sidecar applies at the edit's instant. It pins the whole
file's belief at every edit (collapsing the dominant *presumed* carry-forward residual) and
surfaces real drift as conflicts. No code has been written yet — the next agent executes the
plan below.

## Current State
- **No source code changed this session.** Two planning artifacts were produced:
  1. `plans/roadmap-100-percent-reconstruction.md` — the full 17-item roadmap as a `[ ]`
     checklist (baseline gates checked; items 1–17 open). This is the progress tracker.
  2. The detailed item-1 implementation plan — embedded in full under **What Remains** below
     (the ephemeral plan-mode copy lives at `~/.claude/plans/make-a-plan-for-mutable-donut.md`;
     this handoff is the durable copy).
- **All baseline gates GREEN** (post-migration starting point, unchanged): full suite 35
  suites / 437 passed / 0 failed; detect-rewinds 15/15; sidecar e2e (plate_summary.py)
  247/247 matchedObserved, 0 mismatched, 233 conflicts in one cluster @
  2026-05-17T02:02:43.192Z; probe A/B byte-identical vs `develop-baseline`.
- **Design decided WITH THE USER (locked): Design A** — a first-class `originalFile` event
  kind (NOT folded into edit processing). The user's reason: the discrete event is the
  provenance breadcrumb that matters when reconstructing a file's change history across the
  JSONL files, and it keeps item 1 consistent with the one-non-null-kind-per-event model and
  with §A items 2–8 (which all add event kinds).

## What Remains
Execute the item-1 plan. **Strict red-green TDD; every written file must end ≤ 250 lines
(the `jot` hook BLOCKS the write otherwise).**

### Why three new modules (the 250-cap forces extraction first)
Design A must edit two files that are already over the cap — `api/file-events-extractors.js`
(294L) and `api/line-state-evidence.js` (299L). Each must be shrunk under 250 by moving a
cohesive block into a NEW sibling first. **No forwarding/re-export layers** — moved functions
get ONE canonical home and callers import from there.
1. **`api/file-event-kinds.js`** ← move `KIND_NAMES` (add `'originalFile'`), `createKindEvent`,
   `eventHasAnyKind` out of `file-events-extractors.js`. Needed so the extracted
   `snapshot-events.js` can build events via `createKindEvent` WITHOUT a
   `file-events-extractors ⇄ snapshot-events` require cycle. Becomes the canonical kind
   registry every future kind (items 2–8) registers in.
2. **`api/snapshot-events.js`** ← move the snapshot/fileAbsent cluster (`file-events-extractors.js`
   lines ~176–231: `defaultSnapshotsBase`, `buildBackupKindEvent`, `appendSnapshotRecordEvents`,
   `snapshotDedupKey`, `snapshotEventsForFile`). Imports `createKindEvent` from
   `file-event-kinds`, `editBelongsToFile` from `file-historical-lineage`.
3. **`api/evidence-record-access.js`** ← move the record-loading + locator cluster
   (`line-state-evidence.js` lines ~114–184: `loadParsedRecord` + cache, `textBlockResult`,
   `toolResultTextOfItem`, `findToolResultText`, `findLineInHunk`, `findStructuredPatchLine`).

### Phase 0 — extractions (behavior-preserving; keep suites green at each step)
1. Create `api/file-event-kinds.js` + `tests/test-file-event-kinds.js`; move the 3 names;
   import them back into `file-events-extractors.js`. Full suite green.
2. Create `api/snapshot-events.js` + `tests/test-snapshot-events.js`; move the snapshot cluster;
   import `snapshotEventsForFile` + `defaultSnapshotsBase` back into the orchestrator. Move the
   snapshot *unit* assertions into the new suite (end-to-end snapshot cases that run through
   `extractFileEvents` stay as integration coverage). Full suite green.
3. Create `api/evidence-record-access.js` + `tests/test-evidence-record-access.js`; move the
   record-access cluster; import the needed names back into `line-state-evidence.js`. **Remove
   `loadParsedRecord` + `findStructuredPatchLine` from `line-state-evidence.js`'s exports**
   (they are publicly exported today) and **repoint external importers** (grep `tests/`,
   `api/`, `tools/`) to `evidence-record-access.js` — do NOT re-export. (`findToolResultText`
   is internal-only; no repoint.) Full suite green; **probe A/B must stay byte-identical.**

### Phase 1 — register + emit (`file-events-extractors.js`)
4. RED: `KIND_NAMES` includes `'originalFile'`. GREEN: add it. Audit tests for any hardcoded
   7-kind assumption (every event now carries `originalFile: null`).
5. RED: an Edit record with a non-empty `originalFile` yields exactly ONE `originalFile`-kind
   event at `jsonlLine = edit.line+1` and the edit's timestamp; `null` (Create records),
   wrong-file alias, and `status==='ignored'` yield none. GREEN: add
   `originalFileEventsFromEdits(...)` mirroring `authoredEventsFromKeptEdits` (reuse the SAME
   `extractEditsFromJSONL` array already computed in the orchestrator; the edit object already
   carries `.originalFile` from `buildReplaceEdit`, `edit-stream-extraction.js:56`). Guard:
   `edit.type==='edit'` AND `typeof edit.originalFile==='string' && edit.originalFile!==''`
   AND `editBelongsToFile` AND not `ignored` AND has a timestamp →
   `createKindEvent(..., 'originalFile', {})`. Push its results in `extractFileEventsFromText`.
   Kind fields are `{}` (content comes from refs at materialization, never stored on the event).
   **Leave `originalFile` OUT of `READ_EVENT_KINDS` and `AUTHORED_EVENT_KINDS`** (it is neither,
   like snapshot/fileAbsent) so `readsForFile`/`editsForFile` — and any probe use of them —
   stay unperturbed.

### Phase 2 — materialize (`line-state-evidence.js`)
6. RED: `materializeEvent` of an `originalFile` event over a record whose
   `toolUseResult.originalFile = 'a\nb\n'` returns `{ kind:'originalFile', byLine:[{lineNum:1,
   text:'a',ref:textProperty@'toolUseResult.originalFile'…},{lineNum:2,text:'b',…}] }`, each
   ref's span slicing the exact line. GREEN: add `materializeOriginalFile(event)` =
   `{ kind:'originalFile', byLine: pairEntriesWithRefs(event,'toolUseResult.originalFile',
   plainLineEntries(text)) }` (reuses existing `plainLineEntries` + `pairEntriesWithRefs`;
   `text = loadParsedRecord(...).toolUseResult.originalFile`). Add ONE dispatch line to
   `materializeEvent`: `if (event.originalFile) { return materializeOriginalFile(event); }`.

### Phase 3 — consume (`api/track-line-states.js`, has room: 178L)
7. RED: `applyOneEvent` on an `originalFile` event does a whole-file overlay (conflicts on
   disagreement; `eofConfirmed` true, `lastLine = byLine length`). GREEN: add an explicit
   branch before the readFull/cat fallthrough, IDENTICAL to it: `lb.applyOverlayLines` +
   `lb.finishWholeOverlay`, returning conflicts. (`isBeaconEvent` already returns false — it is
   an observation, not a beacon; the timeline keeps the per-line map and the event appears in
   `group.events`.)
8. RED: ordering — a separate `originalFile` event and its edit event come from the SAME record
   so they tie on `(unixMs, jsonl, jsonlLine)`; assert the observation applies BEFORE the splice
   (overlay-then-splice ⇒ correct post-edit belief; splice-then-overlay ⇒ WRONG, pre-edit
   content overwrites the edit). GREEN: add a final tiebreaker to `compareEvents`:
   `function kindRank(e){ if(e.originalFile)return 0; if(e.edit)return 1; return 2; }` then
   `return kindRank(a)-kindRank(b);`. Comment WHY rank-2 is safe: snapshots/writes are in
   different records (different `jsonlLine`) so they never reach this tiebreaker against an edit;
   the only true coordinate tie is `originalFile` vs its own edit.

### Phase 4 — end-to-end proof (`tests/test-track-line-states.js`)
9. Fixture: a `Read` establishes belief at T1; time passes; at T3 an Edit whose `originalFile`
   is the full pre-edit content. Assert on the T3 timeline entry: (a) `summary.eofConfirmed`
   true and `summary.lastLine` = file length; (b) EVERY line entry has `confirmedAtMs===MS3`
   (no line is `presumed` after the edit instant); (c) with `reference.via='final'` set to the
   post-edit content, `finalVerdict` reports zero mismatches.
10. Regression: an Edit that would otherwise FLOAT (old_string absent from stale carried-forward
    belief) no longer floats once `originalFile` pins the file — the headline benefit.

## Key Files
- `api/file-events-extractors.js` (294L, at cap) — `KIND_NAMES` (:20), `createKindEvent` (:35),
  `buildAuthoredEvent` (:102), orchestrator `extractFileEventsFromText` (:241), partitions (:24).
- `api/line-state-evidence.js` (299L, at cap) — `materializeEvent` (:250), the record-access
  cluster to extract (:114–184), `plainLineEntries` (:71), `pairEntriesWithRefs` (:198),
  exports (:286).
- `api/track-line-states.js` (178L) — `compareEvents` (:20), `applyOneEvent` (:70),
  `applyEditEvent` (:60), readFull/cat overlay path (:82-84), `isBeaconEvent` (:44).
- `api/line-belief.js` (218L, reuse unchanged) — `applyOverlayLines` (:80), `finishWholeOverlay`
  (:111), `overlayLine` (:71), `conflictAgainstExisting` (:53), `degradeUntouchedToPresumed` (:156).
- `api/edit-stream-extraction.js` (197L, reuse unchanged) — `buildReplaceEdit` (:56) already
  captures `originalFile` (coerces `""`/missing → `null`, so `edit.originalFile` is a non-empty
  string or null).
- Tests: `tests/test-file-events-extractors.js`, `tests/test-line-state-evidence.js`,
  `tests/test-track-line-states.js` (edit); three NEW suites named to match the new modules.

## Plan File
- `plans/roadmap-100-percent-reconstruction.md` — the 17-item progress tracker (mark item 1
  `[x]` when done).
- `plans/handoff-develop-20260615-1833.md` — the post-migration roadmap-resumption handoff
  (path-translation map `common/*`→`api/*`, probe gate semantics, env quirks).
- `plans/handoff-develop-20260611-1727.md` — the original 17-item roadmap (stale `common/*`
  paths; translate via the 1833 handoff).
- `plans/per-line-state-sidecar-plan.md` — the implemented sidecar spec (authoritative schema
  comments).
- The full item-1 plan is embedded above (**What Remains**); the plan-mode scratch copy is
  `~/.claude/plans/make-a-plan-for-mutable-donut.md` (ephemeral).

## Context the Next Agent Won't Have
- **Design A vs B was explicitly weighed; the user chose A.** Design B (fold the pre-edit
  overlay into `applyEditEvent`, no new kind) was the lower-risk option — it touched NEITHER
  at-cap file and guaranteed ordering structurally — but the user rejected it because it would
  hide the pre-edit observation from the timeline's per-instant `events` list, losing provenance.
  Do NOT re-litigate; implement A.
- **`originalFile` is an OVERLAY, not a beacon (locked).** Treating it as a beacon would reset
  `lastBeaconMs` at every edit and HIDE the very drift item 1 exists to catch. It must behave
  exactly like `readFull` (`applyOverlayLines` + `finishWholeOverlay`): pins lines as
  `observed`@editTime while still reporting conflicts windowed against the last TRUE beacon.
- **The ordering tie is the one real subtlety.** The `originalFile` event and its edit event
  share the same record ⇒ identical `(unixMs, jsonl, jsonlLine)`. The overlay MUST apply before
  the splice. Solve with the `kindRank` tiebreaker in `compareEvents` (Phase 3 step 8); do NOT
  rely on stable-sort push order (fragile across the orchestrator's intermediate
  `compareByJsonlLine` sort). Snapshots never tie here (different record/line) — documented.
- **`createKindEvent` MUST move to a shared module (`file-event-kinds.js`)**, not be imported by
  `snapshot-events.js` from `file-events-extractors.js` — the latter creates a CommonJS require
  cycle that yields `undefined` at load time. This is why item 1 needs three new modules, not two.
- **The sidecar e2e numbers WILL change** (plate_summary.py: 247/247, 233 conflicts). Item 1
  ADDS observations, so matched/confirmed counts and the conflict total will shift — this is the
  intended effect, NOT a regression. Re-baseline and sanity-check the direction (presumed
  carry-forward down; whole file pinned at each edit; conflicts localized). Record the new
  numbers in the next handoff.
- **The probe A/B byte-identity gate MUST still hold.** The sidecar runs BESIDE reconstruction
  and must never change PASS/MISMATCH. Keeping `originalFile` out of the
  `READ_EVENT_KINDS`/`AUTHORED_EVENT_KINDS` partitions is what guarantees `readsForFile`/
  `editsForFile` (and any probe consumer of them) are untouched. If probe output drifts, the
  event-stream change leaked into reconstruction — stop and fix.
- **No-forwarding repoint:** `loadParsedRecord` + `findStructuredPatchLine` are publicly exported
  from `line-state-evidence.js` today. After moving them to `evidence-record-access.js`, REMOVE
  them from the old exports and update every importer to the new home (the user enforces "one
  canonical home, no re-export layers"). `findToolResultText` is internal — no repoint.
- **Vocabulary (enforced):** never "corpus" (say "all JSONL files in the projects folder");
  "create", never "mint". Schemas are annotated JS literals, NO example values; the non-null
  sub-object IS the kind (no kind strings, no placeholder fields).
- **Coding (lint hook every edit):** strict red-green TDD (watch it fail first); ONE condition
  per `if` (nest; never `&&`/`||`; ternaries only for value selection); >3-deep nesting rejected.
- **Env quirks:** `curl`/`wget` blocked (use node fetch / Playwright); `node` prints
  "Debugger listening…" to stderr (filter `2>/dev/null`); the full-suite gate is a bash `case`
  one-liner that zsh rejects — run via `bash -c`. Do NOT run the probe against live claude-data
  (self-contaminates); A/B against the frozen fixture `~/Programming/jot-recovery/probe-fixture-20260615/`.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.
```bash
# Full suite — re-baseline (was 35 suites / 437 passed / 0 failed; +3 new suites expected):
bash -c 'tp=0; tf=0; s=0; for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) line=$(node "$t" 2>/dev/null | grep -E "[0-9]+ passed, [0-9]+ failed"); p=$(echo "$line"|grep -oE "[0-9]+ passed"|grep -oE "[0-9]+"); f=$(echo "$line"|grep -oE "[0-9]+ failed"|grep -oE "[0-9]+"); if [ -n "$p" ]; then tp=$((tp+p)); tf=$((tf+f)); s=$((s+1)); fi; [ "${f:-0}" != "0" ] && echo "FAILED: $t -> $line";; esac; done; echo "SUITES=$s PASSED=$tp FAILED=$tf"'

# detect-rewinds — expect 15 passed, 0 failed (unchanged):
node tests/detect-rewinds.test.js 2>/dev/null | grep -E "passed|failed" | tail -1

# Probe A/B byte-identity (SAFETY GATE — must stay identical vs develop-baseline):
git worktree add /tmp/reveng-baseline develop-baseline   # then run both against the frozen
# fixture and diff probe-results-v2.json ignoring top-level generatedAt.

# Sidecar e2e (plate_summary.py) — numbers WILL shift; record the NEW values:
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json >/dev/null 2>&1
node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)' 2>/dev/null

# Confirm every edited/new file is ≤ 250 lines:
for f in api/file-events-extractors.js api/line-state-evidence.js api/file-event-kinds.js \
  api/snapshot-events.js api/evidence-record-access.js api/track-line-states.js; do
  printf "%5s  %s\n" "$(wc -l < "$f" | tr -d ' ')" "$f"; done
```
