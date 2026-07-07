## 2026-06-25:00:20:00 — Implement Scenario s45 (`s45-rewind-abandoned-branch`)
Chat title: impl-scenario 45
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/8e70df05-b655-4df8-9239-0e1ec445c74b.jsonl

### References
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s45/plan-s45-rewind-abandoned-branch.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s45/handoff-api-from-scenarios-20260625-0009.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s45-rewind-abandoned-branch/6bdd9f73-5ab9-4c7c-bb41-5fdf9da5a09a.jsonl
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/src/reconstruction_beacons.ts

### Design decisions
- s45 is a real engine gap (NOT char-lock). Surviving `calc.py` final revision was a spurious
  `add+multiply+multiply` (40 lines) instead of `add+multiply` (27 lines).

### Deviations
- THE PLAN'S LEADING ROOT-CAUSE HYPOTHESIS WAS WRONG. The plan/handoff blamed the stale-edit-base
  reseed (`seedStaleEditBases` in `reconstruction_reseed.ts`). A stage-by-stage trace of
  `reconstructFileOver` for the surviving lineage shows the spurious revision is inserted by
  `completeElidedBeacons` (the s28 elided-beacon stage in `reconstruction_beacons.ts`), NOT by
  `seedStaleEditBases`.
  - calc.py backup timeline: v2 `add`(15L)@02:07:06 · v3 `add+subtract`(28L)@02:07:17 ·
    v4 `add`(15L,restore)@02:07:38 · v5 `add+multiply`(28L)@02:07:54.
  - Surviving lineage: B write `add`@02:06:53 · E user-edit 8-line echo@02:07:35 · F edit(multiply)@02:07:50.
  - `completeElidedBeacons` treats the 8-line rewind-restore echo E as an ELIDED beacon (its snippet
    starts past line 1 → `beaconIsElided` true), then scans backups for the LATEST whose numbered
    content matches the visible `add`-tail window. Because `add` is unchanged across v2/v4/v5, ALL
    three match the window, so it picks v5 (`add+multiply`, taken AFTER F). Splicing v5 before F makes
    F's `multiply` hunk append a SECOND `multiply` → the 40-line duplicate.
- FIX (smallest general change): bound the elided-beacon candidate backups to those taken AT OR
  BEFORE the NEXT lineage event's timestamp. A beacon's completed content can never be newer than the
  next thing that happened to the file, so a future edit's backup (v5) is excluded; v4 (the restore,
  the latest matching backup at/before F) is chosen. Terminal beacons (s28's case) have no next event
  → unbounded → behavior unchanged. No scenario/branch/filename special-casing.

### Tradeoffs
- Considered (a) picking the EARLIEST matching backup, and (b) bounding by the beacon's OWN timestamp.
  (a) risks selecting a pre-script backup in s28 if it coincidentally matches the window; (b) risks
  excluding the legitimate post-script backup in s28 (it can land a few ms after the beacon, the m6
  timing note). Bounding by the NEXT event's timestamp avoids both and is the minimal generalization.

### Open questions
- None blocking. The fix is reader-gated (completeElidedBeacons only runs with a reader) so reader-free
  reconstruction is byte-for-byte untouched; the full suite is the regression gate.
