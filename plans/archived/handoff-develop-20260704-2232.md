# Handoff: JFRED console streaming fixed (uncork), consent gate closed, [file:line] attribution, and dedup Fix 1 (memoization) — Fix 2 "ReconstructionCorpus" designed but NOT built
Conversation name: live-progress-console (continuation session)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/dd701830-ec77-4b7c-b859-ed8837464558.jsonl
Plan file: none this session (prior spec: ~/.claude/plans/foamy-orbiting-quail.md, long since implemented). Prior handoff this continues: plans/handoff-develop-20260703-2144.md

## Branch
`develop` based on `develop`. Repo root: `/Users/matkatmusicllc/Desktop/claude code src/RevEng` (path has spaces — always quote). ALL of this session's work is COMMITTED (user commits himself): `259307f`, `c8c94a3` (user), `a3d830b`, `0490b5f`. Commits after mine (`b3b11fa` timeline v0.1, `f6d2852` LRU cache, `f5d43b5` scenarios submodule, `b79cf1b` pipeline diagram "after Core Design 1 reconstruction change") are CONCURRENT sessions' work — as are today's unstaged modifications (package.json, vocabulary.ts, reseed.ts, conversation.js, projects.js). Do not assume a working-tree diff is yours.

## Goal
Make the JFRED viewer's loading console actually stream live (it buffered everything until the build finished), make console lines debuggable (source JSONL file:line), close a consent-gate bypass, and stop the engine re-running identical deterministic work 5–21× per document build (the ~28s/timeout loads). Long-term: replace per-view recomputation with a single "ReconstructionCorpus" artifact (Fix 2, designed, not started).

## Current State
All verified and committed:
1. **Streaming root cause + fix (`0490b5f`/`259307f`, src/viewer_server.ts)** — Node's `OutgoingMessage.write` corks the socket and uncorks on `process.nextTick`, which never runs during the synchronous build → every NDJSON line (headers included) arrived in ONE burst at the end. Fix: `response.socket?.uncork()` after each `writeNdjsonLine`. Verified: 462 lines went from 2 flush instants to 26+ distinct 100ms buckets.
2. **Deep-engine progress labels** — build-scoped module sink `src/reconstruction_progress.ts` (mirrors `reconstruction_exec_gate.ts`; set/cleared in `buildDocumentWithConsent`'s try/finally). Labels at: `executeRunOnce`, `getPreExecutionState`, `runScriptAgainstState`, `injectScriptExecutions`, `discoverScriptCreatedPaths`, `reconstructFilesOver` (counted k/N), lineage replays, `reconstructStepTimeline`, `buildReconstructionDocument` sub-phases.
3. **`[file.jsonl:line]` source attribution (`a3d830b`)** — `loadTranscript` stamps every record's `{filePath, lineNumber}` (1-based FILE line, blanks counted) in a WeakMap (`getRecordSource`); `ScriptRun.source` carries it; `formatRunSource()` appends `[basename:line]` to all script-stage labels.
4. **Consent gate closed** — `discoverScriptCreatedPaths` returned sandbox executions even on DECLINED builds (it never checked `isImpureExecutionAllowed()`). Now gated; declined s84 build: ~25 sandbox runs → 0, 3.3s → 45ms. Test: `tests/exec-gate.test.ts::test_exec_gate_disable_blocks_script_created_path_discovery`.
5. **Console UX** — xterm restored after a brief plain-`<pre>` detour the user rejected; `selectionBackground` = accent + 35% alpha (default translucent-white was INVISIBLE on the light palette's white `--code-bg` — selections worked but looked broken); `rightClickSelectsWord: true`; copy-on-select via `onSelectionChange`/`getSelection`; a `copy` button (top-right) copies the whole buffer; `window.progressTerminal` exposed as a devtools handle.
6. **Dedup Fix 1 (`0490b5f`)** — three memos: (a) `selectBranchRecords`/`selectLiveBranch` return the SAME array instance per (records, tip) so identity-keyed caches downstream hit; (b) `reconstructStepTimeline()` runs ONE pass serving both step states + changes (old fns are one-line delegates; CLI untouched); `buildStepSnapshots` takes optional `surviving` and the document builder passes `branched.surviving` (kills the duplicate `reconstructAll`); (c) `reconstructFileOver` memoized per (records, reader, exec-gate) for PURE TOP-LEVEL calls only. Measured: declined project 3.3s→45ms with zero repeated engine work; consented project build: >120s timeout → 25.3s complete. Tests: `tests/reconstruction_memo.test.ts` (3).

`npm run typecheck` was clean at my last commit; concurrent sessions have since added code (e.g. `src/cache_lru.ts` now imported by `reconstruction_script_execution.ts`) — re-verify before trusting.

## What Remains
1. **Fix 2 — the ReconstructionCorpus (agreed design, not started).** Root cause of remaining duplication: every view is a pure function of `records` that re-derives the FileHistory[] foundation; build once, project many. Shape: `{ branches; recordsForBranch(tip); historiesFor(scope); executionFor(run); contentBefore(target, time) }` — introduce as a thin memoizing facade over existing pure functions, migrate call sites incrementally. NOTE: commit `b79cf1b`'s message says the pipeline diagram was updated "after Core Design 1 reconstruction change" — a concurrent session may have STARTED this; check `git show f6d2852 b79cf1b` and `src/cache_lru.ts` before designing, to avoid duplicating work.
2. **Residual duplication (expected fix-1 leftovers, quantified):** consented s84 PROJECT build still does 186 sandbox runs, worst single run 18×. Sources: per-branch record arrays (legitimately different content), rolling per-target re-execution in `beaconlessScriptExecutions` (semantic, keep), and in-recursion lineage replays (uncacheable under the current stack-dependent cycle guards — see Context). These are what the corpus's `executionFor`/`contentBefore` eliminate.
3. If asked to profile again: `logs.txt`-style duplicate analysis method is in the conversation — strip `HH:MM:SS.mmm` prefixes, count identical remainders.

## Key Files
- `src/viewer_server.ts` — `handleDocumentRequest` progress path; the `uncork()` fix lives in `writeNdjsonLine`.
- `src/reconstruction_progress.ts` — the build-scoped progress sink (set/clear in `viewer_api.ts::buildDocumentWithConsent`).
- `src/reconstruction_branches.ts` — `reconstructFileOver` memo (`fileOverCaches`) + `computeFileRevisionsOver`; `seedingLineages` cycle guard; `getLineageContentBefore`.
- `src/reconstruction_branch.ts` — memoized `selectBranchRecords` (`branchSelections` WeakMap) + `computeBranchRecords`.
- `src/reconstruction_steps.ts` — `reconstructStepTimeline` (the single-pass states+changes).
- `src/reconstruction_json.ts` — `buildStepSnapshots(records, reader, target, surviving?)`; `buildReconstructionDocument` passes `branched.surviving`. Concurrent session added sessionId/git-evidence fields here.
- `src/reconstruction_script_stage.ts` / `_script_execution.ts` — consent gate, `executeRunOnce` per-array memo (`executionsByRecords`), `formatRunSource`, rolling `runOutcomeForTarget`. Concurrent session added `cache_lru.ts` usage here.
- `src/parse/loadTranscript.ts` — record source stamping (`getRecordSource`), numbered-lines parse loop.
- `webapp/app.js` — `ensureProgressTerminal` (theme/selection/copy), `logProgress`, `fetchLogged`.
- `engine-pipeline-diagrams.html` (repo root) — the engine's own call-graph map (Mermaid); diagram #2 is the function-level pipeline. Updated by a concurrent session in `b79cf1b`.
- `tests/reconstruction_memo.test.ts`, `tests/exec-gate.test.ts`, `tests/viewer-progress.test.ts` — the checks guarding this session's work.

## Context the Next Agent Won't Have
- **The cork/nextTick trap**: `res.write` during a synchronous handler buffers EVERYTHING (headers too) until the event loop turns. A single `socket.uncork()` per line fixes it. `setNoDelay` is irrelevant to this. If streaming "breaks" again, check for a new write path missing the uncork.
- **Measurement clients lie**: Bun's `fetch` (context-mode sandbox) buffered the whole NDJSON body and made the fixed server look broken — curl `-N` told the truth. A same-process repro also lies (client shares the blocked event loop). Always measure with curl from another process.
- **Why the `reconstructFileOver` memo caches ONLY pure top-level calls** (`resolving.size === 0 && seedingLineages.size === 0`): results computed inside copy/lineage recursion are STACK-DEPENDENT — the cycle guards (`seedingLineages`, `resolving`) change what a nested compute can see, so caching them (or serving a top-level cached result inside a recursion) would CHANGE OUTPUT, not just speed. Anyone extending this memo must preserve that split. Cache validity includes reader identity AND the exec-gate flag (a declined build's histories must never serve a consented one — tested).
- **The engine's exec gate defaults ON** (CLI/tests) and the viewer boots it OFF; the gate flag is part of both new caches' keys.
- **User workflow rules (repeatedly enforced)**: he runs the server himself on 7343 (`cd "…/RevEng" && npx tsx src/viewer_server.ts --port 7343 [--projects-dir "plans/scenarios/executed"]`); he runs `npm test` himself ("I'll run tests, you don't need to") — run typecheck only; he commits — you only `git add` EXACTLY the files you touched (never `-A`; the repo has multiple concurrent sessions and your staging may be reset by his commits — re-check before assuming staged state survives).
- **Client vs server confusion**: `webapp/*` changes need only a browser reload; `src/*` changes need the node process restarted. Confirm the server runs new code (look for a new label in the stream) before trusting any repro.
- **VS Code debugger env leaks into shells**: prefix `NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS=` on node/npm commands or output gets debugger noise (and `npx tsx`, never bare `tsx`).
- **gstack browse daemon restarts between Bash calls** and loses page state/refs — do goto→act→assert in ONE bash call; click by JS text-match, not stale @refs.
- **xterm selection**: default `selectionBackground` is translucent white → invisible on light themes. Programmatic selection via `window.progressTerminal.select(col,row,len)` works headlessly; synthetic mouse-event drags do NOT drive xterm's selection service.
- **s84 numbers for comparison**: declined project build 45ms/334 lines/0 sandbox; consented single-file ~1.1s/8 sandbox; consented project 25.3s/186 sandbox, worst repeat 18×. If these regress, the memos broke.

## How to Verify
```
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS= npm run typecheck
NODE_OPTIONS= VSCODE_INSPECTOR_OPTIONS= npx tsx --test tests/reconstruction_memo.test.ts tests/exec-gate.test.ts tests/viewer-progress.test.ts
# full suite is the user's to run; it was 377/377 green at commit 0490b5f (concurrent sessions have added tests since)
```
Live check: start the server against `plans/scenarios/executed`, stream `/api/document?project=s84-multiagent-scripts-git-baseline&allowScripts=0&declined=1&progress=1` with curl -N: expect first line ~instantly, zero `running script in sandbox` lines, and lines spread over the build (not one burst).
