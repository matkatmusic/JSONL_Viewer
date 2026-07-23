# Task 178 — S7c acceptance gate: coverage checker learns the multi-source capture layout

Goal: `s88-multi-source-two-roots` must run through the multi-source engine path
(record dedupe/interleave/identity-join + per-source file-history), then its
per-step `.step_states` coverage must be green. Single-source scenarios must be
untouched (degenerate case). Full 88-scenario sweep + `npm test` are run by the
USER after this work — do not run them.

All paths below are relative to `jfred/` unless absolute.

## Context the implementer needs

- The s88 capture (`scenarios/executed/s88-multi-source-two-roots/`) holds TWO
  per-source trees: `source-a1/` and `source-a2/`, each shaped
  `<tree>/projects/-private-tmp-scen88-alpha/<session>.jsonl` +
  `<tree>/file-history/<sessionId>/…`. The flat `*.jsonl` files at the capture
  root are duplicates of the same two sessions (auto-capture); when source
  trees exist they must NOT be loaded (no file-history sibling at the capture
  root — the reader would fall back to the LIVE `~/.claude/file-history`).
- The proven multi-source composition lives in `src/viewer_api.ts`
  (`buildProjectReconstruction`, lines ~59–75): with a non-empty
  `SourceEntry[]` the record stream goes
  `groupRecordsBySession(records)` → `mergeMultiSourceRecords(groups, sources)`
  (from `src/reconstruction_multi_source.ts`), and the reader is
  `buildSidecarReader(records, sources)`. Mirror it exactly.
- A bare `SourceEntry` (`{ projectsDir }`, no `fileHistoryDir`, no `root`) is
  sufficient: the sidecar reader resolves each source's `file-history/` as the
  sibling of its `projects/` dir (`resolveSourceFileHistoryRoot` chain), and
  `computeSessionRoots` auto-detects the workspace root from each session's
  first recorded `cwd` (both s88 sessions recorded `/private/tmp/scen88-alpha`).
- `SourceEntry` is exported from `src/reconstruction_overrides.ts`.
- Records MUST be loaded via `loadTranscript` (already the case in
  `checkScenario`) so each record carries its on-disk source stamp; a
  stamp-less load breaks per-source file-history resolution.
- Line cap: source files stay ≤ 250 lines. `scripts/coverage_scenarios.ts` and
  `scripts/check_scenario_coverage.ts` both have headroom; verify after editing.

## Step 1 — failing test first (discovery)

Create `tests/coverage_scenarios.test.ts` (runner: `node --test` via tsx —
same imports/style as existing tests; this test is capture-free: it fabricates
everything under a `mkdtempSync` root).

Fabricate one executed-root temp dir containing one scenario dir
`s99-fake-multi/` with:

- `.step_states/step-001/x.py` (any content) — so discovery counts it covered;
- `source-a1/projects/-tmp-fake/aaaa.jsonl` and
  `source-a2/projects/-tmp-fake/bbbb.jsonl` (one valid JSON line each, e.g.
  `{"type":"user","uuid":"u1","sessionId":"…","timestamp":"…"}` — discovery
  only globs, it does not parse);
- a decoy flat `cccc.jsonl` at the scenario root (must be ignored when source
  trees exist).

Assert on `findCoveredScenarios(pathToFileURL(tempRoot))`:

1. exactly one scenario, `sources` defined with length 2, each entry's
   `projectsDir` = `<scenario>/source-aN/projects` (sorted source-dir order);
2. `jsonlPaths` = the two jsonls under the source trees (NOT the decoy), sorted
   deterministically;
3. a second fabricated scenario dir WITHOUT `source-*` dirs (flat jsonl +
   `.step_states`) yields `sources` undefined and the flat jsonl — the
   existing single-source behavior byte-for-byte.

Do NOT run the test suite; the user runs it. (Write it to fail-first
conceptually; the implementation lands in the same change set.)

## Step 2 — discovery (`scripts/coverage_scenarios.ts`)

1. Add `sources?: SourceEntry[]` to `CoveredScenario` (import the type from
   `../src/reconstruction_overrides.ts`).
2. New helper `findSourceTrees(dir: string): string[]` — the sorted
   subdirectory names matching `/^source-/` that contain a `projects`
   directory. (Name-prefix match keeps it explicit; sorted for deterministic
   source order.)
3. New helper `allSourceTreeJsonls(dir: string, treeNames: string[]): string[]`
   — for each tree, every `*.jsonl` under `<dir>/<tree>/projects/<projectName>/`
   (one level of project dirs, matching the capture layout), sorted overall.
   Reuse the existing jsonl-filter logic (extract the current `allJsonls`
   filename filter into a shared predicate rather than duplicating it).
4. In `findCoveredScenarios`: after the `.step_states` check, call
   `findSourceTrees(dir)`. If non-empty → `jsonlPaths` from
   `allSourceTreeJsonls`, `sources` = bare `{ projectsDir: new Path(join(dir,
   tree, "projects")) }` per tree. Else → current flat behavior, `sources`
   left undefined.
   The "no jsonl" skip-warning applies in both branches.

## Step 3 — routing (`scripts/check_scenario_coverage.ts`)

In `checkScenario`, replace the record-load line with:

```ts
const loaded = scenario.jsonlPaths.flatMap((path) => loadTranscript(path.toString()).records);
const records = scenario.sources === undefined || scenario.sources.length === 0
    ? loaded
    : mergeMultiSourceRecords(groupRecordsBySession(loaded), scenario.sources);
const reader = buildSidecarReader(records, scenario.sources);
```

(`buildSidecarReader(records, undefined)` is today's exact behavior, so the
single-source path is unchanged.) Import `mergeMultiSourceRecords` and
`groupRecordsBySession` from `../src/reconstruction_multi_source.ts`. Keep the
existing log line; extend it to print the source count when sources are
present (e.g. `… from N JSONL files across M sources`).

`buildUuidLineIndex(scenario.jsonlPaths)` stays as-is — uuids are globally
unique across the source jsonls.

## Step 4 — run the gate on s88 only (not the sweep)

Ad-hoc one-off (from `jfred/`):

```sh
npx tsx -e "import('./scripts/check_scenario_coverage.ts')" # NO — runs all
```

Instead write a throwaway runner in the session scratchpad (NOT in the repo)
that imports `listCoveredScenarios` + `checkScenarioResilient`, filters to
`scenarioId === "s88"`, runs it, and prints the result + mismatches. Run it.

- Green (0 mismatches): done; record the result.
- Mismatches: each is a candidate engine gap. Follow the established
  ground-truth workflow: FIRST validate the ground truth (a ledger FAIL is not
  automatically an engine gap — runner-created workspace files like hook
  scripts/settings may appear in `.step_states` step folders; if a file in a
  step folder has no producing transcript event and no file-history backup, it
  belongs in `NON_SOURCE_NAMES` in `coverage_scenarios.ts`, the same reasoning
  that put `.claude` there). Only then fix the engine, smallest diff, with the
  capture-notes.md revision ladders as the oracle
  (`scenarios/executed/s88-multi-source-two-roots/capture-notes.md`).

## Step 5 — bookkeeping

- `specs/SPEC.md` S7: update status (s88 green through the multi-source path;
  sweep validation = user's run).
- Stage everything (jfred submodule + RevEng); do NOT commit.
- Close tasks 178 and 166 via the close-tasks skill ONLY if the s88 check is
  fully green; the closure note must state that the full-sweep + `npm test`
  validation run is the user's.

## Out of scope

- Task 179 / s89 nested roots (separate plan).
- reveng-paths.json changes (the checker builds `SourceEntry[]` directly; no
  config file involved).
- Any run of `npm test`, `npm run test:ci`, or the full coverage sweep.
