## 2026-07-25:00:45:00 — Tasks 183 / 202 / 186 / 188 / 83
Chat title: task 183 202 188 186 83
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/3be7aade-fd71-4473-b7f9-a9f8aa61f3b1.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/202-186-188-batch.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-per-file-target.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/SPEC.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/from-scratch-SPEC.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md

### Design decisions

- **Task 202 — end states dedupe, gaps re-derive.** The spec says "merge the
  per-session timelines"; it does not say what happens to the two node classes
  task 199 synthesizes per session. Decision: both are re-derived at merged
  level rather than carried over. The on-disk end state collapses to ONE node
  (one file, one disk) and presumption gaps are recomputed against the merged
  neighbours — a gap session A could not explain may be explained by session
  B's beacon sitting between A's two states, so carrying A's gap forward would
  assert an unexplained diff that the merge just explained.
- **Task 202 — nodes owned by no session.** `MergedNode.sessionFile` is
  `Path | undefined`; undefined means "belongs to no session lane" (the end
  state and merged-level gaps). Spec S8 needs that distinction to know which
  lane to draw a node in.
- **Task 202 — corroboration needs two DISTINCT sessions.** One session
  observing the same bytes twice corroborates nothing (that is the spec's
  "single-session degenerate case"). A content group with ≥2 distinct sessions
  marks each of its nodes with the group's other sessions; a node owned by no
  session (the end state) subtracts nothing and so lists every observer.
- **Task 186 — one process, one records array, N targets.** The attempt-4
  evidence in the S8 doc shows the expensive machinery memoizes per
  records-ARRAY identity. The harness therefore loads the 156 transcripts once
  and loops targets over that array instead of spawning the CLI per file. The
  measured shape backs it: the first two M candidates cost 802 s TOTAL,
  dominated by the shared warm-up.
- **Task 186 — "baseline blob present" means present ANYWHERE in the ladder.**
  First implementation checked revision 0 only; the real-data smoke run showed
  `.claude-plugin/marketplace.json` and `plugin.json` failing that check with a
  correct final state. The git seed lands by its committer instant, so a file
  whose recorded history starts before the baseline commit carries the seed
  mid-ladder. Spec S11's wording is "baseline blob present", so the check now
  scans every revision. A `seconds` column was added at the same time so the
  68-file task-187 run has a measurable ETA.
- **Task 188 — a control run was added to the plan's five steps.** Comparing
  iteration 1 (`--nth 5`) against iteration 2 (`--nth 10`, re-seeded) cannot
  separate "re-seeding recovered more" from "the wider bound recovered more".
  A third run at `--nth 10` against the ORIGINAL baseline isolates it — and it
  changed the conclusion (see Deviations).

### Deviations

- **Task 188's headline result is a qualified pass, not the expected one.** The
  loop's mechanics work end-to-end (mid-stream commit accepted as a seed;
  iteration 2 emitted 13 revisions iteration 1 did not), but the control run
  recovered the same 18 revisions and the byte-identical final content from the
  original baseline. Re-seeding added no history for `plate_cli.py`. Two
  defects surfaced instead and are filed rather than papered over: the CLI never
  prunes pre-baseline records so the window does not move (**task 223**), and a
  mid-window seed emits a non-monotonic ladder with a duplicated snapshot
  revision (**task 224**). Task 189 is now blocked on both.
- **`makeJsonlAxisPlacement` stayed private.** The plan said to export both it
  and `sortNodesOntoAxis` from `layered_instants.ts`; only the sort helper has
  a second caller, so only it is exported.
- **The plan's 20-minute fallback to an s39 fixture was not needed.** Bounded
  real-data runs were 12 s / 48 s / 49 s.
- **Task 186's pure half lives in `src/`, not in the script.** The plan
  allowed either; splitting keeps both files far from the 250-line cap and lets
  the report logic be unit-tested without touching the engine.

### Tradeoffs

- **Merged gaps recomputed vs carried over.** Recomputing costs one extra pass
  over the merged node list and reuses task 199's
  `insertPresumedUserEditGaps` verbatim; carrying over would have been free but
  would report gaps the merge itself closes. Correctness won.
- **Sweep resumability is a JSONL append, not a database.** One line per
  candidate, re-read on start, already-logged candidates skipped. Enough for a
  68-file run that may be killed; nothing more was built.
- **Baseline-blob check spawns `git hash-object` per revision** (short-circuited
  by `.some`). An in-process SHA-1 would avoid ~30 spawns per file, but the
  spawn form is exactly what task 182's verified check used, and the sweep's
  cost is dominated by reconstruction, not hashing.
- **The 68-file sweep was NOT run** — that is task 187, and at the measured
  rate it is a long unattended run. The harness was validated on a 2–3 file
  slice of the real sources instead.

### Open questions

1. **Task 224 vs task 223 — one fix or two?** The non-monotonic ladder and the
   duplicated `@v2` snapshot may both disappear once pre-seed records are
   dropped (task 223). Worth confirming before designing a separate placement
   fix.
2. **Is the iterative loop still the right S12 strategy?** The evidence says a
   single bounded pass recovers the same history as a re-seeded one for a file
   the engine handles well. If tasks 223/224 do not change that, the loop's
   value rests entirely on files where a pass stalls — none observed yet.
3. **`npm run typecheck` is red on `develop` before this batch.** ~20
   `TS2532/TS18048` errors in `tests/layered_load.test.ts`, all pre-existing at
   HEAD (verified by stashing this batch's work). Not touched here; worth its
   own task if it should stay green.
