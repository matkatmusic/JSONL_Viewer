# Task 238 — Layer 1 ACCEPTANCE TEST: unrelated repo yields 2 buckets and 0 pairs

S18's milestone definition of done. Point `dir` at a folder of files and `repo` at a
SEPARATE, UNRELATED git repo; the rendered page must show exactly the two orphan bucket
widgets — every disk file under "No repository match", every repo file under "No on-disk
match" — and ZERO pair widgets.

Everything is in the **jfred submodule**: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred`.
All paths below are relative to that directory.

## What already exists (reuse, do not rebuild)

| File | What it gives you |
| --- | --- |
| `tests/layer1-view-test-helpers.ts` | `makeFixtureDiskFolder()`, `makeFixtureRepo()`, `startFixtureViewer(diskDir, port)`, `buildViewUrl(port, params)`, `requestFixtureView(...)`, `WireLayer1View`. Its repo fixture deliberately SHARES `shared.txt` with its disk folder, so it is the OVERLAPPING fixture — task 238 needs a new, unrelated pair beside it. |
| `tests/webapp-dom-test-helpers.ts` | `setupLayer1Dom(search)` builds a happy-dom window from `webapp/layer1.html` with a seeded `?search`; `stubFetchRoutes(routes)`; `flushAsyncWork()`. |
| `tests/layer1-page.test.ts` | The DOM pattern: `setupLayer1Dom` → stub fetch → dynamic-import the page module → call the EXPORTED `bootLayer1Page()`. |
| `tests/viewer_api_layer1_placement.test.ts` | The spawn-a-real-server pattern: `SCRATCH_PORT = <base> + (process.pid % 500)`, `before` spawns, `after` kills. |
| `webapp/layer1-page.ts` | Exports `bootLayer1Page()` AND `loadLayer1View(): Promise<void>` — the latter is the awaitable entry path this test uses. |

## Two constraints that shape the whole design

**1. The page fetches a RELATIVE url.** `loadLayer1View` calls
`fetch("/api/layer1-view?" + params)`. Node's native `fetch` rejects relative urls, so the
page cannot reach a spawned server on its own. Solve it by FORWARDING the relative request to
the live server's absolute origin — never by canning a JSON response, which would leave the
endpoint unexercised and reduce this to a re-run of the task-237 DOM test. Only origin
resolution is harness-supplied; the request, the route, the git reads and the response are all
real.

**2. Do NOT use `flushAsyncWork()` here.** It is three `setTimeout(…, 0)` turns, written for a
stub that resolves immediately. A real HTTP round trip plus the endpoint's `git` subprocesses
will not reliably finish inside it, and the test would be intermittently green. Await the
page's own exported `loadLayer1View()` promise instead — deterministic, and it exercises the
real entry path.

## Hard constraints

- Every source and test file caps at **250 lines**. Split like `tests/layered-app-widgets.test.ts` if needed.
- This test file spawns its **own** viewer on its **own** port. `18900+` and `19400+` are taken
  (each reserves 500 via `process.pid % 500`), so use base **19900**.
- `plans/coding-requirements.md` is mandatory: domain types over primitives, single canonical
  wire vocabulary, DRY helpers, enum-member comparisons, **verb-named functions**.
- Tests follow `~/.claude/guides/tdd.md`: `test_<behavior>` names, plain-English
  `// Scenario:` + `// Steps:` comments, one behavior per test.
- Runner is `node --test` via `npm test`, **not vitest**. An `undefined` argument to a fixture
  helper crashes only under `node --test`, so pass every helper parameter explicitly.
- Every fixture instant is **pinned** — `GIT_COMMITTER_DATE` for commits, explicit mtimes for
  files. No value may come from the clock.
- Assert bucket **CONTENT** (which path is in which bucket), never sizes alone: `gitOrphans`
  and `diskOrphans` are mirror images, so a swap or rename is invisible on shape.
- Do **not** touch the frozen wire contract (absolute `axisPx` per node, no per-pair widget
  offset) and do **not** edit `src/viewer_api_layer1.ts` unless the test exposes a real defect.

---

# Step 1 — capture the pristine `fetch` and add the forwarding helper

**File:** `tests/webapp-dom-test-helpers.ts`

### 1a. Capture the native fetch at module scope

At the top of the file, immediately after the imports, add:

```ts
// The pristine global fetch, captured at module load BEFORE any test replaces it. Both helpers
// below build on this rather than on whatever `globalThis.fetch` currently is, so calling them
// in sequence within one file cannot chain a stub on top of a stub.
const NATIVE_FETCH = globalThis.fetch;
```

Rationale to keep in the comment: without it, `forwardFetchToOrigin` called after
`stubFetchRoutes` would forward THROUGH the stub and silently return canned 404s.

### 1b. Add the forwarding helper

Add beside `stubFetchRoutes` (which stays exactly as it is — other tests depend on it):

```ts
// Point the page's RELATIVE fetches at a live server (task 238). node's native fetch rejects a
// relative url, so an end-to-end DOM test cannot otherwise reach a spawned viewer. Only the
// ORIGIN is supplied by the harness: the pathname, query, route, git reads and response are all
// real, which is what makes this an acceptance test rather than a second render test.
export function forwardFetchToOrigin(origin: string): void {
    Object.assign(globalThis, {
        fetch: (url: unknown, options?: RequestInit): Promise<Response> =>
            NATIVE_FETCH(new URL(String(url), origin), options),
    });
}
```

`origin` stays a plain `string`: it is a URL origin, not one of the domain values
`coding-requirements.md` §1 names (identifier / time / filesystem path), and `URL` consumes a
string base directly. The name carries a verb per §5.

---

# Step 2 — add the UNRELATED-roots fixture

**File:** `tests/layer1-view-test-helpers.ts` (currently ~152 lines; this adds ~45, staying
under the cap)

The existing `makeFixtureDiskFolder` / `makeFixtureRepo` pair OVERLAPS on `shared.txt` — that
is what makes the placement fixture produce a pair. Task 238 needs the opposite, so add a
second, clearly-named pair beside them. Do not modify the existing two: three test files
depend on their exact instants and pixel ladder.

### 2a. Pinned instants

Add beside the existing instant constants:

```ts
// Task 238's UNRELATED fixture: two roots that share no relative path at all. Distinct instants
// per file so each bucket row proves it carries its OWN timestamp and so neither bucket's
// ordering can pass on a tie.
export const UNRELATED_FIRST_COMMIT_INSTANT = "2026-07-01T10:00:00Z";
export const UNRELATED_SECOND_COMMIT_INSTANT = "2026-07-01T15:00:00Z";
export const UNRELATED_FIRST_DISK_MTIME = "2026-07-02T09:00:00Z";
export const UNRELATED_SECOND_DISK_MTIME = "2026-07-02T12:00:00Z";
```

### 2b. The disk folder

```ts
// A plain folder whose every relative path is absent from makeUnrelatedFixtureRepo's tree, so
// pairing yields ZERO pairs and both buckets are populated (S18's acceptance criterion).
export function makeUnrelatedFixtureDiskFolder(): string {
    const diskDir = mkdtempSync(join(tmpdir(), "layer1-unrelated-dir-"));
    writeFileWithPinnedMtime(diskDir, "notes.txt", "disk only\n", UNRELATED_FIRST_DISK_MTIME);
    writeFileWithPinnedMtime(diskDir, "todo.md", "disk only too\n", UNRELATED_SECOND_DISK_MTIME);
    return diskDir;
}
```

Reuse the file's existing `writeFileWithPinnedMtime` and `runGit` helpers — do not write new
ones (§3).

### 2c. The unrelated repo

```ts
// A repo whose every tracked path is absent from the folder above. Two commits, one file each,
// so the two gitOrphans rows carry DIFFERENT instants and the bucket's ascending order is
// actually exercised rather than resolved by a tie.
export function makeUnrelatedFixtureRepo(): string {
    const repoDir = mkdtempSync(join(tmpdir(), "layer1-unrelated-repo-"));
    runGit(repoDir, "init -q");
    writeFileSync(join(repoDir, "alpha.py"), "print('repo only')\n");
    runGit(repoDir, "add -A");
    runGit(repoDir, "commit -q -m first", UNRELATED_FIRST_COMMIT_INSTANT);
    mkdirSync(join(repoDir, "docs"), { recursive: true });
    writeFileSync(join(repoDir, "docs", "readme.md"), "repo only too\n");
    runGit(repoDir, "add -A");
    runGit(repoDir, "commit -q -m second", UNRELATED_SECOND_COMMIT_INSTANT);
    return repoDir;
}
```

Notes for the implementer:
- `docs/readme.md` is nested **on purpose**: it proves the buckets list repo-relative paths
  rather than basenames, which a flat fixture cannot catch.
- Add `mkdirSync` to the existing `node:fs` import if it is not already there.
- Match the existing `runGit(repoDir, command, instant)` signature exactly — check how the
  current `makeFixtureRepo` passes `GIT_COMMITTER_DATE` and use the same form. **Do not**
  invent a `--date` flag; the committer date is what the endpoint reads.
- `git init -q` default-branch naming varies by git version; the endpoint defaults `ref` to
  `ACTIVE_BRANCH_REF`, and the existing fixture already works this way, so change nothing here.

---

# Step 3 — RED: write the acceptance test

**New file:** `tests/layer1-acceptance.test.ts`

A test file with no matching source module is fine and does not trip the missing-test-file
hook (`tests/layered-app-widgets.test.ts` is the precedent).

### 3a. Header comment

State what makes this file different from its neighbours:

```ts
// Task 238 (spec S18): the MILESTONE ACCEPTANCE TEST. Every other Layer 1 test exercises one
// half — the endpoint against a fixture, or the page against a canned view. This one runs the
// whole path: a real folder and a real UNRELATED repo, through the real GET /api/layer1-view on
// a spawned viewer, into the real page render in happy-dom. The page's relative fetch is
// forwarded to the live origin (forwardFetchToOrigin); nothing about the view is canned.
//
// Pixel offsets are deliberately NOT asserted here — tests/viewer_api_layer1_placement.test.ts
// owns placement. This file asserts the user's acceptance criterion: two buckets, zero pairs,
// and every path in the correct bucket.
```

### 3b. Scaffolding

```ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import {
    makeUnrelatedFixtureDiskFolder,
    makeUnrelatedFixtureRepo,
    startFixtureViewer,
} from "./layer1-view-test-helpers.ts";
import { forwardFetchToOrigin, setupLayer1Dom } from "./webapp-dom-test-helpers.ts";

// Own port range: 18900+ and 19400+ are claimed by the two viewer_api_layer1 files, each
// reserving 500 through `process.pid % 500`.
const SCRATCH_PORT = 19900 + (process.pid % 500);

const diskDir = makeUnrelatedFixtureDiskFolder();
const repoDir = makeUnrelatedFixtureRepo();

let child: ChildProcess | undefined = undefined;

before(async () => {
    child = await startFixtureViewer(diskDir, SCRATCH_PORT);
});

after(() => {
    child?.kill();
});
```

### 3c. The render driver

```ts
// Boot the page against the LIVE endpoint and wait for its render to finish. `loadLayer1View` is
// awaited rather than flushAsyncWork()'d: that helper is three zero-delay macrotask turns, which
// a real HTTP round trip plus the endpoint's git subprocesses will not reliably fit inside.
async function renderPageAgainstLiveEndpoint(): Promise<void> {
    const search = `?dir=${encodeURIComponent(diskDir)}&repo=${encodeURIComponent(repoDir)}`;
    setupLayer1Dom(search);
    forwardFetchToOrigin(`http://127.0.0.1:${SCRATCH_PORT}`);
    const { loadLayer1View } = await import("../webapp/layer1-page.ts");
    await loadLayer1View();
}
```

Implementer note: importing the page module also runs its own top-level `bootLayer1Page()` on
first import, which fires one extra unawaited load. Both renders produce identical DOM, so no
assertion can observe the difference — do not add machinery to suppress it. `setupLayer1Dom`
and `forwardFetchToOrigin` run BEFORE the import so that boot sees a real window and a working
fetch.

### 3d. The helpers the assertions need

Copy these two small readers from `tests/layer1-page.test.ts` rather than importing across test
files (they are three lines each; a cross-test-file import would couple two suites):

```ts
function listMatching(selector: string): HTMLElement[] {
    return [...document.querySelectorAll(selector)] as HTMLElement[];
}

// A bucket's identity is its TITLE, never its position or size — the two buckets are mirror
// images, so finding one by index would let an inverted binding pass.
function findBucketTitled(title: string): HTMLElement | undefined {
    return listMatching("#stage .filebox.bucket")
        .find((bucket) => bucket.querySelector(".fname")?.textContent === title);
}

function listBucketPaths(bucket: HTMLElement): (string | null)[] {
    return [...bucket.querySelectorAll("li span")].map((row) => row.textContent);
}
```

### 3e. The tests

Write these THREE separate tests — one behavior each, per the TDD guide. Write them failing
first (the fixture builders and `forwardFetchToOrigin` do not exist yet, so the file will not
even import — that is the RED state; do not stub anything to make it import).

```ts
test("test_unrelated_roots_render_zero_pair_widgets", async () => {
    // Scenario (task 238, spec S18): when the folder and the repo share no relative path, there
    // is nothing to pair, so the stage draws no pair widget at all and says so.
    // Steps:
    // render the page against the live endpoint with two unrelated roots.
    await renderPageAgainstLiveEndpoint();
    // no pair widget is drawn — `:not(.bucket)` excludes the two orphan buckets, which are also
    // .filebox elements.
    assert.equal(listMatching("#stage .filebox:not(.bucket)").length, 0);
    // and the empty-state message stands in for them.
    assert.equal(document.querySelector("#stage .nopairs")?.textContent, "No git ↔ on-disk pairs.");
});

test("test_unrelated_roots_render_exactly_the_two_orphan_buckets", async () => {
    // Scenario: with both directions non-empty, S18 draws BOTH buckets and omits neither.
    // Steps:
    // render the page against the live endpoint with two unrelated roots.
    await renderPageAgainstLiveEndpoint();
    // exactly two buckets exist, identified by title rather than by count alone.
    assert.equal(listMatching("#stage .filebox.bucket").length, 2);
    assert.notEqual(findBucketTitled("No on-disk match"), undefined);
    assert.notEqual(findBucketTitled("No repository match"), undefined);
});

test("test_every_repo_path_and_every_disk_path_lands_in_its_own_bucket", async () => {
    // Scenario (spec S18 "Output contract"): every repo file belongs under "No on-disk match"
    // and every disk file under "No repository match". The two sets are mirror images, so this
    // asserts WHICH PATH is in WHICH bucket — a swap would leave both counts identical.
    // Steps:
    // render the page against the live endpoint with two unrelated roots.
    await renderPageAgainstLiveEndpoint();
    // the repo's two tracked paths, repo-relative and oldest commit first.
    assert.deepEqual(listBucketPaths(findBucketTitled("No on-disk match")!), ["alpha.py", "docs/readme.md"]);
    // the folder's two files, oldest mtime first.
    assert.deepEqual(listBucketPaths(findBucketTitled("No repository match")!), ["notes.txt", "todo.md"]);
});
```

Why the expected orders are what they are — the implementer should verify rather than assume:
the endpoint sorts every bucket's rows ascending by instant. `alpha.py` is committed at
10:00 and `docs/readme.md` at 15:00; `notes.txt`'s mtime is 09:00 and `todo.md`'s is 12:00 the
next day. If a run disagrees, re-derive from the fixture instants before touching either the
expectation or the source.

---

# Step 4 — GREEN and verify

1. Implement Steps 1 and 2 so the file imports and the three tests pass.
2. Confirm all three files are under 250 lines:
   `wc -l tests/layer1-acceptance.test.ts tests/layer1-view-test-helpers.ts tests/webapp-dom-test-helpers.ts`
3. Run `npx tsc --noEmit` for both `tsconfig.json` and `tsconfig.webapp.json`.
4. **Do not run the test suite** — the user runs tests. (The repo's Stop hook may run it
   automatically after an edit; if it reports a failure, diagnose it, but do not invoke the
   suite yourself.)

## If a test fails, decide correctly which side is wrong

- Wrong **path** in a bucket, or a path in the wrong bucket → a real defect. `gitOrphans`
  (in the repo, absent from disk) must bind to "No on-disk match" and `diskOrphans` to "No
  repository match", in both `src/viewer_api_layer1.ts` and `webapp/layer1-page.ts`. Fix the
  source.
- Wrong **order** within a bucket → re-derive from the pinned instants above first; only then
  suspect `orderRowsByInstant`.
- A pair widget appears at all → the fixture roots are not actually disjoint. Check for an
  accidental shared relative path before suspecting the pairing code.
- Basename instead of `docs/readme.md` → a real defect in how repo-relative paths reach the
  bucket rows.

## Out of scope

Do not add navigation from `index.html` to the page, do not assert pixel offsets, and do not
alter the three existing Layer 1 test files.
