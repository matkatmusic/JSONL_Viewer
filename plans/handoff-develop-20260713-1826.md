# Handoff: Implement task 79 — full-fidelity disk-backed builtDocumentCache
Conversation name: tackle-tasks 78,80,79,77
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/744de2b7-f578-4a78-a3d6-bddbfb44f399.jsonl
Plan file: none yet for 79 — write one first (plan files for the finished tasks: plans/item78-timeline-build-progress.md, plans/item80-console-word-wrap.md)

## Branch
`develop` based on `master`

## Goal
Task 79: make the viewer's in-memory `builtDocumentCache` disk-backed so a server RESPAWN
(dev restart) skips reconstruction. Measured cost is severe — see Current State. The user chose
the **FULL-FIDELITY** scope: persist BOTH the wire `document` AND `stepFileHistories`, hydrated
back into real domain objects, so EVERY route (timeline, range-patch, step-files, diff, blob)
skips the rebuild on respawn — not just the timeline.

## Current State
- Tasks 78 (timeline build-progress overlay + reconstruction-phase progress bar) and 80 (console
  word-wrap) are DONE and committed: `7cb9768`, `6223600` (user tuned constants 500→100 / 100→10),
  `8a6cc73` (80), `9638d9f` (78 follow-up: fragment build + shared reconstruction progress bar).
- Task 79 is NOT started (no code, no plan). TASKS.md item 79 holds the measurement + decision +
  a design note.
- **Measurement (faithful respawn: fresh process, cold in-memory caches, WARM disk sandbox memo
  from item 11).** On the RevEng project (`-Users-matkatmusicllc-Desktop-claude-code-src-RevEng`,
  15 jsonl files, 30,201 records): parse 391 ms + `buildDocumentWithConsent` reconstruction
  **468,094 ms (~7.8 minutes)**; document JSON = **87.2 MB**. Harness (throwaway) is at
  `/private/tmp/claude-501/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/744de2b7-f578-4a78-a3d6-bddbfb44f399/scratchpad/measure-respawn.ts`
  (run: `npx tsx <that file> [projectName] [allowScripts 0|1]` from the repo root; it calls
  `setProjectsDir(~/.claude/projects)` + `configureSandboxMemoPersistence(.cache/sandbox-memo.json)`).
- The uncommitted files in `git status` (`src/reconstruction_corpus.ts`, `_extract.ts`,
  `_git_evidence.ts`, `_sidecar.ts`, `package.json`, `scenarios`, `.vscode-parent/`) are
  PRE-EXISTING — not part of this session's work. Leave them alone.

## What Remains
1. **Audit the exact shapes to hydrate.** Read `FileRevision` (`src/reconstruction_engine.ts:48`)
   and `FileHistory` (`:58` = `{ target: Path; revisions: FileRevision[] }`), and
   `ReconstructionDocument` (`src/reconstruction_json.ts:242`). List every domain-typed field
   (`Path`, `Date`, `Uuid` from `src/structures/domain.ts`) nested inside `document`
   (esp. `filesTouched`, `rewoundFilesTouched`, `steps`) AND inside `stepFileHistories`.
2. **Write a plan** (use `/make-a-plan`; follow `plans/coding-requirements.md` + the TDD guide).
3. **Build a structure-aware serialize + hydrate layer** for `BuiltReconstruction`
   (`{ document, stepFileHistories }`, `src/reconstruction_json.ts:259`). `JSON.stringify` already
   flattens domain objects via their `toJSON` (→ strings); the hard half is `hydrate*` functions
   that rebuild `new Path(...)`, `new Date(...)`, `Uuid` from the parsed strings — for the document
   subtree too (see Context: a plain parse is NOT enough).
4. **New module** `src/reconstruction_document_cache.ts`, opt-in exactly like item 11's
   `configureSandboxMemoPersistence` (`src/reconstruction_script_execution.ts` +
   `src/viewer_server.ts:369-377`): only `viewer_server.ts` enables it at startup; CLI + tests stay
   memory-only (keeps spawn-count tests deterministic). One file per cacheKey under
   `.cache/built-documents/` (gitignored — verify `.cache` is in `.gitignore`), filename =
   hash(cacheKey); LRU-capped (careful: 8 × 87 MB ≈ 700 MB — pick a sane disk cap, maybe 4–8, and
   log evictions). Embed a `schemaVersion` in each file; ignore/delete files whose version differs
   so a `BuiltReconstruction` shape change can't deserialize into corruption.
5. **Wire into `buildReconstructionWithConsent`** (`src/viewer_api.ts:301-333`): on in-memory miss,
   try disk (read + hydrate) → on hit, populate the in-memory `builtDocumentCache` and return; on
   miss, build as today, then persist to disk AND memory. Keep the existing cacheKey verbatim
   (`computeTranscriptSetStamp | allowScripts | targetKey | serializePathOverrides()`, line 311) —
   it is already restart-safe (file mtime+size stamp invalidates on any transcript edit).
6. **Correctness test (the gate):** build a SMALL scenario's `BuiltReconstruction` fresh →
   serialize → hydrate → assert the hydrated value drives `renderRangePatch` / step-file resolution
   (`resolveFilesAtStep`) to output IDENTICAL to the fresh build. A bad hydration silently corrupts
   patches — this test is mandatory. Put it in a new `tests/reconstruction_document_cache.test.ts`.
7. Add a `--resetDocumentCache` server flag mirroring `--resetSandboxMemo` (viewer_server.ts) for a
   forced cold rebuild. Mark item 79 done in TASKS.md; stage, don't commit; generate a ≤40-word
   commit summary via a Sonnet 5 subagent.

## Key Files
- `src/viewer_api.ts` — `buildReconstructionWithConsent` (301), `builtDocumentCache` (292),
  `computeTranscriptSetStamp` (129), `serializePathOverrides`, `ARTIFACT_CACHE_CAPACITY` (144),
  `getCachedValueRefreshingRecency` / `evictLeastRecentlyUsedEntries`.
- `src/reconstruction_json.ts` — `BuiltReconstruction` (259), `ReconstructionDocument` (242).
- `src/reconstruction_engine.ts` — `FileRevision` (48), `FileHistory` (58).
- `src/reconstruction_script_execution.ts` + `src/viewer_server.ts:369-377` — item 11 disk-memo
  precedent to copy (opt-in config, reset flag, whole-file persistence lifecycle).
- `src/structures/domain.ts` — `Path` / `Uuid` classes (constructors for hydration).
- `plans/coding-requirements.md` — mandatory style (domain types, DRY, enum members, verb names).

## Context the Next Agent Won't Have
- **A plain `JSON.parse` of the persisted value is NOT sufficient (proven this session).** Server
  code calls DOMAIN methods on the built values — e.g. `findFileHistory` calls
  `entry.target.equals()` (a `Path` method) on `document.filesTouched`. So the `document` subtree
  ITSELF (not just `stepFileHistories`) needs Path/Date/Uuid hydration, not just re-stringification.
  Do not assume "the document is only stringified to the client" — it is also read server-side.
- The document is `JSON.stringify`'d to the client at `src/viewer_server.ts:201`; that path alone
  would tolerate plain strings, but the range-patch/step-files/diff paths do not.
- A generic tag-based JSON replacer will NOT work to mark domain objects: `Path`/`Date` have
  `toJSON`, so the replacer only ever sees the already-stringified value and can't tag it. Use
  STRUCTURE-AWARE hydration (functions that know the field layout), not a generic reviver.
- User is actively tuning `LARGE_TIMELINE_ROW_COUNT` in place (already 500→100) — item-78 boundary
  tests were made to reference the exported constant instead of magic numbers so they survive
  tuning. Follow that pattern for any tuned constant you add.
- The 468 s reconstruction on 30k records also hints reconstruction itself scales poorly on huge
  real projects (separate from item 79 — see items 35/56). Out of scope; do not chase it here.
- Item 11's disk sandbox memo is already 55.4 MB at `.cache/sandbox-memo.json`; `.cache/` should
  already be gitignored (verify).
- Project rule: on replacing existing code, comment the old out first (with an item-79 marker),
  delete only after the new code is confirmed working. Tests: strict red-green TDD, `test_<behavior>`
  names, plain-English step comments. The user runs the full suite — you do not.
- Task 77 (file tree view for the Files column) is also still open and untouched — a separate task,
  not part of 79.

## How to Verify
- Typecheck: `npx tsc --noEmit` and `npx tsc -p tsconfig.webapp.json --noEmit` (both must be clean).
- Respawn win: after wiring, run the harness twice — first run builds+persists, second FRESH run
  should read from disk in well under a second instead of ~468 s:
  `npx tsx "/private/tmp/claude-501/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/744de2b7-f578-4a78-a3d6-bddbfb44f399/scratchpad/measure-respawn.ts"`
  (regenerate an equivalent harness if the scratchpad was cleaned — see Current State for what it does).
- Correctness: the round-trip hydration test in `tests/reconstruction_document_cache.test.ts`
  (step 6) must pass. Do NOT run the full suite — the user runs it.
