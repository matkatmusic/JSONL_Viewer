## 2026-06-25:02:45:00 — Per-step reconstruction output + `.step_states` verification

Chat title: per-step-output (plan slug: support-for-checking-per-step-effervescent-biscuit)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/ (session 01Eo8gP78edzRZfxMXMfd4of)

### References
- /Users/matkatmusicllc/.claude/plans/support-for-checking-per-step-effervescent-biscuit.md  (the plan)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s19-user-edit-conv-rewind/  (re-run scenario dir: new JSONL `1d516db7-…` + `.step_states/`)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/tests/fixtures.ts  (S19_JSONL constant)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/src/parse/loadTranscript.ts  (parser allow-set)

### Design decisions
- **Step boundary = `file-history-snapshot` record.** The new s19 transcript has exactly 9 such
  records, matching the 9 `.step_states/step-001..009` folders. `countSteps` = number of these records.
- **Per-step disk state = unfiltered chronological reconstruction.** Call `reconstructFilesOver(records, reader)`
  WITHOUT `selectLiveBranch` — the branch-agnostic core reconstructs over exactly the records given,
  reusing the full pipeline (copy seed, redirect fill, backup edit-base seed, beacon completion, reseed,
  truncated-beacon). Then snapshot each file via the existing `lastRevisionAtOrBefore(revisions, when)`.
  This is literal disk state (keeps the abandoned-branch `subtract` after the conv-rewind), which is what
  `.step_states` holds — NOT the surviving-branch view.
- **Reuse existing private helpers** `lastRevisionAtOrBefore` and `linesTextOf` from
  `reconstruction_branches.ts` by exporting them (they are exactly the at-or-before selector and the
  "latest text per line" extractor the feature needs). No duplication.

### Deviations (from the original plan — caused by the s19 re-run the user performed for this task)
The plan assumed `S19_JSONL` was usable as-is. It is not. The re-run changed three things:
1. **Stale fixture pointer.** `S19_JSONL` points at `6fc31802-…jsonl`, which no longer exists. The only
   transcript present (and the one `.step_states`/`jsonl_path.txt` reference) is `1d516db7-…jsonl`.
   → Update `S19_JSONL` to the new transcript path.
2. **Parser gap (S32-class).** The new transcript's assistant records carry two unmodeled keys —
   `attributionPlugin` and `attributionSkill` (same `attribution*` family as the already-allowed
   `attributionMcpServer`/`attributionMcpTool`). `loadTranscript` throws `UnmodeledFieldError` until they
   are added to the assistant allow-set. → One-line fix in `loadTranscript.ts`.
3. **Existing s19 tests are already RED.** `reconstruction_engine_s19.test.ts` (4 tests) and
   `reconstruction_cli_s19.test.ts` (5 tests) load `S19_JSONL` and so currently fail on the missing file.
   They are reader-dependent and hardcode the OLD run's values: backup blobs `928642d7d0c1c258@v2/v3`,
   short uuids `66840964` (surviving tip), `7087c57e` (rewound tip), `b1368b53` (rewind point).
   The new run's equivalents: backups `ab41eebc66612a24@v2/v3/v4` + `a48dcdc2d9955ada@v2` (present on disk
   under `~/.claude/file-history/1d516db7-…/`), and new uuids TBD. → Re-characterize these 9 tests against
   the new transcript so the suite returns to green. The scenario is logically identical (same
   instructions per the manifests), so only identifiers/backup-names change, not the engine behavior.

### Tradeoffs
- Re-characterizing the existing reader-dependent s19 tests: prefer switching them to the REAL sidecar
  reader (the new backups exist on disk) over hand-maintaining a hardcoded blob map, if that is the
  smaller/cleaner diff. Will confirm during implementation.
- Could have scoped narrowly (new fixture constant for the feature test only, leave existing s19 tests
  broken). Rejected: the re-run breakage is the root cause and leaving a fixture pointing at a deleted
  file is debt; the green-suite verification gate requires fixing it anyway.

### Open questions
- RESOLVED (parser/fixture/re-characterization): done, suite-local s19 green (9/9). New run interleaves
  add → multiply → tweak → subtract; tip #25984a67, rewound #db319f45, rewind @ #eb95ed14.

- **BLOCKING — step definition (spike result overturns the plan's mechanism).** The plan anchored steps
  to `file-history-snapshot` records. The spike (2026-06-25 ~02:55) shows that is WRONG:
  - The 9 snapshot records are Claude Code's INTERNAL pre-edit backup checkpoints, not scenario-step
    boundaries. The count matching 9 is coincidental. Their `.timestamp` lives in `.snapshot.timestamp`
    (not the envelope), and reconstructing at those times misses step-001's `add`-only state (snapshot
    @09:11:05 predates the write @09:11:12) and yields duplicates.
  - The UNFILTERED chronological reconstruction (`reconstructFilesOver(records, reader)`, no
    `selectLiveBranch`) of scenario19.py is 4 revisions — add / add+tweak / add+tweak+subtract /
    add+multiply+tweak+subtract — which EXACTLY equal the 4 DISTINCT disk states in `.step_states`.
  - `.step_states` has 9 instruction steps, but only 4 change code; the other 5 (Looks good, rewind,
    Thanks, exit, record) are no-ops repeating the prior disk state. The JSONL alone cannot distinguish a
    no-op instruction as its own numbered step, so JSONL-derived 1:1 numbering with step-001..009 is not
    achievable without consulting the scenario's own manifests (circular).
  → Asked the user to choose: (A) step = each chronological code change [recommended; JSONL-only, robust;
    diff verifies every `.step_states` state is reproduced in order, collapsing no-op repeats], or
    (B) reproduce the literal 9 numbered steps by reading `.step_states` manifests for boundaries
    [matches 1:1 but only works where `.step_states` exists and is partly circular].
  → RESOLVED: user chose (A). User also asked whether to change the capture tool to snapshot only on code
    changes; my recommendation (no — keep per-instruction capture as useful provenance; collapse/membership
    in the diff; changing it forces re-running every scenario). Left as the user's call; not blocking.

### Final implementation (Option A) — COMPLETE
- New module `src/reconstruction_steps.ts`: `RepoSnapshot` (= ReadonlyMap<Path,string>), `reconstructStepStates`
  (unfiltered `reconstructFilesOver` → one repo snapshot per distinct change-timestamp), `countStepsInTranscript`,
  `renderRepoSnapshot`. Exported `lastRevisionAtOrBefore` + `linesTextOf` from `reconstruction_branches.ts` (reuse).
- A "step" = each chronological disk mutation (FileRevision boundary across all files); s19 = 5 steps
  (scenario write, test write, user tweak, subtract edit, multiply edit). The engine is FINER than the
  capture tool — step 1 captures the sub-second window where scenario19.py exists but the test file does not.
- CLI (`src/reconstruction_cli.ts`): `--count-steps` (prints the integer) and `--step <n>` (1-based; prints the
  full-repo snapshot, each file under `### <path>`). Both short-circuit before the graph/branch dispatch; an
  out-of-range `--step` throws the usage message with the valid range.
- Verification test `tests/reconstruction_cli_s19_steps.test.ts` (7 tests): count==5; first step has scenario
  only; EVERY `.step_states/step-001..009` content is reproduced by some engine step (the ground-truth diff);
  final step byte-matches step-009; the two CLI flags. `.step_states` read from the absolute Desktop path.
- Parser/fixture/re-characterization (re-run fallout): `attributionPlugin`/`attributionSkill` added to the
  assistant allow-set (+1 parse test); `S19_JSONL` → `1d516db7-…`; the 4 engine + 5 CLI s19 tests
  re-characterized to the new run (real sidecar reader; new ids/content).
- Results: `npm test` 567 pass / 0 fail (was 559); `npx tsc --noEmit` clean. Manual smoke confirms
  `--count-steps`=5, `--step 1`=scenario `add` only, `--step 5`=final add+multiply+tweak+subtract + test.
- NOT committed (left in the working tree, per the project's pipeline convention; commit on request).

### 2026-06-25 — repoint to in-worktree re-run (capture tool now code-changes-only)
- User re-ran s19 again; executed data now lives IN-WORKTREE at
  `scenarios/executed/s19-user-edit-conv-rewind/` (transcript `d8a5cf41-…`, session d8a5cf41), the durable
  tracked location (matches the s39 `S39_GT` convention). The Desktop `1d516db7` run was ephemeral.
- The capture tool now snapshots ONLY on code changes: `.step_states` has 4 folders, keeping the original
  instruction numbers — step-001 (write), step-002 (tweak), step-003 (subtract), step-006 (multiply).
- Manual + automated per-step validation against the new data PASSES: countSteps=5; every code-change
  folder reproduced (001↔engine step2, 002↔3, 003↔4, 006↔5); engine step1 is the finer scenario-only
  intermediate (no `.step_states` counterpart, as designed).
- Repointed: `S19_JSONL` → in-worktree `d8a5cf41`; per-step test `S19_STEP_STATES_DIR` → in-worktree
  `.step_states`, now iterating the captured folders via `capturedStepNumbers()` (robust to which steps the
  runner captures) and byte-locking the final step against the last code-change folder (step-006).
- Re-characterized the 9 existing s19 engine/CLI tests to the new run's ids (content/layout unchanged):
  surviving #620ef9f7, rewound #66a6d627, rewind #e4196ca9; DAG B #0124J6Ks / C #0198ALMJ / D #144e50a3 /
  E #01HkQWUL / F #01R21Md2. Parse test record count 101 → 103.
- Results: `npm test` 567 pass / 0 fail; `npx tsc --noEmit` clean. Still NOT committed; the in-worktree
  `scenarios/executed/s19-…` data is untracked.

### Open questions
- None. Per-step validation works correctly against the in-worktree re-run.
