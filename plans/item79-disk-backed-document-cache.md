# Item 79 — Disk-backed `builtDocumentCache`

## Goal
A viewer server respawn currently re-runs a measured **468 s / 87 MB** reconstruction because
`builtDocumentCache` (`src/viewer_api.ts:292`) is in-memory only. Persist each built
`BuiltReconstruction` (`{ document, stepFileHistories }`) to disk, hydrated back into real domain
objects on read, so **every** route (timeline, range-patch, step-files, diff) reads from disk in
sub-second time after a respawn — not a rebuild.

## Design decisions (the "why", so the implementer doesn't re-derive them)

1. **One type-driven tag/revive pair, NOT per-type hydrators.** The full audit (below) shows every
   persisted field bottoms out in exactly three domain types — `Path`, `Uuid`, `Date` — plus JSON
   primitives, arrays, and plain objects. No `Map`/`Set`/function/cycle anywhere. So one replacer with
   three `instanceof` branches covers the entire tree, and it **survives any future shape change** to
   `ReconstructionDocument` or any nested type with zero maintenance. Hand-written per-type hydrators
   (~13 of them) would be more code and must be kept in sync forever — rejected.

2. **The replacer reaches past `toJSON` via the holder (`this[key]`).** `JSON.stringify` runs a value's
   `toJSON()` **before** handing the result to the replacer function, so by the time a plain replacer
   sees a `Path`/`Uuid`/`Date` it is already a bare string and its type is lost. We use a **non-arrow**
   replacer whose `this` is the holder object; `this[key]` is the ORIGINAL object (pre-`toJSON`), so we
   can test its class and tag it. This is the exact reason a naive value-only replacer "doesn't work"
   (the design note in TASKS.md item 79) — the holder trick is what makes a generic tagger viable.

3. **Eviction by on-disk mtime, not in-memory LRU.** One file per cacheKey; the filesystem already
   records recency (`mtimeMs`). After each write, if the directory holds more than the cap, delete the
   oldest files. No in-memory recency structure needed.

4. **`schemaVersion` tag** on each file: a file whose version differs is treated as a cache miss (and
   overwritten by the next rebuild, since the cacheKey — hence filename — is unchanged). Cheap insurance
   if the tag format ever changes.

5. **Opt-in, mirroring item 11's sandbox memo** (`configureSandboxMemoPersistence` in
   `src/reconstruction_script_execution.ts` + `src/viewer_server.ts:369-377`): only `viewer_server.ts`
   configures a directory; CLI + tests stay memory-only (`cacheDirectory === undefined`), so
   spawn-count / determinism tests are unaffected.

6. **No batching** (unlike item 11). Item 11 rewrites its whole memo on every persist (O(N²) over a cold
   load), so it batches. Here each write is one file for one cacheKey — write once after the build.

## Audit of shapes to hydrate (already done — recorded so the implementer trusts branch #1)
`BuiltReconstruction = { document: ReconstructionDocument, stepFileHistories: FileHistory[] }`
(`src/reconstruction_json.ts:259`). Every domain leaf across the whole tree:
- `ReconstructionDocument` (`reconstruction_json.ts:242`): `sessionId: Uuid?`, `messages:
  ConversationMessage[]`, `branches: BranchSummary[]`, `filesTouched: FileHistory[]`,
  `rewoundFilesTouched: FileHistory[]`, `steps: StepSnapshot[]`, `lineVerdicts: LineVerdict[]`,
  `commitMarkers: CommitMarker[]`, `gitOperations: GitOperation[]`, `toolCalls: ToolCall[]`,
  `sessionTitles: Record<string,string>` (plain).
- `FileHistory` (`reconstruction_engine.ts:58`): `target: Path`, `revisions: FileRevision[]`.
- `FileRevision` (`:48`): `changeId: Uuid`, `timestamp: Date`, `lines: LineEntry[]`, `rename?:
  {from: Path; to: Path}`, `copy?: {from: Path; to: Path}`.
- `LineEntry` (`:35`): `{ oldLineNum: number; values: LineValue[] }`; `LineValue` (`:31`): `{ line:
  string; timestamp: Date }`.
- `ConversationMessage`: `uuid/parentUuid/sessionId: Uuid?`, `timestamp: Date?`, others primitive.
- `BranchSummary`: `tip: Uuid`, `rewindPoint: Uuid?`, others boolean.
- `StepSnapshot`: `when: Date`, `changeIds: Uuid[]`, `sessionId: Uuid?`, `changedPaths: string[]`
  (plain strings — NOT Path), `index: number`.
- `LineVerdict`: `uuid: Uuid?`, others primitive/enum.
- `CommitMarker`: `timestamp: Date`, `sessionId: Uuid?`.
- `GitOperation` (`reconstruction_git_evidence.ts:77`): `timestamp: Date`, `sessionId/uuid: Uuid?`,
  others primitive.
- `ToolCall` (`reconstruction_tool_calls.ts:19`): `timestamp: Date`, `sessionId?/uuid/toolUseId: Uuid`,
  others primitive.
Enums (`EventKind`/`RecordType`/`GitOperationKind`/`Verdict`) are string/number values → JSON-native,
no hydration. **Conclusion: `Path` + `Uuid` + `Date` is the complete set.**

---

## Implementation order (strict red-green TDD)

### Step 1 — New module `src/reconstruction_document_cache.ts`, pure serialize/hydrate core (RED first)

**Test file `tests/reconstruction_document_cache.test.ts`**, RED:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjectReconstruction } from "../src/viewer_api.ts";
import { resolveFilesAtStep } from "../src/reconstruction_steps.ts";
import { serializeBuild, hydrateBuild } from "../src/reconstruction_document_cache.ts";
import { Path } from "../src/structures/domain.ts";
import { S1_JSONL } from "./fixtures.ts";

test("test_hydrated_build_roundtrip_preserves_domain_object_types", () => {
    // Scenario: a serialized-then-hydrated BuiltReconstruction rebuilds real Path/Date domain
    //           objects, not the bare strings JSON.stringify would leave — and loses nothing.
    // Steps:
    // build a small scenario's BuiltReconstruction fresh (real Path/Uuid/Date instances inside).
    const fresh = buildProjectReconstruction([S1_JSONL], undefined);
    // serialize it, then hydrate it back.
    const hydrated = hydrateBuild(serializeBuild(fresh));
    assert.ok(hydrated !== undefined);
    // a filesTouched target must come back as a real Path instance (not a string).
    assert.ok(hydrated.document.filesTouched[0]!.target instanceof Path);
    // a step's `when` must come back as a real Date instance.
    assert.ok(hydrated.document.steps[0]!.when instanceof Date);
    // re-serializing the hydrated value reproduces identical bytes -> nothing was lost or mangled.
    assert.equal(serializeBuild(hydrated), serializeBuild(fresh));
});

test("test_hydrated_build_drives_identical_step_file_resolution", () => {
    // Scenario: the hydrated histories resolve a step's files byte-identically to the fresh build.
    //           This is the real regression gate — a plain JSON.parse corrupts this path (step.when
    //           would be a string, resolveFilesAtStep calls Date methods on it).
    // Steps:
    // build the fresh BuiltReconstruction and pick its last step.
    const fresh = buildProjectReconstruction([S1_JSONL], undefined);
    const lastStep = fresh.document.steps[fresh.document.steps.length - 1]!;
    // resolve that step's files from the FRESH histories.
    const freshFiles = resolveFilesAtStep(fresh.stepFileHistories, lastStep.when);
    // hydrate a round-tripped copy and resolve the same step from the HYDRATED histories.
    const hydrated = hydrateBuild(serializeBuild(fresh))!;
    const hydratedStep = hydrated.document.steps[hydrated.document.steps.length - 1]!;
    const hydratedFiles = resolveFilesAtStep(hydrated.stepFileHistories, hydratedStep.when);
    // the two file maps must be identical.
    assert.deepEqual(hydratedFiles, freshFiles);
});
```

**GREEN — module core.** Implement in `src/reconstruction_document_cache.ts`:

```ts
import { Path, Uuid } from "./structures/domain.ts";
import type { BuiltReconstruction } from "./reconstruction_json.ts";

// Bump on any change to the persisted shape OR the tag format below; files carrying a different
// version are ignored (a cache miss) and overwritten by the next rebuild.
const SCHEMA_VERSION = 1;

// The wrapper key that marks a serialized domain object. No real persisted field is named this, so a
// revived object can never be a false positive.
const DOMAIN_TAG = "__domain";

// Which domain class a tagged value rebuilds into. Local to this module — it is a disk-cache detail,
// never part of the JSONL wire vocabulary (vocabulary.ts), so it does not belong there.
enum DomainType {
    path = "Path",
    uuid = "Uuid",
    date = "Date",
}

type TaggedDomainValue = { [DOMAIN_TAG]: DomainType; value: string | number };

// JSON.stringify runs a value's toJSON() BEFORE the replacer, so by the time the replacer sees a
// Path/Uuid/Date it is already a bare string and its class is lost. We reach PAST toJSON through the
// holder: `this[key]` is the ORIGINAL object, so we can test its class and tag it. This is exactly
// why a value-only replacer cannot work (item 79 design note). Non-arrow function: `this` = holder.
function tagDomainValue(this: Record<string, unknown>, key: string, value: unknown): unknown {
    const original = this[key];
    if (original instanceof Path) return { [DOMAIN_TAG]: DomainType.path, value: original.value };
    if (original instanceof Uuid) return { [DOMAIN_TAG]: DomainType.uuid, value: original.value };
    if (original instanceof Date) return { [DOMAIN_TAG]: DomainType.date, value: original.getTime() };
    return value;
}

function isTaggedDomainValue(value: unknown): value is TaggedDomainValue {
    return typeof value === "object" && value !== null && DOMAIN_TAG in value;
}

// The JSON reviver runs children before parents, so a tagged leaf is a real domain object before the
// object containing it is handed up. Rebuilds the class the tag names.
function reviveDomainValue(_key: string, value: unknown): unknown {
    if (!isTaggedDomainValue(value)) return value;
    if (value[DOMAIN_TAG] === DomainType.path) return new Path(value.value as string);
    if (value[DOMAIN_TAG] === DomainType.uuid) return new Uuid(value.value as string);
    if (value[DOMAIN_TAG] === DomainType.date) return new Date(value.value as number);
    return value;
}

export function serializeBuild(built: BuiltReconstruction): string {
    return JSON.stringify({ schemaVersion: SCHEMA_VERSION, build: built }, tagDomainValue);
}

// undefined when the persisted shape predates the current SCHEMA_VERSION (treated as a miss).
export function hydrateBuild(text: string): BuiltReconstruction | undefined {
    const parsed = JSON.parse(text, reviveDomainValue) as { schemaVersion: number; build: BuiltReconstruction };
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
        return undefined;
    }
    return parsed.build;
}
```

### Step 2 — Disk read/write/reset + opt-in config, same module (RED first)

**Add to the test file**, RED:

```ts
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    configureDocumentCachePersistence,
    readDocumentFromDiskCache,
    writeDocumentToDiskCache,
} from "../src/reconstruction_document_cache.ts";

test("test_written_build_reads_back_hydrated_from_disk", () => {
    // Scenario: a build written under a configured directory reads back, hydrated, for the same key.
    // Steps:
    // point the cache at a fresh temp directory.
    configureDocumentCachePersistence(new Path(mkdtempSync(join(tmpdir(), "doccache-"))));
    // build a small scenario and write it under a known cacheKey.
    const fresh = buildProjectReconstruction([S1_JSONL], undefined);
    writeDocumentToDiskCache("key-a", fresh);
    // reading that key returns a hydrated build whose step-file resolution matches the fresh build.
    const fromDisk = readDocumentFromDiskCache("key-a");
    assert.ok(fromDisk !== undefined);
    const lastStep = fresh.document.steps[fresh.document.steps.length - 1]!;
    assert.deepEqual(
        resolveFilesAtStep(fromDisk.stepFileHistories, fromDisk.document.steps[fromDisk.document.steps.length - 1]!.when),
        resolveFilesAtStep(fresh.stepFileHistories, lastStep.when),
    );
    // reset config so later tests stay memory-only.
    configureDocumentCachePersistence(undefined);
});

test("test_disk_cache_read_is_a_miss_when_persistence_is_unconfigured", () => {
    // Scenario: with no directory configured (CLI/test default), reads and writes are silent no-ops.
    // Steps:
    // ensure persistence is unconfigured.
    configureDocumentCachePersistence(undefined);
    // a read for any key returns undefined (a miss), never throws.
    assert.equal(readDocumentFromDiskCache("anything"), undefined);
});
```

**GREEN — append to the module:**

```ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Each built document is ~87 MB on the large project; 4 files ~= 350 MB — enough for a few
// (project, consent, transcript-state) combinations without unbounded disk growth. Referenced by the
// eviction test instead of a magic number so it survives tuning.
// ponytail: coarse mtime-ordered eviction, not true LRU; raise the cap or track recency in memory if a
// dev juggles more live projects than this at once.
export const DOCUMENT_CACHE_CAPACITY = 4;

// undefined = memory-only (CLI + tests). Only viewer_server.ts sets a directory.
let cacheDirectory: Path | undefined;

export function configureDocumentCachePersistence(directory: Path | undefined): void {
    cacheDirectory = directory;
}

// Delete the whole cache directory so the next run starts cold. force = no error if absent. Server
// calls this before configure when launched with --resetDocumentCache.
export function resetDocumentCacheOnDisk(directory: Path): void {
    rmSync(directory.toString(), { recursive: true, force: true });
}

// One collision-safe filename per cacheKey.
function cacheFilePath(directory: Path, cacheKey: string): string {
    const hash = createHash("sha256").update(cacheKey).digest("hex");
    return join(directory.toString(), `${hash}.json`);
}

export function readDocumentFromDiskCache(cacheKey: string): BuiltReconstruction | undefined {
    if (cacheDirectory === undefined) {
        return undefined;
    }
    const filePath = cacheFilePath(cacheDirectory, cacheKey);
    if (!existsSync(filePath)) {
        return undefined;
    }
    try {
        return hydrateBuild(readFileSync(filePath, "utf8"));
    } catch (error) {
        // A corrupt cache file must not kill a request — log once and rebuild.
        console.error(`document cache unreadable, rebuilding: ${String(error)}`);
        return undefined;
    }
}

export function writeDocumentToDiskCache(cacheKey: string, built: BuiltReconstruction): void {
    if (cacheDirectory === undefined) {
        return;
    }
    try {
        mkdirSync(cacheDirectory.toString(), { recursive: true });
        writeFileSync(cacheFilePath(cacheDirectory, cacheKey), serializeBuild(built));
        evictOldestBeyondCapacity(cacheDirectory);
    } catch (error) {
        // Persistence failure is tolerable; losing the response is not.
        console.error(`document cache not persisted: ${String(error)}`);
    }
}

// Keep at most DOCUMENT_CACHE_CAPACITY files; delete the oldest by mtime. The filesystem already
// tracks recency, so no in-memory structure is needed.
function evictOldestBeyondCapacity(directory: Path): void {
    const files = readdirSync(directory.toString()).filter((name) => name.endsWith(".json"));
    if (files.length <= DOCUMENT_CACHE_CAPACITY) {
        return;
    }
    const oldestFirst = files
        .map((name) => ({ name, mtimeMs: statSync(join(directory.toString(), name)).mtimeMs }))
        .sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const { name } of oldestFirst.slice(0, files.length - DOCUMENT_CACHE_CAPACITY)) {
        rmSync(join(directory.toString(), name), { force: true });
        console.error(`document cache evicted ${name} (capacity ${DOCUMENT_CACHE_CAPACITY})`);
    }
}
```

Optional eviction test (add if quick): write `DOCUMENT_CACHE_CAPACITY + 1` distinct keys, assert the
directory holds exactly `DOCUMENT_CACHE_CAPACITY` files and the first-written key is gone.

### Step 3 — Wire into `buildReconstructionWithConsent` (`src/viewer_api.ts:301-333`)
Purely additive — nothing is replaced, so no comment-out-then-delete needed.

- Add import at the top of `viewer_api.ts`:
  `import { readDocumentFromDiskCache, writeDocumentToDiskCache } from "./reconstruction_document_cache.ts";`
- **After the in-memory-hit block** (after the `return cachedBuild;` at line 316, before
  `setImpureExecutionAllowed`):

```ts
    // item 79: an in-memory miss may still hit the disk cache after a server respawn — hydrate it,
    // repopulate the in-memory cache, and skip the multi-minute rebuild. No-op when the CLI/tests
    // leave the disk cache unconfigured.
    const diskBuild = readDocumentFromDiskCache(cacheKey);
    if (diskBuild !== undefined) {
        reportStage(onProgress, PROGRESS_LABEL_ARTIFACT_CACHE_HIT);
        builtDocumentCache.set(cacheKey, diskBuild);
        evictLeastRecentlyUsedEntries(builtDocumentCache, ARTIFACT_CACHE_CAPACITY);
        return diskBuild;
    }
```

- **Immediately after** `builtDocumentCache.set(cacheKey, built);` (line 326):
  `writeDocumentToDiskCache(cacheKey, built);`

The `cacheKey` (line 311) is reused verbatim — it is already restart-safe (transcript mtime+size
stamp + allowScripts + target + `serializePathOverrides()`), so a transcript edit changes the key,
misses both caches, and orphans the old disk file (which eviction later reclaims).

### Step 4 — Server wiring + `--resetDocumentCache` flag (`src/viewer_server.ts`)
Mirror the sandbox-memo wiring exactly.

- Import: add to the existing script-execution import line (or a new line):
  `import { configureDocumentCachePersistence, resetDocumentCacheOnDisk } from "./reconstruction_document_cache.ts";`
- `USAGE` (line 50): append `[--resetDocumentCache]`.
- `parseServerArgs` (lines 55-71): add `resetDocumentCache: boolean` to the return type and return
  `resetDocumentCache: argv.includes("--resetDocumentCache")`.
- Destructure at line 366: `const { port, resetSandboxMemo, resetDocumentCache } = parseServerArgs(...)`.
- After the sandbox-memo block (after line 377):

```ts
const documentCacheDir = new Path(join(import.meta.dirname, "..", ".cache", "built-documents"));
// --resetDocumentCache: delete the cache dir BEFORE configuring, for a forced cold rebuild.
if (resetDocumentCache) {
    resetDocumentCacheOnDisk(documentCacheDir);
}
configureDocumentCachePersistence(documentCacheDir);
```

`.cache/` is already gitignored (verified: `.gitignore` line 87 `.cache/`).

### Step 5 — Close out
- Mark item 79 `[x]` in `TASKS.md` with a one-line closure note (approach + the two divergences from
  the handoff: type-driven tagger, mtime eviction).
- `npx tsc --noEmit` and `npx tsc -p tsconfig.webapp.json --noEmit` must both be clean.
- Do NOT run the suite (the user runs it). Stage all changes; do not commit.

## Verification (after the user runs the suite)
Respawn win — run the harness twice; the second FRESH run should read from disk in well under a second
instead of ~468 s:
`npx tsx "/private/tmp/claude-501/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/744de2b7-f578-4a78-a3d6-bddbfb44f399/scratchpad/measure-respawn.ts"`
(regenerate the harness if the scratchpad was cleaned; it calls `setProjectsDir(~/.claude/projects)`
+ `configureSandboxMemoPersistence(.cache/sandbox-memo.json)` — add
`configureDocumentCachePersistence(new Path(".cache/built-documents"))` to it to exercise the new path).

## Files touched
- **NEW** `src/reconstruction_document_cache.ts`
- **NEW** `tests/reconstruction_document_cache.test.ts`
- `src/viewer_api.ts` (import + 2 insertions in `buildReconstructionWithConsent`)
- `src/viewer_server.ts` (import + arg parse + startup wiring)
- `TASKS.md` (mark 79 done)
