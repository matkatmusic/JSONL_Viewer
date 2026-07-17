## 2026-06-17:17:02:00 — RevEng roadmap item 14: trailing-extent mismatch class
Chat title: implement RevEng item 14 — trailing-extent mismatch class
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/ (current session JSONL; exact session-id file in that dir)

### References
- /Users/matkatmusicllc/.claude/plans/hidden-foraging-cloud.md (the item-14 plan being executed)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-1658.md (item-14 handoff)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/roadmap-100-percent-reconstruction.md (item 14 entry, line 514)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/api/line-state-evidence.js (host file, EDIT)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/api/numbered-entries.js (NEW sibling)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/api/final-line-verdict.js (consumer, no edit)

### Going-in baseline (Phase 0, 2026-06-17)
- Defect confirmed by reading the two pre-generated reports:
  - File A (`…handoff-recovery-20260519-1250.md.json`): mismatched 1, line 85,
    stats {matchedObserved:84, matchedPresumed:0, mismatched:1, neverObserved:0}.
  - File B (`…diff_sequence_codex.py.json`): mismatched 1, line 498,
    stats {matchedObserved:80, matchedPresumed:417, mismatched:1, neverObserved:0}.
- Full suite: 648 passed / 0 failed (item 13 already landed in the working tree:
  api/reference-ladder.js + test-reference-ladder.js + test-track-line-states-reference.js present).
- line-state-evidence.js = 249 L (AT cap); test-line-state-evidence.js = 241 L (cannot grow).
- Probe A/B / plate_summary.py / detect-rewinds: certified GREEN by the item-13 handoff
  (`develop-baseline` = 880b69d unchanged); re-run as Phase-3 payoff comparison.

### Design decisions
- **Fix lives in a NEW sibling `api/numbered-entries.js`, not in the host.** `line-state-evidence.js`
  was at 249/250 (the write cap). Moved `buildNumberedEntry` + `numberedEntries` verbatim out
  (host 249→227), then added the fix `dropTrailingReadPhantom` in the sibling. Matches the roadmap's
  at-cap rule and the plan.
- **Read-path-only drop (the #1 trap).** `numberedLineEntries` (Read) and `catLineEntries` (cat -n)
  both route through the shared `numberedEntries(rawText, pattern)`. The drop is applied ONLY in
  `numberedLineEntries`; `catLineEntries` calls the sibling generic WITHOUT it, because `cat -n` emits
  a trailing numbered-empty line only for a genuine blank line. A dedicated asymmetry test
  (`test_catLineEntries_keepsGenuineTrailingEmptyNumberedLine`) locks this.
- **Four single-condition guards** define "the terminal Read phantom" precisely: (1) a predecessor
  exists (`length >= 2`), (2) last entry text is empty, (3) `endIndex === rawText.length` (no trailing
  newline after it — the phantom's signature; a witnessed blank line is followed by `\n`), (4) line
  number is predecessor + 1 (contiguity). A genuine interior/final blank line fails guard (3) or is
  preserved because exactly one terminal entry is removed.
- **No edit to `final-line-verdict.js` / `line-belief.js`.** Once `numberedLineEntries` returns one
  fewer entry, `finishWholeOverlay` re-pins `belief.lastLine` to the real EOF and the verdict's
  `Math.max(referenceLines.length, belief.lastLine)` loop bound stops emitting the extra line. The fix
  propagates through belief automatically.

### Deviations
- None from the plan's design. One process note: the plan's Step-4 wording says "both [wrapper] tests
  go RED against the current code." In practice only `test_numberedLineEntries_dropsReadToolTrailingPhantom`
  was RED (host kept the phantom); the cat asymmetry test was GREEN before and after by design (it
  proves the fix does NOT touch the cat path). This is the intended strict-TDD signal — the
  Read-path test fails first, the cat-path guard stays green — not a deviation in behavior.

### Tradeoffs
- Considered inlining the fix in `line-state-evidence.js` — rejected: the file is at the write cap and
  the hook blocks net growth. The sibling-module move is mandated and also yields a cleaner single home
  for the low-level numbered-parsing primitives.
- Considered a generic "strip last empty entry" with no guards — rejected by guard tests (b)/(c)/(d):
  it would corrupt witnessed blank lines, lone entries, and gapped results. The precise guards are
  load-bearing (each guard has a test that fails the over-aggressive cut).

### Gate results (Phase 3, 2026-06-17)
- New unit suite `tests/test-numbered-entries.js`: 9 passed / 0 failed.
- `tests/test-line-state-evidence.js`: 16 passed / 0 failed (unchanged; its fixtures all end in content
  so the drop never fires).
- **Payoff:** File A `mismatched` 1→0 (matchedObserved 84 unchanged); File B `mismatched` 1→0
  (matchedObserved 80 / matchedPresumed 417 unchanged).
- `plate_summary.py` e2e: 247/247 matchedObserved, 0 mismatched, conflicts = 8 (UNCHANGED).
- detect-rewinds: 15/15.
- Full suite: 657 passed / 0 failed (was 648; +9 tests, +1 suite).
- Probe A/B vs `develop-baseline`: `identical: true` (no re-baseline; `880b69d` unchanged).
- Line caps: `line-state-evidence.js` 227, `numbered-entries.js` 59, `test-numbered-entries.js` 84 —
  all ≤250.

### Open questions
None. The real-vs-artifact decision was SETTLED in the plan (Phase 0 step 5 confirmed it); all gates
green; nothing requires user confirmation.
