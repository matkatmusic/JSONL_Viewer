# Handoff: Implement the build-cache plan — kill the 25s s84 load (208 sandbox spawns, 14 distinct)
Conversation name: Ponytail ultra — plan the single-reconstruction-artifact change (handoff item 4)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/3248a5d0-28a5-4272-974c-307b379d3de9.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/reveng-single-reconstruction-artifact.md (NOT YET EXECUTED — this handoff's whole job is to execute it)

## Branch
`develop` based on `main`. HEAD `b3b11fa` "timeline of revisions v0.1". Nothing is staged.
The working tree carries 8 modified files from OTHER sessions (package.json, package-lock.json,
src/reconstruction_reseed.ts, src/structures/vocabulary.ts, webapp/views/conversation.js,
webapp/views/projects.js, tests/viewer-viewmodels.test.ts, tests/vocabulary.test.ts) — do not
revert, fix, or stage them. Merges always `--no-ff`; never delete files (RETIRED headers only).

## Goal
Eliminate repeated deterministic work when the webapp viewer (port 7343 app, `webapp/` +
`src/viewer_server.ts`) loads a project of JSONLs. Measured on the s84 project (logs1.txt,
repo root): a 24.8s load spends ~23.7s running 208 sandbox script executions of which only 14
are distinct (script, seeded-state) inputs. The plan file fixes this at the engine choke point
(Part A) and then makes repeat loads instant with server-side records/document caches (Part B).

## Current State
- Planning only — NO plan code is written. The plan file is complete, reviewed twice against
  `~/.claude/guides/planning.md` (full GREEN bodies, full RED test bodies, exact old→new server
  edits), and adversarially verified against logs1.txt.
- Baseline expectation before starting: `npm test` 400/400, `npm run typecheck` clean.
- logs1.txt (repo root, untracked) is the timing evidence; logs2.txt is a second capture.
- No server is running on 7345; 7343 may hold the user's live viewer — check `lsof -i :7343`,
  never kill it.

## What Remains
Execute the plan file top to bottom. It is self-contained; summary of its order:
1. Step 0 — baseline gates (`npm test`, `npm run typecheck`, `git status`).
2. Part A, Step A1 — new `src/cache_lru.ts` (LRU get-refresh + evict helpers) with
   `tests/cache_lru.test.ts`, red → green.
3. Part A, Step A2 — content-keyed sandbox memo inside `runScriptAgainstState`
   (`src/reconstruction_script_execution.ts:270`): sha256(script + sorted seeded contents) →
   outcome, failures memoized, capacity 256; 3 new tests appended to
   `tests/reconstruction_script_execution.test.ts`. Gates: full suite + typecheck +
   `npx tsx scripts/check_scenario_coverage.ts` → 85/85 (engine touched). Part A alone fixes
   the user's stated pain and is shippable by itself.
4. Part B, Steps B1–B4 — `computeTranscriptSetStamp` (mtime+size), `loadProjectRecords`
   records cache, document cache in `buildDocumentWithConsent`, LRU capacity 8; new
   `tests/viewer-artifact-cache.test.ts` (14 tests) + 2 helpers added to `tests/utilities.ts`
   + 2 cold-build isolation edits in `tests/viewer-progress.test.ts` (plan Step B3c).
5. Part B, Step B5 — five exact edits in `src/viewer_server.ts` routing all four endpoints
   through the caches (the characterization test in B5a runs FIRST and gates edit 5).
6. Step B6 — gates + manual smoke on port 7345 (cold s84 load in a few seconds, ≤~14 sandbox
   spawns, cache-hit labels on reload), then `git add` ONLY the plan's listed paths. Do not
   commit — the user commits.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/reveng-single-reconstruction-artifact.md` — THE plan;
  read fully before any edit. Every function body, test body, and server edit is in it.
- `logs1.txt` (repo root) — the 208-spawn timing evidence the plan's numbers come from.
- `src/reconstruction_script_execution.ts` — `runScriptAgainstState` (line ~270), Part A target.
- `src/reconstruction_script_stage.ts` — the two leak call sites (context only; NOT edited).
- `src/viewer_api.ts` / `src/viewer_server.ts` — Part B targets.
- `tests/fixtures.ts` / `tests/utilities.ts` — S1/S19/S37/S85 fixtures and shared test helpers.
- `plans/coding-requirements.md` — mandatory style rules for all new code.

## Context the Next Agent Won't Have
- ROOT CAUSE (from logs1.txt, not guesswork): `executeRunOnce`'s memo
  (`reconstruction_script_stage.ts:30`) keys on records-ARRAY IDENTITY and lineage/branch
  replays pass different arrays (62 misses for ~11 runs); the rolling-chain path
  (`reconstruction_script_stage.ts:244`) calls `runScriptAgainstState` with NO memo (~146
  spawns). Do NOT fix those two sites individually — the plan deliberately memoizes the single
  choke point both route through. Parsing is NOT the bottleneck despite the user's phrasing.
- Scope decision (user, 2026-07-04): "just make it load way faster; don't redo deterministic
  work." Re-keying `lineVerdicts` by session so conversation/raw-lines share the project-wide
  document was explicitly REJECTED — document shape must not change; no scenario re-cert needed
  for Part B (required for Part A).
- `lineVerdicts[].line` is the record's index in the MERGED stream (`reconstruction_json.ts:188`)
  — that is WHY per-jsonl documents must keep existing; don't "simplify" them away.
- Both diff views send NO `jsonl` param (file-history.js:99, diff-vs-base.js:41), so the
  untargeted `/api/diff` edit makes them share the project document's exact cache key.
- `tests/viewer-progress.test.ts` builds the same (S19, false) key at lines 99, 116/117, 131 in
  one process — without the plan's B3c temp-copy isolation, line 131's test fails on a cache
  hit. Lines 116/117 stay untouched on purpose.
- S37 is the recorded-script scenario for consent-variant tests (pattern at
  viewer-api.test.ts:178,199); S85 has real git commits — a consented S85 build shells out to
  git, prefer S1/S19/S37 in new tests exactly as the plan does.
- The stamp is mtime+size (ponytail-noted miss: same-ms same-size rewrite). The plan's
  characterization test B5a certifies targeted-vs-untargeted diff equality BEFORE the handler
  edit; if it fails, STOP — do not make edit 5.
- Sandbox memo returns outcomes BY REFERENCE — callers treat post-states as read-only; and
  memoizing failures matters (a repeated failing run re-pays up to a 5s execSync timeout).
- Environment: browse daemon dies during idle sleeps — put multi-step browser flows inside ONE
  `$B eval` polling Promise; node output is polluted by the VS Code js-debug bootloader (grep
  `^ℹ` for test summaries); the repo path contains spaces (always quote); it's
  `npm run typecheck` (bare `npm typecheck` doesn't exist).
- User rules locked: strict red-green TDD with `test("test_<snake_case>")` + `// Scenario:`
  comments; 4-space indent even where the repo uses 2; verb-named functions; one condition per
  `if`; compare exported constants never string literals; stage only, never commit.

## How to Verify
- Baseline first: `cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng" && npm test && npm run typecheck` (expect 400/400, clean).
- After Part A: same, plus `npx tsx scripts/check_scenario_coverage.ts` → 85/85.
- After Part B: `npm test` (400 + 20 new), typecheck clean; smoke on port 7345 — cold s84
  project load completes in a few seconds with ≤~14 "running script in sandbox" lines and
  "reusing sandbox result" lines; reload shows "reusing cached transcript records" /
  "reusing cached document artifact" and near-instant arrival; revision diff, vs-base diff,
  and a range-patch export all respond without rebuild stalls.
