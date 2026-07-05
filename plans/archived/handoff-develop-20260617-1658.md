# Handoff: Roadmap Item 14 (trailing-extent mismatch class) — PLANNED, ready to implement
Conversation name: plan RevEng item 14 — trailing-extent mismatch class
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is
**UNTRACKED by design** (`git status --short` → 19 `??` entries + a pre-existing `M .gitignore`,
6 insertions, unrelated — UNCHANGED this session). This project commits nothing during normal
work; the committed source mirror lives on **`develop-baseline`** (tip `880b69d`, the item-5.6
re-baseline), **UNCHANGED this session** (planning only). Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd
`/Users/matkatmusicllc/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the
JSONL), NOT a git repo. `RevEng/` (CONSUMER) is the subdir git repo.

## Goal
The RevEng sidecar reconstructs a file's per-line history from Claude Code JSONL transcripts, then
scores final belief against the best available reference. Items 1–12 are closed; item 13 (git rung
on the reference ladder) is PLANNED/in-flight in a parallel session. This session **PLANNED item
14** — the *trailing-extent mismatch class*. Two files end-state MISMATCH for exactly one reason:
belief claims **one phantom trailing empty (`''`) line beyond the reference's EOF**. The investigation
this session **settled the roadmap's real-vs-artifact question: it is a SYSTEMATIC EXTRACTOR ARTIFACT**
— Claude Code's Read tool numbers the empty string after a file's final `\n` as a phantom `"N\t"`
line, and `api/line-state-evidence.js numberedEntries` faithfully turns it into a belief line. Item
14 fixes the extractor so the two files go end-state per-line-perfect. The next agent EXECUTES the
plan via strict red-green TDD. **No item-14 code was written this session.**

## Current State
**Planning only — no code changes this session.** The RevEng working tree is UNCHANGED from the
item-12/13 handoffs; the only tracked `git diff` is the pre-existing `M .gitignore` (unrelated). The
four standing gates were GREEN at the post-item-12 baseline (per the item-12 handoff
`plans/handoff-develop-20260617-1548.md`; NOT re-run here, nothing changed): full suite ≈ **62 suites
/ 635 passed / 0 failed**; detect-rewinds **15/15**; probe A/B vs `develop-baseline` **`identical:
true`**; sidecar `plate_summary.py` **247/247 matchedObserved, 0 mismatched, conflicts = 8
collapsedCascade** (item 12 collapsed 233 per-line conflicts into 8 records). **NOTE:** item 13 may
land before item 14 starts (it adds ~2 test files / +13 tests and is otherwise gate-neutral); read
the newest `plans/handoff-develop-*.md` for the current full-suite count rather than trusting the ≈62
above.

The item-14 plan is COMPLETE and ready at **`/Users/matkatmusicllc/.claude/plans/hidden-foraging-cloud.md`**
(conformant to `~/.claude/guides/planning.md`, `tdd.md`, `coding-standards.md`,
`single-condition-branching.md`, `verify-work.md`). Every file:line claim in it was confirmed against
live source, and the root-cause/verdict was proven by dereferencing both files' evidence back to raw
JSONL.

## What Remains
Execute in this order (full detail — module body, the test list, and the exact CLI edits — is in the
plan file):

1. **Phase 0 (no code):** confirm the four standing gates are green and record going-in numbers.
   Confirm the defect: read `tools/line-state-reports/Users-matkatmusicllc-Programming-jot-backup-plans-handoff-recovery-20260519-1250.md.json`
   and `…-jot-recovery-src-diff_sequence_codex.py.json` → each has
   `finalVerdict.perLineStats.mismatched === 1` with `mismatchedLines[0].line` = 85 / 498.
2. **Phase 1 (RED→GREEN) — the new sibling module.** Create `tests/test-numbered-entries.js` with the
   DRIVER test + `require('../api/numbered-entries')` → watch RED (`MODULE_NOT_FOUND`). Create
   `api/numbered-entries.js` by moving `buildNumberedEntry` + `numberedEntries` verbatim from
   `api/line-state-evidence.js:46-67` and adding the new pure `dropTrailingReadPhantom(entries,
   rawText)`; reach GREEN. Then add the 5 guard tests (a–e in the plan) + the moved-generic parity
   test (f), each one at a time — guard tests (b)/(d) are written to fail an over-aggressive first cut
   and drive the precise `endIndex === rawText.length` + contiguity guards.
3. **Phase 2 (RED→GREEN) — repoint the host file.** Add the 2 wrapper-integration tests to
   `tests/test-numbered-entries.js` (NOT to `tests/test-line-state-evidence.js`, which is at
   241/250) → RED. Then edit `api/line-state-evidence.js`: add `var numbered =
   require('./numbered-entries');`, delete the moved primitives (`:44-67`), make `numberedLineEntries`
   apply the drop, and make `catLineEntries` call the sibling generic **without** the drop. GREEN.
4. **Phase 3 — run the gates** (§ How to Verify). The payoff gate: File A & File B
   `finalVerdict.perLineStats.mismatched` goes **1 → 0**; `plate_summary.py` MUST stay 247/247, 0
   mismatched, conflicts = 8; probe MUST stay `identical: true` (no re-baseline).
5. **Phase 4 — close out.** Mark item 14 `[x]` in `plans/roadmap-100-percent-reconstruction.md`
   (line 487) with a completion summary; write `plans/implementation-notes-item14-trailing-extent.md`;
   write a fresh handoff via `/jot:handoff-prompt`.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/hidden-foraging-cloud.md` — the full item-14 plan (module body,
  the ~10-test red-green list, exact CLI edits, verification commands).
- `api/numbered-entries.js` — **NEW** ~45 L pure module (4-space): `buildNumberedEntry`,
  `numberedEntries(rawText, pattern)` (moved generic, NO drop), `dropTrailingReadPhantom(entries,
  rawText)` (the fix).
- `api/line-state-evidence.js` — **EDIT** (249 → ~226 L, surgical 2-space): remove the moved
  primitives, add the require, `numberedLineEntries` applies the drop, `catLineEntries` does NOT.
  `READ_NUMBER_PATTERN` (`:15`) / `CAT_NUMBER_PATTERN` (`:17`) and `module.exports` stay. Reuses
  `splitContentLines` (`:23-28`) semantics (the model the fix mirrors).
- `tests/test-numbered-entries.js` — **NEW** unit + wrapper-integration tests.
- `tests/test-line-state-evidence.js` — 241/250, **do NOT add tests here**; its existing
  `numberedLineEntries`/`catLineEntries` fixtures all end in content (drop never fires) → stay green.
- `api/final-line-verdict.js` (`compareLine:33-34`, `buildFinalVerdict:46-62`) — the consumer; the
  off-by-one surfaces here as `mismatched`. **No edit** — the fix propagates via belief.
- `api/line-belief.js` (`finishWholeOverlay`) — pins `belief.lastLine`; **no edit** — once
  `numberedLineEntries` returns one fewer entry, EOF re-pins to the real value automatically.
- `api/evidence-record-access.js` (`loadParsedRecord`, `findToolResultText`) — verification only
  (how the evidence was dereferenced to prove the artifact).
- `tools/line-state-reports/*.json` — pre-generated reports for File A, File B, the clean-PASS control
  (`…plate-assessment-2026-04-28.md.json`), and the e2e `…plate_summary.py.json`; each records
  `filePath` / `aliasPaths` / `jsonlsScanned` to drive deterministic re-verification.

## Plan File
`/Users/matkatmusicllc/.claude/plans/hidden-foraging-cloud.md`

## Context the Next Agent Won't Have
- **The real-vs-artifact decision is SETTLED — do not re-litigate it.** Dereferencing both files'
  `mismatchedLines[0].evidence` → `loadParsedRecord(jsonl, jsonlLine)` showed the source tool output
  literally ends with `"85\t"` / `"498\t"` (empty content, zero-length span at `endIndex ===
  rawText.length`). A **control test** found the phantom on **32 of 65** numbered Read results — it is
  a universal Read-tool format artifact for any file ending in a single `\n`, not unique to these two.
  Phase 0 step 5 is a *confirm*, not a *decide*.
- **THE #1 TRAP — the fix is Read-tool-specific.** `numberedLineEntries` (Read, `/^(\d+)\t/`) and
  `catLineEntries` (cat -n) both route through the shared `numberedEntries(rawText, pattern)`. The
  drop must apply to the **Read path only**. `cat -n` emits a trailing numbered-empty line **only for
  a GENUINE blank line** (verified: `printf 'a\nb\n' | cat -n` → no line 3; `…'a\nb\n\n'` → line 3
  shown), so applying the drop to the cat path would corrupt belief about real cat-observed blanks.
  That is why the plan keeps `dropTrailingReadPhantom` out of the shared generic and out of
  `catLineEntries`. There is a dedicated asymmetry test (`test_catLineEntries_keepsGenuineTrailing…`).
- **Why only two files mismatch despite the phantom being ~everywhere:** the phantom survives to the
  final verdict ONLY when the file's last extent-witnessing event is a raw-numbered `readFull`/`cat`
  with no later beacon. Every belief-replacing beacon (`materializeWrite`/`materializeSnapshot`/
  `materializeOriginalFile`/edits) materializes via `splitContentLines`/`plainLineEntries`, which pop
  the trailing `\n` and emit no phantom. (`plate-assessment-2026-04-28.md` also ends in one `\n` but
  is a clean PASS — its last event is a snapshot beacon.) So most reads' phantoms are harmless;
  fixing the materializer is still globally correct and strictly improves belief.
- **The fix is correct even for files that genuinely end in a blank line.** The Read tool shows the
  genuine blank line AND then the phantom (two trailing empties); `dropTrailingReadPhantom` removes
  only the contiguous TERMINAL one (`endIndex === rawText.length`), and the reference side keeps the
  genuine blank because `splitContentLines('foo\n\n')` → `['foo','']`. Symmetric → still 0 mismatched.
  This is the whole point of mirroring `splitContentLines`' trailing-newline semantics. (Worked
  examples in the plan, test (e).)
- **`api/line-state-evidence.js` is at 249/250 — the WRITE cap.** A fix there cannot add net lines;
  the hook blocks the write. Do NOT try to inline the fix. The plan moves the primitives OUT to the
  sibling (frees ~26 lines) — this is mandated by the roadmap's at-cap rule and item 14's own note.
- **Existing tests verified safe:** `tests/test-line-state-evidence.js` already tests
  `ev.numberedLineEntries` (`'10\tfoo\n11\tbar'`, `'1\tfoo\n<system-reminder>…\n2\tbar'`) and
  `ev.catLineEntries` (`'foo\nbar'`); all end in content, so the drop never fires → they stay green
  after the Phase-2 edit (whose write triggers the hook to run that file). `numberedLineEntries`/
  `catLineEntries` stay exported from `line-state-evidence.js`, so no external importer moves (the only
  external importer of either is that one test file; the generic `numberedEntries` is internal-only).
- **Tracker-only → probe byte-identical; NO re-baseline.** Verified: the probe's reconstruction path
  (`tools/probe-projects-v2.js`, `api/reconstruction-reference-sources.js`, `api/replay-verification.js`,
  `api/edit-replay.js`) has zero references to `numberedLineEntries`/`line-state-evidence`. The fix
  touches only sidecar materialization. `develop-baseline` stays at `880b69d`.
- **Item 14 is independent of item 13** (and 15/16/17) — no file overlap (item 13 edits
  `tools/track-line-states.js chooseReference` + adds `api/reference-ladder.js`). Land in either order.
- **The two targets** (both `comparedVia: 'on-disk'`): File A
  `~/Programming/jot-backup/plans/handoff-recovery-20260519-1250.md` (belief line 85, ref 84 lines,
  `readFull` last event, `lastState:'observed'`); File B
  `~/Programming/jot-recovery/src/diff_sequence_codex.py` (belief line 498, ref 497 lines, `readFull`,
  `lastState:'presumed'`; note its lines 494/495 are GENUINE interior blanks that must survive).
- **Indentation:** new `api/` module in **4-space** flat early-returns (the convention shipped for
  `api/alias-windows.js` / `api/conflict-cascade-collapse.js`; multi-line nested object literals at
  4-space trip the `>3-deep` nesting hook). Surgical edits to `line-state-evidence.js` match its 2-space
  style. One condition per `if`.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`. Exact full-suite + probe-A/B commands
are in `plans/handoff-develop-20260617-1252.md` § How to Verify (also `…-20260615-1833.md`).

1. **New unit suite fails first, then passes:** `node tests/test-numbered-entries.js` (RED on Step 1
   with `MODULE_NOT_FOUND`; GREEN after each step). A *failing* verification: an over-aggressive
   "drop any last empty entry" fails guard tests (b) `'1\tfoo\n2\t\n'` → must keep `[1,2]` and (d)
   non-contiguous → must keep.
2. **`line-state-evidence` suite unchanged:** `node tests/test-line-state-evidence.js` green.
3. **The two files go per-line-perfect (the payoff):** for each, read the report's `filePath` /
   `aliasPaths` / `jsonlsScanned` and re-run the library exactly as `tools/track-line-states.js
   main()` does (`extractFileEvents(jsonlsScanned × aliasPaths)` → `trackLineStates(events, {via:
   'on-disk', content: fs.readFileSync(filePath,'utf8')})`); assert `finalVerdict.perLineStats.mismatched`
   **1 → 0** (matchedObserved/Presumed unchanged). Equivalent CLI form in the plan.
4. **No-regression e2e — `plate_summary.py`** (MUST be unchanged):
   `node tools/track-line-states.js --path ~/Programming/jot/common/scripts/plate/plate_summary.py
   --projects-dir ~/Programming/jot-recovery/claude-data/projects --snapshots
   ~/Programming/jot-recovery/claude-data/file-history --out /tmp/plate-check.json` then
   `node -e 'var d=require("/tmp/plate-check.json"); console.log(JSON.stringify(d.finalVerdict.perLineStats), "conflicts="+d.conflicts.length)'`
   → `{...,"matchedObserved":247,...,"mismatched":0,...}` conflicts=8.
5. **detect-rewinds:** `node tests/detect-rewinds.test.js` → **15/15** unchanged.
6. **Full suite:** all pass; **+1 suite** (`tests/test-numbered-entries.js`), +~10 tests; no other
   suite's count changes.
7. **Probe A/B vs `develop-baseline`:** **`identical: true`** — any non-empty diff means the change
   leaked into a probe-reachable path; stop and investigate.
8. **Line caps:** `wc -l api/numbered-entries.js api/line-state-evidence.js tests/test-numbered-entries.js`
   → all ≤ 250 (`line-state-evidence.js` should drop to ~226).
