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

## AMBIGUITIES (grilling)

1. Range model: full S16/S17 n-cut partition, or v1 = extend the SHIPPED
   2-point diff wash (one range = one segment) and defer multi-segment?
2. jfred branch base: anchor-built root (Q17) or fork of current HEAD?
3. "Mark a section" = one 2-cut range → how many commits? One for the span,
   or Q17's literal one-per-segment (n+1)?
4. WHERE do special ruler nodes live — ruler gutter row, a dedicated strip,
   or a new lane? (No node renders on the ruler today.)
5. Branch created lazily on first commit, or exists-empty up front?
6. Export vs commit: two independent actions on a marked range, or export
   always + commit opt-in? One control or two?
7. Idempotency: jfred branch append-only, or can a re-mark amend/reset?
8. Disk races: apply-and-commit re-reads live disk, or pins the verified
   bytes captured at mark time?
9. Do jfred-branch commits need kept/rejoin visual treatment vs the bubbles
   they were cut from?
10. Author-date when per-file snap instants differ: earliest, latest, or
    the mark's nominal instant?
11. Is the refs-route filter the only exclusion point needed (only
    branch-listing route today) — confirm as a spec invariant.
