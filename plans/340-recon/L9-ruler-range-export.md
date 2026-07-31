# L9 recon — ruler range → git patch export | commit onto 'jfred' branch

## Settled semantics to RESTATE (S16/S17 + Q17 closure, hpp:180-193)

Arming enables cut marks; a mark = one global instant, snapping PER FILE
AT-OR-BEFORE to that file's nearest VERIFIED state (unverified refused,
never pulls future content back). n marks → n+1 contiguous segments
covering the whole ruler. Per-file patch = diff(end of previous segment,
rightmost state in this segment); first base = anchor; file born after a
cut is absent until its birth segment. Segments concatenate into one
git-diff; must `git apply` cleanly in sequence. Commit half (Q17 CLOSED):
one commit per segment, apply-and-commit from the baseline root; per-file
snap variance manifested in the commit message; author date = cut's
snapped instant, committer date = export wall clock.

## What already exists (closer than expected)

- Per-file unified diff: `runGitUnifiedDiff` (src/render_git_diff.ts:19,
  `git diff --no-index`, strips preamble → hunks only) via
  `buildLayer1DiffPayload` (viewer_api_layer1_diff.ts; GET /api/layer1-diff
  + POST /api/layer1-diff-content).
- Git-apply-able patch: `exportPatch()` (layer1-diff-pane.ts:140-152) wraps
  hunks with synthetic diff --git/---/+++ headers → client Blob download.
  PER FILE, per pane, client-side only. No multi-file concatenation, no
  server git apply anywhere.
- Range gesture: shift-click two lane nodes → `extendDiffSelection` →
  `.diff-wash` band + `createDetailViewsForFiles(view, files, {baseInstant,
  targetInstant})`; `resolveRangeStepIndexes` (layer1-diff-wash.ts:31-50)
  ALREADY implements per-file at-or-before snap — for exactly 2 instants.
- Verified byte sources on the wire: `readLayer1FileBytes` dispatch
  (viewer_api_layer1_file.ts:55-62) — commit (git show), disk (readFileSync
  + escape check), snapshot (sidecar). `.n-created` is the no-bytes kind
  the drawer already refuses (`:not(.n-created)`) — the "refuse the cut"
  precedent.
- Ruler interaction: `makeRulerTickClickable` (layer1-ruler-click.ts:74-92)
  is single-click only (expand row / scroll to bubble). No drag. Closest
  mark-rendering analog: `layer1-ranges.ts` buildMark/`.range-wash`/
  `#ranges` (session range BARS, not point marks).

## Commit half: nothing exists

Zero `git commit`/`git apply`/`git branch`/`checkout -b` in src/ (all git
spawns are read-only; argument-array spawnSync pattern to follow). Branch
picker = `#branch` <select> in the `.sources.repo` header row, owned by
webapp/layer1-refs.ts, populated by buildLayer1RefsView
(viewer_api_layer1_refs.ts:41-53, `git for-each-ref refs/heads`) — the
SINGLE exclusion point for hiding the created 'jfred' branch (one filter
line). Glossary has NO "Branch picker" row — glossary gap to fix.
Special ruler nodes for jfred-branch commits: genuinely new render surface —
no existing node kind renders ON the ruler.

## Thin adapters needed

- Arming state + mark placement branch in layer1-ruler-click.ts.
- Generalize resolveRangeStepIndexes from 2 instants to n cuts / n+1
  segments (snap to n-commit/n-disk/n-snap, never n-created).
- Server-side per-file-per-segment diff loop + concatenation (reuse
  exportPatch's header wrapper, move it out of the pane).
- NEW route for apply-and-commit (git apply + git commit --date per
  segment, in order).
- One-line branch filter in buildLayer1RefsView.
- New ruler-node class + placement for jfred-branch commits.

## SETTLED (grilling, 2026-07-30) — nothing open

L9 is the only layer that **writes**. Every git call in the engine today is
read-only; this adds `git apply` and `git commit`.

### The model: a growing prefix, not a partition

**This amends the S16/S17 text above.** "n marks → n+1 contiguous segments
covering the whole ruler" is replaced by:

- One marked range = one segment = **one commit**.
- The first commit's base is the commit chosen by the **ruler base** marker.
  Each later commit's base is the jfred tip.
- You may **stop at any time**. The timeline does not need full coverage.
- You may **not** start in the middle. Chunks extend the prefix.
- Skipping a stretch does not omit it: because each commit diffs the jfred tip
  against the new mark, anything in between is **absorbed into the next
  commit**. Its message must say so — "includes N unmarked changes".

### The branch

- jfred **forks from an existing commit on the timeline**, selected by a new
  **ruler base marker**. Not an orphan root, not current HEAD.
- Created lazily, on the first commit.
- The base is **immutable**. To change it, delete the jfred branch entirely.
- **Append-only.** No amend, no reset, no force-push. Deleting the branch is
  the only undo — so the app never rewrites history it did not just create.
- **Hidden from the repo branch picker** (one filter line in
  `buildLayer1RefsView`), so a reconstruction can never be loaded against a
  synthetic branch. The strip is where it is seen and deleted.

### What goes in a commit

- **v1: markers may only be placed on beacon nodes.** No derived node can carry
  a marker. This is what makes "any jfred commit is a beacon" sound rather than
  self-certifying — every committed byte was already verified.
- Each file in the chunk contributes its **nearest verified state at-or-before**
  the mark (S16/S17 as written). A file with nothing verified yet is absent
  until its first beacon. Per-file snap variance goes in the commit message.
- Bytes are **pinned at mark time**, not re-read at commit time — what you saw
  on the timeline is what lands in git.
- **Any jfred commit counts as a beacon** on the next pass. That is the point:
  committing verified chunks creates real git state, which resolves previously
  unverified stretches when the branch is extended.

### Dates

Author date = the mark's instant, which under the beacon-only rule is always a
real evidenced moment. Committer date = export wall clock. The message carries
a footnote: `reconstructed by JFRED @ <real timestamp>`.

### UI

- jfred commits render in a **dedicated strip beside the ruler** — a new render
  surface with its own layout, hit-testing and scroll sync. Nothing renders on
  the ruler today.
- **Commit only for v1.** No multi-file patch export; per-file patch download
  stays where it already is (`exportPatch`, layer1-diff-pane.ts:140-152).
- L9 is **not a layer** — it adds no node kind. It is a mode you arm. See
  DECISIONS.md.
