# Task 63 plan — GitHub Pages demo tier (publish JFReD static, cheap path)

Reality update since the task was written: the zero-server browser app (`jfred/` +
`api/` + `web-shared/`, entry `jfred/jfred.html`) now lives in RevEng's `archive/`
(the Fork-style webapp superseded it). It is still fully client-side (classic scripts
+ ES modules, no server), and `jfred-load.js` already auto-loads a JSONL from a
`?file=<url>` query param (relative URLs pass `rewritePath` untouched). The item-60
sample = `jfred/demo/projects/s87-demo-composite/*.jsonl` (~16 sessions, ~2.5 MB).

Constraint: this session stages but does not commit — and Pages enablement requires
commit+push+API call. Scope: ASSEMBLE the Pages site in the public jfred repo
(matkatmusic/jfred, develop) under `docs/`, stage it, and hand the user the exact
publish commands.

## Build `docs/` in the jfred repo (Pages "deploy from branch: develop, /docs")

1. `docs/api/` ← copy `RevEng/archive/api/*.js` (67 files, 488K — the FROZEN legacy engine).
2. `docs/web-shared/` ← copy `RevEng/archive/web-shared/*` (11 files).
3. `docs/jfred/` ← copy `RevEng/archive/jfred/{jfred.html,jfred-load.js}` unchanged
   (its `../web-shared/`, `../api/` relative refs resolve inside docs/).
4. `docs/demo/s87-demo-composite/` ← copy ONLY the `*.jsonl` files from
   `jfred/demo/projects/s87-demo-composite/` (never the repo.git.tar / any .git —
   the tasks-60/62 gitlink trap).
5. `docs/index.html` — hand-written landing page, honest labeling per the task:
   this is the DEBUGGER DEMO running the frozen legacy `api/` engine, NOT Engine B
   (`src/`); links each demo session as `jfred/jfred.html?file=../demo/s87-demo-composite/<uuid>.jsonl`.
6. `docs/.nojekyll` (skip Jekyll processing) and `docs/README.md` (provenance: frozen
   copy of RevEng `archive/` app + how to refresh it).

## Hand-off (user runs; outward-facing)
- Commit + push develop.
- Enable Pages via `gh api repos/matkatmusic/jfred/pages -X POST -f "source[branch]=develop" -f "source[path]=/docs"`
  (plain `gh repo edit` is classifier-blocked per the task-120 memory).
- Item 17 (full-fidelity Engine-B static demo) stays open — do NOT build the webapp shim.

Stage in the jfred submodule alongside the task-162 changes; do not commit.
