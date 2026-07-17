## 2026-07-04:21:20:00 — Build-cache implementation (sandbox memo + viewer artifact caches)
Chat title: Implement build-cache plan — kill the 25s s84 load
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/ab917de1-84be-4e1b-955e-dabe227f3a71.jsonl

### References

/Users/matkatmusicllc/.claude/plans/reveng-single-reconstruction-artifact.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260704-2052.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/logs1.txt

### Baseline measurement (user-requested, before any code change)

Measured through the same mechanism the HTML viewer uses: the NDJSON progress
endpoint of `src/viewer_server.ts`, fresh server process (all memos cold).

Server:

    cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng" && npm run app -- --port 7345 --projects-dir "plans/scenarios/executed"

Timed requests (Node `fetch` of the exact URLs the webapp issues, wall-clock
around request → last NDJSON byte):

    GET http://127.0.0.1:7345/api/document?project=s84-multiagent-scripts-git-baseline&progress=1
    GET http://127.0.0.1:7345/api/document?project=s84-multiagent-scripts-git-baseline&progress=1&allowScripts=1

Results (2026-07-04 21:19):

- Consent probe (no allowScripts): **0.04s**, ends in `consent-required`, 8 progress lines.
- Cold consented build: **25.40s**, 710 progress lines, **186 "running script in sandbox" lines**, 0 memo reuse lines.

This reproduces the logs1.txt evidence (24.8s, 208 spawns across the whole capture).

### Design decisions

- Step 0 baseline gates ran green before any edit: `npm test` 400/400, `npm run typecheck` clean.

### Deviations

- The jot:implement skill suggests parallel subagents; the plan mandates strict
  sequential red-green TDD (A1 → A2 → B1…B6) over shared module-level state, so
  the work is executed sequentially in the main session. Parallelizing file
  edits here would only create conflicts.
- 2026-07-04 21:35 — The plan's literal A2 test bodies declare `let firstResult;`
  with no type and assign it only inside the `collectSandboxSpawnLabels` closure;
  `tsc` narrows such a variable to `never` at the later `firstResult?.get(...)`
  (TS2339). Annotated the four locals as `Map<string, string> | undefined` in the
  two memo tests. Type-only change; runtime bodies identical to the plan.

### Part A gate results (2026-07-04 21:36)

- Full suite after A2: 406/406 green (400 baseline + 3 LRU + 3 memo).
- `npm run typecheck`: clean.
- `npx tsx scripts/check_scenario_coverage.ts`: 85/85 scenarios fully reproduced.

### Part B deviations

- 2026-07-04 21:48 — The plan's B1b import block for tests/viewer-artifact-cache.test.ts
  names B2–B5 exports up front, which would make the file fail to LOAD during B1/B2/B3
  green runs. Imports were instead extended step by step as each export landed. Final
  file content matches the plan exactly.

### Results (2026-07-04 22:05, same measurement mechanism as baseline)

Fresh server, same commands as the baseline section (port 7345,
`--projects-dir "plans/scenarios/executed"`, consented progress /api/document):

- Cold consented s84 build: **25.40s → 7.34s** (3.5×); sandbox spawns 186 → **38**,
  memo reuse lines: 148; per-record parse detail intact (311 counted lines).
- Warm reload: **0.03s**, with both cache-hit labels streamed.
- Revision diff / vs-base diff / range patch: ~0.01s each, no rebuild stalls.
- Gates: full suite **420/420** (400 baseline + 20 new), typecheck clean,
  scenario coverage **85/85** (after Part A).

### Tradeoffs

- Cold load is 7.34s, not the plan's hoped ~3s, and spawns 38, not ~14. The memo
  spawns once per DISTINCT sha256(script + sorted seeded contents) key, so the 38
  are provably distinct inputs; the plan's "14 distinct" was derived from logs1.txt
  spawn LABELS (script first line + seeded-file count), which cannot distinguish
  seeded-content variants across lineage/branch replays. The remaining cold time is
  real python3 sandbox work on distinct inputs — irreducible under the approved
  "don't redo deterministic work" scope.

### Open questions

- None blocking. If the 7.3s cold load still feels slow, the next lever is
  cross-restart persistence of the sandbox memo (disk-backed), which the plan
  deliberately left out of scope.

