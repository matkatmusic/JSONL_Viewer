## 2026-06-17:21:00:00 — Item 18: first-class user-edit tracking via `userModified`
Chat title: implement RevEng item 18 — userModified user-edit tracking
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/f8b14079-9f8d-4f43-b6b0-c9ea746233c8.jsonl

### References
- Authoritative plan: /Users/matkatmusicllc/.claude/plans/ticklish-finding-anchor.md
- Going-in handoff (item 18 PLANNED): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-2050.md
- Item-17-DONE handoff (verify cmds): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-2010.md
- Roadmap (item 18 brief lines 244-283): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/roadmap-100-percent-reconstruction.md
- Item-11 precedent (diagnostic template): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-item11-floating-conflict-record.md

### Going-in gate state (measured 2026-06-17 ~20:56)
- Full suite: 69 suites / 690 passed / 0 failed (CONFIRMED, matches plan).
- develop-baseline: a8947fc (item-15 re-baseline). UNCHANGED expected (tracker-only).

### Design decisions
- Two forks decided WITH THE USER during planning (not re-litigated):
  1. Tracker behavior = option (b) record + conservative drift: emit a diagnostic conflict
     record AND `eofConfirmed = false` (un-prove EOF). NOT roadmap default (a) record-only.
  2. Emission scope = ALL edit kinds (Edit AND create/update/Write), gated on the FLAG
     `edit.userModified === true`, NOT on `type === 'edit'` (unlike originalFile).
- Ordering is load-bearing: authored-edit, originalFile, and userModified events all share
  `jsonlLine = edit.line + 1`. compareEvents tie-breaks by kindRank: originalFile(0) →
  edit(1) → userModified(2, the fallthrough). userModified MUST stay the rank-2 fallthrough
  (NO kindRank case) so the drift lands on POST-edit belief.

### Deviations
- **T6 tracker tests went into a NEW sibling file** `tests/test-track-line-states-usermodified.js`
  (89 L), NOT `tests/test-track-line-states-verdict.js` as the plan said. Reason: appending the 3
  tests to the verdict file pushed it to 253 > 250 cap, AND writing them in 2-space tipped that
  file's detected indent-unit to 2, which retroactively tripped the 2-space-unit deep-nesting hook
  on the PRE-EXISTING item-11/item-12 4-space fixture arrays (lines 82-90, 118-127, 153-157). A new
  all-4-space sibling file is detected as unit-4, so its fixture arrays sit at depth 2 (hook-safe),
  and both files stay ≤250. This is the codebase's established split pattern (item 8 used a sibling
  test file for the same cap reason). The verdict file was reverted to its original 177 L.
- **The T4 integration test in `test-file-events-extractors.js` is written 2-space** (with an
  `isUserModifiedEvent` helper to keep the filter shallow), not 4-space. That file is uniformly
  2-space (detected unit 2); a 4-space test body there put the fixture array at 8 spaces = depth 4
  and tripped the deep-nesting hook. The global-4-space rule yields to the hard hook + existing-file
  consistency. All NEW-FILE and source-island code stays 4-space (see below).
- `materializeUserModified` is written as a FLAT 4-space island (value-selection ternaries, no
  nested if-block) so the 8-space inner-return a nested block would create never appears (it sits
  inside the 2-space `line-state-evidence.js`, where the 2-space-unit hook would flag depth-4).

### Tradeoffs
- **`appendConflictRecords` generalized to a truthy-`kind` check** (`if (infos[c].kind)`), the plan's
  recommended option, vs. adding a second `=== 'userModified'` branch beside the existing
  `=== 'floatingOverKnownRegion'`. Chose truthy-kind: single-condition, DRY, behavior-preserving for
  item 11 (its floating infos still carry a `kind` → identical routing), and it accommodates any
  future kinded diagnostic without another branch. Per-line infos carry NO `kind` → still routed to
  the per-line `buildConflictRecord`.
- New-code indentation: whole new files are 4-space (`api/user-modified-events.js`,
  `tests/test-user-modified-events.js`, `tests/test-track-line-states-usermodified.js`); source
  additions inside existing 2-space files are 4-space FLAT ISLANDS (`materializeUserModified`,
  `buildUserModifiedConflictInfo`, `unproveEof`) per the item-11 precedent; tests added INTO existing
  2-space test files match 2-space (the deep-nesting hook forces it for fixture arrays).

### Gate results (all GREEN, measured 2026-06-17 ~21:10)
- Full suite: **71 suites / 705 passed / 0 failed** (was 69/690: +2 suites — the new emission +
  tracker sibling suites; +15 tests — T1 +3, T3 +8, T4 +1, T6 +3).
- detect-rewinds: **15 passed / 0 failed**.
- Sidecar e2e (`plate_summary.py`): **247/247 matchedObserved, 0 mismatched, conflicts=8** —
  UNCHANGED (the dormancy proof: `userModified:true` is absent from plate data).
- Probe A/B vs `develop-baseline` (`a8947fc`) on the frozen fixture: **`identical: true`** → NO
  re-baseline; `develop-baseline` UNCHANGED at `a8947fc`. (KIND_NAMES adds `userModified:null` to
  sidecar events only; the probe never serializes them.)
- Line caps (all ≤250): edit-stream-extraction 250, file-events-extractors 250, file-event-kinds 53,
  user-modified-events 52, line-state-evidence 243, line-belief 246, apply-one-event 166,
  track-line-states 185; tests test-track-line-states-verdict 177, test-track-line-states-usermodified 89.
- No golden ripple from T2: no existing test does deep-equal on a full event including all kinds, so
  the `userModified:null` field addition required zero golden fixes.

### Open questions
- Semantics UNCONFIRMED (pre-edit vs post-edit change). `userModified:true` is DORMANT
  (0x across frozen fixture + live ~/.claude/projects + plate). REOPEN TRIGGER: when the
  first real `userModified:true` record appears, check whether its `newString` matches the
  NEXT observation's `originalFile`/read to settle pre- vs post-edit timing BEFORE trusting
  the conservative drift on real data. Built with SYNTHETIC tests only.
