## 2026-07-16:09:55:00 — Task 58 STEP 1: populate JFRED with the canonical webapp + engine
Chat title: tackle-tasks 58 — JFRED step 1 (webapp + engine standalone)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/d4542af6-dde8-4940-8837-40fb7a5f3e8f.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task58-step1-jfred-populate.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tasks.json (task 58)
/Users/matkatmusicllc/Programming/jfred (target repo — 136 files staged, NOT committed)

### Design decisions

- JFRED's `npm run app` defaults `--projects-dir` to `"$HOME/.claude/projects"` — the
  flag is mandatory in viewer_server.ts and this is the one directory every Claude Code
  user has; the running app can switch via POST /api/config. RevEng keeps
  `scenarios/executed` (unchanged).
- No `test` script in JFRED's package.json: STEP 1 ships no tests/, and a script
  pointing at a missing directory would fail a cloner. STEP 2 restores it with the
  scenario harness.
- JFRED tsconfig.json = RevEng's minus `tests`/`scripts` in `include` (not shipped in
  STEP 1).
- Verification used `git checkout-index -a --prefix=<scratch>/` — an exact export of
  the staged index, i.e. what a clone of the eventual commit will contain — because
  the no-commit constraint rules out a literal `git clone`.

### Deviations

- None from the plan. Excluded from the copy per plan: `src/*.md` (planning templates —
  the only matkatmusicllc carriers under src/), `webapp/.plate/` (hook captures with
  absolute private paths), `webapp/archive/` (pre-port frontend), `webapp/dist/`
  (generated). `jfred/`, `api/`, `web-shared/` (superseded frontend) not shipped.

### Tradeoffs

- Kept all five RevEng devDependencies (incl. @xterm packages, used only for types —
  runtime xterm is vendored in webapp/vendor/) rather than pruning: pruning risks
  breaking typecheck for zero cloner benefit.
- `$HOME` in the npm script assumes a POSIX shell; Windows is a README concern for
  task 61, not engineered around here.

### Verification results (clone-equivalent export, port 7443)

- `npm install` + `build:webapp` (tsc -p tsconfig.webapp.json) clean — webapp has zero
  out-of-tree imports.
- GET / → 200, real index.html; GET /api/config → 200 with projectsDir/fileHistoryDir;
  GET /app/vendor/xterm.js → 200 (488,663 bytes).
- `npx tsc --noEmit` → PASS (src/ self-contained).
- Privacy gate: `git grep matkatmusicllc` and `git grep "Desktop/claude code"` in JFRED
  → zero hits.

### Open questions

- JFRED is staged but uncommitted per instructions; first commit + push still needs the
  privacy gate re-run at push time (STEP 3's clean-room check covers this).
- STEP 2 (scenario harness + run-all-scenarios) and STEP 3 (zero-jot + RevEng
  submodule + repoint npm run app) remain open in task 58.
