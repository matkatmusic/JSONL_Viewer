# Per-file reconstruction — candidate set + first target (task 180 / spec S8)

## Task 182 viability run — attempt 1 (2026-07-22, INCOMPLETE)

Invocation: all 156 top-level JSONLs from
`~/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jot/`
(292MB; the session-id subdirs hold only `tool-results/` sidecars, not
transcripts) + `--file /Users/matkatmusicllc/Programming/jot/common/scripts/plate/plate_cli.py
--repo ~/Programming/jot --base-commit 793e6524…
--fhsLoc ~/Programming/jot-recovery/claude-data/file-history --branch surviving --json`.

Findings:

- Load phase completed: all 156 transcripts loaded (strict parser accepted all
  real-data records — no unknown-record-type crash).
- Reconstruction phase ran **>24 minutes with zero output**, was killed by the
  user before emitting the ladder. No JSON was produced, so the 9d14d60d blob
  check and revision count are still unverified.
- Two CLI observability gaps surfaced (now task 191): per-transcript
  `Loading transcript from …` lines go to **stdout**, polluting the `--json`
  document; and the reconstruction stages emit nothing, making crunching
  indistinguishable from hung.

Task 182 is blocked on task 191 (per-stage logging) and stays open; rerun with
logging to determine whether the >24-min silence is progress or a blowup
(cf. the task-162 lineage-replay memo — a similar real-data blowup class).

## Task 182 viability run — attempt 2 (2026-07-23, KILLED — blowup CONFIRMED)

Rerun of the same invocation with task-191 `--progress` logging
(stderr → `/tmp/plate_cli_progress.log`, preserved at
`~/Programming/jot-recovery/run-evidence/plate_cli_progress-attempt2-2026-07-23.log.gz`
with a plain-text tail alongside). Killed by the user after ~1.5h;
`plate_cli_ladder.json` still 0 bytes.

Findings (now task 192, which blocks 182):

- The silence is a **blowup, not progress**: `executing script run` appeared
  12,101 times across only 122 distinct runs — the single run at
  `684c147c-375f-449f-8e32-3847c8cb94ab.jsonl:605` (2026-04-25T01:50:53.814Z,
  compound chmod+bash of `skills/todo/tests/hook-mktemp-pending-test.sh`)
  accounts for 11,980 sandbox executions.
- Target discovery stalled while executions doubled: distinct lineage targets
  42 → 156 → 165 across log quarters, executing-lines 64 → 6,006 → 6,031.
- Suspected mechanism: `executeRunOnce` memoizes on `timestamp|code` inside
  `getDerivedCaches(records, reader)` — keyed by records-ARRAY identity, which
  churns across per-branch passes and lineage replays, so the memo never
  serves across passes. See task 192 for the fix direction.
- The task-191 logging did its job: the `script stage: N runs` climb
  (43 → 2559+) reflects the replay cutoff advancing through ~3 months of
  session time — that pool size is real (thousands of `&&`-split bash runs
  across 156 sessions), not itself the pathology.

## Task 182 viability run — attempt 3 (2026-07-24, KILLED — residual blowup past task 192)

Same invocation as attempt 2, run twice on jfred@cdeef5b (task-192 fix committed):

- **Wrong-flag run (02:39–09:41, ~7h, killed)**: passed `--surviving` (boolean)
  instead of `--branch surviving` — the task-192 fast path gates on
  `options.branch === "surviving"` (`isTargetedSurvivingRequest`,
  `reconstruction_target.ts:70`), so the run fell into the all-branch
  `reconstructBranches` path: 1,568 lineage replays over 90 distinct files,
  script-stage highwater 957/3,992, target never reached. Operator error, not
  an engine finding — but a trap worth recording: **`--surviving` and
  `--branch surviving` select the same view at very different cost.**
- **Correct-flag run (09:42, killed after ~6 min once the rate was measured)**:
  fast path ENGAGED (no corpus-wide pass; work went straight to the target's
  dependency closure). Task-192 fixes held: only 11 sandbox executions (vs
  12,101 in attempt 2). But the run advanced the script-run pool at
  **~3 runs/minute** — 60 of 3,992 runs after 6 min, linear ETA ~22h, and the
  per-run cost GROWS: 291 nested lineage replays over 32 distinct script files
  (~9× re-replay each) by run 60. Progress log preserved at
  `~/Programming/jot-recovery/run-evidence/plate_cli_progress-attempt3-2026-07-24.log.gz`.

Mechanism (the residual blowup, distinct from tasks 162/192): even
target-scoped, `injectScriptExecutions` walks all 3,992 script runs, and each
run's sandbox precondition replays the lineage of every script file in the
closure **at that run's instant**. The task-162 memo cannot serve these — each
run needs content at a different cutoff (the never-widening-window rule), so
cost ≈ runs × closure-size × per-replay cost, superlinear in session count.
Fix direction: incremental per-file replay state that advances WITH the run
cutoff (reconstruct each closure file once, forward through time) instead of
a fresh bounded replay per run — cf. optimizations.md Phases 4/5 deferred from
task 192.

Task-220 fix implemented 2026-07-24 (plans/220-lineage-horizon-memo.md): the
lineage-seed memo is now keyed by relevant-input horizon instead of raw
instant, so unchanged closure files serve from cache across run cutoffs —
pending a task-182 rerun to measure the real-corpus rate.

## Task 182 viability run — attempt 4 (2026-07-24, COMPLETED — blowup FIXED)

Same invocation as attempt 3's correct-flag run, on jfred@beac114 (task-220
horizon memo committed). The FULL run completed in ~11 minutes, exit 0 —
vs the ~22h linear ETA measured in attempt 3. Final counters:
executionRequests 1,864,979 (99.8% cache hits), preStateBuilds 136,
sandboxSpawns 311, lineageReplayRequests 18,639 with 17,965 cache serves
(96.4%). Output: a valid `--json` document for `plate_cli.py` with a
**34-revision ladder**. Evidence preserved at
`~/Programming/jot-recovery/run-evidence/plate_cli_progress-attempt4-2026-07-24.log.gz`
and `plate_cli_ladder-attempt4-2026-07-24.json`. Task 220 closed; the
9d14d60d blob check and per-revision validation are task 182's remaining work.

Task 182 is now unblocked. Multi-source seeding was ruled OUT
as a factor: writes to the target's absolute path exist only in the
`-Users-matkatmusicllc-Programming-jot` project folder (11 JSONLs); the
engine's multi-source machinery (specs S3–S6) is present and unused here.

## Task 182 blob-identity + evidence check (2026-07-24, PASSED — task CLOSED)

Validation of the attempt-4 ladder JSON
(`plate_cli_ladder-attempt4-2026-07-24.json`, 34 revisions for
`common/scripts/plate/plate_cli.py`):

- **Blob identity PASSED.** Revision 0 (`kind: write`,
  `changeId: gitBase:793e6524…`, ts 2026-05-10T18:34:03Z), reconstructed as
  line-joined text + trailing newline, git-hashes to exactly
  `9d14d60df7aebcba8455bdea7d6b817bca572fe6` — byte-identical to the
  baseline blob. (Without the trailing newline the hash differs; the
  trailing-NL form is the match.)
- **Source evidence fully represented.** The 33 non-seed revisions trace to:
  31 `edit` revisions carrying 18 DISTINCT `toolu_*` changeIds — exactly the
  18 Edit tool_use records targeting the file in the project's JSONLs (11
  multi-hunk Edits emit one ladder step per hunk, duplicates are consecutive
  with identical timestamps — expected engine behavior, not a mismatch) —
  plus 2 `overwrite` revisions from file-history snapshots
  `04b5333dde2392bd@v2` and `@v4`.
- Revision-kind ladder: 1 write (git seed), 31 edits, 2 overwrites; span
  2026-05-10 → 2026-05-17.

No mismatch found. Step-1 viability of the per-file approach is proven;
tasks 183/186/188 are unblocked.

Ground truth for the per-file reconstruction sprint (S8–S13, tasks 180–190):
which files the engine must recover, in what order, and the first target's git
provenance. All facts below re-verified live against the repo on 2026-07-22.

## Baseline

- Repo: `~/Programming/jot`
- Baseline commit: `793e65241902f276caf5f5c28d539269e7d36d11`
- Candidate enumeration: `git diff --name-status 793e6524…` (working tree vs
  baseline), 131 files as of 2026-07-22 — **68 M / 11 A / 52 D**.

## Sources

All per-file reconstruction reads `~/Programming/jot-recovery/claude-data/`
ONLY — its `projects/` JSONL folders and `file-history/` snapshot dirs. Never
the live `~/.claude`.

## Phase order: M → A → D

User directive: M files were never renamed/moved since the baseline, only
modified — so the M phase needs no rename/move recovery, making it the
cheapest correctness gate. A (born after baseline) next; D (deleted since
baseline; final state is absence) last.

## First target (M phase)

- `common/scripts/plate/plate_cli.py`, blob at baseline
  `9d14d60df7aebcba8455bdea7d6b817bca572fe6` (verified:
  `git rev-parse 793e6524…:common/scripts/plate/plate_cli.py`).
- Git provenance — both commits verified pre-baseline ancestors
  (`git merge-base --is-ancestor`), so the file is modify-only since the
  baseline:
  - created at `7a7ea11a25e5a29ca68924de5e561e98d95cf191` (2026-05-01)
  - renamed at `dcb25ce14140fa48d6acf313c0bbb022fd511abe` (2026-05-08)

## M — modified since baseline (68)

```
.claude-plugin/marketplace.json
.claude-plugin/plugin.json
.gitignore
CHANGELOG.md
CODING_RULES.md
MIGRATION_TO_PYTHON.md
README.md
TROUBLESHOOTING.md
common/scripts/claude_lib.py
common/scripts/debate_lib.py
common/scripts/git_lib.py
common/scripts/git_test_funcs_lib.py
common/scripts/hookjson_lib.py
common/scripts/jot_lib.py
common/scripts/plate/plate_cli.py
common/scripts/plate/plate_lib.py
common/scripts/plate/spawn_summary_agent.py
common/scripts/plate/transcript_parse.py
common/scripts/plate_dispatcher.py
common/scripts/tmux_lib.py
common/scripts/todo_lib.py
common/scripts/util_lib.py
docs/design/architecture.md
docs/design/milestones.md
hooks/hooks.json
plans/migration_to_python/common_scripts_claude-launcher.sh.md
plans/migration_to_python/common_scripts_git.sh.md
plans/migration_to_python/common_scripts_hook-json.sh.md
plans/migration_to_python/common_scripts_invoke_command.sh.md
plans/migration_to_python/common_scripts_lock.sh.md
plans/migration_to_python/common_scripts_permissions-seed.sh.md
plans/migration_to_python/common_scripts_platform.sh.md
plans/migration_to_python/common_scripts_tmux-launcher.sh.md
plans/migration_to_python/common_scripts_tmux.sh.md
plans/migration_to_python/scripts_jot-plugin-orchestrator.sh.md
scripts/jot_plugin_orchestrator.py
tests/conftest.py
tests/test_claude_permissions.py
tests/test_debate_agents.py
tests/test_debate_archive_io.py
tests/test_debate_capacity.py
tests/test_debate_daemon.py
tests/test_debate_locks.py
tests/test_debate_main.py
tests/test_debate_retry.py
tests/test_debate_tmux.py
tests/test_dispatcher.py
tests/test_git_lib.py
tests/test_hookjson_lib.py
tests/test_jot_buildcmd.py
tests/test_jot_diag.py
tests/test_jot_dispatch.py
tests/test_jot_phase2.py
tests/test_jot_state.py
tests/test_jot_stop.py
tests/test_plate_main.py
tests/test_spawn_summary_agent.py
tests/test_tmux_communicate.py
tests/test_tmux_configure.py
tests/test_tmux_create.py
tests/test_tmux_destroy.py
tests/test_tmux_read.py
tests/test_todo_capture.py
tests/test_todo_list.py
tests/test_todo_stop.py
tests/test_util_filelock.py
tests/test_util_shell.py
tests/test_util_terminal.py
```

## A — added since baseline (11)

```
archive/common/scripts/run_scenario_lib.py
archive/common/scripts/sync_lib.py
archive/common/scripts/sync_lib_format.py
archive/common/scripts/sync_lib_paths.py
archive/common/scripts/sync_lib_rsync.py
archive/skills/run-scenario/SKILL.md
archive/skills/sync-jsonl-projects/SKILL.md
archive/tests/test_sync_lib.py
scripts/fibonacci.py
skills/make-a-plan/SKILL.md
tests/test_fibonacci.py
```

## D — deleted since baseline (52)

```
common/scripts/plate/_rebase_reword_summary.py
common/scripts/plate/append_plate_to_stack.py
common/scripts/plate/cascade_parent_chain.py
common/scripts/plate/check_drift_alert.py
common/scripts/plate/check_live_children.py
common/scripts/plate/check_rolling_intent_refresh.py
common/scripts/plate/clear_drift_alert.py
common/scripts/plate/instance_rw.py
common/scripts/plate/list_paused_plates.py
common/scripts/plate/next_resume_point.py
common/scripts/plate/print_resume_pointer.py
common/scripts/plate/register_parent.py
common/scripts/plate/verify_stash_refs.py
skills/plate/DESIGN.md
skills/plate/IMPLEMENTATION.md
skills/plate/PLATE STATE.md
skills/plate/README.md
skills/plate/SESSION_CONTEXT.md
skills/plate/SKILL.md
skills/plate/scripts/assets/permissions.default.json
skills/plate/scripts/assets/permissions.default.json.sha256
skills/plate/scripts/prompts/bg-agent.md
skills/plate/scripts/prompts/drift-judge.md
skills/plate/scripts/prompts/summary-agent.md
skills/plate/summary-template.md
skills/plate/tests/fixtures/sample-transcript.jsonl
skills/plate/tests/sequence/conftest.py
skills/plate/tests/sequence/test_enumerate_subagent_transcripts.py
skills/plate/tests/sequence/test_extract_files_created_since_timestamp.py
skills/plate/tests/sequence/test_helpers_convo.py
skills/plate/tests/sequence/test_helpers_git_test_funcs.py
skills/plate/tests/sequence/test_helpers_plate.py
skills/plate/tests/sequence/test_helpers_plate_sequence.py
skills/plate/tests/sequence/test_iter_tool_use_records_since_timestamp.py
skills/plate/tests/sequence/test_parse_files_created_from_bash_command.py
skills/plate/tests/sequence/test_plate_cli.py
skills/plate/tests/sequence/test_plate_e2e_wiring.py
skills/plate/tests/sequence/test_plate_extract_empty_log.py
skills/plate/tests/sequence/test_plate_scenarios.py
skills/plate/tests/sequence/test_session_end_hook.py
skills/plate/tests/sequence/test_summary_pipeline.py
tests/test_claude_buildcmd.py
tests/test_claude_misc.py
tests/test_debate_e2e_wiring.py
tests/test_debate_prompts.py
tests/test_jot_audit.py
tests/test_jot_e2e_wiring.py
tests/test_plate_set_summary_cli.py
tests/test_plate_summary_watch.py
tests/test_tmux_monitor.py
tests/test_todo_e2e_wiring.py
tests/test_todo_send.py
```

## Task 186 — the per-file sweep harness (spec S11)

`jfred/scripts/per_file_sweep.ts` runs the task-182 per-file path over a
candidate list and writes the S11 results table. Running the 68-file M phase
with it is task 187, not task 186.

Invocation (defaults already point at the jot recovery sources and the baseline
commit, so the M phase is just `--status M`):

```
cd jfred
npx tsx scripts/per_file_sweep.ts --status M \
  [--repo ~/Programming/jot] \
  [--base-commit 793e65241902f276caf5f5c28d539269e7d36d11] \
  [--projects ~/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jot] \
  [--fhsLoc ~/Programming/jot-recovery/claude-data/file-history] \
  [--out plans/166-per-file-sweep-results.jsonl] \
  [--table plans/166-per-file-sweep-table.md] \
  [--limit <n>]
```

Outputs:

- `--out` — one JSON line per candidate, appended as each finishes. A killed
  run resumes from it: candidates already logged are skipped, so the 68-file
  run does not restart from zero.
- `--table` — the markdown results table, rewritten after every candidate:
  `file | revisions | baseline blob | final = disk | unrecoverable | verdict | note`.

Verdicts (`SweepVerdict` in `jfred/src/structures/vocabulary.ts`) encode the
user's S11 correction that endpoints are necessary but not sufficient:
`ok` = both endpoints matched and every revision replayed; `gaps` = endpoints
matched but the ladder holds unrecoverable revisions; `endpoint-miss` = the
baseline blob or the final-vs-disk check failed; `none` = no revisions at all.

Design points that matter for the task-187 run:

- **One process, one records array, N targets.** The script loads the 156
  transcripts once and calls `reconstructSurvivingFileHistory` per candidate
  over that same array, because the expensive machinery memoizes per
  records-ARRAY identity (attempt-4 evidence above). Spawning the CLI once per
  file would pay the ~11-minute cost 68 times.
- Candidates resolve to absolute paths through the RECORDED cwd
  (`findFirstRecordCwd`), not through `--repo` — the transcripts' paths are
  recorded-cwd absolute, and `reconstruction_base_commit.ts` derives its
  repo-relative path the same way.
- A candidate that throws becomes a zero-revision row carrying the message; one
  bad file never ends the sweep.

### Measured cost (2026-07-25, first three M candidates)

| candidate | revisions | baseline blob | final = disk | verdict | seconds |
| --- | --- | --- | --- | --- | --- |
| `.claude-plugin/marketplace.json` | 16 | yes | yes | ok | 810 |
| `.claude-plugin/plugin.json` | 9 | yes | yes | ok | 1 |
| `.gitignore` | 3 | yes | no | endpoint-miss | 1 |

817 s wall clock for all three over the 156-transcript / 72,438-record source.
**The shared warm-up is the whole cost: 810 s for the first candidate, 1 s each
for the next two.** That is the "one process, one records array, N targets"
decision paying off — the full 68-file M phase should land in roughly 15
minutes, not the ~12 hours a CLI-spawn-per-file harness would take. Two things
for task 187 to triage from this slice alone:

- `.gitignore` recovers only 3 revisions and its final revision does NOT match
  today's working tree — a real endpoint miss, not a harness artifact.
- "Baseline blob present" had to mean present ANYWHERE in the ladder: both
  `.claude-plugin` files carry the git seed mid-ladder (their recorded history
  starts before the 2026-05-10 baseline commit), so a revision-0-only check
  reported a false `endpoint-miss` for both.

## Task 188 — the iterative reconstruct → commit → re-seed loop (spec S12 prep)

Run 2026-07-25 on `common/scripts/plate/plate_cli.py`, all four runs against
`~/Programming/jot-recovery/claude-data`. Commits landed in a scratch clone
(`git clone --shared ~/Programming/jot <scratch>` checked out at the baseline);
`~/Programming/jot` was only ever read.

### The recipe

1. **Scratch clone at the baseline** — never commit into the real repo:
   ```
   git clone --shared ~/Programming/jot "$SCRATCH"
   git -C "$SCRATCH" checkout -B loop-proof 793e65241902f276caf5f5c28d539269e7d36d11
   ```
2. **Reconstruct a chunk** (`--until-revision <file> --nth <n>` bounds the
   record stream at the containing turn's end; both flags name the same file):
   ```
   npx tsx src/reconstruction_cli.ts <claude-data projects>/*.jsonl \
     --file /Users/matkatmusicllc/Programming/jot/common/scripts/plate/plate_cli.py \
     --repo ~/Programming/jot --base-commit 793e6524… \
     --fhsLoc ~/Programming/jot-recovery/claude-data/file-history \
     --branch surviving --until-revision <same file> --nth 5 --json --progress
   ```
   `--branch surviving` (NOT `--surviving`) is what engages the fast path.
3. **Commit the chunk's last revision at ITS OWN instant.** Write
   `lines.join("\n") + "\n"` (the form that blob-matched in task 182) to the
   file in the clone, then:
   ```
   GIT_AUTHOR_DATE=<revision.timestamp> GIT_COMMITTER_DATE=<revision.timestamp> \
     git -C "$SCRATCH" commit -am "<chunk>"
   ```
   `GIT_COMMITTER_DATE` is the load-bearing one — the engine reads committer
   time (`%cI`) and never author time, so `git commit --date` alone places the
   seed at today's instant and it sorts to the END of the ladder.
4. **Re-seed from the new hash** — same command with
   `--repo "$SCRATCH" --base-commit $(git -C "$SCRATCH" rev-parse HEAD)` and a
   wider `--nth`. `--repo` may point at the clone: the repo-relative path comes
   from the recorded cwd, not from `--repo`.
5. **Control run** — the same wider `--nth` against the ORIGINAL baseline, to
   separate what re-seeding recovered from what merely widening the bound
   recovered.

### Measured results

| run | seed | bound | wall clock | revisions | monotonic | unrecoverable |
| --- | --- | --- | --- | --- | --- | --- |
| iteration 1 | `793e6524…` (baseline) | `--nth 5` | 12 s | 7 | yes | 0 |
| iteration 2 | `403f6944…` (committed rev 6, 2026-05-14T03:06:21Z) | `--nth 10` | 48 s | 20 | **no** | 0 |
| control | `793e6524…` (baseline) | `--nth 10` | 49 s | 18 | yes | 0 |

Bounded runs are cheap: 12–49 s against the ~11 minutes the unbounded
attempt-4 run took.

### Findings

1. **The loop's mechanics work.** The mid-stream commit is accepted as a seed —
   iteration 2's ladder carries
   `gitBase:403f69440808e9ad21291695f99595e3a5f10d98:<target>` — and iteration 2
   emits 13 revisions iteration 1 never produced, ending at different (later)
   content. The reconstruct → commit → re-seed → reconstruct cycle runs
   end-to-end with no engine change.
2. **But re-seeding recovered no history the widened bound did not.** The
   control run (original baseline, same `--nth 10`) produced the same 18
   revisions and the byte-identical final content. Every changeId in iteration 2
   is in the control except the new `gitBase:` id, and vice versa. For this file
   the extra history came from moving the bound, not from moving the seed.
3. **Mechanism: the CLI never prunes pre-baseline records.**
   `preBaselineReconstructionAllowed` defaults to `true` and only the viewer
   flips it (`reconstruction_base_commit.ts:33`, "the CLI never touches it"), so
   `computeSkippedBaselineCutoff` returns undefined and a later baseline does
   NOT cut the window. Iteration 2's ladder starts at 2026-05-13T15:53 — well
   before its own 2026-05-14T03:06 seed — which is why it neither pruned work
   (48 s ≈ the control's 49 s) nor shortened the ladder. **The loop's intended
   "start from the new hash" effect needs a CLI equivalent of the viewer's "No"
   to the pre-baseline question; there is no such flag today** (task 223).
4. **A mid-stream seed corrupts the ladder as things stand.** Iteration 2 is
   non-monotonic — its `gitBase:` overwrite (2026-05-14T03:06:21Z, index 10)
   sits before a revision stamped 2026-05-13T21:45:19Z (index 11) — and it
   repeats snapshot `04b5333dde2392bd@v2` twice (indices 8 and 11) where the
   control emits it once. 20 revisions vs the control's 18 is exactly those two
   artifacts (task 224).
5. **Consequence for S12/S13.** The loop is only worth running where a single
   pass STALLS. `plate_cli.py` is not such a file — one unbounded pass already
   recovers all 34 revisions (task 182) — so it proved the mechanics but could
   not demonstrate the value. Before tasks 189/190 lean on re-seeding, tasks 223
   and 224 need to land, or a re-seeded ladder will be reported non-monotonic
   with duplicated snapshot revisions.

Evidence (session scratchpad, not preserved): `iter1.json`, `iter2.json`,
`control.json` plus their `--progress` logs.
