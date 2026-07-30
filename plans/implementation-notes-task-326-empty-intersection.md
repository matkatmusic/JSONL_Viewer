## 2026-07-29:18:45:00 — Task 326 follow-up: empty filter intersection drew ALL files
Chat title: tackle-tasks [326] valid
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/6c5b2125-423d-43c1-a1cb-3fdbd54f380a.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/326-empty-intersection-filter.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/layer1-page.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/layer1-filter.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/layer1-filter.test.ts

### Design decisions

- Reproduced first: headless CDP against the real viewer (943-file jfred view) showed the
  shipped toggle DOES filter timeline + minimap (943→1 bubbles and marks, shift-click
  files →2). The basic wiring is not the live bug.
- The one real defect found by tracing: `intersectFilterTargets` returned `[]` both for
  "no picker active" and "two active pickers with no overlap", and
  `filterLayer1ViewByTargets` read `[]` as "no filter" — so a selected JSONL session plus
  a non-overlapping File Nav selection showed EVERYTHING instead of nothing.
- Fix spelling: `undefined` = not filtering, `[]` = filter matched nothing. Only one call
  site (`redrawStage`), untouched.

### Deviations

- Skipped the full `npm test` run: the tackle-tasks skill says the user runs suites.
  Targeted file passes 12/12; both typechecks pass; CDP repro unchanged pre/post fix.

### Tradeoffs

- Considered asking the user for their exact failing gesture before fixing; defaulted to
  fixing the one provable defect since the session is autonomous.

### Open questions

- Does the fix match YOUR failing gesture? Please `npm run build:webapp`, HARD-reload
  the viewer, and retry. If it still shows unfiltered, the other recorded suspect is a
  stale webapp bundle (tasks 241-244 trap) — or tell me the exact clicks you made.
- Task 326 stays OPEN pending your browser verification, per its own status note.

## 2026-07-29:20:15:00 — Same-contents diff pair + acceptance flake (same session)
Chat title: tackle-tasks [326] valid
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/6c5b2125-423d-43c1-a1cb-3fdbd54f380a.jsonl

### Design decisions

- User bug: identical base/target + "show full content" rendered nothing. Root cause:
  git emits no hunk for identical sides, the endpoint answered "", the drawer showed
  "No text differences". Fixed SERVER-side in src/viewer_api_layer1_diff.ts — on
  context=full with an empty diff, synthesize one all-context hunk from the target
  lines, so both drawer render modes work unchanged. Empty files still answer "".
- The layer1-acceptance flake the user's test run surfaced (pre-existing per 07-28
  observation: passes alone, fails under load) was an unhandled fetch rejection from
  confirmRepoAndFillRefs when the fixture server dies mid-flight; its fetch now
  catches to "repo not confirmed" (webapp/layer1-refs.ts). 3/3 repeat runs green.

### Deviations

- None from the reported bug; the flake fix is extra scope, taken because the user's
  own test run surfaced it and the fix is one guard at the root.

### Open questions

- exportPatch on an identical pair with full content on now exports a no-op patch
  (context-only hunk) instead of refusing — harmless under git apply; say if you
  want the export button to keep refusing instead.
