## 2026-06-17:19:20:00 — Item 16: run the sidecar over list2 (SURVEY → DEFER + reopen-gate tool)
Chat title: Implement RevEng item 16 — run the sidecar over list2
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/d7b42ba2-fc28-4f56-9be9-6a646ddc13f7.jsonl

> Running log of how this implementation interprets / diverges from the spec. The
> standalone survey deliverable lives in `implementation-notes-item16-list2-notfound-survey.md`
> (per the plan); this file is the `/jot:implement` decision log.

### References
- Plan: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/plan-item16-list2-notfound-survey.md
- Handoff (trigger): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-1915.md
- Predecessor (item 15): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-1858.md
- Survey-note structure mirrored from: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-item7-timestampless-survey.md
- Spike template: /Users/matkatmusicllc/Desktop/claude code src/RevEng/tools/spike-item6-context-mode-yield.js
- Test scaffold reused (makeRepo/transcriptWithGit): /Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/test-reference-ladder.js
- Roadmap: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/roadmap-100-percent-reconstruction.md

### Design decisions
- Going-in suite count measured: **68** `tests/test-*.js` files (handoff predicted 68; the stale item-15
  "66" was NOT trusted, per the handoff). Item 16 adds +1 suite → expect 69.
- Entry shape confirmed from `tools/probe-results-v2.json`: each NOT_FOUND `filesNotInProject` entry
  carries `identityKey` (absolute target path), `aliasPaths[]`, `status`, and `transcriptsUsed[].jsonl`
  (the transcript file path). `classifyNotFoundTarget` uses `identityKey` as the resolveGitReference
  target and `aliasPaths` as the alias list; `main()` loads each `transcriptsUsed[].jsonl` to text.

### Deviations
- **Helper signature `classifyNotFoundTarget(entry, transcriptTexts)`** — the plan's signature sketch
  shows `classifyNotFoundTarget(entry)`. I pass the transcript TEXTS as a second argument instead of
  reading the transcript files inside the helper. Why: (1) it keeps fs IO out of the testable surface
  (the temp-repo tests supply synthetic transcript text directly, no fixture files), matching the
  spike-item6 separation of pure helpers from IO; (2) it mirrors `api/reference-ladder.js`
  `resolveGitReference(target, aliasPaths, transcriptTexts)`, whose own third arg is texts. `main()`
  does the fs read (`loadTranscriptTexts`) behind `require.main === module`.
- **Plan/handoff "reuse" note said `resolveGitReference(target, aliasPaths, gitOpts)`** — the ACTUAL
  signature is `resolveGitReference(target, aliasPaths, transcriptTexts)` (no `gitOpts` param; it derives
  cwd/branch from each transcript's `extractSessionMetadata`). The spike calls the real signature.

### Tradeoffs
- noRepo vs repoButNoRef distinction: `resolveGitReference` returns content-or-null and does NOT report
  whether a repo resolved. So `classifyNotFoundTarget` first tries `resolveGitReference` (non-null →
  RECOVERABLE); on null it makes a SEPARATE pass (`anyTranscriptResolvesRepo` via
  `resolveRepoRootWalkingUp`) to split repoButNoRef from noRepo. Alternative considered: have the ladder
  return a richer object — rejected (would edit the at-near-cap, probe-reachable `reference-ladder.js`,
  which the plan forbids touching).

### Empirical result (live spike on tools/probe-results-v2.json)
- `node tools/spike-item16-list2-notfound-yield.js` → 64 NOT_FOUND scanned,
  `{counts:{noRepo:30, repoButNoRef:34, RECOVERABLE:0}, viable:false}` → **NON-VIABLE**. Confirms the
  plan's kill threshold: 0 of 64 are git-recoverable today.
- **1-file split difference from the planning census** (`{noRepo:31, repoButNoRef:33}`): the
  load-bearing numbers — 64 scanned, `RECOVERABLE:0`, `viable:false` — match exactly; only the
  noRepo/repoButNoRef boundary moved by one file. The planning session used an ad-hoc `node -e` census
  with a slightly different repo-resolution heuristic; this spike resolves the repo via
  `resolveRepoRootWalkingUp(meta.cwd)` over each transcript's session metadata. Both classify the file
  as non-recoverable, so the verdict is identical. Not investigated further (benign measurement-method
  difference; both buckets are NON-VIABLE).

### Gate results (all GREEN — verified, not predicted)
- Full suite: **67 suites / 679 passed / 0 failed** (+1 suite, +6 tests vs going-in 66/673 by the awk
  gate method). NOTE: `ls tests/test-*.js | wc -l` = 68/69 raw files, but the awk method counts only
  files emitting a `passed,` summary line (66→67); the +1 suite / +6 tests deltas are the real signal.
- New item-16 suite: 6 passed / 0 failed.
- detect-rewinds: 15 passed / 0 failed.
- plate_summary.py e2e: `{matchedObserved:247, matchedPresumed:0, mismatched:0, neverObserved:0}`,
  conflicts=8 (UNCHANGED).
- Probe A/B vs `develop-baseline` (`a8947fc`) on the frozen fixture: **identical: true** → NO
  re-baseline. (The gate regenerates the working-tree `tools/probe-results-v2.json`; content is
  byte-identical to baseline modulo `generatedAt` — documented gate behavior.)
- Spike smoke: `{counts:{noRepo:30,repoButNoRef:34,RECOVERABLE:0}, viable:false}` → NON-VIABLE.
- Line counts: `spike-item16-list2-notfound-yield.js` 115, `test-spike-item16-list2-notfound-yield.js`
  148 — both ≤250 cap.
- Git state: working tree fully untracked by design (19 collapsed `??` directory entries + pre-existing
  `M .gitignore`); new files live inside already-untracked dirs (`git check-ignore` → not ignored).

### Open questions
- (none) — scope fully settled; all gates green. Implementation COMPLETE.
