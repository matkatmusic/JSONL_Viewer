# Handoff: implement the RevEng function-name audit & rename (CSV-gated, Stages 1–3)
Conversation name: plan 'use proper function names'
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/2cfe77ab-377b-4a50-a2f2-0ca7276359b2.jsonl

## Branch
`develop` based on `develop` (root). Only one commit exists — `1a9f098 Initial commit`; all RevEng source is currently untracked/uncommitted. CWD is `RevEng/`, which is its own git repo (the parent `claude code src/` is not a repo).

## Goal
Audit **every function name** in `RevEng/` against the guideline *"name functions based on what they do, and include a verb in the name"* and rename the violators, so the code is self-documenting. This pass is **function names only** — variable-name auditing is explicitly deferred. Renames are applied through a **user-reviewed, multi-stage CSV** so the human approves every change before code is touched.

## Current State
**No code has been changed.** The deliverable so far is a fully-designed, finalized plan. Completed analysis:
- **Inventory:** ~758 unique function names across **~127 in-scope `.js` files** (`api` 34, `tests` 54, `tools` 14, `web-shared` 10, `viewer` 7, `diff` 5, `unified` 1, `jfred` 1, `plans/research/.../scan.js` 1).
- **Duplicates:** 64 names defined in >1 file, categorized; **0 are genuine co-loaded global collisions** (computed) → uniqueness gate is clear.
- **Mechanism validated:** the LSP tool has no `rename` op and its `findReferences` misses cross-file CommonJS/global usages.
- **Scope locked:** `*/archive/` excluded, `common/` is 100% archive (excluded), `jsonl-tree-viewer.ts` excluded (dead monolith).
- `plans/naming/` does **not** exist yet; the CSV and rename script are **not** created yet.
- Tests not run this session (nothing changed). The next agent runs them after edits.

## What Remains
Execute in order (each stage **pauses for the user** — this is gated, not one-shot):
1. `mkdir -p plans/naming` (use Bash).
2. **Stage 1 — Inventory CSV.** Build `plans/naming/function-names.csv`: header `oldName,needsRename`, sorted + de-duplicated, one blank-`needsRename` row per function name (~758). Enumerate via LSP `documentSymbol` per file, reconciled with the regex cross-check (`function NAME(` + named arrow-consts) so method-shorthand/class methods aren't missed. Write via the **Write tool**. Hand to the user to mark `Y`/`N`. **Do not pre-mark.**
3. **Stage 2 — Suggestions.** For each `Y` row append a verb-first `newName`; for `N` rows set `newName = oldName`. Hand back for the user to adjust/approve.
4. **Stage 3 — Enrich + execute.** Append `file, line, isExported, numReferences` (reconcile LSP `findReferences` + repo-wide grep over `*.js` and `*.html`). Expand any duplicated isolated name (`main`, `parseArgs`, …) into one row per defining file, each with its own `newName`. Then write and run `plans/naming/rename-functions.py`; fix any row it flags (count mismatch) with native `Edit`.
5. **Verify** (see How to Verify). Before Stage 3, re-run the co-load collision check to confirm it is still 0 after the `.ts` exclusion.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/the-entire-codebase-needs-lovely-pixel.md` — **the plan; read this first.** Everything below is detail it already encodes.
- `api/line-state-evidence.js` — canonical example: `numberedLineEntries` (def line 70; passed as a callback at lines 196–197; export key line 235). Use it to sanity-check the rename engine catches all reference forms.
- `tests/test-helpers.js` — the `run()` / `summary()` test harness every `tests/test-*.js` requires.
- `jfred/jfred.html`, `diff/jfred-diff.html`, `unified/jfred-unified.html` — load `api/*.js` as **classic `<script>` globals** (the api files are dual-loaded: `require()` in Node *and* globals in browser).
- `viewer/*.js` — classic `<script>` globals; the heaviest function-naming offenders (`label`, `roleClass`, `attachFlat`, `btns`, `esc`).
- `web-shared/*.js`, `diff/jfred-diff-*.js` — ES modules / dual-consumed; more UI naming violations (`nextMatch`, `prevMatch`, `stepSource`).
- `tools/assemble-split-reads.js` ↔ `api/split-read-assembly.js`; `api/line-diff.js` ↔ `viewer/viewer-diff.js`; `verify-unified-scenarios.js` ↔ `verify-all-scenarios.js` — **duplicated implementations**; flag for possible dedup but renaming them is out of scope.
- `plans/naming/` — to be created; will hold `function-names.csv` and `rename-functions.py`.

## Plan File
`/Users/matkatmusicllc/.claude/plans/the-entire-codebase-needs-lovely-pixel.md`

## Context the Next Agent Won't Have
- **LSP cannot rename here.** The LSP tool exposes no `rename`; and `findReferences` **misses cross-file CommonJS namespace usage** (`var ev = require('...'); ev.foo()`) and `window` globals — proven: on exported `numberedLineEntries` it returned only 4 intra-file refs and missed `ev.numberedLineEntries(raw)` in `tests/test-line-state-evidence.js`. → Renames must reconcile **LSP `findReferences` + repo-wide grep across `*.js` AND `*.html`**.
- **Match the whole identifier token** (bounded by non-identifier chars). Do **not** search only ` name(` / `.name(` — that misses functions passed as values/callbacks and export-object entries. Whole-token replacement also updates export keys (`foo: foo`) automatically — that is *not* a separate task (user corrected an earlier draft that listed it separately).
- The per-row replacement count is a **guard/assertion** (`actual == numReferences`, else abort the row) — the user explicitly rejected calling this a "checksum".
- **Uniqueness is shared-namespace only** (user decision): isolated duplicate locals are acceptable — `main` (×13), `parseArgs` (×6), `fail`, per-file test helpers (`ref`, `beliefWithLines`, `snapshotLine`), and module-scoped functions in separate files. Only functions co-loaded as classic `<script>` globals on the *same* HTML page must be unique → **0 such collisions exist**, so nothing blocks the audit.
- **`jsonl-tree-viewer.ts` is excluded** (user decision): dead monolith, loaded by nothing, superseded by `viewer/*.js`.
- **Variables are out of scope** this pass (user). Do not rename variables.
- **Verb rule is strict:** `nextMatch`/`prevMatch` ARE violations (user: "nextMatch is not a good function name and does not contain a verb"). `api/`/`tools/` are already mostly clean; violations cluster in the UI layer.
- **The CSV workflow is gated:** pause for the user between every stage; never pre-fill `needsRename`; the user fills `Y`/`N`, then approves `newName` values.
- **Verification grep gotcha (user caught this):** `grep --include` does nothing without `-r`; `-r` recurses to any depth; **quote the globs** (`--include='*.js'`) so the shell doesn't expand them, and add `--exclude-dir=archive` to stay out of dead code.
- **File-writing policy:** all CSV/script/file writes use the **Write/Edit tools**, never shell redirection.

## How to Verify
- **Tests (custom Node runner, no pytest):**
  `for f in tests/test-*.js; do node "$f" || { echo "FAIL: $f"; break; }; done`
  (each test file is standalone, requires `tests/test-helpers.js`, and `h.summary()` exits 1 on failure.)
- **No residual old names:**
  `grep -rnE "\b(<each renamed oldName>)\b" --include='*.js' --include='*.html' --exclude-dir=archive .` → empty (except intended new names).
- **LSP diagnostics** clean on every touched file (no new "cannot find name" errors).
- **UI smoke check** (if UI functions were renamed): open `jfred/jfred.html`, `diff/jfred-diff.html`, `viewer/jsonl-tree-viewer.html` and confirm they still load/render.
- **Re-confirm 0 collisions** before Stage 3: a Node check that, per HTML page, intersects the page's classic (non-`type=module`) `<script src>` set against each duplicate name's defining files and flags any name present in ≥2.
