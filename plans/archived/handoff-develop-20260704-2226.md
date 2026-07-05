# Handoff: Build-cache work is DONE and committed — viewer loads s84 in 7.3s cold / 0.03s warm; next agent picks up follow-ups only
Conversation name: Implement build-cache plan — kill the 25s s84 load
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/ab917de1-84be-4e1b-955e-dabe227f3a71.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/reveng-single-reconstruction-artifact.md (FULLY EXECUTED — do not re-run it)

## Branch
`develop` based on `main`. HEAD `b79cf1b` "engine pipeline visual (html) updated after Core Design 1 reconstruction change".
The build-cache work landed in `f6d2852` "added LRU speed up for HTML viewer loading";
the diagram update landed in `b79cf1b`. Nothing is staged.
The working tree carries 7 modified files from OTHER sessions (package.json,
package-lock.json, src/reconstruction_reseed.ts, src/structures/vocabulary.ts,
tests/vocabulary.test.ts, webapp/views/conversation.js, webapp/views/projects.js) —
do not revert, fix, or stage them. Merges always `--no-ff`; never delete files
(RETIRED headers only); stage only, the user commits.

## Goal
The 25s s84 project load in the HTML viewer was ~92% repeated deterministic sandbox
work. That is fixed and committed: a content-keyed memo at the engine choke point
(`runScriptAgainstState`) plus server-side records/document LRU caches in the viewer.
This handoff exists so the next session starts from "done" and only takes follow-ups.

## Current State
- ALL of ~/.claude/plans/reveng-single-reconstruction-artifact.md is implemented,
  gated, and committed (f6d2852): `src/cache_lru.ts` (LRU primitives),
  sandbox memo + `spawnSandboxRun` extraction in `src/reconstruction_script_execution.ts`,
  `computeTranscriptSetStamp` / `loadProjectRecords` / document cache in `src/viewer_api.ts`,
  all four endpoints routed through the caches in `src/viewer_server.ts`, 20 new tests.
- Gates at completion: `npm test` 420/420, `npm run typecheck` clean,
  `npx tsx scripts/check_scenario_coverage.ts` 85/85.
- Measured through the real viewer pipeline (fresh server, port 7345,
  `--projects-dir "plans/scenarios/executed"`, project `s84-multiagent-scripts-git-baseline`,
  `/api/document?...&progress=1&allowScripts=1`): cold consented build 25.40s → 7.34s
  (sandbox spawns 186 → 38, memo hits 148); warm reload 0.03s with both cache-hit
  labels; diff/vs-base/range-patch ~10ms each.
- `engine-pipeline-diagrams.html` tabs 2–3 updated with the memo + cache_lru (b79cf1b).
- Full narrative: plans/implementation-notes-build-cache-s84.md.

## What Remains
No mandatory work. Candidate follow-ups in priority order, each needs user approval first:
1. Disk-backed sandbox memo (persist sha256→outcome across server restarts) — the only
   lever left on the 7.3s cold load; the remaining time is 38 genuinely-distinct python3
   runs + parse. Deliberately out of scope of the executed plan.
2. Add a viewer request-path tab to engine-pipeline-diagrams.html (the server-side
   records/document caches currently get only a one-line mention on the cache_lru node).
3. Cache the serialized `JSON.stringify(document)` string beside the document if reload
   latency ever shows it (ponytail note in viewer_api.ts, "Known remaining repeated work").

## Key Files
- plans/implementation-notes-build-cache-s84.md — baseline/result measurements with exact commands, deviations, tradeoffs.
- src/reconstruction_script_execution.ts — sandbox memo (`computeSandboxInputKey`, `sandboxOutcomesByInput`, `spawnSandboxRun`).
- src/viewer_api.ts — stamp + `loadProjectRecords` + `buildDocumentWithConsent` caches, `ARTIFACT_CACHE_CAPACITY = 8`.
- src/viewer_server.ts — all four endpoints route through `loadProjectRecords`/`buildDocumentWithConsent`; `/api/diff` builds UNTARGETED on purpose.
- src/cache_lru.ts + tests/cache_lru.test.ts — shared LRU primitives.
- tests/viewer-artifact-cache.test.ts — the 14 Part-B tests incl. the B5a characterization test.
- plans/coding-requirements.md — mandatory style rules.

## Context the Next Agent Won't Have
- The plan predicted ~14 cold spawns; reality is 38. The memo makes duplicate spawns
  impossible (one per distinct sha256(script + sorted seeded contents)), so 38 is the
  TRUE distinct-input count — the "14 distinct" figure came from logs1.txt spawn LABELS
  (script first line + file count), which cannot see seeded-content differences across
  lineage replays. Do not "fix" the spawn count; it is correct.
- 7.3s cold is the floor for this design: real python3 executions on distinct inputs.
  Only cross-restart persistence (follow-up 1) cuts it further.
- `/api/diff` deliberately passes `target=undefined` so both diff views share the
  project-wide document cache entry; the equality is certified by
  test_revision_diff_from_untargeted_document_matches_targeted_build — if that test
  ever fails, the untargeted edit must be revisited, not the test weakened.
- tsc pitfall hit twice: `let x;` assigned only inside a closure narrows to `never` at
  later use — annotate such locals explicitly in tests.
- The s84 measurement project lives at plans/scenarios/executed/s84-multiagent-scripts-git-baseline/
  (3 JSONLs); the viewer scan root for it is `--projects-dir "plans/scenarios/executed"`.
- Port 7343 is the user's live viewer — check `lsof -i :7343`, never kill it; smoke on 7345.
- curl/wget in Bash are redirected by a context-mode hook in this environment — do timed
  HTTP measurement inside a single node fetch script (see the notes file for the pattern).
- Node test output is polluted by the VS Code js-debug bootloader — grep `^ℹ` for summaries;
  the repo path contains spaces (always quote); it's `npm run typecheck` (bare `npm typecheck`
  doesn't exist).
- User rules locked: strict red-green TDD with `test("test_<snake_case>")` + `// Scenario:`
  comments; 4-space indent; verb-named functions; one condition per `if`; compare exported
  constants never string literals; stage only, never commit; never delete files.

## How to Verify
- `cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng" && npm test && npm run typecheck` — expect 420/420 and clean.
- Engine touched? Also `npx tsx scripts/check_scenario_coverage.ts` — expect 85/85.
- Viewer smoke: `npm run app -- --port 7345 --projects-dir "plans/scenarios/executed"`, then load
  `/api/document?project=s84-multiagent-scripts-git-baseline&progress=1&allowScripts=1` —
  expect ~7s cold with "reusing sandbox result" lines, ~0.03s warm with
  "reusing cached transcript records" / "reusing cached document artifact".
