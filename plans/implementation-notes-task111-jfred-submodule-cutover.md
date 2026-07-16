## 2026-07-16:14:10:00 — Task 111 (task 58 STEP 3): frontend archiving, JFRED submodule cutover, 7343 repoint
Chat title: tackle-tasks 111 — JFRED submodule cutover
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/66a0b12e-262e-4598-8d40-17bc5895ed00.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task111-jfred-submodule-cutover.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260716-1240.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task58-step2-jfred-harness.md
/Users/matkatmusicllc/Programming/jfred (local clone; pushed branch develop @082468f)

### Design decisions
- Full cutover confirmed by the user in-session: RevEng's byte-identical copies of src/,
  webapp/, scripts/, tsconfig.webapp.json, and the duplicated tests were DELETED (git rm),
  not archived — the content lives on in the jfred/ submodule inside this repo and in git
  history. RevEng-unique material was moved, never deleted: the 3 planning templates →
  plans/templates/ (both SKILL.md references updated), webapp/archive → archive/webapp,
  webapp/.plate captures → archive/webapp-plate.
- The repointed scripts run everything from RevEng's root with RevEng's own node_modules
  (`tsc -p jfred/tsconfig.webapp.json`, `tsx jfred/src/viewer_server.ts`): tsconfig paths
  resolve relative to the tsconfig file and viewer_server resolves webapp/ + .cache/ via
  import.meta.dirname, so no npm install is needed inside the submodule and the submodule
  stays clean (jfred/.gitignore covers .cache/ and dist).
- `--projects-dir scenarios/executed` kept pointing at RevEng's checkout — it holds the 195
  executed fixture dirs; jfred's own scenarios sub-submodule checkout has an empty executed/.
- The 2 python tests (test_run-all-scenarios.py, test_run_all_scenarios.py) were kept even
  though jfred/tests has identical copies, because they exercise run-all-scenarios.py, which
  stays in RevEng and DIFFERS from jfred's (jot-era vs dispatcher-era).
- scenario-completeness-audit.py kept at root (operates on RevEng's populated
  scenarios/executed).
- engine-pipeline-diagrams.html kept at root per the user's answer; new task 112 covers
  updating it to match JFRED's engine and copying it into the JFRED repo.

### Deviations
- Plan assumed `git submodule add` would land on 082468f. It landed on 0eabc4c ("Initial
  commit") because GitHub's DEFAULT branch for jfred is `master`, which was never pushed
  past the initial commit — the real work lives on `develop`. Fixed by checking out
  082468f in the submodule and recording `branch = develop` in .gitmodules.
- Clean-room clone therefore used `git clone --recursive -b develop …` instead of the
  plan's plain clone. A plain `git clone` of jfred currently yields the EMPTY initial
  commit (see Open questions).
- webapp/.gitignore (8 bytes, "dist") survived `git rm -r webapp` as an untracked leftover;
  removed with plain rm rather than archived — it ignored a directory that no longer exists.
- Clean-room `npm test` and the interactive /run-scenario hook check were NOT run, per the
  user's standing instruction this session (user runs all tests). Everything else in task
  step 5 was done: recursive clone, npm install, its own `npm run app` served HTTP 200 on
  7343, and .claude/skills/run-scenario/SKILL.md + .claude/settings.json exist in the clone.

### Tradeoffs
- Driving the submodule's build/serve from RevEng's node_modules avoids a second npm
  install and lockfile drift, at the cost of RevEng's devDependencies needing to stay a
  superset of what viewer_server/tsc need (today they are identical lists).
- Deleting duplicates instead of archiving trims ~34k lines from the working tree but makes
  jfred/ the ONLY editable home for engine/webapp work — future scenario fixes are made in
  the submodule, pushed to jfred, then the pin bumped here.

### Open questions
- GitHub default branch for matkatmusic/jfred is `master` at the empty initial commit; a
  plain `git clone` (the README instruction on the jfred side) gets an empty tool. Switch
  the default branch to `develop` (one click in GitHub settings, or
  `gh repo edit matkatmusic/jfred --default-branch develop`)? Left untouched — outward-facing
  repo setting.
- Left for the user to run: RevEng `npm test` (5 task-workflow tests + 2 python tests
  remain), `npm run typecheck`, clean-room `npm test`, and the interactive /run-scenario
  check under `command claude`.
- The scenarios submodule pin drift, deleted plans/*.md, and .vscode-parent/launch.json
  noise remain UNSTAGED per the handoff instruction.
