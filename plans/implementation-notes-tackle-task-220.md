## 2026-07-24:11:45:00 — Task 220: horizon-keyed lineage-seed memo
Chat title: task 204 195 194 17 220 83
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/09640d17-6186-4a75-aadb-b987a092a775.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/220-lineage-horizon-memo.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-per-file-target.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/162-lineage-memo-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/192-bounded-single-file-performance.md

### Design decisions

- The fix re-keys `lineageSeedsByKey` from the exact instant (`path|beforeMs`) to a
  relevant-input horizon (`path|h<horizonMs>`), leaving frames, cycle guards, and the
  never-widening window untouched. This realizes the task's "advance with the run cutoff"
  direction as a cache-key widening rather than a stage restructuring — the per-target run
  scan is recomputed only when `executionsByRun` has grown, which is exactly the forward
  increment the task asked for.
- The module split (`reconstruction_lineage_inputs.ts` static half,
  `reconstruction_lineage_horizon.ts` run-relevance half) exists because the single module
  exceeded the 250-line hook cap.
- The horizon computation only PROBES the execution memo (`.has()`/`.get()`); it never calls
  `executeRunOnce`, so it cannot execute runs out of the outer walk's ascending order.
- Serve safety with widened keys required one memo-module change: `findServableLineageSeed`
  now refuses while a queried FILE is in flight at ANY instant (path-level check), because a
  fresh compute at a different instant would cycle-guard against that file. Strictly more
  conservative than the task-162 exact-key check; refused serves just recompute as before.

### Deviations

- None from plans/220-lineage-horizon-memo.md. The plan's `findLatestInstantBefore` and the
  static-inputs cache landed in `reconstruction_lineage_inputs.ts` instead of the horizon
  module (line-cap split, anticipated by the plan's "new module" allowance).

### Tradeoffs

- Three conservative over-approximations trade cache hits for provable identity with a fresh
  compute (each marked with a `ponytail:` comment naming the upgrade path):
  1. an eligible-but-unexecuted run bumps the horizon (unknown effects);
  2. after a file's first proven script touch, every later roll-capable run bumps (the
     beaconless rolling branch bypasses the execution memo and the pre-baseline gate);
  3. after the first touch, any later static event of ANY file bumps (a proven script move
     can splice another path's history into the chain).
  Closure files never touched by scripts — the 32 files driving the task-182 blowup — keep
  sparse horizons, which is where the win lives.
- Diff keys are cached per `RunExecution` object in WeakMaps rather than in `DerivedCaches`,
  so invalidation rides object lifetime instead of adding corpus fields.

## 2026-07-24:12:30:00 — Task 17: Engine-B GitHub Pages demo
Chat title: task 204 195 194 17 220 83
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/09640d17-6186-4a75-aadb-b987a092a775.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/17-engineb-pages-demo.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/scripts/generate_pages_demo_data.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/docs/engineb/static-shim.js

### Design decisions

- One-pass implementation (the plan's default when its split-into-three question went
  unanswered): generator + shim + assembly + landing link in one batch.
- The generator cans /api/prescan and /api/project-paths beyond the plan's list — the task-194
  mode-selection view (which landed after the plan was written) fetches /api/prescan before any
  document request, and the paths views fetch /api/project-paths.
- /api/document is canned as the consented FULL build; the shim ignores bounded-mode params on
  purpose (a full document is a superset of any bounded request) and returns it for every
  document request, which also bypasses the consent and baseline dialogs — the client keys off
  the response's `kind` discriminant and a real document has none.
- document.json is written as ONE newline-terminated line because the client's NDJSON reader
  only parses newline-terminated lines; the shim serves the file's bytes as the entire stream.
- Blobs are the demo file-history tree copied verbatim; the shim wraps hits/misses into
  readBlobSnapshot's `{ exists, content }` wire shape.

### Deviations

- None from plans/17-engineb-pages-demo.md 's structure; interactive endpoints (diff,
  range-patch, step-files, pick-folder, repo-commits, repo-commit-match, POSTs) return the
  planned "not available in the static demo" 400.

### Tradeoffs

- No unit tests for the generator (a one-shot data producer whose run IS the check — it built
  the 1.8 MB document) or the browser-only IIFE shim; the Stop hook warned. Verified instead
  over `python3 -m http.server -d docs`: page, app.js, shim, vendor, and document all 200.

### Open questions

- Task 17 stays OPEN pending the user's in-browser check of /engineb/webapp_old.html and the
  `git push` publish (Pages is already configured from task 63).

## Open questions carried from task 220

- Task 220 is left OPEN: closure needs the user's task-182 real-corpus rerun
  (`--branch surviving --file .../plate_cli.py`) to confirm the run rate; the unit and
  integration tests prove key stability and cache serves, not the wall-clock win.
- `test_python_run_still_executes`-style sandbox tests were untouched, but the full suite has
  not been run this session per the tackle-tasks instruction — the user runs `npm test`.
