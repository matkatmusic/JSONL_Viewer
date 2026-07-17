# Implementation notes — Item 16 (run the sidecar over list2): SURVEYED → DEFERRED

**Date:** 2026-06-17
**Disposition:** DEFERRED. The MISMATCH half was already delivered by item 15 (in-probe promotion);
the NOT_FOUND half is not buildable now (0 of 64 git-recoverable). Item 16 ships a read-only
reopen-gate tool, its tests, this note, and the roadmap checkbox.
**Outcome:** No production reconstruction/probe code added → probe A/B byte-identical → **no
re-baseline** (`develop-baseline` unchanged at `a8947fc`).

## The item as written
Roadmap §C item 16: *"Run the sidecar over list2"* — drive the per-line sidecar across list2's
MISMATCH + NOT_FOUND targets (`tools/probe-results-v2.json` `filesNotInProject`) so item 15 can
promote the per-line-perfect ones. Two findings reshaped it into a survey:

1. **The MISMATCH half is already done.** Item 15 (`plans/handoff-develop-20260617-1858.md`) added
   in-probe promotion (`api/promote-per-line-status.js` via `tools/probe-v2-assembly.js`
   `maybePromotePerLine`): for every probe MISMATCH it runs `extractFileEvents → trackLineStates`
   against the SAME reference and relabels per-line-perfect files `PASS_PER_LINE`. On the frozen
   fixture this flipped **list2 MISMATCH 106 → 50** (+56). Nothing more to build there.
2. **The NOT_FOUND half is not buildable now.** The 64 list2 NOT_FOUND files have no on-disk copy,
   no snapshot, and — verified by a full 64-file census via the reopen-gate spike — **0 of 64 are
   git-recoverable.** The item-15 handoff's claim that item 13's git rung makes them scoreable is
   **false**: item 13's rung lives in the sidecar CLI, but the failure here is upstream (no repo on
   this machine / never-committed), which no rung fixes.

## What the 64 NOT_FOUND files actually are (census)
| Bucket | Count | Why no reference exists |
|---|---|---|
| A. foreign `/home/user/repo/*` | 14 | another machine; `/home/user` absent here → no on-disk, no local repo |
| B. `~/.claude/plans` + `/root/.claude/plans` | 11 | plans folder is not a git repo (and `/root` is a foreign home) |
| C. `jot-worktrees/*` | 6 | worktree-local plan/debate/migration artifacts, never committed |
| D. `jot-recovery/*` | 1 | scratch/recovery tree |
| E. `~/Programming/jot/*` | 31 | repo exists but these are gitignored `.plate`/`Debates`/`Todos`; `git log --all -- <f>` empty |
| F. other | 1 | `jotVerifySequence/*` scratch |

The spike's git-recoverability classification of the same 64:
`{noRepo: 30, repoButNoRef: 34, RECOVERABLE: 0}` → **viable: false** (NON-VIABLE).
- `noRepo` (30): no transcript session cwd walks up to any git repo on this machine (buckets A/B/most
  of C/D/F — foreign homes and non-repo dirs).
- `repoButNoRef` (34): a repo resolves (mostly the `~/Programming/jot` repo, bucket E) but no git ref
  holds the file — it is gitignored / never committed.
- `RECOVERABLE` (0): no file resolves to non-null content via the CLI git rung.

(The path-class census A–F and the spike's noRepo/repoButNoRef split are two views of the same 64; the
boundary between "no repo" and "repo-but-ignored" depends on per-file session cwd, so the per-bucket
counts are not expected to line up one-to-one. The load-bearing number is `RECOVERABLE: 0`.)

## Why git cannot reach them
`classifyNotFoundTarget` calls `api/reference-ladder.js resolveGitReference` — the **exact** resolver
the production CLI git rung (item 13) uses — so the spike measures precisely what the CLI would
recover. For all 64:
- bucket A/B (foreign `/home/user`, `/root`): the session cwd does not exist on this machine, so
  `resolveRepoRootWalkingUp` finds no repo → `git show <ref>:<path>` is never attempted → null.
- bucket E (`~/Programming/jot/*`): the repo resolves, but the files are gitignored
  (`.plate`/`Debates`/`Todos`); `git show <ref>:<path>` exits non-zero for every ref in
  `buildMultiRefs` (branch, origin/branch, HEAD, main, master) → null.
- buckets C/D/F: worktree-local / scratch trees, never committed → null.

The failure is **upstream of the reference ladder**: there is no committed bytes to score against.
No rung added to `chooseReference` changes that.

## What item 16 actually delivered
- **MISMATCH half:** shipped by item 15 (list2 106 → 50 `PASS_PER_LINE`). Not rebuilt.
- **NOT_FOUND half:** a read-only **reopen-gate tool** `tools/spike-item16-list2-notfound-yield.js`
  (mirrors items 6 & 7's survey-tool pattern) + its suite
  `tests/test-spike-item16-list2-notfound-yield.js` (6 tests). The tool re-measures
  git-recoverability on demand; it adds NO reconstruction/probe code.

## What item 16 is deliberately NOT (settled — do not revisit)
- **NOT** extending in-probe promotion to NOT_FOUND. For NOT_FOUND `decision.usedSource` is `null`
  (`api/reconstruction-reference-sources.js:72-80`), so `reference.content = decision.usedSource.content`
  would throw; and a `via:'none'` reference makes `buildFinalVerdict` early-return
  (`api/final-line-verdict.js:53`) → `mismatched===0` *vacuously* → false promotion. The
  `=== 'MISMATCH'` guard in `api/promote-per-line-status.js` stays exactly as-is; never relax to
  `!== 'PASS'`.
- **NOT** building a standalone production batch driver now (`tools/run-sidecar-over-list2.js`). It
  returns nothing for every NOT_FOUND class today. Build it only if the reopen gate flips.

## Reopen trigger
Reopen item 16 when the spike's `counts.RECOVERABLE >= 1` (equivalently `viable: true`). The reopen
lever is **data, not code:** the 31 `~/Programming/jot/*` files become recoverable only if their
gitignored `Debates`/`.plate`/`Todos` artifacts get committed (a data-collection fix outside RevEng);
the foreign `/home/user` + `/root` files need their source machine. When the gate flips, reopen and
build the standalone batch driver as production code.

Exact reopen check (read-only; never run the probe against live claude-data):
```bash
cd /Users/matkatmusicllc/Desktop/claude\ code\ src/RevEng
node tools/spike-item16-list2-notfound-yield.js
# today: {counts:{noRepo:30,repoButNoRef:34,RECOVERABLE:0}, viable:false}  → NON-VIABLE
# reopen when counts.RECOVERABLE >= 1 → VERDICT: REOPEN-CANDIDATE
```

## Reproduce
Read-only; no production reconstruction code path. The spike reads `tools/probe-results-v2.json`
(never regenerates it), selects the 64 `status==='NOT_FOUND'` `filesNotInProject` entries, and
classifies each via `api/reference-ladder.js resolveGitReference` (the CLI git rung's resolver).
Expect 64 scanned, `RECOVERABLE: 0`, `viable: false`. Unit suite:
`node tests/test-spike-item16-list2-notfound-yield.js` → 6 passed (the RECOVERABLE test proves the
gate CAN flip, guarding against a false-permanent DEFER).
