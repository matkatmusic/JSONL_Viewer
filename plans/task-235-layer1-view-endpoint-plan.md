# Task 235 — `GET /api/layer1-view?dir=&repo=&ref=`

Spec: `specs/from-scratch-SPEC.md` S18. Mockup: `plans/layer1-mockup.html`.
Pattern to follow: `jfred/src/viewer_api_layered.ts` (query parse → engine call →
`sendJson`, HTTP wiring stays in `viewer_server.ts`).

All paths below are relative to `jfred/`. Style rules that govern every snippet:
`plans/coding-requirements.md` (domain types, verb-named functions, one canonical
home, no re-export shims), `~/.claude/guides/coding-standards.md` (4-space indent,
imperative style) and `~/.claude/guides/single-condition-branching.md` (one
condition per `if`, no compound `&&` guards).

**Do not run the test suite.** The user runs tests. Verification in this plan is
`npm run typecheck` only.

---

## What already exists (compose it — write no second copy)

| function | file | returns |
|---|---|---|
| `walkCurrentFileState(projectFolder)` | `src/layer1_disk_walk.ts` | `DiskFileState[]` = `{ relativePath: Path, mtime: Date }`, path-sorted |
| `listRepoTreeAtRef(repoDir, ref?)` | `src/layer1_repo_tree.ts` | `Path[]` in git tree order; **throws** naming the ref on a bad ref or non-repo |
| `pairDiskFilesAgainstRepoPaths(diskFiles, repoPaths)` | `src/layer1_pairing.ts` | `{ pairs: DiskFileState[], gitOrphans: Path[], diskOrphans: DiskFileState[] }` |
| `listPairCommitHistory(repoDir, repoRelativePath)` | `src/layer1_commit_history.ts` | `{ hash, instant }[]`, oldest first |
| `resolveInstantOffsets(instants)` | `src/layer1_ruler_axis.ts` | `{ instant, offsetPx }[]`, distinct + ascending, earliest at 0 |
| `requireParam(query, name)`, `sendJson(response, status, value)` | `src/viewer_server_routes.ts` | throws `missing query param: <name>` / writes JSON |

---

## Step 1 — thread `ref` through the shared git-log reader (RED first)

**Why this step exists at all:** the endpoint accepts a `ref`, and today
`listCommitsTouchingFile` runs `git log` with **no ref**, i.e. from `HEAD`. With
`?ref=<older-commit-or-other-branch>` the repo tree comes from that ref while the
ladders come from `HEAD` — a path tracked at the ref but absent from `HEAD` gets an
empty history, so a git-orphan row would have no instant to place it at. Fixing the
one shared reader fixes both call sites (Layer 1 ladders and git-orphan placement).

### 1a. Test first — `tests/layered_git_beacons.test.ts`

Add ONE test to the existing file (it already builds temp repos — reuse its
helpers; do not add a second repo-builder):

```ts
test("test_commit_history_is_read_from_the_requested_ref_not_head", () => {
    // Scenario: a file committed on a side branch is NOT reachable from HEAD.
    // Steps:
    // build a repo whose HEAD (main) never touched side-only.txt, while branch
    //   "side" has exactly one commit that added it.
    // reading the file's touches with the DEFAULT ref (HEAD) yields nothing —
    //   proving the default is unchanged for Layer 2's callers.
    // reading the same file with ref "side" yields that one commit — proving the
    //   ref reaches git log.
});
```

Trap: `git init`'s default branch is `master` on some machines and `main` on
others, so never hardcode it. Build the side branch as `git checkout -q -b side`,
commit, then return with `git checkout -q -` (previous branch) — no branch name
needed anywhere.

### 1b. `src/layered_git_beacons.ts` — `listCommitsTouchingFile`

Change the signature to `(repoPath: Path, repoRelativePath: Path, ref: string = ACTIVE_BRANCH_REF)`
and import `ACTIVE_BRANCH_REF` from `./layer1_repo_tree.ts` — which must first be
`export`ed there (it is currently module-private). One canonical `"HEAD"` for the
whole engine, per coding-requirements §2; no re-export shim. It stays in
`layer1_repo_tree.ts` (rather than moving to `structures/vocabulary.ts`) because
that module already owns it and it is a git ref, not wire vocabulary — a Layer-2
module importing one constant from a Layer-1 module is cheaper than inventing a
third home for the string `"HEAD"`.

Replace the `execSync` template-string call with `spawnSync` in **argument-array**
form, mirroring `listRepoTreeAtRef`:

```ts
const result = spawnSync("git", ["log", ref, "--format=%H %ct", "--", repoRelativePath.toString()], {
    cwd: repoPath.toString(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
});
if (result.status !== 0) {
    return [];          // unchanged Layer-2 posture: absence is a silent skip
}
```

then parse `result.stdout` with the existing loop, unchanged.

Three reasons the array form is mandatory here rather than a quoting tweak: `ref`
is now **user input arriving from a URL**, and inside `execSync`'s double quotes
`$(…)` and backticks still execute — the array form removes the shell entirely;
it drops the `JSON.stringify` quoting dance; and `execSync`'s default 1 MB
`maxBuffer` silently throws on a long history, which the `catch` would report as
"no commits". Keep `import { spawnSync } from "node:child_process"` and delete the
now-unused `execSync` import **only if** `readBlobAtCommit` no longer needs it —
it does, so import both.

Update the doc comment: name the new `ref` parameter and its `HEAD` default.

### 1c. `src/layer1_commit_history.ts` — `listPairCommitHistory`

Add a third parameter with the same default and pass it straight through:

```ts
export function listPairCommitHistory(repoDir: Path, repoRelativePath: Path, ref: string = ACTIVE_BRANCH_REF): CommitHistoryNode[] {
    return listCommitsTouchingFile(repoDir, repoRelativePath, ref).map((touch) => ({ … }));
}
```

The default keeps `tests/layer1_commit_history.test.ts`'s two-argument calls
compiling and passing untouched.

---

## Step 2 — the endpoint's server test (RED)

New file `tests/viewer_api_layer1.test.ts`. Copy the spawned-process scaffolding
from `tests/viewer_api_layered.test.ts` verbatim (`spawnViewerProcess`,
`markWhenListeningLineArrives`, `waitUntilListening`) — `viewer_server.ts` listens
at import time, so the endpoint cannot be called in-process.

Scaffolding facts that will otherwise cost a debug cycle:

- `const SCRATCH_PORT = 18900 + (process.pid % 500);` — 17400 (`viewer_server.test.ts`),
  17900 (`viewer_api_layered.test.ts`) and 18400 (`viewer_api_ladder.test.ts`) are
  taken; parallel test files must never collide.
- `parseServerArgs` **requires** `--projects-dir` even though this route reads no
  JSONL. Pass the fixture's temp root.
- Spawn ONE server in a `before` hook and `child.kill()` it in `after` (node:test
  runs a file's tests sequentially, so one port is enough). Five spawns would cost
  five server boots for nothing.
- Build the fixtures ONCE at module scope and reuse them across tests.

### Fixture — two unrelated roots, all instants pinned

Two separate temp directories, so nothing is inherited from the surrounding repo:

- **disk dir** (`mkdtempSync(join(tmpdir(), "layer1-view-dir-"))`), no `.git`:
  - `shared.txt`, mtime pinned to `2026-07-01T18:00:00Z`
  - `disk-only.txt`, mtime pinned to `2026-07-02T14:00:00Z`

  Pin with `utimesSync(path, date, date)` — mtimes must be stated, not "now", or
  every pixel assertion below becomes clock-dependent.

- **repo dir** (`mkdtempSync(join(tmpdir(), "layer1-view-repo-"))`), a real
  `git init -q` repo. Reuse `tests/layer1_commit_history.test.ts`'s `runGit` /
  `commitFile` shape (fixed `user.name`/`user.email`, `GIT_COMMITTER_DATE` for the
  instant — `--date` sets author time, which S18 never reads):
  - commit **C1** `2026-07-01T10:00:00Z` adds `shared.txt` **and** `repo-only.txt`
    — one commit holding two files, so write both then `git add -A` before
    committing; a one-file-per-commit helper would put `repo-only.txt` at its own
    instant and break the offsets table below.
  - commit **C2** `2026-07-01T14:00:00Z` edits `shared.txt` only

Expected sets: `pairs` = `["shared.txt"]`, `gitOrphans` = `["repo-only.txt"]`,
`diskOrphans` = `["disk-only.txt"]`.

Expected ruler (2.5 px/hr, 24 px cap — the arithmetic itself is already covered by
`tests/layer1_ruler_axis.test.ts`; these are the four instants this fixture draws):

| instant | gap from previous | axisPx |
|---|---|---|
| `2026-07-01T10:00:00Z` (C1) | — | `0` |
| `2026-07-01T14:00:00Z` (C2) | 4 h → 10 px | `10` |
| `2026-07-01T18:00:00Z` (shared.txt mtime) | 4 h → 10 px | `20` |
| `2026-07-02T14:00:00Z` (disk-only.txt mtime) | 20 h → 50 px, **capped to 24** | `44` |

The last row is deliberate: the fixture crosses the cap, so a run that dropped the
cap would read 70 px and fail.

### The four tests

```ts
test("test_layer1_view_endpoint_pairs_disk_files_against_the_repo_tree", async () => {
    // Scenario: dir and repo overlap on exactly one path.
    // Steps:
    // GET /api/layer1-view?dir=<diskDir>&repo=<repoDir> returns HTTP 200.
    // `pairs` holds exactly the one path present in BOTH roots (shared.txt).
    // `gitOrphans` holds exactly the repo path with no disk counterpart (repo-only.txt).
    // `diskOrphans` holds exactly the disk path with no repo entry (disk-only.txt).
    // Direction is load-bearing (S18): assert each bucket's CONTENT, never just its size.
});

test("test_layer1_view_endpoint_places_every_pair_node_on_the_shared_ruler", async () => {
    // Scenario: the page emits --axis-px straight from the wire, so the endpoint owes a
    //   finished offset per node.
    // Steps:
    // the pair's commit nodes are its two touching commits, oldest first, at axisPx 0 and 10.
    // the pair's on-disk node — the final node — sits at axisPx 20 (its pinned mtime).
    // the returned `ruler` is the four distinct instants ascending, offsets 0/10/20/44,
    //   so the 20-hour gap proves the 24 px cap survived the round trip.
});

test("test_layer1_view_endpoint_places_each_orphan_row_at_its_own_instant", async () => {
    // Scenario: each bucket row carries its own timestamp (S18 "a plain file list with each
    //   member's own timestamp").
    // Steps:
    // the git-orphan row (repo-only.txt) is placed at its LAST touching commit, C1 → axisPx 0.
    // the disk-orphan row (disk-only.txt) is placed at its mtime → axisPx 44.
});

test("test_layer1_view_endpoint_rejects_a_ref_that_does_not_resolve", async () => {
    // Scenario: `ref` is typed by the user, so a bad one is a client error the header box can
    //   display — never a 500 and never a stack trace.
    // Steps:
    // GET the same view with ref=no-such-ref returns HTTP 400.
    // the body names the offending ref.
    // the body carries no stack frame (no "\n    at " line), so nothing internal leaks.
});
```

Missing-`dir` and non-existent-`dir` cases are one more `assert` each inside the
bad-ref test's shape — add them as a fifth test only if they need their own
fixture, which they do not:

```ts
test("test_layer1_view_endpoint_rejects_a_project_folder_that_is_not_on_disk", async () => {
    // Scenario: dir arrives from a text box that accepts paste, so a typo must be a 400.
    // Steps:
    // GET with dir=<tmpdir>/definitely-not-here returns HTTP 400 naming the missing folder.
    // GET with the dir param omitted entirely returns HTTP 400 naming the missing param.
    // GET with repo pointing at the (non-repo) disk dir returns HTTP 400 mentioning git.
});
```

Wire types in the test file: declare a local `type WireLayer1View = { … }` with
`string` paths and `string` instants, exactly as
`tests/viewer_api_layered.test.ts` declares `WireGraph` — `Path` and `Date`
serialize to strings, and the test asserts the wire, not the in-process types.

---

## Step 3 — `src/viewer_api_layer1.ts` (GREEN)

New file. Header comment: task 235 / spec S18; states that this path reads **no
JSONL** and is a new surface beside `/api/layered-graph`, not a change to it.

### Wire types

```ts
// One placed moment on the wire: the instant, plus the finished pixel offset the page emits as
// --axis-px. The S18 ruler accumulates, so an offset cannot be derived from its own instant —
// the page must be handed the number (same contract as task 239's axisOffsetsPx).
export interface Layer1WireInstant {
    instant: Instant;
    axisPx: number;
}

// One commit node of a pair's ladder.
export interface Layer1WireCommit extends Layer1WireInstant {
    hash: string;
}

// One pair: its path relative to BOTH roots, the commits that touched it (oldest first), and its
// current on-disk state — S18's final node.
export interface Layer1WirePair {
    path: Path;
    commits: Layer1WireCommit[];
    onDisk: Layer1WireInstant;
}

// One bucket row: a path and the single instant that places it.
export interface Layer1WireOrphan extends Layer1WireInstant {
    path: Path;
}

// The Layer 1 View. `pairs`/`gitOrphans`/`diskOrphans` are task 232's property names, passed
// through UNCHANGED — the two orphan sets are mirror images, so a swap is invisible to the
// task-238 acceptance test and must not happen here (S18 "Output contract").
export interface Layer1WireView {
    pairs: Layer1WirePair[];
    gitOrphans: Layer1WireOrphan[];
    diskOrphans: Layer1WireOrphan[];
    // Every distinct instant the view draws, ascending — the page's ruler ticks.
    ruler: Layer1WireInstant[];
}
```

`Instant` is imported from `./layered_types.ts` (it is the engine's `Date` alias —
one clock vocabulary, not a fresh one).

### Offset lookup

`resolveInstantOffsets` runs ONCE over every instant in the view, so widgets, nodes
and buckets share one axis. Key the lookup by `getTime()` — epoch ms is the same
identity `resolveInstantOffsets` de-duplicates on, so two `Date` objects for the
same moment resolve to one offset:

```ts
function mapInstantsToOffsetPixels(instants: Instant[]): Map<number, number> {
    return new Map(resolveInstantOffsets(instants).map((position) => [position.instant.getTime(), position.offsetPx]));
}

// Place one instant on the resolved ruler. Every instant handed out below was part of the
// resolve input, so a miss is a bug in this file rather than bad input — fail loudly.
function placeInstantOnAxis(offsets: Map<number, number>, instant: Instant): Layer1WireInstant {
    const axisPx = offsets.get(instant.getTime());
    if (axisPx === undefined) {
        throw new Error(`instant ${instant.toISOString()} is missing from the resolved ruler`);
    }
    return { instant, axisPx };
}
```

### Assembly

```ts
export function buildLayer1View(projectFolder: Path, repoDir: Path, ref: string): Layer1WireView
```

In order:

1. `const diskFiles = walkCurrentFileState(projectFolder);`
2. `const repoPaths = listRepoTreeAtRef(repoDir, ref);` — runs BEFORE any history
   read so a bad ref throws once, from the module whose error message already names
   it, instead of degrading into empty ladders.
3. `const pairing = pairDiskFilesAgainstRepoPaths(diskFiles, repoPaths);`
4. Per pair, read its ladder once and keep it beside its disk state:
   `const pairHistories = pairing.pairs.map((file) => ({ file, commits: listPairCommitHistory(repoDir, file.relativePath, ref) }));`
5. Per git-orphan path, read its ladder and keep the **last** commit — a repo path
   with no disk mtime has no other instant, and its most recent commit is the moment
   it last existed in the repo (this matches `plans/layer1-mockup.html`, which
   places a repo-only row with `.at(-1).at`):
   ```ts
   const gitOrphanPlacements: Array<{ path: Path; instant: Instant }> = [];
   for (const orphanPath of pairing.gitOrphans) {
       const lastTouch = listPairCommitHistory(repoDir, orphanPath, ref).at(-1);
       // ponytail: a path git lists at `ref` always has a commit reachable from that ref, so
       // this holds only for a shallow clone whose history was truncated; such a row is dropped
       // rather than invented at a fake instant. Revisit if shallow clones become a real input.
       if (lastTouch === undefined) {
           continue;
       }
       gitOrphanPlacements.push({ path: orphanPath, instant: lastTouch.instant });
   }
   ```
6. Collect every instant the view draws and resolve the axis once:
   commit instants of every pair ladder, every pair's `mtime`, every
   `gitOrphanPlacements` instant, every disk-orphan `mtime`.
7. Build the four output arrays with `placeInstantOnAxis`:
   - `pairs`: in `pairing.pairs` order (the disk walk's path order — do not re-sort).
   - `gitOrphans` / `diskOrphans`: sorted **ascending by instant**, so the bucket's
     placement is simply its first row's `axisPx` and the page needs no `Math.min`.
     Sorting rows re-orders a list; it does not rename or invert the buckets, so
     S18's output contract is untouched.
   - `ruler`: `resolveInstantOffsets`' own output mapped `offsetPx → axisPx`
     (already distinct and ascending).

Empty cases fall out with no special code: an empty overlap is `pairs: []`, an
empty repo plus empty folder is three empty arrays and an empty `ruler`. S18's
"buckets are omitted when empty" is the renderer reading that emptiness — do not
add optional fields.

### Trust-boundary validation

```ts
// `dir` and `repo` are pasted or typed into the header's text boxes, so both are validated here
// rather than deep in a walker: a bad one must be a 400 the page can display, not an ENOENT
// from readdirSync. Existence + is-a-folder only — this is a localhost tool reading the user's
// own machine, so there is no allowlist to enforce (same posture as POST /api/config).
function requireExistingFolderParam(query: URLSearchParams, name: string): Path {
    const value = requireParam(query, name);
    if (!existsSync(value)) {
        throw new Error(`${name} folder does not exist: ${value}`);
    }
    if (!statSync(value).isDirectory()) {
        throw new Error(`${name} is not a folder: ${value}`);
    }
    return new Path(value);
}

// An absent ref AND an empty one both mean "the repo's active branch" — the header's ref box is
// optional, and a blank box still submits `?ref=`.
function resolveRequestedRef(query: URLSearchParams): string {
    const requested = query.get("ref");
    if (requested === null) {
        return ACTIVE_BRANCH_REF;
    }
    if (requested.trim() === "") {
        return ACTIVE_BRANCH_REF;
    }
    return requested.trim();
}
```

A non-repo `repo` and an unresolvable `ref` need no check of their own:
`listRepoTreeAtRef` already throws naming the ref, and `git ls-tree`'s stderr names
the non-repo case. `ref` never reaches a shell (argument arrays in both git calls
after Step 1), so no validation regex is required.

### Handler

```ts
// GET /api/layer1-view?dir=&repo=&ref= — the S18 Layer 1 View: disk-plus-git only, NO JSONL
// (which is what makes the task-238 acceptance test meaningful — it cannot accidentally pass on
// JSONL data). Every failure below throws before any header is written, so viewer_server.ts's
// outer catch turns it into a 400 carrying the message, matching every other route.
export function handleLayer1ViewRequest(response: ServerResponse, query: URLSearchParams): void {
    const projectFolder = requireExistingFolderParam(query, "dir");
    const repoDir = requireExistingFolderParam(query, "repo");
    sendJson(response, 200, buildLayer1View(projectFolder, repoDir, resolveRequestedRef(query)));
}
```

---

## Step 4 — route it in `src/viewer_server.ts`

Add the import beside the existing `handleLayeredGraphRequest` import, and one
branch in `handleRequest` immediately after the `/api/layered-graph` branch (Layer
1 beside Layer 2 reads in the order a reader expects):

```ts
} else if (url.pathname === "/api/layer1-view") {
    handleLayer1ViewRequest(response, url.searchParams);
```

The file is at 244 lines against the project's 250-line cap; this adds 3 (one
import, two branch lines) → 247. Nothing else may be added to this file in this
task. The outer `catch` already does `sendText(response, 400, String(error))`, so
`String(error)` is `"Error: <message>"` with **no** stack — the task's "clear
error, never a stack trace" requirement needs no new error handling.

---

## Step 5 — verify

`cd jfred && npm run typecheck` (must be clean). Do **not** run `npm test` — the
user runs the suite.

---

## Step 6 — record it

1. `specs/from-scratch-SPEC.md` S18 "Status" line: append #235 to the done list —
   name `jfred/src/viewer_api_layer1.ts`, the `/api/layer1-view` route, the
   `ruler` + `axisPx` additions on top of the unchanged
   `pairs`/`gitOrphans`/`diskOrphans`, and the Step-1 `ref` threading (shared
   `listCommitsTouchingFile` now takes an optional `ref`, defaulting to the newly
   exported `ACTIVE_BRANCH_REF`, and uses `spawnSync` argument arrays so a
   URL-supplied ref never reaches a shell). Move #235 out of the "Remaining" list,
   leaving #237, #238, #240.
2. Close task 235 with the `taskTools:close-tasks` skill, closure note naming the
   new file, the route, and the wire shape.
3. Stage every changed repo (`jfred` submodule + the `RevEng` parent's submodule
   pointer and spec/tasks edits). **Do not commit.**
