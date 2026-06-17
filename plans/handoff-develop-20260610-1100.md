# Handoff: Implement two CLI tools that find JSONL transcripts which touched a file

## Branch
`develop` based on `master` (only commit so far: `1a9f098 Initial commit`; working tree is almost entirely untracked — the whole project is uncommitted).

## Goal
Build two Node CLI tools that answer "which Claude Code session transcripts (`~/.claude/projects/*/*.jsonl`) ever **touched** a given file?" — where **touched = read (Read tool / `cat`) OR modified (Write/Edit/create/update/`cp`/`mv`/`git mv`/`rm`/redirect)** — and that **follow rename/move/copy events** so the answer isn't lost when the file was renamed over its lifetime. Tool 1 takes an on-disk path; Tool 2 takes a git repo + commit hash + path-at-that-hash and additionally reports whether the file is still on disk or was removed.

## Current State
**Planning only — zero implementation written.** The full, reviewed plan is finalized at `/Users/matkatmusicllc/.claude/plans/i-need-a-cli-parsed-quasar.md` (~21 KB). It was iterated through many rounds of user review; all open design questions are resolved (see "Context" below). No new source files, no tests, nothing committed. No test runner exists for the new work yet.

The codebase already has all needed primitives (JSONL parsing, read/write/cat/snapshot extraction, bash op parsing, git resolution) — the only new code is a permissive touch-collector + cross-JSONL rename-lineage tracker, plus two thin CLIs and their tests.

## What Remains
Execute strictly **RED-first** (write the test, confirm it fails, then implement to green), in this order:

1. **`tests/test-helpers.js`** — add and export two things:
   - `makeBashCommandLine(toolUseId, command)` — a general Bash `tool_use` line builder (existing `makeBashCatToolUse` hardcodes `cat -n`).
   - `runWithContext(name, fn)` — passes the test a per-test `ctx` with a `ctx.tempDir(prefix)` fixture that auto-removes its dir in a `finally`. It **reuses** the existing `run()` internally (no duplicated pass/fail accounting). **Leave `run()` exactly as-is.**
2. **`tests/test-collect-touches.js`** (RED) — the 8 tests verbatim in the plan: read-only file is a touch (the gotcha guard), create/cat touches, relative-`mv`-resolves-against-cwd, `mv` bidirectional + `cp` dst→src directional, 3-hop rename alias closure, and the end-to-end pre-rename-session test (uses `runWithContext`/`ctx.tempDir`).
3. **`common/collect-touches.js`** (GREEN) — implement: `collectTouches`, `buildLineageGraph`, `resolveAliases`, `enumerateJsonlFiles`, `findReferencingJsonls` (two-pass: collect touches+ops per JSONL once → build one global lineage graph → resolve aliases → match). Export all.
4. **`tests/test-find-jsonls-at-commit.js`** (RED) — the tests in the plan: `parseRenameHistory`, `pickCurrentPath` (most-recent target + fallback), `computeOnDisk` true/false (`runWithContext`), `gitFollowHistory` returns `''` on non-repo, and a guarded real-git-repo integration test.
5. **`tools/find-jsonls-at-commit.js`** (GREEN) — implement Tool 2: pure `parseRenameHistory`/`pickCurrentPath`, I/O wrappers `gitFollowHistory` (via `execFileSync`) and `computeOnDisk` (`fs.existsSync`), plus `main()`/arg-parsing. Export the testable functions.
6. **`tools/find-jsonls-for-file.js`** (GREEN) — thin CLI over `findReferencingJsonls([resolvedPath], projectsDir)`. (No separate unit suite — covered by collect-touches test #7; arg-parsing covered by the smoke test.)
7. **Verify**: run both new suites, the full regression, and the CLI smoke tests (see "How to Verify").

## Key Files
- `/Users/matkatmusicllc/.claude/plans/i-need-a-cli-parsed-quasar.md` — **the authoritative plan**; contains every test body verbatim and exact output shapes. Read it first.
- `common/replay-edits.js` — reuse `extractEditsFromJSONL` (covers create/update/edit/cat/snapshot/ops). **Note its reads filter** (see Context). `collectSessionsForFile` exists but inherits the filter — do not rely on it for reads.
- `common/extract-file-state.js` — reuse `extractReadEdits(lines, parsed)` (ALL reads, unfiltered) and `extractBashCatEdits`.
- `common/extract-bash-file-ops.js` — reuse `extractBashFileOps(parsed)` → `{type,src,dst,paths,path,mode,line}`.
- `common/git-file-state.js` — reuse `resolveRepoRootWalkingUp`, `computeRepoRelativePath`, `extractSessionMetadata`; mirror its thin git-CLI-wrapper style (upgraded to `execFileSync`).
- `tools/probe-projects.js` — reuse `discoverProjects(projectsDir)` (exported). `cwdFromFolderName`/`resolveRepoRoot` are NOT exported (not needed — get cwd from `extractSessionMetadata`).
- `tests/test-helpers.js` — the custom `run`/`summary` runner; extend per step 1.
- `tests/test-git-file-state.js` — reference for the guarded-integration-test pattern (the jot-repo skip guard).

## Plan File
`/Users/matkatmusicllc/.claude/plans/i-need-a-cli-parsed-quasar.md`

## Context the Next Agent Won't Have
- **The reads-filter gotcha (most important):** `extractEditsFromJSONL` only includes **Read-tool** reads for files that were *also written* in the same session (`appendFilteredReadEdits` in `replay-edits.js:99`, keyed on basename, `'create'`/`'edit'` only). A session that *only read* the target via the Read tool would be missed. `collectTouches` must call `extractReadEdits` **directly** to capture all reads. Note `cat` reads (`extractBashCatEdits`) and writes are NOT filtered.
- **Match on absolute paths, not basenames** (basenames collide across unrelated files). Reads/writes/cat already carry absolute paths; bash-op `src`/`dst`/`paths` may be **relative** → resolve with `path.resolve(session.cwd, p)` (cwd from the `type:'system'` record via `extractSessionMetadata`) and expand a leading `~`.
- **Lineage edge semantics (user-confirmed):** `mv`/`git-mv` = **undirected** edge src↔dst (same identity). `cp` = **directional** dst→src ("copy→source") — following a target reaches its copy-source, never the reverse.
- **Tool 2 decisions (user-confirmed):** rename discovery = git history (`git log --all --follow --name-status`) **unioned with** JSONL bash ops; the on-disk signal follows renames **forward** to the file's current name (`currentPath`) and reports `onDisk = fs.existsSync(currentPath)`.
- **Git access decision (user-confirmed):** use a thin in-repo `execFileSync('git', [args])` wrapper — NOT a library (rejected `simple-git`/`isomorphic-git`/`nodegit`), NOT `execSync` strings. `execFileSync` avoids shell injection; `isomorphic-git` was rejected because it lacks `--follow` rename detection. The project deliberately has **no `package.json`/dependencies** — keep it that way.
- **Test-infra decision (user-confirmed):** two separate functions — keep `run()` untouched, add `runWithContext()` — so tests that don't need fixtures are unchanged and the call name signals intent. An earlier design used a module-global `cleanups` array (rejected — fragile global state) and a `withTempDir` wrapper (rejected — more verbose). `fs.rmSync(dir,{recursive,force})` needs Node ≥14.14.
- **Output shapes are exact:** Tool 1 → `{ "filename": <input path>, "referencedIn": [<jsonl>...] }`. Tool 2 adds two fields → `{ "filename", "currentPath", "onDisk", "referencedIn" }`. Output is JSON to stdout by default — there is intentionally **no `--json` flag** (it was removed as redundant).
- **Why temp fixtures are safe to delete:** they're written by `fs.writeFileSync` at test runtime (not Claude tool calls) and live in `os.tmpdir()` (not `~/.claude/projects/`), so no transcript references them and the probe never scans them — deleting them cannot cause a reconstruction mismatch.
- **Style:** plain CommonJS, `var` only, `#!/usr/bin/env node`, hand-rolled arg parsing, `if (require.main === module) main();`, export core funcs. Follow `~/.claude/guides/` — especially `single-condition-branching.md` (one condition per `if`, no `&&`/`||` chains, no control-flow ternaries) for all NEW code; do not refactor reused `common/*` modules.
- **Cleanup:** delete the stray file `/Users/matkatmusicllc/.claude/plans/i-need-a-cli-parsed-quasar-agent-acb451ea7beb13567.md` — a misbehaving Explore agent created it; it is NOT part of the plan.

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng`:

1. New suites (each must FAIL before its module exists, then PASS):
   - `node tests/test-collect-touches.js`
   - `node tests/test-find-jsonls-at-commit.js`
2. No regression — every existing suite stays green:
   - `for f in tests/test-*.js; do echo "== $f"; node "$f" || break; done` (watch `test-replay.js`, `test-extract.js`, `test-git-file-state.js`).
3. Tool 1 smoke (file known to be edited this session → non-empty `referencedIn`):
   - `node tools/find-jsonls-for-file.js --path "/Users/matkatmusicllc/Desktop/claude code src/RevEng/common/replay-edits.js"`
4. Tool 1 rename check: find a transcript with a `mv`/`git mv`, query the **new** path, confirm the pre-rename session appears.
5. Tool 2 smoke:
   - `node tools/find-jsonls-at-commit.js --repo "/Users/matkatmusicllc/Desktop/claude code src/RevEng" --commit HEAD --path common/replay-edits.js` → `onDisk:true`, `currentPath` set, `referencedIn` non-empty. Re-run with a deleted/renamed path → `onDisk:false`.
