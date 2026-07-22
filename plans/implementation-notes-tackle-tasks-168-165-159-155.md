# 2026-07-22T08:55:00-07:00 — Tasks 168/165/159/155 (multi-source design doc, capture publishing + CI, paths wizard mockup, script-move rename revisions)

Chat title: tackle-tasks 168 165 159 155
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/02c9d5b1-9706-4194-8ed0-c0f5bea8f751.jsonl

## References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-multi-source-design.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-source-probe-notes.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/SPEC.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/159-paths-wizard-mockup.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/155-script-move-rename-revisions-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-tackle-tasks-142-143-144-145.md

## Design decisions

- **Task 168** (`plans/166-multi-source-design.md`): all four spec-S1 sections cite
  probe data. Notable locks: identity = rel-path agreement + content agreement, with
  jot vs jot-backup as the proof rel-path alone fails; merge stage order = (1)
  record-level dedupe by (sessionId, recordUuid), (2) identity, (3) timestamp
  interleave, (4) lineage-mismatch conflict notes; branch/rewind structure stays
  session-local (no cross-source rewind interplay exists in the real data — stated
  per the spec's "or states none was found" clause).
- **Task 165**: the captures are now SELF-CONTAINED where feasible — 136 of 140
  executed sessions' live `~/.claude/file-history/<uuid>` dirs were copied into
  `scenarios/file-history/` (2.3MB), because the sidecar reader's sibling-derivation
  chain (`<X>/projects → <X>/file-history`, here `scenarios/executed → scenarios/file-history`)
  finds them with ZERO code change, converting reader-dependent scenarios from
  machine-bound to portable. 4 sessions have no live dir (scenarios that never
  produced backups). The 14 nested scenario `.git` repos are committed as
  `executed/<scenario>/repo.git.tar` (demo-bundle pattern); a new npm `pretest`
  (`scripts/extract_scenario_git_tars.sh`, idempotent) restores them for both local
  `npm test` and CI. CI now checks out the scenarios submodule and runs the FULL
  suite (`npm test` — pretest fires automatically, so no extra CI extraction step).
- **Task 165 staging verification**: 5,994 files staged in the scenarios repo —
  `.step_states` oracle + `.abandoned_branches` (force-added; the per-scenario
  capture `.gitignore`s suppress them), 14 repo tars, 556 file-history blobs, 0
  `.plate/` leaks, 0 gitlinks (mode 160000), no file over 50MB. Per the user's
  follow-up, 3,884 regenerable Python cache files (`__pycache__/`, `*.pyc`,
  `.pytest_cache/`) inside the step snapshots were unstaged and added to
  `scenarios/.gitignore` — the coverage checker's own `NON_SOURCE_NAMES`
  (`coverage_scenarios.ts:24`) proves it never reads them. The step snapshots'
  `.claude/` dirs (233 files, also in `NON_SOURCE_NAMES`) stay COMMITTED: they are
  recorded run state (permissions granted during the run), not regenerable cache.
- **Task 159**: the four open ambiguities were answered by the user via
  AskUserQuestion (2026-07-22): trigger = first-run + unconfigured projects + Paths…
  button; screen-4 default = session-recorded baseline else default-branch tip;
  task-56 question = wizard screen 5 when wizarding, load-time dialog otherwise;
  post-load editing = summary panel with per-row edit + "Run full wizard" link.
  Deliverables (a)+(b) are in `plans/159-paths-wizard-mockup.md`.
- **Task 155**: new module `src/reconstruction_script_move_events.ts` —
  `appendScriptMoveRenames` is the THIRD script-rename evidence channel: sandbox
  pre/post-proven pairs (task 143's `matchRenamePairs`) become `EventKind.rename`
  events, deduped by `from|to` against the stdout/code-literal channels. changeId =
  `computeScriptExecutionChangeId(run, from)` (run x SOURCE path — collision-free,
  the destination owns the run x destination id). Timestamp = the run's tool_use
  instant (matches the same run's beaconless events). Wired into BOTH rename-chain
  build sites: `computeFileRevisionsOver` (stage-tolerant via `runStageTolerantly`)
  and `reconstructFilesOver`. NOT wired into the prestate chain (would recurse into
  the in-flight execution) and the channel filters runs through
  `selectRunsWithinReplayWindow` (task-162 discipline).

## Deviations

- **Task 165, step 3 (commit + push)**: per the tackle-tasks session rule everything
  is STAGED but NOT committed/pushed. The user's commit flow: (1) commit + push the
  scenarios repo (develop), (2) commit jfred with the bumped scenarios submodule
  pointer — CI's submodule checkout needs the pushed scenarios commit first.
- **Task 165, machine-bound residue**: not fully resolved by design — the task
  expects the first full CI run to name the residual set. Known-in-advance: s85
  resolves its repo via a recorded live tmpdir cwd. The ci.yml comment documents the
  fallback (exclude via `scripts/list_capture_free_tests.ts`, which stays in place).
  The optional pack-object secret rescan was not done (text scan was already clean
  and the user accepted exposure on 2026-07-21).
- **Task 159 implementation (deliverable c)**: intentionally NOT started — the task
  mandates mockup review first. Tasks 159 stays OPEN.
- **TDD red phase**: observed via the Stop hook's automatic run (module-not-found
  failure after the test file was written), not a manual test invocation — the
  session rule forbids running tests/suites manually. Only `tsc --noEmit` was run
  (exit 0).

## Tradeoffs

- `reconstruction_branches.ts` lands at exactly 250 lines (the cap). Next change to
  this file must move something out first.
- The captured `scenarios/file-history` blobs freeze the sidecar state as of
  2026-07-22; a future scenario RE-RUN writes a fresh session uuid, so its dir must
  be re-captured (same copy step). Re-capture is a plain `cp -R` of the new uuid dir.
- Dedupe key for the new rename channel is `from|to` (not changeId): two channels
  evidencing the same move produce one event, whichever extraction saw first wins —
  chosen so scenarios already covered by the stdout/code-literal channels
  (s25/s33/s37/s87) are byte-identical under the sweep.

## Open questions

- **User's test run will decide**: s85's coverage/ladder delta (sources merging into
  `core_*.py` destinations changes filesTouched from 9 downward) and whether the
  trunk-absorb un-orphaning shifts any other newer-CC scenario's timeline (task
  155's second paragraph — observation only, no code here).
- First full CI run (after the two-step push above) names the residual machine-bound
  test set; whatever it lists goes back through `list_capture_free_tests.ts` or gets
  its inputs captured.
- Task 168's design doc locks the S1 policy — tasks 170/172/173 can start once the
  user accepts it.
