## 2026-06-24:23:45:00 — Scenario s44 (`s44-git-baseline-then-rename`) CHAR-LOCK regression test
Chat title: impl-scenario 44
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/60199014-1ae0-4fb0-8b74-2ffacbb82161.jsonl

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s44/handoff-api-from-scenarios-20260624-2340.md
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s44/plan-s44-git-baseline-then-rename.md
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/script-handling.txt
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/tests/reconstruction_cli_s43.test.ts (clone source)
- s44 reconstruction-input JSONL: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s44-git-baseline-then-rename/56f60db2-0bf0-4685-99dd-ef8f65685245.jsonl

### Design decisions
- CHAR-LOCK only, NO `src/` change — engine already reconstructs s44 byte-for-byte (confirmed by live probe).
- Cloned the s43 test helpers verbatim (`fileVerboseBlock`, `finalRevisionSlice`, `revisionSlice`,
  `stripLineNumberPrefixes`, `stripTrailingNewline`) — they already handle the EOF/no-trailing-separator and
  trailing-newline gotchas.
- Assertions derived from LIVE `runCli` output (captured before writing the test), not from plan prose.

### Deviations
- **Plan/handoff claim that rev0 carries `low_stock` is WRONG for s44.** `low_stock` appears NOWHERE — not on
  disk, not in any reconstructed revision (verified by grep over both the on-disk `inventory.py` and the full
  `--verbose` output). The claim is a copy-paste from the s43 notes. The s44 test asserts the actual rev0
  function set: `check_quantity, insert_item, remove_item, find_item, tot_value` (5 funcs, post-rename names),
  and does NOT assert `low_stock`.
- **`restock` IS present in s44** (rev1 onward; on-disk line 160) — unlike s43, where `restock` was added after
  the backup point and appears nowhere. s44's mid-stream `inventory.py` ladder is 4 edits
  (D restock / E reorder / F `# reviewed by ops` user-edit / G shrink), so the test asserts restock PRESENT in
  the tip rather than absent.
- s44 reconstructs `rename_inv.py` (3-rev ladder, tip 38 lines) because `--excludeJSONL` fires before the rename
  script exists, leaving the full rename machinery in the mid-stream transcript. The byte-match on `rename_inv.py`
  is the new assertion vs s43 (which has no mid-stream `rename_inv.py`).

### Tradeoffs
- Wrote 6 test cases (mirroring s43's 5 + the new `rename_inv.py` byte-match) rather than the minimal 3 named in
  the handoff. The fuller mirror keeps the s39+ pipeline's per-scenario coverage consistent (default DAG,
  list-branches, graphFile, two verbose byte-matches, absent-file) at negligible cost.

### Open questions
- None. Live probe matches the engine output exactly; no `src/` change required.

### Result
- 6 test cases (C1–C6), all green. Full suite: **552/552** (s43 left it at 546; s44 added 6). No `src/` change.
- C6 fix vs the s43 clone: s43 asserted the bare substring `test_inventory.py` absent from `--verbose`. That is
  WRONG for s44 because `rename_inv.py` IS reconstructed here and its docstring literally reads
  "…renames to inventory.py and tests/test_inventory.py". C6 now asserts no `### …test_inventory.py` SECTION
  header instead of a whole-output substring check.

### Live probe facts (s44, post-s43 engine)
- conversationDAG: A prompt #9e222129 → B write rename_inv.py #01P7yUwh, C user-edit rename_inv.py #37df4213,
  D edit inventory.py #012m36TL, E edit inventory.py #01V7qRzW, F user-edit inventory.py #7b942a81,
  G edit inventory.py #01XWh7Ph.
- list-branches: `surviving  tip #974a065f    rename_inv.py, inventory.py` (no rewound branch).
- rename_inv.py revs: 0 (36) / 1 (16) / 2 (38, tip) — tip byte-matches on-disk rename_inv.py.
- inventory.py revs: 0 (175) / 1 (206) / 2 (241) / 3 (242) / 4 (264, tip) — tip byte-matches on-disk inventory.py.
- tests/test_inventory.py: NOT reconstructed (no mid-stream event).
