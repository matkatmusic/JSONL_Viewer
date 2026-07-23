# Task 179 — s89 nested-root sessions (<proj> + <proj>/tests): plan

Goal: a scenario where agent a2's session runs INSIDE a subfolder of a1's
project (`/tmp/scen89-proj/tests`), producing two Claude project dirs
(`-private-tmp-scen89-proj`, `-private-tmp-scen89-proj-tests`) — plus the
runner/capture support to run and capture it, and an engine check that the
same file reached from both roots stays ONE merged ladder.

Scope boundary for this session (per tackle-tasks instructions the user runs
tests/suites, and the live capture spawns paid Opus agents + Terminal windows):
implement runner + capture + scenario + design doc + engine verification via
fabricated records; the LIVE /run-scenario capture run is the user's next step
(the task stays OPEN until captured + verified, like task 171 was for s88).

## 1. Runner (`jfred/jfredToolsPlugin/common/scripts/run_scenario_lib.py`)

Today `runScenario_launch` calls `runScenario_createFixedRoot` for every
declared root. For `root: tests = /tmp/scen89-proj/tests` that FAILS: the
parent's `_seedWorkspaceRoot` already created a non-empty `tests/` (conftest)
without a `.run-scenario-root` marker → the safety check raises; and even
past it, the wipe+reseed would plant `tests/tests/`, a nested `.gitignore`,
and a marker inside the parent's tracked tree.

Decision: nested roots are created AT LAUNCH, parent-first (declaration order,
already the case), but a root nested under an EARLIER declared root is only
`mkdir -p`'d — no wipe, no marker, no seeding. Rationale: the parent was just
created fresh, so the nested dir is already fresh; its content BELONGS to the
parent project (the parent repo tracks it); re-run cleanup wipes the parent,
which removes the nested root with it. Nested-ness is detected textually
(`Path(parent) in Path(nested).parents`), so a nested root must be declared
with the same textual prefix as its parent root (documented in the scenario
header comment convention — both use `/tmp/scen89-proj…`).

Spawn semantics (`SpawnNewAgent: a2 in tests`) are unchanged —
`_resolveSpawnRoot` already maps the name to the declared path; signals stay
in the PRIMARY root (task-169 behavior, untouched).

## 2. Capture (`jfred/scenario_capture_lib.py`)

`captureCompletedScenario` copies jsonls only from `known[0]`'s parent project
dir. Change: compute the distinct project dirs across ALL `jsonl_paths`.

- One project dir → existing flat behavior byte-for-byte (the 88-scenario
  sweep's capture shape must not change).
- Multiple project dirs → per-source trees, the s88 capture-notes layout the
  coverage checker now discovers (task 178):
  `executed/<stem>/source-<sessionId[:8]>/projects/<projectDirName>/<session>.jsonl`
  plus `source-…/file-history/<sessionId>/` copied from
  `~/.claude/file-history/<sessionId>` (that copy is what frees the checker
  from the LIVE ~/.claude fallback). One source tree per session jsonl; every
  `*.jsonl` in every involved project dir is collected (/clear splits ride in
  their own source trees).

Leave ONE runnable check: a small `test_scenario_capture_lib.py`-style assert
is overkill here (pure file plumbing exercised by the next capture run);
instead the s89 capture run itself is the check — noted in the design doc.

## 3. Scenario s89 (design doc first)

- `plans/179-s89-ground-truth-design.md`: agents/roots, per-file revision
  ladders keyed to step numbers, the nested-root identity crux
  (`tests/test_parser.py` under proj ≡ `test_parser.py` under proj/tests ≡
  ONE absolute path), capture checklist (tmux watcher recipe reference).
- `scenarios/s89-nested-roots.txt` + identical copy at
  `jfred/scenarios/s89-nested-roots.txt` (two-location convention). ~20 steps,
  a1 implicit in `proj`, `SpawnNewAgent: a2 in tests` — interleaved a1/a2 +
  one runner `Edit:` on the SAME test file from both roots; git init + commit
  baseline + final staged commit for git evidence. `Edit:` directives resolve
  against the ACTIVE agent's cwd, so each `Edit:` step follows an @a1 step and
  uses proj-relative paths.

## 4. Engine: nested-root identity

Hypothesis check (task predicts a gap): both sessions reference the SAME
absolute path, so identity should fall out of the absolute-path fast path with
no rel-path join needed. Verify with fabricated records (multi-source test
helpers): source A session cwd `/tmp/…/proj` Writes + Edits
`<proj>/tests/test_x.py`; source B session cwd `<proj>/tests` Edits the same
absolute path. Merge through `mergeMultiSourceRecords` and reconstruct; assert
ONE file timeline carrying all revisions in interleave order.

- Probe first via a scratchpad runner (not the test runner) to learn the
  actual behavior; then encode the result as a capture-free test in
  `tests/reconstruction_multi_source.test.ts` (or the join test file,
  whichever has line-cap headroom). If the ladder splits, fix the smallest
  engine diff and keep the test.

## 5. Bookkeeping

Stage everything, do not commit. Task 179 STAYS OPEN — closure requires the
live capture + per-step verification (like task 171). Note the remaining steps
in the implementation-notes file and the design doc.
