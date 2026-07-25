## 2026-07-25:03:15:00 — Tasks 223 / 224 / 184 / 203 / 207 / 187 batch
Chat title: tackle-tasks 223 184 224 203 207 187 valid
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/28efdd4c-0b36-443f-bf31-e9a7798ad87f.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/224-mid-window-seed-monotonic.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-per-file-target.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-per-file-sweep-results.jsonl
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-per-file-sweep-table.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/from-scratch-SPEC.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-task-183-202-188-186-83.md

### Design decisions

**Task 223 — where the gate is set.** `--no-pre-baseline` is applied inside
`applyCliPathOverrides`, and it is set UNCONDITIONALLY (`setPreBaselineReconstructionAllowed(options.preBaseline)`)
rather than only when the flag is present. The gate is module state shared with
the viewer, so an in-process CLI run — the sweep harness drives `runCli`
repeatedly in one process — must never inherit a previous run's answer. A test
pins exactly that: decline, then run again without the flag, and the gate is back
to `true`.

**Task 224 — a two-sided clamp, not a global sort.** `replayEvents`
(`reconstruction_replay.ts:214`) is a positional fold that never sorts, and the
per-file pipeline's only sort runs in `extractFileEvents`, BEFORE the stage
chain. Four later stages insert events by adjacency rather than by clock. Sorting
the event list before replay would be the obvious general fix, but it would
change the output of every one of the 85+ character-locked ground-truth
scenarios, and this batch was explicitly instructed not to run the test suite —
so the blast radius could not be measured.

The two-sided clamp is safe by CONSTRUCTION instead of by measurement: whenever
the seed already sits at-or-after the previous event — true of every ladder that
is monotonic today — `Math.max` returns the seed's own timestamp and the function
returns the identical object. Only a seed that would move the ladder backwards is
touched.

**Task 224 — where the clamp lives.** `reconstruction_reseed.ts` was at 244 of
the 250-line cap, so it could not grow. `reconstruction_sidecar.ts` (164 lines)
is already the home of `backupSeedWriteFor`, the function that applies the stamp
being repaired, so the clamp went there, beside its cause. `seedBeforeEdit` was
deleted from `reconstruction_reseed.ts` (single caller), so that file got
SHORTER: 244 → 233. `reconstruction_sidecar.ts` went 164 → 186.

The clamp takes `Date` values rather than `FileEvent`s so `reconstruction_sidecar.ts`
needs no new type import.

**Task 187 — `diskMatched` reinterpreted as a one-way oracle.** The raw sweep
reported 46 of 68 files failing the endpoint check, which reads as a catastrophic
engine result. It is not. Content-hashing all 11,748 file-history snapshots shows
22 of 22 passes are present in the archive but only 11 of 46 misses are — for 35
files no engine could ever satisfy the check, because the current bytes were
never recorded. `diskMatched=true` is evidence; `diskMatched=false` alone is
uninterpretable. That conclusion is recorded in the plan doc as a finding, and it
is the reason the real defect list is 10 files rather than 46.

### Deviations

**Plan said create `tests/reconstruction_sidecar.test.ts`; it already existed.**
The file was present (188 lines) and appending the five clamp tests pushed it to
255, over the 250-line cap. The clamp tests therefore live in a sibling file,
`tests/reconstruction_sidecar_clamp.test.ts` (74 lines). The plan's Step 1 is
otherwise unchanged — same five tests, same names.

**Task 224's duplicate-revision half was NOT implemented, because task 223 fixed
it.** The reported defect had two artifacts. Reproduction showed
`--no-pre-baseline` removes both the `@v2` and `@v1` duplications outright (20
revisions → 10) and prunes the window as intended (66 s → 39 s, ladder now
starting exactly at the seed instant). Only the non-monotonicity survived, and
that is what the clamp addresses. The task text explicitly asked for this to be
verified rather than assumed; it was, with four captured runs.

**Task 184's "manual check against the real claude-data sources" was satisfied
without a browser.** The requirement implied a viewer session plus a long
reconstruction. Instead the real ladders already captured for task 224
(`control.json`, 18 revisions; `iter2b.json`, 10) were fed through the actual
`renderDebugLadder` into the same happy-dom bootstrap the tests use. All four
assertions passed on both, and real data exercised an `overwrite` kind and full
40-char seed SHAs that the synthetic fixture never produced.

**Task 203 did not reuse `resolveFinalPath`.** It returns only the last path, so
it cannot produce the ordered entity chain `lineageOf` must return, and it would
infinite-loop on a recorded `mv a b; mv b a` cycle. `layered_lineage.ts` walks
the edges directly with a shared seen-set. The engine's version was left
untouched and the cycle defect filed as task 225.

**Task 207 implemented only the offsets-and-lanes half of spec S8.** S8's prose
also calls for dashed cross-lane corroboration lines, but task 207's own text
stops at widget offsets plus per-session lanes; the corroboration lines belong to
task 208, whose input is `MergedNode.corroboratedBy`.

### Tradeoffs

**Clamp at one proven site vs. all three backup stampers.** `backupAfterWriteFor`
and `backupWritesFor` apply the identical `timestamp: <backupTime>` pattern and
therefore share this defect CLASS. Fixing all three at once is the textbook
root-cause move. It was rejected here: `completeElidedBeacons` and
`completeTruncatedBeacon` are load-bearing for many character-locked scenarios
(S27, S28, S30 among others) and already carry their own retiming logic —
`completeElidedBeacons` re-times the BEACON backward when its seed precedes it.
Extending the clamp there without a reproducer, and without permission to run the
suite, risks breaking locked ground truths to fix a defect nobody has observed.
Filed as task 229, gated on producing a reproducing scenario first.

**Clamping UP to equal the previous timestamp, rather than to previous + 1 ms.**
Equal timestamps keep the sequence non-decreasing, which is all the ladder
requires, and avoid inventing an instant that no evidence supports. The engine's
own ordering is positional, so ties are resolved by array order, which is already
correct at the insertion point.

**When no valid slot exists** (the previous event is already at/after the edit,
meaning the array was non-monotonic BEFORE this seed) the clamp keeps the seed
just before its edit. The "a seed precedes the edit it seeds" invariant is
load-bearing — `lastRevisionAtOrBefore` would otherwise resolve both steps to the
edited revision — so it wins over monotonicity in a case the clamp cannot repair
anyway.

### Open questions

1. **Should the clamp be extended to the two sibling stampers now, or wait for a
   reproducer?** Task 229 currently says wait. If you would rather take the
   blast-radius risk and fix the whole class at once, say so — the helper is
   already shared, so it is a two-line change per site plus a full-suite run.

2. **`renderRevisionText` unconditionally appends a trailing newline**
   (`linesTextOf(rev).join("\n") + "\n"`), so any file whose real bytes lack one
   can never blob-match. Exactly 2 of the 68 baseline blobs lack a trailing
   newline and they are exactly the 2 baseline-blob misses; it also corrupts 3
   files on the disk side. Filed as task 226. Fixing it means the engine must
   carry a "final line had no newline" bit, which touches the LineEntry
   vocabulary — confirm you want that before it is designed.

3. **`tests/layered-app.test.ts` is now at 248 of 250 lines.** The next task
   touching the layered webapp has to split it first. Flagging so it is not a
   surprise.

4. **The 9 long-ladder M-file gaps** (task 228) have their current bytes present
   in the archive but unreached by reconstruction — `README.md` at 58 revisions
   is the largest. Should these be attacked per-file with the task-188 iterative
   re-seed loop (now that 223 makes it actually cut the window), or triaged for a
   common mechanism first? The loop is only worth running where a single pass
   stalls, and that has not been established for these nine.
