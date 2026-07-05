# Handoff: Roadmap Item 11 (floatingOverKnownRegion conflict record) — PLANNED, ready to implement; also append new Item 18 to the roadmap
Conversation name: plan RevEng item 11 — floatingOverKnownRegion conflict record
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is
**UNTRACKED by design** (`git status --short` → 18 `??` entries + a pre-existing `M .gitignore`,
unrelated — UNCHANGED this session). This project commits nothing during normal work; the
committed source mirror lives on **`develop-baseline`** (tip `880b69d`, the item-5.6 re-baseline),
**UNCHANGED this session** (planning only). Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd
`/Users/matkatmusicllc/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the
JSONL), NOT a git repo. `RevEng/` (CONSUMER) is the subdir. No `develop-plate` branch exists.

## Goal
The RevEng sidecar reconstructs a file's per-line history from events extracted out of Claude Code
JSONL transcripts, driving toward 100% reconstruction
(`plans/roadmap-100-percent-reconstruction.md`). Items 1–10 + 10a are closed. This session
**PLANNED roadmap item 11** (surface the `floatingOverKnownRegion` flag as a conflict record
instead of silently degrading numbering) and **carved out a NEW item 18** (first-class user-edit
tracking via the `userModified` flag). The next agent EXECUTES the item-11 plan via strict
red-green TDD and APPENDS item 18 to the roadmap. No item-11 code was written this session.

## Current State
**Planning only — no code changes this session.** The RevEng working tree is UNCHANGED from the
item-10 handoff (`plans/handoff-develop-20260617-1252.md`); the only `git diff` is the pre-existing
`M .gitignore` (6 insertions, unrelated). All four gates were GREEN at that baseline and were NOT
re-run here (nothing changed): full suite **61 suites / 619 passed / 0 failed**; detect-rewinds
**15/0**; probe A/B vs `develop-baseline` **`identical: true`**; sidecar `plate_summary.py`
**247/247 matchedObserved, 0 mismatched, conflicts=233**.

The item-11 plan is COMPLETE and ready at **`~/.claude/plans/calm-jingling-cookie.md`** (verified
conformant to `~/.claude/guides/planning.md`, `tdd.md`, `coding-standards.md`; all code snippets in
**4-space** per the user's explicit directive — see Context below). Item 9 (replaceAll splice) is
already SHIPPED: `api/edit-splice.js` carries the replaceAll machinery and sets
`floatingOverKnownRegion: gapLine === null` at **two** sites — `:147` (replaceAll, `targets.length===0`)
and `:168` (single-edit). The roadmap's item-11 brief still cites the stale pre-item-9 line `:130`.

## What Remains
Execute in this order (full detail + exact code/test snippets in `~/.claude/plans/calm-jingling-cookie.md`):

1. **Append Item 18 to the roadmap.** Copy the verbatim brief from the plan's
   "Roadmap addition — Item 18" section into `plans/roadmap-100-percent-reconstruction.md` as a new
   `[ ]` item under **§A — Event-extraction coverage gaps** (it is unread JSONL evidence),
   cross-referenced to items 1 and 11. Roadmap-only edit; no code; independent of the item-11 gates.
2. **Item 11 — strict red-green TDD:**
   a. **Step 0:** confirm the four baseline gates are green.
   b. **Step 1 (RED):** in `tests/test-track-line-states-verdict.js`, widen the import at line 9 to
      add `TS3`/`MS3`, then add the two tests from the plan — `test_..._floatingOverFullyKnownBeliefProducesConflictRecord`
      (drives RED) and `test_..._floatingOverGapProducesNoFloatingConflictRecord` (regression guard).
      Run the suite; watch test (a) FAIL (`conflicts.length` 0 ≠ 1).
   c. **Step 2 (GREEN):** in `api/apply-one-event.js`, add `buildFloatingConflictInfo(event, materialized)`
      and, in `applyEditEvent`, return `[buildFloatingConflictInfo(...)]` when `result.floatingOverKnownRegion`.
   d. **Step 3 (GREEN):** in `api/track-line-states.js`, add `buildFloatingConflictRecord(info, unixMs, fromBeaconMs)`
      and branch `appendConflictRecords` on `infos[c].kind === 'floatingOverKnownRegion'`. Run; both new tests GREEN.
   e. **Step 4:** confirm existing floating tests still pass (they do — see Context); run
      `grep -rn "\.conflicts" tests/` as a backstop.
   f. **Step 5 (optional):** strengthen `test_..._originalFileRescuesAnEditThatWouldOtherwiseFloat`
      with `floated.conflicts.length === 1` + `.kind` assertions.
3. **Run the four gates.** `conflicts=233` MUST stay unchanged (dormancy proof); probe A/B MUST stay
   byte-identical. Full suite expected 619 → 621 passed (+2 tests).
4. **Document + flip.** Write `plans/implementation-notes-item11-floating-conflict-record.md`; flip
   item 11 `[ ]`→`[x]` in the roadmap — ONLY after the sidecar check is confirmed (get user sign-off
   if `plate_summary.py` moves off 247/247, conflicts=233).

## Key Files
- `~/.claude/plans/calm-jingling-cookie.md` — **THE plan** (item-11 steps with exact snippets + the
  Item 18 brief). Read this first.
- `api/apply-one-event.js` (119 L) — `applyEditEvent` is the SEAM; today it reads only
  `result.floating` and returns `[]`, discarding `floatingOverKnownRegion`.
- `api/track-line-states.js` (153 L) — `buildConflictRecord` (~:67) / `appendConflictRecords` (~:105);
  add the variant builder + the discriminated branch here.
- `api/edit-splice.js` — sets `floatingOverKnownRegion` at `:147` and `:168`; **NO change needed**.
- `api/line-belief.js` (238 L), `api/line-state-evidence.js` — `makeExcerpt` (tolerates `null`),
  `refForAuthoredEditLine`; **NO change**.
- `tests/test-track-line-states-verdict.js` (74 L) — home for the two new tests.
- `tests/test-track-line-states-originalfile.js` (135 L) — optional Step 5 assertion only.
- `tools/track-line-states.js` — CLI `printConflicts` (~:73-80) is the SOLE production consumer of
  `conflicts[]`; **NO change** (the variant supplies every field it reads).
- `plans/roadmap-100-percent-reconstruction.md` — append item 18; flip item 11 when done.
- `plans/handoff-develop-20260617-1252.md` — the item-10 handoff; its § How to Verify has the EXACT
  four-gate commands (full suite / detect-rewinds / probe A/B / plate_summary.py).

## Plan File
`~/.claude/plans/calm-jingling-cookie.md` — item-11 implementation steps + the Item 18 roadmap brief.
Active and ready; not yet executed.

## Context the Next Agent Won't Have
- **Item 11 is DORMANT on real data — defensive build (item-8 class).** `floatingOverKnownRegion`
  never fires on the frozen fixture: `plate_summary.py` stays at **conflicts=233**. The two synthetic
  tests are the ONLY triggers. **If `conflicts` moves off 233, STOP** — the build is no longer dormant
  and is wrong.
- **WHY it is dormant:** `originalFile` (item 1) re-syncs belief to the actual pre-edit file at each
  edit, absorbing unobserved (incl. user/IDE/formatter) edits, so the float-over-known case is
  rescued in practice. The user explicitly confirmed this line of reasoning: a float-over-known IS a
  signature of an out-of-band edit, and `originalFile` already absorbs those.
- **Record-shape decision = Option B** (a dedicated `buildFloatingConflictRecord` + a discriminated
  branch), NOT reusing `buildConflictRecord` — to keep that function's "per-line displacement"
  semantics honest. The variant MUST carry `window`, `timestampOfContradictingRecord`, and `excerpt`
  (the CLI printer reads them; `line: null` is safe — prints "null", never crashes). The `kind` field
  is additive (no consumer reads `.kind` today). Existing per-line infos have no `kind`, so they take
  the unchanged branch.
- **observedRef uses `materialized.newString` (NOT oldString) as the locator** for
  `refForAuthoredEditLine`: the edit record physically contains `newString` in
  `toolUseResult.newString`, and `''.indexOf('') === 0`, so even an empty `newString` yields a
  non-null ref. `observedText` uses `oldString` (the text proven absent) for human meaning. The two
  are deliberately different.
- **Test-construction gotchas (verified against the real extractor):** seed belief with
  `h.makeCreateLine` (a Write beacon → fully-known belief, EOF proved, sets `lastBeaconMs`). Use the
  **3-arg** `h.makeEditLine(path, old, new)` — its `originalFile` defaults to `''`, and
  `buildOriginalFileEvent` returns null on `originalFile === ''` (`api/file-events-extractors.js:124`),
  so NO originalFile event is emitted and the seeded belief is NOT overwritten. (Passing an
  `originalFile` would re-sync belief and the edit would no longer float-over-known.) The default
  empty `structuredPatch` makes `refForAuthoredEditLine` fall to the `newString` textProperty branch,
  giving a deterministic `observed.textProperty.property === 'toolUseResult.newString'`.
- **Existing floating tests stay green with NO edits:** `test-track-line-states.js`'s floating test
  floats over an unknown GAP (`gapLine` non-null → `floatingOverKnownRegion = false` → no new record;
  no conflicts assertion). The originalfile rescue test's `floated` variant DOES newly emit one
  floating conflict (its Read is a `readFull`, fully-known belief), but it asserts only `edit.floating`,
  not `conflicts.length`, so it passes unchanged.
- **Item 18 (carved out, NOT in item 11):** consuming `userModified`. It is DORMANT —
  `userModified:true` appears **0× across 6,065 records** (frozen fixture + live `~/.claude/projects`
  + plate data). NOT surfaced at extraction (`buildReplaceEdit`/`buildCreateOrUpdateEdit`,
  `api/edit-stream-extraction.js:45-57`). Semantics are UNCONFIRMED (Claude Code docs were
  unreachable from the agent sandbox; no positive examples to learn from). A user-edit heuristic
  ALREADY exists in the OTHER (non-sidecar) pipeline — `api/file-state-history.js`
  `isUserEditGap`/`buildUserEditStep`/`isUserEdit` (infers from `originalFile !== previousContents`);
  align vocabulary, do NOT reuse (sidecar is independent — no forwarding). The Item 18 brief in the
  plan carries the reopen trigger and the three behavior options (diagnostic-record-only /
  +conservative-drift / surface+annotate) to decide at item-18 planning.
- **USER PREFERENCE — indentation:** new code uses the **global 4-space** standard
  (`~/.claude/guides/coding-standards.md`), even though RevEng's existing files are 2-space. The new
  functions are 4-space ISLANDS; do NOT reflow the surrounding 2-space code. This OVERRIDES the
  "match existing style" instinct for indentation. (The plan's snippets are already 4-space.)
- **USER PREFERENCE — edits:** a failed Edit `old_string` match is a signal that the file changed
  out-of-band (a user/concurrent-session edit), NOT a prompt to retry — re-read and re-target, never
  force. Re-read each target file immediately before editing it (this is a concurrent multi-session
  project — items 9 and 10 landed while item 11 was being planned, so line anchors shift; locate by
  symbol, not line number).
- **Process:** strict `~/.claude/guides/planning.md` (zero ambiguity — exact test construction +
  expected values) and `tdd.md` (granular `test_<behavior>` tests, plain-English step comments, RED
  before GREEN). 250-line WRITE cap is hook-enforced per file (incl. tests) — new tests go in a NEW
  sibling file if a suite would exceed it. A Stop hook auto-runs `tests/test-<basename>.js` after
  edits and BLOCKS on failure (expected during RED). One condition per `if` (nest; no `&&`/`||`;
  ternaries only for value selection).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. The exact four-gate commands are in
`plans/handoff-develop-20260617-1252.md` § How to Verify. Summary of expected post-item-11 state:
1. **Full suite** — green; 619 → **621 passed** (+2 new tests), 0 failed.
2. **detect-rewinds** — 15 passed / 0 failed (unchanged; tracker-only change).
3. **Probe A/B vs `develop-baseline`** — `identical: true` (probe never reads `conflicts[]`).
4. **`plate_summary.py`** — 247/247 matchedObserved, 0 mismatched, **conflicts=233 (MUST be unchanged
   — the dormancy proof).**
