## 2026-07-21:10:15:00 — Tasks 150, 149, 151, 152 (bogus redirect targets, Phase-4 progress, pre-baseline script skip, re-ask control)
Chat title: tackle-tasks 149 150 151 152
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/0648d80a-68b8-43db-8d46-6513fc8589c7.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-149-152-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-task56-pre-baseline-question.md

### Design decisions

- Task 150 root cause pinned before fixing: `bashOverwriteRedirect`'s `(?<!>)>\s*(?!&)(\S+)\s*$` matches the `>` inside a JS arrow (`=>`), so `node -e "…map(x => x.taskNumber).join(','))"` minted `x.taskNumber).join(','))"` as an overwrite target. Fixed at `parseRedirect` (the single choke point both `bashEventsFrom` and `reconstruction_parse_lines.ts` route through) with a deny-list validator (`checkCandidateLooksLikePath`, chars `"'`()<>{}$;,|`), not a regex change — the value-level check also covers shrapnel other command shapes could admit.
- Task 149: no timer heartbeat — the engine is synchronous on one thread, so no interval can fire mid-build. Instead, one label emission inside `runStageTolerantly` covers all nine per-target chain stages (including nested lineage/copy re-entries, which are exactly the silent grind), and `collectAcceptedUserEditIds` announces each branch pass (`reconstructing accepted user edits — branch k/n`). All new labels keep the `reconstructing ` substring so the webapp's `classifyLoadPhase` keeps them in phase 4. Deliberately did NOT label the `executionsByRun` cache-hit path — hits are microseconds and would flood the stream.
- Task 151: the skip lives in `executeRunOnce` (the one choke point every script-execution consumer routes through), mirroring the item-68 read-only gate: a run whose timestamp is at-or-before the declined baseline's commit timestamp returns a `post: undefined` execution under a new `PROGRESS_LABEL_PRE_BASELINE_SKIP_PREFIX` label. The at-or-before boundary matches `seedBaseCommitBeacon`'s insertion rule (events strictly after the beacon survive). The cutoff (`computeSkippedBaselineCutoff` + `checkTimestampPrecedesSkippedBaseline`) lives in `reconstruction_base_commit.ts` beside the flag, memoized per repo|commit pair.
- Task 151 also fixes a latent cache bug: `DerivedCaches` was stamped with reader + exec-gate only, yet `historiesByTarget` already depended on the pre-baseline flag (the task-56 beacon trim). The group now stamps `preBaselineAllowed` and rebuilds on a flip — a "No" build's histories/executions can no longer serve a "Yes" rebuild of the same records array.
- Task 152: the re-ask button lives in the timeline filter bar (`timeline-render-filterbar.ts`) — rebuilt per render with `context.project` in hand — and only shows when an answer is stored. It must clear BOTH the `baseline:<project>` sessionStorage key AND the project's `documentCache` entries (`dropProjectDocuments`), because `fetchDocument`'s cache key does not include the choice; a cache hit would answer from memory and the question would never reach the wire.

### Deviations

- The plan's `tests/reconstruction_renderable.test.ts` was not created as a separate file for the branch-pass test — `tests/reconstruction_branches.test.ts` already imports and exercises `collectAcceptedUserEditIds`, so both task-149 tests live there.
- The plan's `checkRunPrecedesSkippedBaseline` in `reconstruction_script_runs.ts` became `checkTimestampPrecedesSkippedBaseline(timestamp: Date)` in `reconstruction_base_commit.ts` — the 250-line cap on `reconstruction_script_runs.ts` forced the move, and taking a `Date` avoids importing the `ScriptRun` type across modules.
- The branch-pass test asserts `branch 1/\d+` rather than the plan's `branch 1/1` — S15 enumerates more than one branch.
- NOT in the plan: `webapp/app-choices.ts` is a new module. Adding `clearBaselineChoice`/`dropProjectDocuments` pushed `app-fetch.ts` to 261 lines (cap 250), so the whole consent/baseline-choice + boot-id-sweep block moved there (split, never condense; no re-export shim — all seven webapp importers and two test files now import from the new canonical home). `dropProjectDocuments` stayed in `app-fetch.ts` beside the `documentCache` it operates on, avoiding a module cycle.
- Also NOT in the plan: dead commented-out corpus-migration blocks (item 14 remnants) were deleted from `reconstruction_branches.ts` and `reconstruction_script_runs.ts` to satisfy the 250-line cap after the new labels/gate landed. The item-14 corpus move is long committed and confirmed, meeting the "delete only after confirmed working" bar; the one-line `// corpus: moved to …` pointers remain.

### Tradeoffs

- Deny-list vs. path grammar for redirect targets: a deny-list is one line per bad character and cannot over-reject the plain/absolute paths every scenario uses; a whitelist grammar risks rejecting odd-but-real paths. Ceiling marked with a `ponytail:` comment.
- Per-stage labels add ~9 emissions per target (~4k lines for 451 targets) to the NDJSON stream — accepted: existing builds already stream per-run sandbox labels at similar volume, and the visibility is the entire point of task 149.
- Task 151 skips ALL pre-baseline runs when declined, including runs whose outputs might survive untouched past the baseline — acceptable because the "No" answer explicitly declines pre-baseline reconstruction and the baseline commit supplies the ground-truth content.

### Open questions

- Task 149's original report described a 500+ second stall; the expectation is that task 150's garbage-target fix removes most of it and the new labels make the rest visible. Worth re-loading the real RevEng project (451 targets) to confirm the stall shrinks — not done here since suites/app runs were left to you.
- The "Re-ask baseline" button label ("Re-ask baseline") and its filterbar placement are my choice; say the word if you want it in the Paths popover next to the task-137 repo/commit picker instead.
