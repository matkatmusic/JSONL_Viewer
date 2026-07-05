# Handoff: Roadmap Item 14 (trailing-extent mismatch class) — COMPLETE, all gates GREEN
Conversation name: implement RevEng item 14 — trailing-extent mismatch class
JSONL: (omitted per handoff rules — ephemeral)

## Branch
`develop` based on `master`. HEAD is `1a9f098 Initial commit`. The whole working tree is
**UNTRACKED by design** (`git status --short` → many `??` entries + a pre-existing `M .gitignore`,
6 insertions, unrelated — UNCHANGED this session). This project commits nothing during normal work;
the committed source mirror lives on **`develop-baseline`** (tip `880b69d`, the item-5.6 re-baseline),
**UNCHANGED this session** (item 14 is tracker/materializer-only → probe byte-identical, no
re-baseline). Run ALL git + tests from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the
cwd `/Users/matkatmusicllc/Desktop/claude code src` is the Claude Code TS source (PRODUCER of the
JSONL), NOT a git repo. `RevEng/` (CONSUMER) is the subdir git repo.

## Goal
The RevEng sidecar reconstructs a file's per-line history from Claude Code JSONL transcripts, then
scores final belief against the best available reference. Item 14 fixed the **trailing-extent
mismatch class**: two MISMATCH files each differed from their reference by exactly one phantom
trailing empty (`''`) line. The root cause was SETTLED as a SYSTEMATIC EXTRACTOR ARTIFACT — Claude
Code's Read tool numbers the empty string after a file's final `\n` as a phantom `"N\t"` line, and
the sidecar's numbered-entry materializer faithfully turned it into a belief line one past EOF. The
fix drops that one terminal phantom on the Read path only; both files now go end-state per-line-perfect.

## Current State
**Item 14 COMPLETE — implemented this session via strict red-green TDD. All gates GREEN.** Item 13
(git rung) had already landed in the working tree before this session.

Changes (all UNTRACKED working-tree files, per project convention):
- **NEW** `api/numbered-entries.js` (59 L, 4-space) — `buildNumberedEntry` + `numberedEntries` moved
  verbatim from `line-state-evidence.js:46-67`, plus the fix `dropTrailingReadPhantom(entries, rawText)`.
- **EDIT** `api/line-state-evidence.js` (249 → 227 L) — added `var numbered = require('./numbered-entries');`,
  deleted the moved primitives, `numberedLineEntries` now applies the drop, `catLineEntries` calls the
  sibling generic WITHOUT the drop. `module.exports` unchanged.
- **NEW** `tests/test-numbered-entries.js` (84 L) — 9 tests (driver + guards a–f + 2 wrapper-integration).
- **EDIT** `plans/roadmap-100-percent-reconstruction.md` — item 14 marked `[x]` with completion summary.
- **NEW** `plans/implementation-notes-item14-trailing-extent.md` — full notes (decisions/gates).

Gate results:
- **Payoff:** File A (`…handoff-recovery-20260519-1250.md`) `perLineStats.mismatched` **1 → 0**
  (matchedObserved 84 unchanged); File B (`…diff_sequence_codex.py`) `mismatched` **1 → 0**
  (matchedObserved 80 / matchedPresumed 417 unchanged; genuine interior blanks 494/495 survive).
- Full suite: **65 suites / 657 passed / 0 failed** (was 648; +9 tests, +1 suite).
- detect-rewinds: **15/15**.
- `plate_summary.py` e2e: **247/247 matchedObserved, 0 mismatched, conflicts = 8** (UNCHANGED).
- Probe A/B vs `develop-baseline` (`880b69d`): **`identical: true`** — NO re-baseline.
- Line caps: `line-state-evidence.js` 227, `numbered-entries.js` 59, `test-numbered-entries.js` 84 — all ≤250.

## What Remains
Item 14 has nothing left. Pick the next roadmap item. Per §C's load-bearing chain **13 → 16 → 15**
(item 13 is done):

1. **Item 16 — Run the sidecar over list2.** Drive the sidecar across list2's MISMATCH (106) +
   NOT_FOUND (64) targets. The 106 MISMATCH files already have a reference → runnable now; the 64
   NOT_FOUND files needed item 13's git rung (now landed) for a reference. Tracker-only → byte-identical.
   See roadmap line ~558.
2. **Item 15 — Promote per-line verdict into probe verdict (new PASS-PER-LINE status).** Consumes item
   16's verdicts; **discuss the status NAME with the user FIRST** (proposal `PASS-PER-LINE`; MUST NOT be
   merged with PASS). Can run on the 160 on-disk MISMATCH files (54 list1 + 106 list2) without item 13.
   See roadmap line ~536.
3. **Item 17 — Unify the two read-event scanners** (§D consolidation; parity refactor). Note: item 14
   did NOT touch the read-event scanners — `numberedLineEntries`/`numberedEntries` are the numbered-line
   *parsers*, distinct from the `extractReadEdits`/`extractReadEvents` scanners item 17 unifies. See
   roadmap line ~578.
4. **Item 18 — userModified tracking** (dormant/defensive, item-8 class). See roadmap line ~244.

For any chosen item: write a How-focused plan (`~/.claude/guides/planning.md`), implement strict
red-green (`tdd.md`), keep files ≤250 (split to siblings), one condition per `if`, 4-space for new
`api/` modules.

## Key Files
- `api/numbered-entries.js` — NEW sibling: numbered-line parser + `dropTrailingReadPhantom` (the fix).
- `api/line-state-evidence.js` (227 L) — host; `numberedLineEntries` (Read, drops phantom),
  `catLineEntries` (cat -n, no drop), materializers.
- `api/final-line-verdict.js` — the verdict consumer (`compareLine`, `buildFinalVerdict`); NOT edited.
- `api/line-belief.js` — `finishWholeOverlay` pins `belief.lastLine`; NOT edited (re-pins automatically).
- `tests/test-numbered-entries.js` — the item-14 test suite (unit + wrapper-integration).
- `tools/track-line-states.js` — sidecar CLI `main()`; reference ladder lives here (item 13).
- `tools/line-state-reports/*.json` — pre-generated reports for File A/B + clean-PASS control + plate e2e.
- `plans/implementation-notes-item14-trailing-extent.md` — this session's full notes.
- `plans/roadmap-100-percent-reconstruction.md` — the 17-item roadmap (item 14 now `[x]`).

## Plan File
`/Users/matkatmusicllc/.claude/plans/hidden-foraging-cloud.md` (item-14 plan, fully executed).

## Context the Next Agent Won't Have
- **The phantom is everywhere but harmless except at a raw-numbered terminal event.** A control found
  the `"N\t"` phantom on 32/65 numbered Read results. It survives to the final verdict ONLY when a
  file's LAST extent-witnessing event is a raw-numbered `readFull`/`readChunk`/`cat` with no later
  beacon. Every belief-replacing beacon (`materializeWrite`/`materializeSnapshot`/`materializeOriginalFile`/
  edits) materializes via `splitContentLines`/`plainLineEntries`, which pop the trailing `\n` → no
  phantom. That is why only TWO files in the whole fixture mismatched, and why `plate_summary.py`
  (also ends in one `\n`) was a clean PASS (last event = snapshot beacon).
- **The fix MUST stay Read-path-only.** `cat -n` emits a trailing numbered-empty line only for a
  GENUINE blank line (`printf 'a\nb\n' | cat -n` → no line 3; `'a\nb\n\n'` → line 3 shown). Applying
  the drop to `catLineEntries` would corrupt belief about real cat-observed blanks. The asymmetry test
  `test_catLineEntries_keepsGenuineTrailingEmptyNumberedLine` guards this — do not "simplify" by routing
  cat through the drop.
- **The four guards in `dropTrailingReadPhantom` are each load-bearing** — proven by guard tests that
  fail an over-aggressive "drop any last empty entry" cut: (b) `endIndex === rawText.length` (a witnessed
  blank line is followed by `\n` so its endIndex is short), (c) `length >= 2` (a lone entry has no
  predecessor), (d) contiguity `last.lineNum === previous.lineNum + 1` (gapped results are not phantoms).
- **Files ending in a genuine final blank line stay correct.** The Read shows the genuine blank AND then
  the phantom (two trailing empties); the drop removes only the contiguous TERMINAL one, and the
  reference side keeps the genuine blank (`splitContentLines('foo\n\n')` → `['foo','']`) — symmetric, 0
  mismatched. Test (e) covers this.
- **`line-state-evidence.js` was at the 249/250 write cap** — the fix could not be inlined (hook blocks
  net growth). Moving the primitives to the sibling freed it to 227. Same constraint applies to future
  edits there.
- **Re-verifying the two target files:** read each report's `filePath` / `aliasPaths` / `jsonlsScanned`
  from `tools/line-state-reports/*.json`, then run the CLI with `--projects-dir
  ~/Programming/jot-recovery/claude-data/projects --snapshots ~/Programming/jot-recovery/claude-data/file-history`
  (both files compare `via: on-disk`). Exact commands in the implementation notes.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng` (with `unset NODE_OPTIONS` to silence
the debugger banner):
1. **New unit suite:** `node tests/test-numbered-entries.js` → 9 passed / 0 failed.
2. **Host suite unchanged:** `node tests/test-line-state-evidence.js` → 16 passed / 0 failed.
3. **Payoff (both files per-line-perfect):**
   `node tools/track-line-states.js --path ~/Programming/jot-backup/plans/handoff-recovery-20260519-1250.md
   --projects-dir ~/Programming/jot-recovery/claude-data/projects --snapshots
   ~/Programming/jot-recovery/claude-data/file-history --out /tmp/item14-A.json` then check
   `finalVerdict.perLineStats.mismatched === 0`; repeat for
   `~/Programming/jot-recovery/src/diff_sequence_codex.py`.
4. **plate e2e (must be unchanged):** same CLI with `--path
   ~/Programming/jot/common/scripts/plate/plate_summary.py` → `{matchedObserved:247, mismatched:0}`,
   conflicts = 8.
5. **detect-rewinds:** `node tests/detect-rewinds.test.js` → 15/15.
6. **Full suite:** `for fkt in tests/test-*.js; do case "$fkt" in tests/test-helpers.js|*output-data.js)
   continue;; esac; node "$fkt" 2>/dev/null; done | grep -E "passed,|FAIL:"` → 657 passed total, no FAIL.
7. **Probe A/B byte-identical** vs `develop-baseline` (`880b69d`) — exact worktree+diff command in
   `plans/handoff-develop-20260617-1252.md` § How to Verify → `identical: true`.
8. **Line caps:** `wc -l api/numbered-entries.js api/line-state-evidence.js tests/test-numbered-entries.js`
   → all ≤ 250.
