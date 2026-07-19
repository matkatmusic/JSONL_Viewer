## 2026-07-17:18:07:00 — s87 engine-gaps implementation (56/118 → 118/118)
Chat title: s87 engine-gaps implementation
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/ab24c46d-ab80-4ffa-889f-0ec7bd4bc47e.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/s87-engine-gaps-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260717-1803.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/script-handling.txt
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md

### Design decisions

- 2026-07-17:18:10 — `computeSandboxInputKey` now hashes `recordedCwd` (when defined) alongside
  script + pre-state. The plan only specified the remap; the key change is required so (a) the
  same script replayed with different recorded cwds cannot collide, and (b) memoized FAILURES
  persisted to disk by the viewer server before this fix (keyed without cwd) cannot shadow the
  now-succeeding runs.
- 2026-07-17:18:10 — remap implemented inside `spawnSandboxRun` (not `runScriptAgainstState`)
  because the sandbox `tempDir` — the replacement value — only exists there. Signature per plan:
  optional trailing `recordedCwd?: Path` on `runScriptAgainstState`.
- 2026-07-17:18:45 — **rename events now stamp at the RESULT record's instant**, not the
  tool_use's (both stdout and code-literal channels). The tool_use instant is only when a run
  was REQUESTED; execution provably finished by the result echo. The old run-instant assertion
  in the existing test was flipped deliberately — its "later edits order after it" rationale is
  exactly wrong for consent-delayed runs.
- 2026-07-17:18:55 — the staged-blob channel trusts only the LAST `git add <path>` per path
  (the index holds one blob per path — whatever the most recent add staged) and only adds that
  NAME their file explicitly (`git add -A` / `git add .` yield nothing; ponytail note in code:
  widen via `git ls-files` if a scenario needs it). Placement reuses the s85 splice machinery
  unchanged (`placeOneBlobDiff` extracted from `placeOneCommitDiff`); commits are tried first,
  the index only as a fallback.
- 2026-07-17:18:55 — `FullContentEvent` (splice-base candidates in the placement stage) widened
  to include `OverwriteEvent` — s87's base is the elided-beacon overwrite `@v3`; without it no
  pre-run splice point exists. Full sweep confirms s85 unaffected.
- 2026-07-17:18:40 — three 250-line-cap module splits, all verbatim moves with direct imports
  (no re-export shims): script-indirection machinery → `reconstruction_script_indirection.ts`
  (canonical home of `pathBasename` moved with it; prestate import repointed), pure
  line-addition helpers → `reconstruction_git_additions.ts`, staged-blob tests →
  `tests/reconstruction_git_staged.test.ts`.


### Deviations

- 2026-07-17:18:30 — **Plan's Phase 3 diagnosis was incomplete.** After Phase 3 (rename
  registration) landed with green unit tests, s87 stayed at 89/118: every remaining failure
  (steps 90–118) traces to three root causes the plan never identified:
  1. **Stale script-indirection** (steps 93–109): `indexWrittenContentByBasename` keeps ONE
     body per basename, last-loaded-record wins (readdir order) — every `python3
     apply_renames.py` run resolves to the same stale 23:49:18 body instead of the body
     written just before the run. Verified: the 00:03:21 run's sandbox replay leaves
     `reporting_core.py` line 6 unchanged.
  2. **Request-instant vs execution-instant** (steps 110–118): the MCP `shutil.move` run was
     REQUESTED at 00:24:29 but only EXECUTED ~00:31:00 (consent delay; its result echo). Two
     interleaved Bash runs (00:30:14 FileNotFoundError on the destination; 00:30:42 reading
     the source) prove the file had not moved during that window. Renames stamped at
     tool_use time fire 6 minutes early.
  3. **Evidence only in the git INDEX** (steps 90–92 content, and the 42-line base of
     93–109): the driver's external edit (duplicate `# reviewed by ops` line) appears in NO
     transcript record and NO file-history backup — its only evidence is the blob staged by
     `git add reporting_core.py` (00:20:19), still readable from the recorded tmpdir repo's
     index (verified byte-identical to ground-truth step-093). The existing s85 stage reads
     only COMMIT blobs; the sole commit is the baseline.

- 2026-07-17:18:20 — **Phase 2 skipped entirely.** After Phase 1 alone, coverage is 89/118 and
  every remaining failing step is 90–118 (Phase 3's rename cluster). Steps 66–88 — Phase 2's
  entire target window — pass, so the mid-stream truncated-beacon gap was NOT independent of
  the cwd-remap gap: with the 23:49:28 script event injected, the driver-edit echoes replay
  onto a complete base and need no backup completion. Phase 2's own gate (coverage ≥ 88/118)
  is already met at 89/118, so extending `completeTruncatedBeacon` to mid-stream beacons would
  be engine complexity with no failing oracle behind it — and it carries regression risk
  against s27/s28/s45. Skipped per YAGNI; revisit only if a future scenario ledger shows a
  mid-stream truncated beacon the engine misses.


### Tradeoffs

- Result-instant stamping shifts EVERY script rename a few seconds later (Bash results echo
  seconds after execution). Considered a hybrid (result-instant only when the delay exceeds a
  threshold) — rejected: a threshold is a magic number, and the full 87-scenario sweep proves
  the uniform rule regresses nothing.
- The code-literal rename channel matches only two-STRING-literal `shutil.move`/`os.rename`
  calls; the variable form `shutil.move(src, dst)` stays invisible by design (arguments
  unknowable statically — never fabricate). s87's loop-driven moves are covered by the stdout
  arrow channel instead.
- `computeSandboxInputKey` hashing `recordedCwd` invalidates every pre-existing persisted
  sandbox memo entry for cwd-carrying runs (viewer server cold-loads re-spawn once). Accepted:
  the stale entries include memoized FAILURES that would otherwise shadow now-succeeding runs.



### Open questions

- The staged-blob channel (like the s85 commit channel) reads the LIVE recorded tmpdir repo
  (`/private/var/folders/.../run-scenario.7y52smqe`) — when macOS purges it (~3 days), s87's
  steps 90–118 will regress unless a preserved clone lands next to the transcript (the
  `findFallbackRepoDirs` chain). Should the s87 capture get a preserved repo clone (including
  its `.git/index`) like item 46 did for s85?
- `git add -A` / `git add .` produce no staged-blob evidence today. Fine for s87; a future
  scenario staging via `-A` would need the `git ls-files`-based widening noted in the code.

### Final state

- `npx tsx scripts/check_scenario_coverage.ts s87` → PASS 118/118.
- Full sweep: **87/87 scenarios fully reproduced**. `npm test` → **786/786** (was 775/776).
- All changes STAGED (not committed) in `jfred/`: 17 files, +743/−201.

