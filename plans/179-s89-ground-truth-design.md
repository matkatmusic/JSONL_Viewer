# s89-nested-roots — ground-truth design (task 179)

> **STATUS 2026-07-22: CAPTURED + VERIFIED, task 179 closed.** Live run
> completed (user-driven), captured via `captureCompletedScenario` into
> `jfred/scenarios/executed/s89-nested-roots/` (two `source-*` trees with
> DIFFERENT project dir names), coverage gate 20/20 GREEN through the
> multi-source engine. Engine-gap prediction refuted on real data. Observed
> deviations (benign — dup runner appends, one snapshot-timing lag) are in the
> capture's `capture-notes.md`.

Acceptance reference for the task-179 capture (run + verify like task 171 was
for s88). The scenario lives at `scenarios/s89-nested-roots.txt` (identical
copy at `jfred/scenarios/s89-nested-roots.txt`), 20 steps, two agents:

- **a1** — implicit, cwd = primary root `proj` (`/tmp/scen89-proj`)
- **a2** — `SpawnNewAgent: a2 in tests` (step 4), cwd = the NESTED root
  `tests` (`/tmp/scen89-proj/tests`)

The crux this scenario exists to exercise (USER INSIGHT 2026-07-22): the two
sessions record DIFFERENT Claude project dirs (`-private-tmp-scen89-proj` and
`-private-tmp-scen89-proj-tests`), and the SAME file carries different
rel-paths per root — `tests/test_parser.py` under `proj` is `test_parser.py`
under `tests` — while its ABSOLUTE path is identical. The merged
reconstruction must keep it ONE ladder (absolute-path identity; no rel-path
join is needed or wanted — a join would try to remap paths that already
agree).

## Runner mechanics this depends on (implemented, staged)

- `run_scenario_lib.py runScenario_createDeclaredRoots`: a root nested under
  an earlier declared root is only `mkdir -p`'d — no wipe/marker/seed (the
  parent's seeded `tests/conftest.py` must survive; pytest covers this in
  `jfredToolsPlugin/tests/test_run_scenario_lib.py`).
- `scenario_capture_lib.py`: when the run's jsonl_paths span >1 project dir,
  capture emits per-source trees `source-<sessionId[:8]>/projects/…` +
  `source-…/file-history/<sessionId>/` (the s88 layout the coverage checker
  discovers since task 178). Single-project runs keep the flat layout.
- Signals stay in the PRIMARY root (`/tmp/scen89-proj`) — task-169 behavior.
- Prompt approvals during the run: tmux watcher recipe (see memory
  `tasks176-171-159-batch` — approve_s88.py pattern).

## Per-file revision ladders (keyed to step numbers; capture locks exact bytes)

`parser.py` (a1 + runner, proj root only):

| step | actor | change |
|---|---|---|
| 1 | a1 Write | parse_line / count_tokens |
| 3 | runner user-edit | + `# reviewed by ops` |
| 8 | a1 Edit | + strip_comment |

`tests/test_parser.py` — THE cross-root stream (one absolute path, two rel-paths):

| step | actor (root) | change |
|---|---|---|
| 1 | a1 Write (proj) | tests for parse_line + count_tokens |
| 6 | a1 Edit (proj, `tests/test_parser.py`) | + empty-line parse_line test |
| 7 | a2 Edit (tests, `test_parser.py`) | + test_count_tokens_multiword |
| 9 | runner user-edit (proj-relative path) | + `# tests reviewed` |
| 10 | a2 Edit (tests) | + strip_comment test |
| 11 | a1 Edit (proj) | + combined parse_line/strip_comment test |

Interleave across roots: a1(1) → a1(6) → a2(7) → runner(9) → a2(10) → a1(11).

Git evidence: step 2 baseline commit; steps 13–14 stage + commit "parser
tests" (both from a1 in proj — the repo root).

## Engine expectation (verified 2026-07-22 against fabricated records)

Both sessions reference the same ABSOLUTE path, so identity falls out of the
merged record stream without any rel-path join; the fabricated-record check
(see `tests/reconstruction_multi_source.test.ts`, nested-root case) asserts
one merged ladder in interleave order. If the live capture still splits the
ladder, the gap is in something the fabrication doesn't model (e.g. sidecar
ownership or cwd remap) — diagnose per the ground-truth workflow before
touching the join.

## Capture checklist (the step that closes task 179)

1. Sync the staged `run_scenario_lib.py` into the LIVE plugin clone the
   `claude()` wrapper uses (`~/Programming/jfredToolsPlugin`) — the trap from
   memory `tasks98-118-skill-plugin-ports`: the wrapper's clone lacks changes
   until synced.
2. `/run-scenario scenarios/s89-nested-roots.txt` with the tmux approval
   watcher running; both roots are created at launch (nested `tests` only
   mkdir'd).
3. Verify the run like task 171: per-agent tool sequences, final workspace
   state vs the ladders above, `.step_states` complete (20 steps' worth of
   snapshots of the PRIMARY root — the nested root's files appear under
   `tests/`).
4. Capture via run-all-scenarios / `captureCompletedScenario` — expect
   `executed/s89-nested-roots/` with TWO `source-*` trees (one per session,
   different `projects/<dir>` names) + `.step_states` + workspace tree.
5. Re-derive exact ladders into `capture-notes.md`; run the s88-style
   coverage gate (task-178 checker path) on s89; fix any engine gap; only
   then close task 179.
