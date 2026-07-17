# Implementation notes — Roadmap Item 10 (+10a): Time-aware alias windows

Shipped 2026-06-17 via strict red-green TDD. Plan: `~/.claude/plans/clever-swinging-toucan.md`.
Handoff that fed this session: `plans/handoff-develop-20260617-1220.md`.

## What it does

`cp src dst` copies `src` into `dst` at ONE instant T, after which they diverge. The alias
set was STATIC for the whole timeline, so `src` edits made AFTER T bled into `dst`'s
reconstructed belief and mis-numbered it. Item 10 bounds alias membership in time: a `src`
event counts toward `dst`'s belief only THROUGH the copy instant T (the **upper** bound).
Sub-item **10a** (folded in) reseeds the CLI's transcript discovery from the full alias
closure instead of just `[target]`, so a transcript that touches only `src` is scanned.

The whole change is **sidecar-only** — the probe never calls any modified code path.

## Architecture (as planned, no deviation)

1. **New module `api/alias-windows.js`** (113 L) holds the time-aware closure + predicate +
   filter. The flat lineage exports (`buildLineageGraph`/`gatherAllOps`/`resolveAliases`/
   `editBelongsToFile`) are left **byte-identical** — the probe depends on them.
2. **Annotate-then-filter, NOT per-emitter gates.** Each event gets an additive `aliasPath`
   field at its emitter's existing membership-check site (the matched path is already computed
   there), then ONE pure `filterEventsByAliasWindows(events, windows)` runs in the CLI. This
   avoids threading a `windows` arg into 10 emitter call sites (which would breach the 250-line
   cap on `file-events-extractors.js`, 239→247) and keeps every emitter + `editBelongsToFile`
   byte-identical. `aliasPath` is inert to the engine/sort/materialize/verdict.
3. **Windows are upper-bound only**: `Map<absolutePath, latestValidMs>`; `Infinity` = never cut
   (the seed, and mv/git-mv same-identity paths). Lower bound is unmodeled (`-Infinity`).
4. **Window algorithm** (`resolveAliasWindows`): BFS/relaxation from the seed over lineage edges.
   - cp `{src,dst}` → directed `dst→src` edge, `cut = copyInstantMs(op)`.
   - mv/git-mv → undirected `src↔dst`, `cut = Infinity`.
   - Tightest (min) wins on rediscovery; cycles converge (the bound only decreases).
   - Seed protection: a seed is never relaxed below `Infinity`.

### Three correctness traps (all handled, all tested)
- **A1 — null copy-instant.** `copyInstantMs` returns `Infinity` (no cut) when the cp op's
  timestamp is missing/unparseable. Cutting to `NaN` would make every `unixMs <= NaN` false and
  silently drop ALL of the destination's events. Test:
  `test_resolveAliasWindows_unparseableCopyInstantDoesNotCut`.
- **Seed protection.** A `cp seed downstream` edge must not cut the tracked file. Test:
  `test_resolveAliasWindows_seedStaysFullEvenWhenCopiedToAnother`. (Confirmed live on
  RED_GREEN_TDD.md: a second cp `jot → plugin-cache` does NOT touch the seed's window.)
- **Snapshot full-path annotation.** Snapshots match by repo-relative suffix
  (`anyAliasPathEndsWith`), so the event is annotated with the FULL alias path whose suffix
  matched (new `matchedAliasPathForSnapshotKey` in `snapshot-events.js`), NOT the repo-relative
  key — else its `aliasPath` is not a key in the windows map and the event would be dropped.
  Test: `test_appendSnapshotRecordEvents_annotatesFullAliasPathNotRepoRelativeKey`. (This is why
  the plate e2e — which leans on snapshots — stayed 247/247.)

## Files

Modified:
- `api/file-historical-lineage.js` (245→246): +1 line `stampTouchTimestamps(ops, parsed)` in
  `collectTouches`, so cp/mv ops carry their record timestamp (the copy instant). Probe-safe —
  `buildLineageGraph`/`gatherAllOps`/`resolveAliases` read only `type/src/dst`.
- `api/file-events-extractors.js` (239→247): annotate 4 emitters (authored, originalFile, cat,
  read) with `event.aliasPath`. Stayed under the 250 cap (no `read-cat-events.js` split needed).
- `api/structured-patch-events.js` (71→73), `api/bash-op-events.js` (85→89; rm + redirect),
  `api/bash-read-events.js` (120→122), `api/grep-tool-events.js` (52→54): +1 annotation each
  (bash-op +2).
- `api/snapshot-events.js` (77→95): `matchedAliasPathForSnapshotKey` helper + annotation.
- `tools/track-line-states.js` (117→127): Phase 4 wiring — `resolveAliasWindowsForTarget`
  (build windows from `gatherAllOps`, return `{aliasPaths, windows}`); reseed `discoverJsonls`
  from the closure (10a); apply `filterEventsByAliasWindows` before `trackLineStates`.

Created:
- `api/alias-windows.js` (113): `resolveAliasWindows`, `aliasPathValidAt`,
  `filterEventsByAliasWindows`.
- `tests/test-file-historical-lineage-windows.js`: Phase-1 op-stamp test (sibling — the parent
  test file is at the 246-line cap).
- `tests/test-alias-windows.js` (191): 8 unit + authored-annotation + capstone + snapshot-trap.

Not touched (probe-depended): `editBelongsToFile`, `resolveAliases`, `buildLineageGraph`,
`gatherAllOps`; the engine `api/track-line-states.js`.

## Gates (all GREEN)

- Full suite: **61 suites / 619 passed / 0 failed** (was 59/607: +2 suites, +12 tests).
- detect-rewinds: **15 / 0**.
- **Probe A/B vs `develop-baseline` (880b69d): `identical: true`** — sidecar-only change; the
  probe never calls the modified code. NO re-baseline; `develop-baseline` unchanged.
- Sidecar e2e `plate_summary.py`: **matchedObserved 247, mismatched 0, conflicts 233 —
  UNCHANGED.** plate has no cp alias, so its windows are seed-only (`Infinity`) and the filter
  drops nothing → identical output. Proves the cut does not touch non-cp files.

## Payoff (the temporal cut measured on real data)

Critical method note: the item-2 spike numbers (2026-06-15) are STALE — the on-disk reference
files drifted in the 2 days since. The honest before/after is **`develop-baseline` (880b69d) vs
the windowed build on the SAME current data**:

- **`jot/RED_GREEN_TDD.md`** (src `jot-worktrees/python-migration/RED_GREEN_TDD.md`, copy instant
  2026-05-03T22:05:10Z): baseline `{obs:164, mismatched:1, conflicts:11}` → windowed
  `{obs:164, mismatched:1, conflicts:0}`. **Conflicts 11 → 0.** The window dropped 3 of the src's
  4 events (the post-copy edits); all 4 dst events kept. The 1 residual mismatch is the
  documented lower-bound limitation (unchanged from baseline). **This is the item working.**
- **`jot/skills/handoff-prompt/SKILL.md`** (src `jot-backup/.../SKILL.md`, copy instant
  2026-05-18T23:58:31Z): baseline `{obs:44, mismatched:57, conflicts:35}` ≡ windowed
  `{obs:44, mismatched:57, conflicts:35}` — **byte-identical to baseline.** The cp src has a
  single PRE-copy event (kept); there are no post-copy src events to cut, so item 10 has nothing
  to do here. The spike's `mismatched:3 / obs:98` was the on-disk file BEFORE it was edited; the
  44/57 is the current reference. **NOT a regression** — confirmed by `develop-baseline`
  producing the identical 44/57 on current data. No window dropped any event.

So on identical current data, item 10 is either a strict improvement (RED_GREEN_TDD.md: −11
conflicts) or a no-op (SKILL.md, and every non-cp file incl. plate). It never regresses.

## Known limitations (by design; reopen triggers — see plan)

1. **Lower bound / pre-existing destination.** Windows model only the UPPER bound; pre-copy
   attribution is unchanged from today's static behavior. The 1 residual RED_GREEN_TDD.md
   mismatch is this. **Reopen** if a cp-overwrite of a file with substantial prior authored
   history shows phantom mid-timeline conflicts.
2. **mv-overwrite of an existing path** parses identically to a rename; treated as same-identity
   (no cut), as today.
3. **Multi-lineage UNION windows.** On rediscovery we take the tightest (min) upper bound
   (conservative against bleed); a genuine UNION of disjoint valid intervals is not modeled.

## TDD record (RED→GREEN, watched each fail first)
- Phase 1: `test_collectTouches_stampsCopyInstantTimestampOnCpOp` (RED: timestamp undefined).
- Phase 2: 8 `alias-windows` unit tests (RED: module absent).
- Phase 3: `test_extractFileEvents_annotatesAuthoredEventWithAliasPath`,
  `test_windowFilter_keepsPreCopySrcWriteDropsPostCopySrcEdit` (capstone, strengthened with
  `matchedObserved===2` to defeat a false-green where a missing annotation drops ALL events),
  `test_appendSnapshotRecordEvents_annotatesFullAliasPathNotRepoRelativeKey` (RED: aliasPath
  undefined / wrong path).
- Phase 4: CLI wiring — no unit test (thin orchestrator); verified by the e2e + probe gates and
  the live payoff above.
