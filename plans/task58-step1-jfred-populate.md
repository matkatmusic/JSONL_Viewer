# Task 58 — STEP 1: Populate JFRED with the canonical webapp + engine

Goal: `/Users/matkatmusicllc/Programming/jfred` (currently only `LICENSE` + `.gitignore`)
becomes a standalone clone-and-run copy of the RevEng viewer: `npm install && npm run app`
serves the webapp on port 7343 with no dependency on RevEng, jot, or scenario fixtures.
STEP 1 ships the tool only — no tests, no scenario harness (those are STEPS 2/3).

Source of truth: the RevEng working tree at
`/Users/matkatmusicllc/Desktop/claude code src/RevEng` (copy the working tree as-is,
tracked or not — the staged webapp/engine work is part of the tool).

## Facts the steps rely on (verified 2026-07-16)

- `src/viewer_server.ts:41` resolves the webapp as
  `resolve(import.meta.dirname, "..", "webapp")` — a side-by-side `src/` + `webapp/`
  copy needs zero path edits.
- `--projects-dir` is MANDATORY (no default scan root), so JFRED's `app` script must
  supply one. `$HOME/.claude/projects` is the one directory every Claude Code user has.
  The running app can switch directories afterward via POST `/api/config`.
- `matkatmusicllc` / private-path hits inside the manifest area live ONLY in
  `src/*.md` (Plan/Impl templates) and `webapp/.plate/captures/*.json`. Excluding
  those (plus `webapp/archive/`, `webapp/dist/`) makes the privacy gate pass.
- JFRED's existing `.gitignore` already ignores `node_modules/` and bare `dist`
  (which covers `webapp/dist/`) — no gitignore edits needed.
- RevEng `tsconfig.json` includes `tests` and `scripts`, which STEP 1 does not ship —
  JFRED's copy must drop them from `include`.

## Steps (in order)

### 1. Copy the manifest into JFRED

```bash
REVENG="/Users/matkatmusicllc/Desktop/claude code src/RevEng"
JFRED="/Users/matkatmusicllc/Programming/jfred"
rsync -a --exclude='*.md' "$REVENG/src/" "$JFRED/src/"
rsync -a --exclude='.plate' --exclude='archive' --exclude='dist' "$REVENG/webapp/" "$JFRED/webapp/"
cp "$REVENG/tsconfig.webapp.json" "$JFRED/tsconfig.webapp.json"
```

- `--exclude='*.md'` on src/ drops the three planning templates (the private-string
  carriers); everything else under `src/` (top level + `parse/` + `structures/`) ships.
- webapp excludes: `.plate` (hook captures with absolute private paths), `archive`
  (pre-port frontend), `dist` (generated output).
- Do NOT copy `jfred/`, `api/`, `web-shared/`, `tests/`, `scripts/`, `scenarios/`,
  or anything else from RevEng.

### 2. Write JFRED's `package.json`

Create `$JFRED/package.json` (new file — none exists) with exactly:

```json
{
    "name": "jfred",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "description": "Reconstruct file change history from Claude Code session JSONL files (clean-room).",
    "license": "GPL-3.0-only",
    "scripts": {
        "typecheck": "tsc --noEmit",
        "build:webapp": "tsc -p tsconfig.webapp.json",
        "app": "npm run build:webapp && tsx src/viewer_server.ts --projects-dir \"$HOME/.claude/projects\""
    },
    "devDependencies": {
        "@types/node": "^22.20.0",
        "@xterm/addon-fit": "^0.11.0",
        "@xterm/xterm": "^6.0.0",
        "tsx": "^4.19.0",
        "typescript": "^5.7.0"
    }
}
```

- No `test` script: STEP 1 ships no `tests/`; a script pointing at a missing
  directory would fail a cloner. STEP 2 adds it back with the harness.
- `$HOME` expansion assumes a POSIX shell (macOS/Linux). Windows support is a
  README concern for task 61 — do not engineer around it here.

### 3. Write JFRED's `tsconfig.json`

Copy RevEng's `tsconfig.json` verbatim EXCEPT change the include/exclude lines to:

```json
    "include": ["src", "webapp"],
    "exclude": ["webapp/vendor", "webapp/dist", "webapp/archive"]
```

(`tests`, `scripts`, and `tests/archive` don't exist in JFRED.)

### 4. Stage in JFRED — do not commit, do not push

```bash
cd "$JFRED" && git add -A
```

### 5. Privacy gate (must pass before anything is ever pushed)

```bash
cd "$JFRED" && git grep -c matkatmusicllc -- . | cat
```

Expected: zero output (no hits in the index). Also run
`git grep -l "Desktop/claude code"` as a sanity sweep — expected empty.
If either hits, remove/scrub the offending file and re-stage; do not proceed.

### 6. Verify: clone-equivalent smoke run

`git checkout-index` exports exactly what a clone of the staged tree would contain,
without committing:

```bash
SCRATCH="/private/tmp/claude-501/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/d4542af6-dde8-4940-8837-40fb7a5f3e8f/scratchpad/jfred-clone"
mkdir -p "$SCRATCH"
cd "$JFRED" && git checkout-index -a --prefix="$SCRATCH/"
cd "$SCRATCH" && npm install && npm run app -- --port 7443
```

Run the server in the background, then verify (7443 avoids any live RevEng server
on 7343; npm appends the extra args to the final `tsx` command in the script):

1. `npm install` succeeds and `build:webapp` (inside `npm run app`) compiles with
   no errors — this proves the webapp has zero imports reaching outside the copied
   tree.
2. `curl -s http://127.0.0.1:7443/` returns the index.html markup (HTTP 200).
3. `curl -s http://127.0.0.1:7443/api/config` returns JSON containing
   `"projectsDir"`.
4. `npx tsc --noEmit` in the scratch clone passes (proves `src/` is
   self-contained too).
5. Kill the server.

No unit tests for this plan: it is pure packaging with no new logic; the smoke run
above is the runnable check that fails if the packaging is wrong.

### 7. RevEng side

No RevEng source changes. Stage only this plan file and the implementation-notes
file in RevEng; do not commit.
