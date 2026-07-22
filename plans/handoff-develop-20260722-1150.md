# Handoff: tasks 175/177/170 (+174) — multi-source batch implemented and staged, verification + bookkeeping remain
Conversation name: task 174 175 177 170
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/cd52c321-257b-4f35-824b-43fae2db98bc.jsonl
Plan file: plans/174-175-177-170-multi-source-batch.md (implementation notes: plans/implementation-notes-tasks-174-175-177-170.md)

## Branch
`develop` in BOTH repos (RevEng at 5ff11ab, jfred submodule at 05f5426 + staged work). The
scenarios submodule (RevEng/scenarios AND jfred/scenarios — two clones of the same repo) each
have the new s88 scenario file staged.

## Goal
Specs S4b/S5a/S6/S7a of specs/SPEC.md (task 166 multi-source reconstruction): the CLI accepts
multiple conversation-log sources (174), the engine merges per-file timelines across sources by
root-relative identity + content agreement (175), the webapp lets a project declare sources and
serves the merged reconstruction (177), and a new two-session/two-root acceptance scenario s88
exists (170). All four are IMPLEMENTED with green targeted tests; nothing is committed.

## Current State
Everything below is STAGED, uncommitted (user rule: never commit; user runs the full suite).

- jfred: 24 files staged, 1377 insertions. New engine modules
  `src/reconstruction_multi_source.ts` (dedupe §c1 / interleave §c3 / session roots §b / merge
  composition), `src/reconstruction_multi_source_join.ts` (§a identity join + clone-on-write
  path remap), `src/reconstruction_multi_source_gate.ts` (content-agreement gate). New
  `src/viewer_api_sources.ts` (resolveJsonlPaths moved from viewer_server_routes.ts + spec-S6
  multi-source union). CLI: `reconstruction_cli_args.ts` (multiple positionals, config/derived
  sources), `reconstruction_cli.ts` (multi-transcript strict load + merge). Overrides:
  `sources` field on PathOverrides + cache-stamp serialization. Webapp:
  `webapp/app-paths-sources.ts` (sources rows UI), `app-paths-project.ts` + `index.html` wired.
  New exports: `setRecordSource` (parse/loadTranscript.ts), `findMatchingSourceEntry`
  (reconstruction_sidecar_reader.ts).
- Tests all green in their files: tests/reconstruction_multi_source.test.ts (7),
  tests/reconstruction_multi_source_join.test.ts (3), tests/reconstruction_overrides.test.ts
  (12 incl. new serialize test), reconstruction_cli*.test.ts (41 total incl. 6 new),
  tests/viewer_api_sources.test.ts (2), tests/app-paths-sources.test.ts (5),
  tests/app-paths-project.test.ts (3, regression). `npx tsc -p tsconfig.json --noEmit` clean;
  `npx tsc -p tsconfig.webapp.json --noEmit` clean. Shared fixture helpers:
  tests/multi-source-test-helpers.ts.
- Scenarios: `s88-multi-source-two-roots.txt` staged in both scenarios clones (26 steps, roots
  alpha=/tmp/scen88-alpha + beta=/tmp/scen88-beta, a2 spawned `in beta`, four s87 mechanisms
  split a1=git-index+rename-stamp / a2=cwd-remap+time-aware-indirection, shared inventory.py
  synced via explicit cp steps). Linter passes on both copies. Ground-truth ladders:
  plans/170-s88-ground-truth-design.md (RevEng, staged).
- RevEng: plan + implementation notes + ground-truth doc staged. Submodule pointers (` m
  jfred`, ` m scenarios`) NOT yet bumped — they can't be until jfred/scenarios commit.

## What Remains
1. USER runs the full jfred suite (`cd jfred && npm test`) — the 87-scenario sweep and every
   pre-existing test must stay green. Watch for: tests that call
   `buildProjectReconstruction(..., sources)` with a non-empty sources list now ALSO get the
   dedupe/interleave/join stages (previously sources only reached the sidecar reader).
2. Update specs/SPEC.md statuses: S4 → done (cite #174; CLI + corpus-load dedupe landed), S5 →
   partially done (#175 done; #176 conflict notes still open), S6 → done (#177), S7 →
   partially done (#170 authored; #171 capture and #178 gate open).
3. Close tasks 174, 175, 177, 170 via /taskTools:close-tasks with closure notes (this also
   unblocks 171/176/178 if their blockers list these).
4. Commit: scenarios submodule first (both clones same commit), then jfred, then RevEng with
   both submodule pointer bumps + plans; push in that order (user preference: user reviews
   before push — ask).
5. Task 171 (next): /run-scenario capture of s88 into scenarios/executed + reveng-paths.json
   sources entry per plans/170-s88-ground-truth-design.md §"sources shape".
6. Known follow-up gaps (create tasks or fold into 176/178): (a) inspector blob drawer
   (readBlobSnapshot) still reads only the single effective file-history dir — multi-source
   blobs outside it won't render; (b) content gate implements only Edit evidence
   (originalFile/hunks) — non-Edit first evidence refuses the join (ponytail comment in
   reconstruction_multi_source_gate.ts); (c) multi-source builds run the per-records WeakMap
   memos cold (new merged array per build).

## Key Files
- jfred/src/reconstruction_multi_source.ts — dedupe/interleave/roots/merge composition
- jfred/src/reconstruction_multi_source_join.ts — §a join orchestration + clone remap
- jfred/src/reconstruction_multi_source_gate.ts — content-agreement gate
- jfred/src/viewer_api_sources.ts — resolveJsonlPaths (moved) + spec-S6 source union
- jfred/src/viewer_api.ts — buildProjectReconstruction applies merge; consent path passes
  getPathOverrides().sources
- jfred/src/reconstruction_cli_args.ts — jsonlPaths positionals + resolveCliSources
- jfred/webapp/app-paths-sources.ts — popover sources rows (initialize/render/collect)
- jfred/tests/multi-source-test-helpers.ts — fabricated Write/Edit record pairs + two-source
  fixture (records load via loadTranscript for source stamps)
- plans/174-175-177-170-multi-source-batch.md — the full plan (phase details)
- plans/170-s88-ground-truth-design.md — s88 intended revision ladders (acceptance ref for 171/178)
- specs/SPEC.md — statuses to update (step 2)

## Context the Next Agent Won't Have
- The 250-line-cap Stop hook counts COMMENT lines and applies to tests too; it forced the
  three-way engine module split and the viewer_api_sources.ts location (viewer_server_routes.ts
  AND viewer_api_projects.ts both sit at the cap — do not add lines to either; use pointer
  comments like "moved to X" instead of the comment-out convention when a move is cap-driven).
- Session roots are passed INTO joinCrossSourceFileIdentities as a parameter specifically to
  keep module imports one-way (multi_source → join → gate); don't "simplify" by importing back.
- The path remap MUST clone (never mutate) records — they live in loadProjectRecords' LRU
  cache; a later sources-less build of the same transcripts would see remapped paths. Clones
  are re-stamped via the new setRecordSource export, or per-source file-history resolution
  silently breaks (falls back to LIVE ~/.claude/file-history — long-standing trap).
- Evidence-content comparison must strip ONE trailing newline: the engine's line model drops a
  file's final "\n" (no empty trailing line entry), so originalFile equality fails otherwise.
- macOS temp dirs are /var → /private/var symlinks; resolveProjectFile realpaths at the trust
  boundary, so test expectations must realpathSync too (already done in
  tests/viewer_api_sources.test.ts — pattern to copy for new server tests).
- Spec-S6 decision: a project entry declaring `sources` is AUTHORITATIVE for jsonl discovery —
  the union replaces the active-dir scan, so the config author must list the primary source
  too. Legacy entries (no `sources`) keep the old single-dir scan byte-for-byte.
- CLI decision (task text allowed either): multiple conversation-log folders = multiple
  POSITIONAL jsonl paths; file-history dirs/roots come from the reveng-paths.json `sources`
  entry of the FIRST positional's project; >1 distinct projects root with no config derives
  bare {projectsDir} sources automatically.
- s88 authoring: `spawn` (EndCurrentAgentAndSpawnNewAgent) does NOT register a new agent name —
  only SpawnNewAgent (spawnconcurrent) does; post-spawn Edit steps in s88 use explicit
  `Edit @aN:` targets so the runner lands disk edits in the right root.
- User workflow preferences enforced this session: never commit (stage only), user runs the
  full suite, respond IMMEDIATELY when mid-turn user messages arrive (two were missed between
  tool calls this session — end the turn or surface the reply, don't keep streaming tools).

## How to Verify
```
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred"
npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.webapp.json --noEmit
node --import tsx --test tests/reconstruction_multi_source.test.ts \
  tests/reconstruction_multi_source_join.test.ts tests/viewer_api_sources.test.ts \
  tests/app-paths-sources.test.ts tests/reconstruction_cli.test.ts \
  tests/reconstruction_cli_args.test.ts tests/reconstruction_overrides.test.ts
python3 jfredToolsPlugin/tools/lint-scenario.py scenarios/s88-multi-source-two-roots.txt
npm test   # full suite — user runs this
```
