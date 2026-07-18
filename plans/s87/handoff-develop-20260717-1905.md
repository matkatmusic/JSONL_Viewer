# Handoff: s87 engine gaps IMPLEMENTED (56/118 → 118/118, sweep 87/87, tests 786/786)
MUST READ: plans/script-handling.txt
Conversation name: s87 engine-gaps implementation
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/ab24c46d-ab80-4ffa-889f-0ec7bd4bc47e.jsonl
Plan file: plans/s87-engine-gaps-plan.md
Implementation notes: plans/implementation-notes-s87-engine-gaps.md

## Branch
`develop` (RevEng superproject; all engine work inside the `jfred/` submodule, also on `develop`)

## Goal
Make the reconstruction engine reproduce all 118 captured step states of
`jfred/scenarios/executed/s87-demo-composite/`. Engine changes only; the scenario and its
capture are fixed ground truth.

## Current State
DONE. `npx tsx scripts/check_scenario_coverage.ts s87` → PASS 118/118; full sweep 87/87
scenarios; `npm test` (from jfred/) → 786/786. All changes STAGED, NOT committed, in jfred/:
17 files, +743/−201 (git status in jfred shows the exact set). Four engine mechanisms landed:
1. Sandbox recorded-cwd remap (`runScriptAgainstState(..., recordedCwd?)` +
   `computeSandboxInputKey` hashes the cwd) — plan Phase 1. Closed steps 57–88.
2. Script-rename registration (code-literal `shutil.move("a","b")`/`os.rename` channel +
   chain-aware timestamp-ordered phantom guard) — plan Phase 3, plus a plan CORRECTION:
   rename events now stamp at the tool_result record's instant (consent-delayed MCP runs
   execute minutes after their tool_use record).
3. Time-aware script indirection (new `src/reconstruction_script_indirection.ts`): each
   `python3 x.py` run resolves the Write body current at ITS instant — NOT in the plan.
4. Git-INDEX staged-blob evidence (`findGitAddEvents`, `readStagedFileContent`,
   `placeStagedBlobDiff`; `FullContentEvent` widened with `overwrite`) — NOT in the plan; the
   driver's external edit exists ONLY in the blob staged by `git add reporting_core.py`.
Plan's Phase 2 (mid-stream truncated-beacon completion) was NOT implemented — Phase 1 alone
closed its whole step window; deviation reasoning in the implementation notes.

## What Remains
1. Review + commit the staged jfred changes (user preference: user drives commits).
2. Decide the open question: the s87 steps 90–118 evidence lives in the LIVE recorded tmpdir
   repo `/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.7y52smqe`
   (its `.git/index` staged blob + baseline commit). macOS purges idle temp dirs (~3 days) —
   preserving a repo clone (INCLUDING `.git/index`) next to the transcript, per the item-46
   `findFallbackRepoDirs` chain, would make s87 durable. Until then, do not clean that tmpdir.
3. Optional: archive plans/s87-engine-gaps-plan.md and the root-level
   plans/handoff-develop-20260717-1803.md per the usual /update-tasks flow.

## Key Files
- jfred/src/reconstruction_script_sandbox.ts — cwd remap + memo-key change (Phase 1).
- jfred/src/reconstruction_script_indirection.ts — NEW; time-aware indirection, owns `pathBasename`.
- jfred/src/reconstruction_script_renames.ts — two-channel candidates + chain-aware guard + result-instant stamping.
- jfred/src/reconstruction_git_commit_events.ts — `findGitAddEvents` beside `findGitCommitEvents`.
- jfred/src/reconstruction_git_evidence.ts — `readStagedFileContent` (index blobs).
- jfred/src/reconstruction_git_placement.ts — `placeOneBlobDiff` generalization + `placeStagedBlobDiff`.
- jfred/src/reconstruction_git_additions.ts — NEW; pure line-addition helpers (250-cap split).
- jfred/tests/reconstruction_git_staged.test.ts — NEW; staged-blob channel tests.
- plans/implementation-notes-s87-engine-gaps.md — full diagnosis, deviations, tradeoffs.

## Context the Next Agent Won't Have
- The coverage checker reports only the FIRST differing file per step — failure clusters MASK
  each other. s87 stalled at 89/118 through two correct fixes because every remaining step
  shared one hidden line-42 diff. Diff ground-truth step folders directly before trusting the
  checker's step attribution.
- MCP ctx_execute runs can execute MINUTES after their tool_use record (consent dialog). The
  s87 move was requested 00:24:29 and executed ~00:31:00; two interleaved Bash runs (one
  FileNotFoundError on the destination) prove it. Any evidence stamped at tool_use time is a
  lower bound; the tool_result record time is the safe upper bound.
- `git add` with no later commit leaves staged content readable via
  `git ls-files --stage` + `git cat-file -p` — an evidence channel no backup or transcript
  record covers. Only the LAST add per path is trustworthy (the index keeps one blob per path).
- DO NOT replay s87 runs against recorded paths: the recorded tmpdir still exists and a
  real-cwd replay MUTATES it (the Phase-1 remap prevents this — keep it).
- The elided-beacon splice on inventory.py at 23:48:14 is CORRECT; earlier instincts to bound
  or reorder it were disproven (see the planning handoff, plans/handoff-develop-20260717-1803.md).
- Monitor gotcha (why this handoff sits in plans/s87/): monitor-handoff.sh scans ONLY
  plans/<scenario>/handoff-*.md — the planning agent's handoff in plans/ root was never
  detected; found manually.
- User preferences honored: comment out replaced code, no forwarding layers (module splits
  moved canonical homes and repointed importers), verb-named functions, domain types.

## How to Verify
```
cd jfred
npx tsx scripts/check_scenario_coverage.ts s87   # PASS 118/118
npx tsx scripts/check_scenario_coverage.ts       # 87/87 scenarios fully reproduced
npm test                                          # 786/786
```
