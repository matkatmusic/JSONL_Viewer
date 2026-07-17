# Implementation Notes — Roadmap Item 9: replaceAll splice across ALL runs

## 2026-06-17:11:32:00 — Item 9: replaceAll splice across ALL known runs
Chat title: implement RevEng item 9 — replaceAll splice across all runs (indexed-hartmanis)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/66a677b9-7ec1-4c47-898e-ae585ea1ee16.jsonl

### References
- Plan (spec): /Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-indexed-hartmanis.md
- Handoff that opened this session: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-1111.md
- Prior handoff (item 8 shipped): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-1026.md
- Roadmap: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/roadmap-100-percent-reconstruction.md (§B item 9, line 255)
- Production file changed: /Users/matkatmusicllc/Desktop/claude code src/RevEng/api/edit-splice.js
- Test file changed: /Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/test-edit-splice.js
- Item 8 notes (format precedent): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-item8-multiedit.md

### What was built
An `Edit` with `replaceAll:true` mutates EVERY occurrence of `old_string` in the real file. Before this
change `api/edit-splice.js` spliced only the **first** known run containing `old_string`
(`applyEditToBelief` → `locateInRuns`, return-on-first-match), leaving other known runs stale and
silently ignoring occurrences hidden in unknown gaps — mis-numbering every line below an unvisited
occurrence. The `replaceAll:true` path now splices **every** known run and floats below an unknown gap.
The `replaceAll:false` path is byte-for-byte unchanged.

New internal functions in `api/edit-splice.js` (135 L → 173 L, under the 250-line cap):
- `locateAllRunsContaining(runs, oldString)` — every known run whose joined text contains `oldString`.
- `applyReplaceAllToBelief(belief, splice, unixMs, refForLine)` — the multi-run splice + float-on-gap path.
- `applyEditToBelief` gains one guard line: `if (splice.replaceAll) { return applyReplaceAllToBelief(...); }`.

`module.exports` is unchanged — only `applyEditToBelief` stays public; the two new functions are internal.
Reused unchanged: `applyLocatedSplice` / `rebuildEntriesForSplice` / `splicedRunText`, `firstGapLine`,
`applyFloating`, and `lb.knownRuns`.

### Design decisions
- **Descending-`startLine` splice order is mandatory.** All target runs are captured up front from one
  `lb.knownRuns(belief)` call, then spliced **bottom run first** (`targets.sort((a,b) => b.startLine -
  a.startLine)`). `rebuildEntriesForSplice` keeps entries with key `< startLine + prefixCount` unchanged,
  so a run *above* a splice (keys `< startLine`) is never disturbed. Processing bottom-up therefore keeps
  every not-yet-spliced higher run's captured `{startLine, texts}` valid **without re-deriving runs**
  after each splice. Ascending/source order would splice at stale coordinates and corrupt the belief.
  This was adversarially validated by a planning agent with a concrete counter-example and is guarded by
  `test_replaceAll_authorsNewLinesBelowEachOccurrenceAcrossRuns` (fails loudly if reordered).
- **`gapLine` is computed AFTER the splice loop** (`var gapLine = firstGapLine(belief)`). Splices above a
  gap shift the gap's line number, so it must be read from the rebuilt entries, not before.
- **`targets.length === 0` reproduces the legacy unlocatable return exactly** — float below the first gap,
  or flag-everything when the region is fully known (`floatingOverKnownRegion: gapLine === null`). Parity
  is guarded by tests 4 and 5.
- **Located runs + a remaining gap → float (the intended behavioral change).** When at least one run was
  spliced but an unknown gap still exists, the result now returns `floating:true` /
  `floatingOverKnownRegion:false` and unanchors numbering below the gap. Before, a located `replaceAll`
  returned `floating:false` even with an open gap. This is strictly more conservative/correct: an
  occurrence could hide in the gap, so numbering below it is no longer trusted.

### Deviations
- **Dropped two unused `var result =` assignments in the test file.** The plan's exemplar (written
  verbatim) and test 1 assert on `belief` state, not on the return value, so binding `result` left it
  unread — TypeScript flagged `'result' is declared but its value is never read` (6133). I call
  `es.applyEditToBelief(...)` without binding in those two tests. The plan's intent ("write the exemplar
  verbatim; it fixes the comment structure for the rest") is about the **comment structure**, which is
  preserved; this only removes a dead binding to keep the file lint-clean and production-quality. The four
  tests that assert on the return value keep `var result =`.
- No other deviations. All six test setups/edits/assertions match the plan exactly; the production code
  matches the plan's snippets exactly (plus the limitation comment from Step 3, placed at the `gapLine`
  line where it is most discoverable).

### Tradeoffs
- **Roadmap DONE block replaces item 9's planning sub-bullets** (Intent/Now/Gap/Home/Deps), mirroring how
  item 8 was closed. Full design detail now lives here; the roadmap stays a concise status ledger.
- **Documented (not coded) limitation:** two runs separated by a *missing interior key* (rather than an
  `unknown` entry) with `eofConfirmed===true` would let `firstGapLine` return `null` and wrongly report
  non-floating. This is unreachable for real inputs — every belief writer (`ensureImpliedLines`,
  `applyWrite`, `applySnapshotVerify`, `applyOverlayLines`) produces a contiguous `1..N` with `unknown`
  entries for interior gaps. A one-line (block) comment notes it in `applyReplaceAllToBelief`; no guard
  code was added, per the plan, to avoid dead defensive code.
- **Single split/join pass per run** (`splicedRunText`'s existing `split(old).join(new)`) is safe even when
  `new_string` contains `old_string` (no runaway re-matching). Guarded by
  `test_replaceAll_replacesEveryOccurrenceWithinOneRunInOnePass`.

### Gate results (all GREEN, run from RevEng/)
- Item-9 unit file (`node tests/test-edit-splice.js`): **12 passed, 0 failed** (6 prior + 6 new).
- Full suite: **59 suites / 607 passed / 0 failed** (was 601; +6 new tests).
- detect-rewinds: **15 passed / 0 failed**.
- Probe A/B vs `develop-baseline` (frozen fixture `probe-fixture-20260615`): **identical: true** — the
  splice path is tracker-only (`api/edit-splice.js`'s sole caller is `api/apply-one-event.js`; the probe
  replays via `api/edit-replay.js` and never calls splice). **No re-baseline**; `develop-baseline`
  unchanged at `880b69d`.
- Sidecar e2e (`track-line-states.js` on `plate_summary.py`): `{"matchedObserved":247,"matchedPresumed":0,
  "mismatched":0,"neverObserved":0}`, **conflicts=233** — **UNCHANGED** from the prior 247/247, 233. The
  behavioral change (multi-run / gap-float `replaceAll`) is **dormant** on this fixture: its history has no
  `replaceAll` edit spanning multiple known runs or floating over an open gap that moves the final verdict.
  Because nothing moved, no delta needed user sign-off (plan's "If unchanged → done" path).
- Line counts: `api/edit-splice.js` **173 L**, `tests/test-edit-splice.js` **220 L** — both under the
  hook-enforced 250-line cap.

### Open questions
- None blocking. The located-run-with-gap float is now `floating:true`; if a future fixture surfaces a
  `plate_summary.py`-style file whose history *does* exercise multi-run/gap-float `replaceAll`, expect the
  sidecar verdict/conflicts to shift — that would be the intended correctness improvement, to be confirmed
  against the actual edits at that time (it did not occur here).
