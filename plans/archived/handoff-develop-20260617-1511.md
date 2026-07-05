# Handoff: Roadmap Item 11 (floatingOverKnownRegion conflict record) — SHIPPED; Item 18 appended to roadmap
Conversation name: implement RevEng item 11 — floatingOverKnownRegion conflict record
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is
**UNTRACKED by design** (`git status --short` → 18 `??` entries + a pre-existing `M .gitignore`,
unrelated — UNCHANGED this session). This project commits nothing during normal work; the
committed source mirror lives on **`develop-baseline`** (tip `880b69d`, the item-5.6 re-baseline),
**UNCHANGED this session** (item 11 is sidecar-only → no re-baseline). Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd
`/Users/matkatmusicllc/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the
JSONL), NOT a git repo. `RevEng/` (CONSUMER) is the subdir. No `develop-plate` branch exists.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts, driving toward 100% reconstruction
(`plans/roadmap-100-percent-reconstruction.md`). Items 1–10 + 10a were closed before this session.
This session **implemented item 11** (surface the `floatingOverKnownRegion` flag as a conflict
record instead of silently degrading numbering) and **appended a new item 18** (`userModified`
first-class user-edit tracking) to the roadmap. Both are now landed.

## Current State
**Item 11 SHIPPED. All four gates GREEN.** Code changes this session (all sidecar/tracker-only):
- `api/apply-one-event.js` (119 → 143 L): new module-private `buildFloatingConflictInfo(event,
  materialized)`; `applyEditEvent` now returns `[buildFloatingConflictInfo(...)]` when
  `result.floatingOverKnownRegion` (was: discarded). `result.floating` still sets
  `event.edit.floating` unchanged.
- `api/track-line-states.js` (153 → 178 L): new module-private `buildFloatingConflictRecord(info,
  unixMs, fromBeaconMs)`; `appendConflictRecords` branches on
  `infos[c].kind === 'floatingOverKnownRegion'` → variant builder, else the existing per-line
  builder.
- `tests/test-track-line-states-verdict.js` (74 → 136 L): `TS3`/`MS3` added to the line-9 import;
  two new tests (RED confirmed `0 ≠ 1` first, then GREEN).
- `plans/roadmap-100-percent-reconstruction.md`: item 11 flipped `[ ]`→`[x]` with a DONE summary;
  new item 18 (`userModified`) appended to §A (after item 8, cross-ref items 1 + 11).
- `plans/implementation-notes-item11-floating-conflict-record.md`: new — full design + gate results.

No change to `api/edit-splice.js` (already sets the flag at `:147`/`:168` since item 9),
`api/line-belief.js`, `api/line-state-evidence.js`, or the CLI `tools/track-line-states.js`. All
edited files ≤250. Gate results (run from `RevEng/`): full suite **61 suites / 621 passed / 0
failed** (was 619; +2 tests); detect-rewinds **15/0**; probe A/B vs `develop-baseline`
**`identical: true`**; sidecar `plate_summary.py` **247/247 matchedObserved, 0 mismatched,
conflicts=233 (UNCHANGED — the dormancy proof).**

## What Remains
Item 11 is complete. Remaining roadmap items (re-read `plans/roadmap-100-percent-reconstruction.md`
for each item's full planning brief; the §C chain is **13 → 16 → 15**, with a bypass noted):
1. **Item 12 — Collapse conflict cascades.** REPORTING-time post-process of `conflicts[]` (LCS
   alignment of a constant-offset run → one synthetic record). New sibling
   `api/conflict-cascade-collapse.js`. Pure reporting; MUST NOT mutate belief/per-line verdict.
   Probe byte-identical; e2e `conflicts:233` changes BY DESIGN → re-baseline that one assertion.
   Independent of 11/13.
2. **Item 13 — Git rung on the reference ladder.** Insert a git rung after snapshot in
   `chooseReference` (`tools/track-line-states.js`); mirror `api/replay-verification.js`
   `tryGitFallback`/`verifyMissingFile`. **Unblocks item 16.** Tracker/reference-only → probe
   byte-identical.
3. **Item 14 — Trailing-extent mismatch class.** Decide per file: real historical blank line vs
   numbered-empty-trailing-line extractor artifact; fix the materializer if artifact. Most
   independent of the §C group.
4. **Item 16 — Run the sidecar over list2** (106 MISMATCH now; 64 NOT_FOUND need item 13's git
   rung). Consumes item 13; feeds item 15.
5. **Item 15 — Promote per-line verdict** (new `PASS-PER-LINE` status — **discuss the name with
   the user FIRST**). Consumes 13 + 16; the 160 on-disk MISMATCH files run without item 13.
6. **Item 17 — Unify the two read-event scanners** (parity refactor; strict byte-identical scanner
   output across all three repointed callers).
7. **Item 18 — `userModified` tracking** (newly added; DORMANT, semantics unconfirmed — see its
   brief and reopen trigger). Plan it when picked.

## Key Files
- `api/apply-one-event.js` — `applyEditEvent` + `buildFloatingConflictInfo` (the item-11 seam).
- `api/track-line-states.js` — `buildConflictRecord` / `buildFloatingConflictRecord` /
  `appendConflictRecords` (discriminated branch).
- `api/edit-splice.js` — sets `floatingOverKnownRegion` at `:147` (replaceAll, `targets.length===0`)
  and `:168` (single-edit). NOT changed by item 11.
- `tools/track-line-states.js` — CLI `printConflicts` is the SOLE production consumer of
  `conflicts[]` (reads `.line`/`.timestampOfContradictingRecord`/`.window`/`.excerpt`; tolerates
  the variant's `line:null`).
- `tests/test-track-line-states-verdict.js` — the two new item-11 tests live here.
- `tests/track-line-states-fixtures.js` — shared `trackFixture`/`withTimestamp`/`TS*`/`MS*`/
  `makeReadUseWithGeometry`.
- `plans/roadmap-100-percent-reconstruction.md` — progress tracker (items 12–18 open).
- `plans/implementation-notes-item11-floating-conflict-record.md` — this session's design notes.
- `plans/handoff-develop-20260617-1252.md` § How to Verify — the EXACT four-gate commands.

## Plan File
`~/.claude/plans/calm-jingling-cookie.md` — the item-11 plan (executed; includes the item-18 brief
that was appended to the roadmap). The prior planning handoff was
`plans/handoff-develop-20260617-1452.md`.

## Context the Next Agent Won't Have
- **Item 11 is DORMANT on real data (defensive build, item-8 class).** `floatingOverKnownRegion`
  never fires on the frozen fixture — `plate_summary.py` stays `conflicts=233`. The two synthetic
  tests are the ONLY triggers. **If a future change moves `conflicts` off 233, the branch is no
  longer dormant** — inspect the new record before trusting it. WHY dormant: item 1's `originalFile`
  overlay re-syncs belief to the actual pre-edit file at each edit, absorbing out-of-band
  (user/IDE/formatter) edits, so the float-over-known case is rescued in practice.
- **Record shape = Option B** (dedicated `buildFloatingConflictRecord` + discriminated branch on a
  `kind` field), NOT reusing `buildConflictRecord` — to keep that function's "per-line displacement"
  semantics honest. Existing per-line infos (from `conflictAgainstExisting`) have no `kind` →
  `undefined` → unchanged branch. The variant carries `kind` (additive; no consumer reads it today),
  `line:null`/`presumed:null`, and every CLI-printer field.
- **`observedRef` uses `newString`, `observedText` uses `oldString` — deliberately different.**
  `observedRef = refForAuthoredEditLine(event, materialized.newString)`: the edit record physically
  contains `newString` (`toolUseResult.newString`) and `''.indexOf('') === 0`, so the ref is never
  null even for an empty newString. `observedText = materialized.oldString` is the human-readable
  text proven absent from belief. `makeExcerpt(null)` returns `null` (verified
  `api/line-state-evidence.js:230` — `typeof text !== 'string'` guard), so the variant's null
  presumed side excerpts cleanly.
- **INDENTATION — 4-space islands MUST be flat-assignment in RevEng.** New code uses the global
  4-space standard (overrides RevEng's 2-space; see the user memory note). BUT RevEng's
  `PostToolUse` deep-nesting hook measures indent in **2-space units**, so a multi-line 4-space
  object literal puts properties at 8 spaces = 4 units (>3) and is BLOCKED on save. Resolution
  (used here): write 4-space islands with flat imperative assignment (`var o = {}; o.k = v; …
  return o;`, max 4 leading spaces = 2 units), NOT nested object literals. Existing 2-space
  functions you only add a branch to are NOT reflowed — add the branch at the function's existing
  2-space indent (`applyEditEvent`, `appendConflictRecords` were done this way).
- **Step 5 (optional originalfile-rescue test strengthening) was OMITTED** — the rescue test's
  `floated` variant exercises the identical emission path (gap-less belief →
  `floatingOverKnownRegion`), so it adds no distinct coverage beyond the dedicated tests; the plan
  sanctioned omitting it to keep that file's diff at zero. It still passes unchanged (it asserts
  only `edit.floating`, not `conflicts.length`).
- **Test-construction gotcha:** use the **3-arg** `h.makeEditLine(path, old, new)` — its
  `originalFile` defaults to `''`, and `buildOriginalFileEvent` returns null on `originalFile === ''`
  (`api/file-events-extractors.js`), so NO originalFile event is emitted and the seeded belief is not
  overwritten (passing an `originalFile` would re-sync belief and the edit would no longer
  float-over-known). Seed full-belief with `h.makeCreateLine` (a Write beacon → EOF proved, sets
  `lastBeaconMs`).
- **USER PREFERENCE — edits:** a failed Edit `old_string` match is a signal the file changed
  out-of-band (concurrent multi-session project — items 9/10/11 landed across sessions), NOT a
  prompt to retry. Re-read each target file immediately before editing it; locate by symbol, not
  line number.
- **Process:** strict red-green TDD (`~/.claude/guides/tdd.md`); one condition per `if` (nest; no
  `&&`/`||`; ternaries only for value selection); 250-line WRITE cap is hook-enforced per file
  (split to a new sibling, never grow a file at the cap); a Stop hook auto-runs
  `tests/test-<basename>.js` after edits and BLOCKS on failure (expected during RED).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. Exact four-gate commands are in
`plans/handoff-develop-20260617-1252.md` § How to Verify. Current confirmed state:
1. **Full suite** — `61 suites / 621 passed / 0 failed`.
2. **detect-rewinds** — `15 passed / 0 failed`.
3. **Probe A/B vs `develop-baseline`** (frozen fixture `~/Programming/jot-recovery/probe-fixture-20260615/`)
   — `identical: true`. `develop-baseline` unchanged at `880b69d`.
4. **Sidecar e2e `plate_summary.py`** — `{matchedObserved:247, matchedPresumed:0, mismatched:0,
   neverObserved:0} conflicts=233` (the conflicts count is the item-11 dormancy proof — must stay 233).
