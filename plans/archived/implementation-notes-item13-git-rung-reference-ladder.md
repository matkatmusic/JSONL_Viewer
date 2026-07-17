# Implementation notes — Roadmap Item 13: git rung on the reference ladder

## 2026-06-17:16:07:00 — Item 13: git rung on the reference ladder
Chat title: implement RevEng item 13 — git rung on the reference ladder
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/11af56e0-4e5c-4202-bc73-f2fb855a3657.jsonl

### References
- /Users/matkatmusicllc/.claude/plans/noble-floating-volcano.md (the item-13 plan being executed)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-1603.md (item-13 plan-phase handoff)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/roadmap-100-percent-reconstruction.md (item 13 at line 458)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-1252.md (How to Verify — exact gate commands)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-item12-collapse-conflict-cascades.md (prior item)

### Design decisions
- **Module built as the complete faithful port to satisfy Test 1.** Test 1 is an integration
  happy-path (commit → delete working copy → resolve from git), which requires the entire resolution
  chain (`extractSessionMetadata` → `resolveRepoRootWalkingUp` → `buildMultiRefs` →
  `resolveGitContentMultiRef`, plus both loops). There is no smaller module that makes Test 1 GREEN.
  Genuine RED→GREEN was observed at the module level (MODULE_NOT_FOUND → stub `'COMMITTED\n' !== null`
  → GREEN). Tests 2–8 then LOCK each distinct behavior (guards, alias-basename loop, transcript
  fallback direction, the empty-string `!== null` contract, HEAD fallback, no-repo guard). Each is
  articulably a failing verification against a module missing that behavior (per verify-work.md), so
  coverage is real even though tests 2–8 passed on first run against the complete port.
- Module `api/reference-ladder.js` = **60 lines** (plan estimated ~55); test file **184 lines** (plan
  ~206). Both under the 250 cap; no split needed.
- **CLI edits written in 2-space to match the existing file** (NOT global 4-space). Per project
  convention and the item-10/item-12 precedent on this exact file (`tools/track-line-states.js`),
  in-place edits to an existing 2-space file stay 2-space; only NEW files are 4-space. The plan's
  snippets were shown in 4-space but the convention governs. `chooseReference` gained two params
  (`aliasPaths`, `transcriptTexts`) and the git rung (guarded `gitContent !== null`); `main()` reads
  each transcript to text in the existing `jsonls` loop (no extra read pass) and passes them down;
  `chooseReference` is exported (CLI behavior unchanged — `main()` stays behind `require.main ===
  module`). CLI grew **127 → 147 lines** (plan estimated ~135; the extra ~12 lines are explanatory
  comments). Under the 250 cap.

### Deviations
- **Baseline numbers in the plan/handoff are STALE (item 12 shipped after the plan was written).**
  The plan states the going-in baseline as `61 suites / 619 passed`, `conflicts=233`. Actual measured
  baseline at the start of this session (2026-06-17 16:08): full suite **62 suites / 635 passed / 0
  failed**; detect-rewinds **15/15**; probe A/B **identical:true**; `plate_summary.py` **247/247
  matchedObserved, 0 mismatched, conflicts=8** (roadmap line 14/451 confirms item 12 collapsed the 233
  per-line conflicts into 8 `collapsedCascade` records). Consequence for item 13's gates: post-item-13
  full suite target is **64 suites** (62 + 2 new test files), and the e2e conflict invariant to hold is
  **conflicts=8** (NOT 233). Item 13 is reference-only — it must leave conflicts at 8.
- **Test-scaffold robustness: `fs.realpathSync` added to `makeRepo`.** The plan's scaffold (lifted
  from `test-git-file-state.js:259-266`) did NOT canonicalize the temp repo path. On macOS
  `os.tmpdir()` yields `/var/folders/...` but `git rev-parse --show-toplevel` (inside
  `resolveRepoRootWalkingUp`) returns the realpath `/private/var/...`; `computeRepoRelativePath`
  (`git-file-state.js:19`) then sees `target` not prefixed by `repoRoot` and returns null — Test 1
  failed RED for this reason even with the correct module. Fix is TEST-ONLY: `makeRepo` now wraps
  `ctx.tempDir(...)` in `fs.realpathSync` so `target`, the transcript `cwd`, and the git-resolved
  repoRoot share one prefix. This matches real sessions (cwd + file paths already share a canonical
  prefix), so the module needs no change. The original git-state test never hit this because it never
  computes repo-relative paths from an absolute target. Both test files apply the same canonicalization.

### Tradeoffs
- **`filePathMap` from the alias closure, not per-transcript edits** (followed the plan). The probe's
  `gatherGitSource` builds its `filePathMap` from each transcript's edits; the CLI rung instead uses
  `[target].concat(aliasPaths)`. Rationale: the CLI does not thread per-transcript edits into
  `chooseReference`, and the alias closure already names every absolute path the file is known by — and
  it IS the discovery seed (item 10a), so every discovered transcript's target paths are already in the
  closure. Practical coverage is equivalent for discovered transcripts; no per-transcript edit map is
  needed.
- **Ran the optional live smoke test (before/after) instead of skipping it.** It is the only check that
  exercises the full CLI `main()` path (discovery → events → transcript-text reads → `chooseReference` →
  verdict) end-to-end; the 5 ordering tests cover `chooseReference` in isolation but not `main()`'s
  transcript-text plumbing. Before/after on `develop-baseline` vs the working tree gives concrete,
  fails-if-broken evidence (verify-work.md). Run against the FROZEN fixture projects-dir only (never live
  claude-data — self-contaminates).

### Verification (all GREEN, 2026-06-17)
- Full suite **64 suites / 648 passed / 0 failed** (was 62/635; +13 tests = 8 unit + 5 ordering, +2 suites).
- detect-rewinds **15/15**.
- Probe A/B vs `develop-baseline` **identical: true** — NO re-baseline; `develop-baseline` stays `880b69d`.
- Sidecar e2e `plate_summary.py` **247/247 matchedObserved, 0 mismatched, conflicts=8** (UNCHANGED;
  comparedVia=on-disk, so the git rung is dormant there).
- **Payoff** (frozen fixture, list2 off-disk file `jot/skills/debate/scripts/debate-orchestrator.sh`):
  baseline CLI → `comparedVia=none` + empty verdict; item-13 CLI → `comparedVia=git`,
  `{matchedObserved:23, mismatched:1}`. The file is now scoreable → **item 16 unblocked**.

### Open questions
- **None blocking.** Note (not an item-13 defect): the smoke file scored `mismatched:1` in the sidecar
  while the probe scored it PASS via its own git-matched replay. Item 13 only PROVIDES the git reference;
  the 1-line sidecar-belief-vs-git delta is a sidecar reconstruction nuance for item 15/16 to examine, not
  a reference-ladder issue. Item 16 (run the sidecar over list2) is the natural next step now that the git
  rung exists.
