## 2026-07-25:15:45:00 — Task 238: Layer 1 milestone acceptance test (unrelated repo → 2 buckets, 0 pairs)
Chat title: tackle-tasks 237 240 → close → tackle-tasks 238 (S18 Layer 1 View milestone)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/b97bdfe7-d6f6-4031-ac4c-427012b322fc.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-238-layer1-acceptance-test.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/from-scratch-SPEC.md (S18)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/layer1-mockup.html
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/layer1-acceptance.test.ts (new)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/layer1-view-test-helpers.ts (extended)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/webapp-dom-test-helpers.ts (extended)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-task-237-layer1-webapp-page.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-task-240-layer1-placement.md

### Design decisions

**The page's relative fetch is FORWARDED, not stubbed.** `loadLayer1View` calls
`fetch("/api/layer1-view?…")`, and node's native fetch rejects a relative url, so the page cannot
reach a spawned viewer unaided. New `forwardFetchToOrigin(origin)` in
`tests/webapp-dom-test-helpers.ts` rewrites the relative request onto the live server's origin and
calls the real fetch. Only origin resolution is harness-supplied — the pathname, query, route, git
reads and response are all real. Canning a JSON response instead would have reduced this to a
second copy of the task-237 DOM test and left the endpoint unexercised, which is the one thing
task 238 exists to prevent.

**`NATIVE_FETCH` is captured at module load.** `webapp-dom-test-helpers.ts` now snapshots
`globalThis.fetch` at module scope, and `forwardFetchToOrigin` builds on that rather than on
whatever `globalThis.fetch` currently is. Without it, calling `forwardFetchToOrigin` after
`stubFetchRoutes` in the same file would forward *through* the stub and silently receive canned
404s. `stubFetchRoutes` itself is untouched — four other test files depend on it.

**The unrelated fixture is a second pair of builders, not a parameterisation of the existing one.**
`makeFixtureDiskFolder`/`makeFixtureRepo` deliberately overlap on `shared.txt`, and three test
files depend on their exact instants and pixel ladder. `makeUnrelatedFixtureDiskFolder`/
`makeUnrelatedFixtureRepo` sit beside them with their own `UNRELATED_*` instants.

**`docs/readme.md` is nested on purpose.** A flat fixture cannot catch a bucket that lists
basenames instead of repo-relative paths.

**Two commits of one file each, rather than one commit of two.** Committing both repo files
together would give both `gitOrphans` rows the same instant, so the bucket's ascending order would
be resolved by a sort tie rather than actually exercised.

**Pixel offsets are deliberately NOT asserted here.** `tests/viewer_api_layer1_placement.test.ts`
(task 240) owns placement. This file asserts only the user's acceptance criterion: zero pair
widgets, exactly two buckets, and which path lands in which bucket.

**Buckets are found by TITLE, never by index or count.** `gitOrphans` and `diskOrphans` are mirror
images, so an inverted binding leaves every count identical; `findBucketTitled` plus a `deepEqual`
on each bucket's paths is what makes a swap fail.

### Deviations

**`flushAsyncWork()` is NOT used, against the pattern every other webapp DOM test follows.** It is
three `setTimeout(…, 0)` turns, written for a stub that resolves immediately; a real HTTP round
trip plus the endpoint's `git` subprocesses will not reliably finish inside it, and the test would
be intermittently green. `loadLayer1View()` is exported and returns a promise, so it is awaited
directly — deterministic, and it exercises the page's real entry path.

**Own port base 19900.** `viewer_api_layer1.test.ts` uses 18900+ and
`viewer_api_layer1_placement.test.ts` 19400+, each reserving 500 via `process.pid % 500`.

### Tradeoffs

**A first draft called only `loadLayer1View()` and skipped `bootLayer1Page()` — that was a bug, now
fixed.** `bootLayer1Page()` is what calls `fillSourceBoxesFromUrl()`, and `loadLayer1View` reads the
header BOXES, not the URL. node's module cache runs the module's own top-level boot only on the
first import, so test 1 rendered correctly off that one boot while tests 2 and 3 built a fresh
document whose boxes were never seeded, hit `loadLayer1View`'s missing-dir/repo guard, and rendered
nothing (0 buckets). The driver now calls `bootLayer1Page()` for every document and then awaits
`loadLayer1View()`. Worth recording because it is the second time this module-cache behaviour has
bitten in this milestone — task 237 exported `bootLayer1Page` for exactly this reason.

**The endpoint was verified independently before the test was blamed.** A throwaway probe built the
unrelated fixture, spawned the viewer and hit `/api/layer1-view` directly; it returned
`pairs: []`, `gitOrphans: [alpha.py@0, docs/readme.md@12.5]`,
`diskOrphans: [notes.txt@36.5, todo.md@44]` — matching the hand-derived ladder exactly (2.5 px/hr,
24 px cap: 10:00→0, 15:00→+5 h=12.5, next-day 09:00→+18 h capped to 24 →36.5, 12:00→+3 h=44). So
`src/viewer_api_layer1.ts` needed **no change**; the failure was entirely in the test driver.

**Copied `listMatching`/`findBucketTitled` rather than importing them from
`tests/layer1-page.test.ts`.** They are three lines each; importing across two test files would
couple two suites so that editing one's helpers breaks the other.

### Open questions

None blocking. Two carried forward from task 237, unchanged and still unowned by any task:

1. Nothing links to `/app/layer1.html` from `index.html`. S18 defines the page as a shareable link
   and no task asks for navigation, so none was added.
2. `git init` default-branch naming varies by git version. The fixture repo resolved to `master`
   here and the endpoint defaults `ref` to `ACTIVE_BRANCH_REF`, which is why nothing pins it — but
   a machine configured with `init.defaultBranch=main` is untested for this fixture.
