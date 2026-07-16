# Task 111 (task 58 STEP 3): archive superseded frontends, JFRED submodule cutover, repoint 7343

Repo: /Users/matkatmusicllc/Desktop/claude code src/RevEng (branch `develop`).
Local JFRED clone for reference only: /Users/matkatmusicllc/Programming/jfred @ 082468f
(pushed to https://github.com/matkatmusic/jfred.git — the submodule is added from the URL,
never from the local path).

User decisions already taken (2026-07-16, this session — do not re-ask):
- Archive `fork-style-mockup.html` + `revision-timeline-mockup.html`; KEEP
  `engine-pipeline-diagrams.html` at root (new task 112 covers updating it to match JFRED
  and copying it into the JFRED repo).
- FULL CUTOVER confirmed: delete RevEng's byte-identical copies of src/, webapp/, the
  duplicated tests, and scripts/ (content survives in the jfred/ submodule and in git
  history). RevEng-unique material is moved, never deleted.
- Zero-jot sweep (task step 1) already verified clean this session: all
  `git grep -E 'common\.scripts|CLAUDE_PLUGIN_ROOT|Programming/jot|jot_plugin'` hits in
  JFRED are the dispatcher/lib's own env bootstrap, dated comments, or synthetic
  `/Users/me/Programming/jot` test-fixture strings. Nothing to change.

Constraints:
- DO NOT run `npm test` or any suite — the user runs tests afterwards. The only runtime
  checks allowed are the build + HTTP smoke checks named in Phase 6/7.
- Stage all work with `git add`; DO NOT commit.
- `node` in this environment attaches a debugger and prints noise lines — ignore
  "Debugger listening/attached/Waiting" text in outputs.
- Use `/usr/bin/grep` (plain `grep` is shimmed).

Verified facts the steps below rely on (do not re-derive):
- Untracked at root: `api/`, `diff/`, `jfred/`, `web-shared/`, `jsonl-tree-viewer.ts`,
  `revision-timeline-mockup.html`. Tracked: `js-engine/`, `fork-style-mockup.html`,
  `engine-pipeline-diagrams.html`, `src/`, `webapp/`, `tests/`, `scripts/`,
  `tsconfig.webapp.json`.
- `diff -rq` RevEng vs jfred: src/ identical except the 3 template .md files; webapp/
  identical except `.plate/` (untracked captures), `archive/`, `dist/` (untracked build
  output); tests/ identical except the 5 task-workflow tests
  (archiveProcessed/extractOpenSections/getTaskDetails/nextTaskNumber/viewTaskHook),
  `archive/`, `.plate/`, `fixtures.ts` + `reconstruction_steps_name_at_time.test.ts`
  (jfred's copies are the improved repo-relative versions — RevEng's are the stale ones).
- The 5 task-workflow tests import ONLY node builtins — they survive src/ deletion.
- The 2 python tests (`tests/test_run-all-scenarios.py`, `tests/test_run_all_scenarios.py`)
  reference neither `tests/fixtures/` nor `scripts/`; they test `run-all-scenarios.py`,
  which STAYS in RevEng (RevEng's copy differs from jfred's — jot-era vs dispatcher-era).
- `jfred/src/viewer_server.ts` resolves `webapp/`, `webapp/dist/`, and `.cache/` via
  `import.meta.dirname` → running it from RevEng's root serves jfred's webapp and writes
  cache under `jfred/.cache/`, which jfred's .gitignore line 87 (`.cache/`) covers, so the
  submodule stays clean.
- tsconfig `include`/`outDir` paths resolve relative to the tsconfig file's own location →
  `tsc -p jfred/tsconfig.webapp.json` run from RevEng's root compiles jfred/webapp into
  jfred/webapp/dist using RevEng's own typescript. No `npm install` inside the submodule.
- Highest task number across tasks.json + completedTasks.json = 111 → new task = 112.
- `archive/` already exists at root (contains copy-scenario-outputs.py).

## Phase 1 — archive superseded frontends into archive/

1. Plain `mv` (untracked): `api`, `diff`, `jfred`, `web-shared`, `jsonl-tree-viewer.ts`,
   `revision-timeline-mockup.html` → `archive/<same name>`.
2. `git mv js-engine archive/js-engine` and `git mv fork-style-mockup.html archive/`.
3. Leave `engine-pipeline-diagrams.html` at root.

## Phase 2 — relocate RevEng-unique material out of src/, webapp/

1. `mkdir plans/templates` then
   `git mv src/Plan_template.md src/Impl_template.md src/Plan_Impl_template.md plans/templates/`.
2. Edit `.claude/skills/plan-scenario/SKILL.md` line 7: `Read src/Plan_template.md` →
   `Read plans/templates/Plan_template.md`. Same edit in
   `.claude/skills/impl-scenario/SKILL.md` line 7 for `Impl_template.md`. These are the
   only two references outside src/ (verified by grep across .claude/ and plans/).
3. `git mv webapp/archive archive/webapp` (pre-Fork-GUI-port timeline.ts/styles.css live
   here — archive-preserve convention).
4. `mv webapp/.plate archive/webapp-plate` (untracked capture screenshots; preserved, not
   deleted). `tests/.plate` stays where it is — tests/ survives.

## Phase 3 — delete the byte-identical duplicates

1. `git rm -r src webapp scripts` and `git rm tsconfig.webapp.json`.
2. `rm -rf webapp/dist` then remove the now-empty `webapp/` dir (git rm leaves untracked
   build output behind; dist is regenerable from jfred's sources).
3. tests/: delete exactly the files that exist at the same relative path in
   `/Users/matkatmusicllc/Programming/jfred/tests`, EXCEPT the two python tests (kept —
   see facts). Deterministic loop:
   `for f in tests/*.ts tests/*.test.ts; do b=$(basename "$f"); [ -f "/Users/matkatmusicllc/Programming/jfred/tests/$b" ] && git rm -q "$f"; done`
   (covers *.test.ts plus fixtures.ts/utilities.ts/…-helpers.ts; the 5 task tests have no
   jfred counterpart and survive). Then `git rm -r tests/fixtures` — its only consumers
   were the deleted TS tests, and jfred/tests has an identical copy.
   `tests/archive/`, `tests/.plate/`, `tests/.gitignore`, `tests/__pycache__` stay.
4. Edit `tsconfig.json`: `"include": ["tests"]`, `"exclude": ["tests/archive"]` (src,
   scripts, webapp entries are gone; webapp excludes are dead).
5. KEEP at root: `run-all-scenarios.py` (differs from jfred's),
   `scenario-completeness-audit.py` (operates on RevEng's populated scenarios/executed).

## Phase 4 — add the JFRED submodule at jfred/

1. `git submodule add https://github.com/matkatmusic/jfred.git jfred`
2. Verify the recorded pin: `git -C jfred rev-parse HEAD` → must be `082468f...`. Do NOT
   init jfred's own sub-submodules (scenarios/tmux_lib/claude_plugin_lib) — serving the
   webapp needs only jfred's tracked files; sub-submodules matter only for regenerating
   scenarios or running jfred's tests, which this task doesn't do.

## Phase 5 — repoint npm run app / 7343

1. package.json `scripts` becomes:
   ```json
   "test": "node --import tsx --test tests/*.test.ts",
   "typecheck": "tsc --noEmit",
   "build:webapp": "tsc -p jfred/tsconfig.webapp.json",
   "app": "npm run build:webapp && tsx jfred/src/viewer_server.ts --projects-dir scenarios/executed"
   ```
   (`test`/`typecheck` unchanged; `--projects-dir scenarios/executed` keeps serving
   RevEng's populated 195 fixture dirs — jfred's own checkout has an empty executed/.)
2. README.md: append two lines stating the webapp + engine now live in the `jfred/`
   submodule (github.com/matkatmusic/jfred); `git submodule update --init jfred` then
   `npm install && npm run app` serves it on port 7343.

## Phase 6 — local verification (no test suites)

1. `npm run build:webapp` → exit 0 and `jfred/webapp/dist/` exists.
2. Start `npm run app` in the background; `curl -s http://localhost:7343/` returns the
   webapp index HTML; kill the server. If 7343 is already busy, kill the stale listener
   first (`lsof -ti :7343`).
3. `git -C jfred status --porcelain` → empty (proves .cache/dist stay ignored inside the
   submodule).

## Phase 7 — clean-room check (task step 5, scripted part only)

In the session scratchpad dir (NOT /tmp):
1. `git clone --recursive https://github.com/matkatmusic/jfred.git`
2. `npm install` in the clone.
3. `npm run app` in the background (its own script serves `$HOME/.claude/projects`);
   `curl -s http://localhost:7343/` → index HTML; kill. Ensure the Phase 6 server is
   stopped first (same port).
4. Confirm `.claude/skills/run-scenario/SKILL.md` and `.claude/settings.json` (the
   UserPromptSubmit hook) exist in the clone.
5. EXPLICITLY LEFT TO THE USER (report in the summary, do not run): clean-room `npm test`
   and the interactive `/run-scenario` skill+hook check under `command claude`.

## Phase 8 — tasks bookkeeping

1. Append task 112 to tasks.json: title "Update engine-pipeline-diagrams.html to match the
   JFRED engine and copy it into the JFRED repo"; description captures the user's
   2026-07-16 wording: the diagram page stays at RevEng root until it is updated to match
   JFRED's current engine pipeline, then a copy lands in the JFRED repo.
2. Move task 111's object from tasks.json to completedTasks.json with
   `completionDate: "2026-07-16"` and a `closureNote` summarizing: zero-jot sweep verified
   clean; frontends archived; full cutover (duplicates deleted, JFRED submodule at jfred/
   pinned 082468f); 7343 repointed; clean-room clone check done minus user-run tests.
   Omit `commitHashes` (work staged, not committed — the user commits).
3. Move task 58's object to completedTasks.json the same way (`closureNote`: STEPs 1+2
   shipped 2026-07-16 in commits 00d639d/b6a720e/5b63b59, STEP 3 was task 111, now
   complete).

## Phase 9 — stage (SELECTIVE — never `git add -A`)

Pre-existing unstaged noise (deleted plans/*.md, `.vscode-parent/launch.json`, the
`scenarios` submodule pin drift) predates this task and MUST stay unstaged (handoff
instruction). `git mv`/`git rm`/`git submodule add` already staged their own changes; add
only this task's remaining paths:
`git add archive plans/templates plans/task111-jfred-submodule-cutover.md package.json tsconfig.json README.md tasks.json completedTasks.json .claude/skills/plan-scenario/SKILL.md .claude/skills/impl-scenario/SKILL.md .gitmodules jfred`
plus the implementation-notes file /jot:implement creates. Verify with `git status` that
none of the noise paths moved to the index. DO NOT commit.

No new logic is introduced anywhere (file moves, deletions, JSON/script-line edits), so no
new tests are written; the surviving suite is the 5 task-workflow tests + 2 python tests,
which the user will run.
