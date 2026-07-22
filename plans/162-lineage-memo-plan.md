# Task 162 plan — safely memoize nested lineage replays (phase-4 blowup fix)

Root cause (verified in code): `replayLineageContentBefore` (`jfred/src/reconstruction_branches.ts:199`)
memoizes ONLY replays entered on a clean seeding stack (`enteredWithCleanStack`). Every nested
replay — one target's pre-state needing another target's lineage — recomputes the target's FULL
pipeline, and those recomputations recurse, so the same `(target, before)` is replayed 27-56x.
Script-run discovery is NOT part of the problem: `findScriptExecutionRuns` is already corpus-cached
(`CorpusState.scriptRuns`); the "1447 runs" log lines are per-replay progress labels.

Fix = task's direction (a): cache nested replay results that are PROVEN stack-independent, and
serve cached results to nested callers only when provably identical to a fresh compute. Zero
behavior change; strictly less work.

## The correctness argument (drives every rule below)

A replay's result can depend on execution-stack state in exactly two ways:
1. **Cycle-guard hits.** A replay whose subtree queries a `cycleKey` currently on the stack gets
   `undefined` for that seed (degraded). Rule: track, per in-flight frame, every cycleKey its
   subtree queried. A guard hit on key K degrades every frame pushed AFTER K's own frame (K's own
   frame reproduces the same hit on a fresh compute, so it stays cacheable). Only un-degraded
   ("un-poisoned") frames may be stored. A stored entry carries its transitive queried-key set;
   it may be served — on ANY stack — only when none of those keys is currently in flight
   (then a fresh compute would take the identical path). Serving an entry adds its queried keys
   to all in-flight frames (the caller now depends on them).
2. **Window narrowing.** `enterLineageReplayWindow` NEVER widens: a nested replay with `before`
   later than the active cutoff computes under the OUTER cutoff, so its result is not intrinsic
   to `(target, before)`. Rule: when the active cutoff is defined and earlier than `before`,
   neither read nor write the cache for that call.

Top-level (clean-stack) calls: frames empty → serve rule always passes, frame 0 can never be
poisoned (a hit poisons only frames after the hit key's index ≥ 0), window rule passes (no active
cutoff) — byte-identical to today's behavior, including caching top-level results whose subtrees
contained internal cycles.

## Changes

### 1. New module `jfred/src/reconstruction_lineage_memo.ts` (~85 lines)
Owns the replay-frame stack (REPLACES the `seedingLineages` Set in `reconstruction_branches.ts`)
and the memo bookkeeping. Exports:
- `type LineageSeedEntry = { text: string | undefined; queriedKeys: ReadonlySet<string> }`
- `countActiveLineageReplayFrames(): number` — for `reconstructFileOver`'s compute-fresh gate.
- `isLineageKeyOnReplayStack(cycleKey: string): boolean`
- `recordLineageKeyQuery(cycleKey)` — adds the key to every in-flight frame's queried set.
- `recordLineageGuardHit(cycleKey)` — poisons frames after the key's frame (defensive: poison all
  frames when the key is unexpectedly absent).
- `canServeLineageSeed(entry): boolean` — no queried key currently on the stack.
- `noteLineageCacheServe(entry)` — merge entry.queriedKeys into every in-flight frame.
- `beginLineageReplayFrame(cycleKey)` / `completeLineageReplayFrame(text): LineageSeedEntry | null`
  (pops; null when poisoned) / `abandonLineageReplayFrame()` (exception unwind: pop, no store).
- `replayWindowKeepsInstant(before: Date): boolean` — active cutoff undefined or ≥ before; uses a
  new getter from `reconstruction_script_runs.ts`.
Imports only the cutoff getter — no import cycle (corpus imports the entry TYPE only).

### 2. `jfred/src/reconstruction_script_runs.ts` (246/250 — +2/3 lines)
Add `getActiveLineageReplayCutoff(): Date | undefined` beside `restoreLineageReplayWindow`.

### 3. `jfred/src/reconstruction_corpus.ts`
`lineageSeedsByKey: Map<string, LineageSeedEntry>` (type import from the memo module).

### 4. `jfred/src/reconstruction_branches.ts` (237/250)
- Delete the `seedingLineages` Set; shrink its long memo comment to a pointer at the new module.
- `reconstructFileOver` gate: `seedingLineages.size > 0` → `countActiveLineageReplayFrames() > 0`.
- Rewrite `replayLineageContentBefore`:
  entry → `recordLineageKeyQuery`; guard via `isLineageKeyOnReplayStack` + `recordLineageGuardHit`
  then return undefined; cache read gated on `replayWindowKeepsInstant(before)` + `canServeLineageSeed`
  (serve → `noteLineageCacheServe`, return entry.text); else `enterLineageReplayWindow` +
  `beginLineageReplayFrame`, compute as today, `completeLineageReplayFrame(seededText)`, store the
  non-null entry when the window kept the instant; finally-block: `abandonLineageReplayFrame()` when
  the frame wasn't completed (exception path) + `restoreLineageReplayWindow` as today.
  Single-condition ifs throughout; keep the `reportReconstructionProgress` call on the compute path
  only (cache hits are silent — that is the observable speedup in the log-count repro).

### 5. Tests `jfred/tests/reconstruction_lineage_memo.test.ts` (node:test, same runner as siblings)
Unit-test the bookkeeping (the correctness rules above, one test each):
- complete on a clean single frame → entry carries the queried keys, not null.
- guard hit poisons frames pushed after the hit key's frame but NOT that key's own frame
  (three-frame stack: A, B, C; hit on A's key → B popped null... careful: pop order C then B;
  C and B null, A completes non-null).
- `canServeLineageSeed` false while a queried dependency is in flight, true after it pops.
- `noteLineageCacheServe` merges served dependencies into in-flight frames (parent's completed
  entry then carries them).
- `replayWindowKeepsInstant` false only when the active cutoff is earlier than `before`
  (drive via `enterLineageReplayWindow`/`restoreLineageReplayWindow`).

## Order of work
1. Write the memo module; 2. the script_runs getter; 3. corpus type change; 4. branches rewrite;
5. tests; 6. `npm run typecheck` in jfred (npm install first if node_modules missing); stage in the
jfred submodule. Do NOT run the scenario sweep or app (user runs suites). Do not commit.

## Verification the user can run later
Repro from the task: load project `-Users-matkatmusicllc-Desktop-claude-code-src-RevEng` with
script consent, pipe server stdout, count `replaying lineage of` repeats per target — repeats per
(target, timestamp) should collapse to ~1 on the cache-hit paths; the 87-scenario sweep must stay
green (behavior-preservation argument above predicts zero ladder changes).
