# Task 326 follow-up: an empty filter intersection must show ZERO files, not ALL files

## The defect

`intersectFilterTargets` (jfred/webapp/layer1-page.ts:87) returns `[]` both when
neither picker is filtering AND when two active pickers' selections do not overlap.
`filterLayer1ViewByTargets` (jfred/webapp/layer1-filter.ts:88) treats `[]` as "no
filter", so a user with a session selected in the JSONLs pane plus a non-overlapping
File Nav selection and "Show Only Selected" ON sees the FULL timeline and minimap
instead of an empty one. Headless CDP repro (2026-07-29) confirmed every other path
works: folder select + toggle filters 943→1 bubbles and the minimap follows.

## The fix shape

Distinguish the two meanings in the type: `undefined` = "not filtering",
`string[]` (possibly empty) = "filter to exactly these paths". Only one call site
exists (`redrawStage` in layer1-page.ts), so the ripple is two functions + tests.

## Steps, in order (strict red-green)

### Step 1 — RED: new + updated tests in jfred/tests/layer1-filter.test.ts

1a. In `test_two_pickers_intersect_and_an_empty_one_does_not_filter` (line ~124):
    - CHANGE the both-empty expectation: `intersectFilterTargets([], [])` returns
      `undefined` (was implicitly `[]` via the sessions spread).
    - KEEP `intersectFilterTargets([], ["a.ts","b.ts"])` → `["a.ts","b.ts"]` and
      `intersectFilterTargets(["a.ts"], [])` → `["a.ts"]` unchanged.
    - KEEP the non-overlap case `intersectFilterTargets(["a.ts"], ["c.ts"])` → `[]`
      — the RETURN VALUE is unchanged; only its downstream meaning changes.

1b. CHANGE `test_an_empty_selection_restores_every_record_at_its_original_offset`
    (line ~109): pass `undefined` instead of `[]` as the targets argument — that is
    now the "not filtering" spelling.

1c. ADD `test_a_filter_that_matches_nothing_draws_zero_files`:
    - Scenario comment: two active pickers whose selections do not overlap must
      empty the timeline, never fall back to showing everything.
    - `const filtered = filterLayer1ViewByTargets(FULL_VIEW, []);`
    - Assert `filtered.pairs.length === 0`, `filtered.gitOrphans.length === 0`,
      `filtered.diskOrphans.length === 0`, `filtered.ruler.length === 0`.

Run `node --test tests/layer1-filter.test.ts` (via `npm test` filter or directly
with tsx) and confirm 1a-changed, 1b-changed and 1c FAIL for the expected reasons
(type error / wrong counts) before touching source.

### Step 2 — GREEN: jfred/webapp/layer1-filter.ts

Change the signature to
`filterLayer1ViewByTargets(view, targets: readonly string[] | undefined, expansion?)`.
Replace the `targets.length === 0` early return with `targets === undefined`.
The existing `new Set(targets)` path already yields zero survivors for `[]` — no
other body change. Update the line-87 comment: `undefined` = no filter; an empty
list means the pickers matched nothing and the stage draws empty.

### Step 3 — GREEN: jfred/webapp/layer1-page.ts

`intersectFilterTargets` returns `string[] | undefined`:

```ts
export function intersectFilterTargets(folders: readonly string[], sessions: readonly string[]): string[] | undefined {
    if (folders.length === 0 && sessions.length === 0) {
        return undefined;
    }
    if (folders.length === 0) {
        return [...sessions];
    }
    if (sessions.length === 0) {
        return [...folders];
    }
    const touched = new Set(sessions);
    return folders.filter((path) => touched.has(path));
}
```

Update its comment: an empty PICKER isn't filtering; an empty INTERSECTION of two
active pickers filters everything out. `redrawStage` needs no edit — it passes the
result straight through.

### Step 4 — verify

- `node_modules/.bin/tsc -p tsconfig.webapp.json` and the repo's main typecheck.
- Full `npm test` in jfred (not just the touched file).
- Re-run the CDP repro script
  (`scratchpad/repro326.mts`) to confirm the working paths still filter 943→1→943
  and the minimap follows.
- Do NOT close task 326: the user must verify in their live browser (hard reload
  after `build:webapp`) — their report may also have been a stale bundle
  (known trap, tasks 241-244).

## Out of scope

- The mockup (`plans/layer2-mockup/`) and its checks — this defect is real-app only.
- Session-pane path spelling, nav search selection wipe — no evidence either is the
  reported failure; revisit only if the user's re-test still fails.
