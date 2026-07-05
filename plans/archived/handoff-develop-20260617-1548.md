# Handoff: Roadmap Item 12 (collapse conflict cascades) — SHIPPED + GREEN; pick the next §B/§C item
Conversation name: implement RevEng item 12 — collapse conflict cascades
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is
**UNTRACKED by design** (`git status --short` → many `??` entries + a pre-existing `M .gitignore`,
unrelated — UNCHANGED this session). This project commits nothing during normal work; the committed
source mirror lives on **`develop-baseline`** (tip `880b69d`, the item-5.6 re-baseline),
**UNCHANGED this session** (item 12 is sidecar-only — probe byte-identical, so no re-baseline). Run
ALL git + tests from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd
`/Users/matkatmusicllc/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the
JSONL), NOT a git repo. `RevEng/` (CONSUMER) is the subdir. No `develop-plate` branch exists.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts, driving toward 100% reconstruction
(`plans/roadmap-100-percent-reconstruction.md`). Items 1–12 are now closed. This session
**implemented roadmap item 12** — collapse the per-line conflict-record CASCADES that appear when
one untracked K-line insertion shifts every downstream line (N conflict records for one logical
event) into ONE synthetic record. It is **cosmetic on the diagnostic `conflicts` list only** —
belief and the per-line verdict are untouched. The next agent picks the next roadmap item.

## Current State
**Item 12 SHIPPED, all four gates GREEN.** New pure module `api/conflict-cascade-collapse.js`
(225 L, 4-space) + 3 in-place wirings + 14 new tests. Concretely:
- **Gates (from `RevEng/`):** full suite **62 suites / 635 passed / 0 failed**; detect-rewinds
  **15/0**; probe A/B vs `develop-baseline` (`880b69d`) **`identical: true`**; sidecar
  `plate_summary.py` **247/247 matchedObserved, 0 mismatched (UNCHANGED)**, **conflicts 233 → 8**
  (re-baselined BY DESIGN, user-signed-off; all 8 are `collapsedCascade` records whose member
  lineCounts sum to exactly 233 — lossless).
- **Item 11** (`floatingOverKnownRegion` conflict record) landed in a CONCURRENT session before this
  work and is already `[x]` in the roadmap; item 12 coexists with it (skips floating `line:null`
  records via `isPerLineConflict`). The full suite was already 621 (not the stale 619 some handoffs
  cite) because item 11's +2 tests had landed.
- Roadmap item 12 flipped `[ ]`→`[x]` with a DONE note; `233 → 8` re-baselined in the roadmap
  baseline line and `plans/handoff-develop-20260615-1833.md` § How to Verify (historical DONE-notes
  for items 1–11 left intact). `plans/implementation-notes-item12-collapse-conflict-cascades.md` written.

## What Remains
Item 12 is DONE. The remaining roadmap items (see `plans/roadmap-100-percent-reconstruction.md` §B/§C
and the order header ~248–253). **Suggested next: item 13 (git rung) — it unblocks 16 → 15.**

1. **Item 13 — Git rung on the reference ladder.** Insert a git rung after snapshot in
   `tools/track-line-states.js` `chooseReference` (~:65, on-disk→snapshot→none). `resolveGitContent`
   is ready (`api/git-file-state.js`); mirror `api/replay-verification.js` `tryGitFallback`/
   `verifyMissingFile`. **Unblocks item 16.** Tracker/reference-only → probe byte-identical.
2. **Item 16 — Run the sidecar over list2** (106 MISMATCH have a reference → run now; 64 NOT_FOUND
   need item 13's git rung). Consumes into item 15.
3. **Item 15 — Promote per-line verdict into a NEW probe status** (`PASS-PER-LINE`; **discuss the
   name with the user FIRST**). Runs on the 160 on-disk MISMATCH files without item 13.
4. **Item 14 — Trailing-extent mismatch class** (most independent; no dep on 13/15/16/17).
5. **Item 17 — Unify the two read-event scanners** (parity refactor).
6. **Item 18** — a NEW item carved out during item-11 planning (`userModified` flag; DORMANT, 0×
   on all known data). It was to be APPENDED to the roadmap §A by the item-11 implementer; **verify
   it is present** in `plans/roadmap-100-percent-reconstruction.md` — if missing, the verbatim brief
   is in `~/.claude/plans/calm-jingling-cookie.md` "Roadmap addition — Item 18".

## Key Files
- `api/conflict-cascade-collapse.js` (225 L, NEW, 4-space) — the collapse logic. `collapseConflictCascades`
  (public) + `isPerLineConflict`/`groupConflictsByMoment`/`splitIntoConsecutiveLineRuns`/`computeShiftOffset`/
  `buildCollapsedConflictRecord`/`describeCollapsedConflict` (exported for tests).
- `api/track-line-states.js` (179 L) — engine; the return's `conflicts` field now runs through
  `cascadeCollapse.collapseConflictCascades(...)`. Locate by SYMBOL (multi-session anchor drift).
- `tools/track-line-states.js` (132 L) — CLI; `printConflicts` has the `collapsedCascade` branch;
  `chooseReference` (~:65) is item 13's home.
- `api/line-diff.js` — `lineDiff(a,b)` → `[{op:'ctx'|'del'|'add',text}]` (REUSED by the collapse).
- `api/final-line-verdict.js` (66 L) — `perLineStats` is computed from `belief.entries` + reference,
  INDEPENDENT of the conflicts array (this is WHY item 12 is safe for item 15). NO edit.
- `tests/test-conflict-cascade-collapse.js` (195 L, NEW) — 13 unit tests.
- `tests/test-track-line-states-verdict.js` (177 L) — has the item-12 integration test
  `test_trackLineStates_collapsesStaleBeliefSnapshotVerifyCascade` (+ item-11's two floating tests).
- `plans/roadmap-100-percent-reconstruction.md` — authoritative item list; item 12 now `[x]`.
- `plans/implementation-notes-item12-collapse-conflict-cascades.md` — item-12 design record + the 8-cascade spot-check.
- `plans/handoff-develop-20260617-1252.md` § How to Verify — the EXACT four-gate commands.

## Plan File
`~/.claude/plans/giggly-roaming-adleman.md` (item-12 plan) is **fully executed** — no longer active.
There is **no active plan** for the next item; the next agent creates one for the item they choose
(strict `~/.claude/guides/planning.md`).

## Context the Next Agent Won't Have
- **Item 12 is cosmetic — belief and `perLineStats` are NOT touched.** `perLineStats`
  (`api/final-line-verdict.js`) is computed from `belief.entries` + the reference, entirely
  independent of the `conflicts` array. Collapsing conflicts cannot change item-15's raw stats. The
  gate proving it: `plate_summary.py` `perLineStats` stayed `247/247, 0 mismatched`. **If a future
  change moves `perLineStats`, the collapse wrongly touched belief — STOP.**
- **`233 → 8` is lossless and clean.** All 233 per-line conflicts on `plate_summary.py` were 8
  constant-`shift:-1` cascades (one snapshot-verify moment broken into runs by agreement-gaps + one
  earlier moment). `collapsedCascade.memberLines` preserves every raw line number; lineCounts sum to
  233. The number was user-signed-off before the roadmap flip.
- **Collapse criterion = LCS-overlap-dominates** (`2*ctxCount >= run.length`, run ≥ 2) via reused
  `lineDiff` over the per-line EXCERPTS (≤80 chars). Conservative: a false negative leaves a cascade
  un-collapsed (safe); a false positive is cosmetic. `shiftOffset` = signed length of the leading
  non-ctx op block (+add = insertion, −del = deletion); a directional hint only.
- **Out of scope BY DESIGN:** `rm` total-deletion cascades (all `observedText:null` → `ctxCount 0` →
  not collapsible) stay per-line. `tests/test-track-line-states-bashops.js`'s 2-conflict `rm` test is
  the guard that this case is untouched.
- **Item 12's ONE production consumer of `result.conflicts` is `printConflicts`** (`tools/track-line-states.js`).
  Verified by grep — no viewer reads it. So replacing the array inside `trackLineStates` is safe.
- **`result.conflicts` now carries THREE shapes:** per-line (no `kind`, numeric `line`), item-11
  floating (`kind:'floatingOverKnownRegion'`, `line:null`), item-12 collapsed (`kind:'collapsedCascade'`,
  `firstLine`/`lastLine`/`lineCount`/`shiftOffset`/`memberLines`). `printConflicts` branches on
  `collapsedCascade`; floating falls through the per-line printer (`line null` prints, never crashes).
- **INDENTATION = 4-space for NEW code (USER PREFERENCE; saved memory
  `global-4space-indent-overrides-match-existing`).** The new module + new test functions are 4-space
  ISLANDS even though RevEng is 2-space. In-place edits (require lines, the return-field change, the
  `printConflicts` branch) match the local 2-space. Do NOT reflow surrounding code. (The older item-10
  handoff's "RevEng is 2-space, NOT 4-space" note is SUPERSEDED.)
- **Concurrent multi-session project.** Items 9, 10, 11 all landed mid-flight while later items were
  planned; line anchors SHIFT and file contents change out-of-band. **Locate edit sites by SYMBOL,
  not line number; re-read each file immediately before editing.** A failed Edit `old_string` match
  means the file changed out-of-band → re-read and re-target; never force a retry.
- **Process:** strict `~/.claude/guides/tdd.md` (RED before GREEN; granular `test_<behavior>` tests,
  plain-English step comments). 250-line WRITE cap is hook-enforced per file incl. tests (new code →
  new sibling). A Stop hook auto-runs `tests/test-<basename>.js` after edits and BLOCKS on failure
  (expected during RED). One condition per `if` (nest; no `&&`/`||`; ternaries only for value
  selection). TS 80001 (CommonJS→ESM) + TS 6133 (unused test binding during RED) are benign.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. The exact four-gate commands are in
`plans/handoff-develop-20260617-1252.md` § How to Verify. Current state (all GREEN):
1. **Full suite** — 62 suites / 635 passed / 0 failed.
2. **detect-rewinds** — 15 passed / 0 failed.
3. **Probe A/B vs `develop-baseline` (`880b69d`)** — `identical: true`.
4. **`plate_summary.py`** — `247/247 matchedObserved, 0 mismatched`; **conflicts=8** (all
   `collapsedCascade`; member lineCounts sum to 233). Exact command:
   ```
   node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py \
     --projects-dir ~/Programming/jot-recovery/claude-data/projects \
     --snapshots ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json
   node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)'
   ```
