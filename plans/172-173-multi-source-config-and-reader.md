# Tasks 172 + 173 — multi-source config parsing (S3) and per-source engine seams (S4a)

Design authority: `plans/166-multi-source-design.md` (RevEng root). All work happens in
`RevEng/jfred` (never the `~/Programming` clones). Do NOT run `npm test`, any test file, or
the scenario sweep — the user runs tests. The only allowed verification command is
`npm run typecheck` inside `jfred/`.

Vocabulary (from the design doc): a **source** is one `{projectsDir, fileHistoryDir?, root?}`
entry in a project's `sources` list in reveng-paths.json. A **root** is the absolute
workspace directory a source's file paths are relative to. An omitted `root` means
"auto-detect from JSONL cwds later" (design §b) — at the parsing layer it simply stays
absent; no auto-detection is implemented in these two tasks.

Scope fence — explicitly OUT of these tasks (later tasks own them):

- Record-level dedupe by (sessionId, recordUuid) — design §c1, task 174.
- Cross-source file identity / timeline interleave — design §a, §c2–4, spec S5.
- Root auto-detection from cwds — design §b2, spec S5 territory.
- Server/CLI plumbing of `sources` from config to build calls — later S4 work. These two
  tasks end at: config parses `sources`, and `buildProjectReconstruction` +
  `buildSidecarReader` accept a `sources` list and resolve blobs per source.

Both touched modules stay comfortably under the 250-line cap
(`reconstruction_overrides.ts` 92 → ~125, `reconstruction_sidecar_reader.ts` 127 → ~175,
`viewer_api.ts` 208 → ~212).

---

## Phase A — task 172: `sources` in reveng-paths.json (spec S3)

All edits in `jfred/src/reconstruction_overrides.ts` and
`jfred/tests/reconstruction_overrides.test.ts`.

### A1 (RED): three new tests in `tests/reconstruction_overrides.test.ts`

Follow the file's existing style: plain-English `// Scenario:` + `// Step:` comments,
`test_<behavior>` names, `assert` from `node:assert/strict`. Import the new symbols
(`hydrateProjectSources`, and types) from `../src/reconstruction_overrides.ts`.

Test 1 — `test_hydrate_project_sources_builds_domain_entries_from_sources_list`:

```ts
test("test_hydrate_project_sources_builds_domain_entries_from_sources_list", () => {
    // Scenario (spec S3): a project entry may declare a `sources` list; each entry hydrates
    // into domain Paths (coding-req §1), preserving order and per-entry optional fields.
    // Step: hydrate a wire entry carrying two sources — one fully populated, one minimal.
    const sourceEntries = hydrateProjectSources(new Path("/tmp/live/projects"), {
        sources: [
            { projectsDir: "/tmp/live/projects", fileHistoryDir: "/tmp/live/file-history", root: "/Users/me/Programming/jot" },
            { projectsDir: "/tmp/backup/projects" },
        ],
    });
    // Step: both entries hydrate, in declaration order.
    assert.equal(sourceEntries.length, 2);
    // Step: every populated field is a real Path carrying the wire value.
    assert.ok(sourceEntries[0]!.projectsDir instanceof Path);
    assert.equal(sourceEntries[0]!.projectsDir.toString(), "/tmp/live/projects");
    assert.equal(sourceEntries[0]!.fileHistoryDir?.toString(), "/tmp/live/file-history");
    assert.equal(sourceEntries[0]!.root?.toString(), "/Users/me/Programming/jot");
    assert.equal(sourceEntries[1]!.projectsDir.toString(), "/tmp/backup/projects");
});
```

Test 2 — `test_hydrate_project_sources_degenerates_legacy_entry_to_single_source`:

```ts
test("test_hydrate_project_sources_degenerates_legacy_entry_to_single_source", () => {
    // Scenario (spec S3): a legacy entry (no `sources` key) is the one-entry degenerate
    // case — the single source is the config's own projects dir, carrying the legacy
    // fileHistory override, with root absent (auto-detect, design §b).
    // Step: hydrate a fully-populated LEGACY wire entry.
    const legacyWire = { cwd: "/Users/me/jot", repo: "/Users/me/jot", baseCommit: "deadbeef", fileHistory: "/tmp/custom-history" };
    const sourceEntries = hydrateProjectSources(new Path("/tmp/live/projects"), legacyWire);
    // Step: exactly one source — the containing projects dir.
    assert.equal(sourceEntries.length, 1);
    assert.equal(sourceEntries[0]!.projectsDir.toString(), "/tmp/live/projects");
    // Step: the legacy fileHistory override rides along as the source's fileHistoryDir.
    assert.equal(sourceEntries[0]!.fileHistoryDir?.toString(), "/tmp/custom-history");
    // Step: root stays absent — legacy entries never declared one.
    assert.equal(sourceEntries[0]!.root, undefined);
    // Step: legacy hydration is untouched — the same wire still yields the same overrides.
    const overrides = hydrateProjectPaths(legacyWire);
    assert.equal(overrides.projectCwd?.toString(), "/Users/me/jot");
    assert.equal(overrides.fileHistoryRoot?.toString(), "/tmp/custom-history");
});
```

Test 3 — `test_hydrate_project_sources_leaves_omitted_root_absent_for_auto_detect`:

```ts
test("test_hydrate_project_sources_leaves_omitted_root_absent_for_auto_detect", () => {
    // Scenario (design §b): an omitted `root` is the auto-detect signal — hydration must
    // leave it absent, never invent a value.
    // Step: hydrate a sources entry that omits root (and fileHistoryDir).
    const sourceEntries = hydrateProjectSources(new Path("/tmp/live/projects"), {
        sources: [{ projectsDir: "/tmp/live/projects" }],
    });
    // Step: root and fileHistoryDir are absent on the hydrated entry.
    assert.equal(sourceEntries[0]!.root, undefined);
    assert.equal(sourceEntries[0]!.fileHistoryDir, undefined);
});
```

### A2 (GREEN): implement in `src/reconstruction_overrides.ts`

Add below the existing `WireProjectPaths` declaration (wire types beside wire types), and
extend `WireProjectPaths` itself:

```ts
// Wire shape of one entry in a project's `sources` list (spec S3): one conversation-log
// folder plus its optional file-history folder and workspace root. Paths resolve exactly
// like every other reveng-paths.json path (task-56 trap: jfred-root-relative or absolute,
// taken verbatim).
export type WireSourceEntry = { projectsDir: string; fileHistoryDir?: string; root?: string };

export type WireProjectPaths = {
    cwd?: string;
    repo?: string;
    baseCommit?: string;
    fileHistory?: string;
    sources?: WireSourceEntry[];
};

// One hydrated source (spec S3/S4): where a source's JSONLs live, optionally where its
// file-history blobs live, and optionally the workspace root its file paths are relative
// to. An absent root means "auto-detect from JSONL cwds" (design §b) — resolved by later
// pipeline stages, never at parse time.
export type SourceEntry = { projectsDir: Path; fileHistoryDir?: Path; root?: Path };

// A project's sources list (spec S3). A legacy entry (no `sources` key) is the one-entry
// degenerate case: the config's own projects dir, carrying the legacy fileHistory override.
export function hydrateProjectSources(configProjectsDir: Path, wire: WireProjectPaths): SourceEntry[] {
    if (wire.sources === undefined) {
        const legacySource: SourceEntry = { projectsDir: configProjectsDir };
        if (wire.fileHistory !== undefined) {
            legacySource.fileHistoryDir = new Path(wire.fileHistory);
        }
        return [legacySource];
    }
    const sourceEntries: SourceEntry[] = [];
    for (const wireSource of wire.sources) {
        const sourceEntry: SourceEntry = { projectsDir: new Path(wireSource.projectsDir) };
        if (wireSource.fileHistoryDir !== undefined) {
            sourceEntry.fileHistoryDir = new Path(wireSource.fileHistoryDir);
        }
        if (wireSource.root !== undefined) {
            sourceEntry.root = new Path(wireSource.root);
        }
        sourceEntries.push(sourceEntry);
    }
    return sourceEntries;
}
```

Do NOT change `hydrateProjectPaths`, `readProjectPathsConfig`, or `writeProjectPathsEntry`
— legacy parsing must stay byte-identical (test 2 locks this). `readProjectPathsConfig`
already passes `sources` through untouched because it parses the whole JSON object.

Why the legacy degenerate case does NOT map `cwd` → `root`: `projectCwd` is a
git-evidence disk-access override ("where the project lives NOW"), not a rel-path
workspace root; conflating them would silently change legacy semantics. Legacy entries get
auto-detect (absent root), same as any sources entry that omits `root`.

---

## Phase B — task 173: per-source BackupReader + multi-source build seam (spec S4a)

Edits: `jfred/src/reconstruction_sidecar_reader.ts`,
`jfred/tests/reconstruction_sidecar_reader.test.ts`, `jfred/src/viewer_api.ts`, plus one
smoke test in `jfred/tests/viewer-api-documents.test.ts`.

### B1 (RED): tests in `tests/reconstruction_sidecar_reader.test.ts`

Reuse the file's existing helpers `makeCopiedTree` and `loadMinimalTranscript`.
`loadMinimalTranscript` hardcodes one session id — generalize it by adding a trailing
`sessionId: string = "11111111-2222-3333-4444-555555555555"` parameter (defaulted, so the
existing call sites stay untouched) and use it in the record literal.

Fixture helper for the two-source tests (place beside the other helpers):

```ts
// Two copied-out-of-~/.claude trees, each holding one single-session transcript and one
// file-history blob of the SAME name with tree-specific content — the spec-S4 two-source
// fixture: only per-source root resolution can read both blobs correctly.
const SHARED_BLOB_NAME = "aaaa0000@v1";
function makeTwoSourceFixture(): {
    treeA: { treeRoot: string; projectDir: string };
    treeB: { treeRoot: string; projectDir: string };
    sessionA: string;
    sessionB: string;
    records: TranscriptRecord[];
} {
    const treeA = makeCopiedTree(true);
    const treeB = makeCopiedTree(true);
    const sessionA = "aaaaaaaa-1111-2222-3333-444444444444";
    const sessionB = "bbbbbbbb-1111-2222-3333-444444444444";
    const recordsA = loadMinimalTranscript(treeA.projectDir, "a.jsonl", sessionA);
    const recordsB = loadMinimalTranscript(treeB.projectDir, "b.jsonl", sessionB);
    writeBlobForSession(treeA.treeRoot, sessionA, SHARED_BLOB_NAME, "content from tree A");
    writeBlobForSession(treeB.treeRoot, sessionB, SHARED_BLOB_NAME, "content from tree B");
    return { treeA, treeB, sessionA, sessionB, records: [...recordsA, ...recordsB] };
}

// One blob file under <treeRoot>/file-history/<sessionId>/<blobName>.
function writeBlobForSession(treeRoot: string, sessionId: string, blobName: string, content: string): void {
    const blobDir = join(treeRoot, "file-history", sessionId);
    mkdirSync(blobDir, { recursive: true });
    writeFileSync(join(blobDir, blobName), content);
}
```

Test 1 — `test_build_sidecar_reader_reads_each_sessions_blob_from_its_own_source`:

```ts
test("test_build_sidecar_reader_reads_each_sessions_blob_from_its_own_source", () => {
    // Scenario (spec S4a, design §c5): with records merged from two sources, each session's
    // blob must be read from the file-history root of the source that OWNS the session —
    // never from the first source's root for everyone.
    // Step: two trees, two sessions, the SAME blob name with different content in each.
    const fixture = makeTwoSourceFixture();
    // Step: build the reader with both sources declared (sibling file-history derivation).
    const reader = buildSidecarReader(fixture.records, [
        { projectsDir: new Path(join(fixture.treeA.treeRoot, "projects")) },
        { projectsDir: new Path(join(fixture.treeB.treeRoot, "projects")) },
    ]);
    assert.ok(reader, "expected merged two-source records to yield a sidecar reader");
    // Step: session A's blob comes from tree A, session B's from tree B.
    assert.equal(reader(new Path(SHARED_BLOB_NAME), new Uuid(fixture.sessionA)), "content from tree A");
    assert.equal(reader(new Path(SHARED_BLOB_NAME), new Uuid(fixture.sessionB)), "content from tree B");
});
```

Test 2 — `test_build_sidecar_reader_source_fileHistoryDir_wins_over_sibling_derivation`:

```ts
test("test_build_sidecar_reader_source_fileHistoryDir_wins_over_sibling_derivation", () => {
    // Scenario (design §b analog: config-first): a source's explicit fileHistoryDir
    // outranks the derivable <treeRoot>/file-history sibling.
    // Step: the two-tree fixture, plus a custom history dir holding tree B's session blob
    // with distinct content.
    const fixture = makeTwoSourceFixture();
    const customHistoryDir = makeTempDir();
    // writeBlobForSession appends file-history/<session>, so write the custom dir's blob directly.
    mkdirSync(join(customHistoryDir, fixture.sessionB), { recursive: true });
    writeFileSync(join(customHistoryDir, fixture.sessionB, SHARED_BLOB_NAME), "content from custom dir");
    // Step: declare source B WITH fileHistoryDir.
    const reader = buildSidecarReader(fixture.records, [
        { projectsDir: new Path(join(fixture.treeA.treeRoot, "projects")) },
        { projectsDir: new Path(join(fixture.treeB.treeRoot, "projects")), fileHistoryDir: new Path(customHistoryDir) },
    ]);
    assert.ok(reader);
    // Step: session B reads from the custom dir, not the derivable sibling.
    assert.equal(reader(new Path(SHARED_BLOB_NAME), new Uuid(fixture.sessionB)), "content from custom dir");
    // Step: session A is unaffected — still the sibling derivation.
    assert.equal(reader(new Path(SHARED_BLOB_NAME), new Uuid(fixture.sessionA)), "content from tree A");
});
```

Test 3 — `test_build_sidecar_reader_single_source_matches_no_sources_behavior`:

```ts
test("test_build_sidecar_reader_single_source_matches_no_sources_behavior", () => {
    // Scenario (spec S4a): single source is the degenerate case — passing a one-entry
    // sources list must read exactly the bytes the sources-less reader reads.
    // Step: one tree, one session, one blob.
    const tree = makeCopiedTree(true);
    const sessionId = "cccccccc-1111-2222-3333-444444444444";
    const records = loadMinimalTranscript(tree.projectDir, "c.jsonl", sessionId);
    writeBlobForSession(tree.treeRoot, sessionId, SHARED_BLOB_NAME, "single source content");
    // Step: build both readers over the same records.
    const readerWithoutSources = buildSidecarReader(records);
    const readerWithOneSource = buildSidecarReader(records, [{ projectsDir: new Path(join(tree.treeRoot, "projects")) }]);
    assert.ok(readerWithoutSources);
    assert.ok(readerWithOneSource);
    // Step: identical bytes from both.
    const blobPath = new Path(SHARED_BLOB_NAME);
    const owner = new Uuid(sessionId);
    assert.equal(readerWithOneSource(blobPath, owner), readerWithoutSources(blobPath, owner));
});
```

Add the needed imports (`basename`/`dirname` only if actually used after removing the
drafting slip; `SourceEntry` type import is unnecessary in tests — object literals
structurally match).

### B2 (GREEN): per-source resolution in `src/reconstruction_sidecar_reader.ts`

Import the type: `import type { SourceEntry } from "./reconstruction_overrides.ts";`
(the module already imports `getPathOverrides` from there — no new edge, no cycle).

Add two module-private helpers above `buildSidecarReader`:

```ts
// The source entry whose projectsDir is the given transcript-derived projects root, by
// normalized-path equality. undefined when no declared source matches (that session falls
// back to the single-root chain).
function findMatchingSourceEntry(sources: SourceEntry[], projectsRoot: string): SourceEntry | undefined {
    for (const source of sources) {
        if (resolve(source.projectsDir.toString()) === resolve(projectsRoot)) {
            return source;
        }
    }
    return undefined;
}

// Per-session file-history roots for multi-source records (design §c5): each session's
// blobs live under the root of the source that recorded it. Resolution per session:
// matching source's explicit fileHistoryDir → that session's transcript-derived sibling →
// the ~/.claude default. Keyed by sessionId string (module-private internal map;
// the public reader surface still speaks Uuid — coding-req §1).
function computeSessionFileHistoryRoots(records: TranscriptRecord[], sources: SourceEntry[]): Map<string, string> {
    const sessionRoots = new Map<string, string>();
    for (const record of records) {
        const sessionId = (record as { sessionId?: Uuid }).sessionId;
        if (sessionId) {
            if (!sessionRoots.has(sessionId.toString())) {
                const source = getRecordSource(record);
                if (source) {
                    const projectsRoot = dirname(dirname(source.filePath));
                    const matchedSource = findMatchingSourceEntry(sources, projectsRoot);
                    const explicitDir = matchedSource?.fileHistoryDir?.toString();
                    const siblingDir = deriveSiblingFileHistoryRoot(new Path(projectsRoot))?.toString();
                    const root = explicitDir ?? siblingDir ?? getDefaultFileHistoryRoot().toString();
                    sessionRoots.set(sessionId.toString(), root);
                }
            }
        }
    }
    return sessionRoots;
}
```

(`resolve` comes from `node:path` — extend the existing import.)

Then extend `buildSidecarReader` with a trailing optional parameter — the sources-less
path must stay byte-identical (test 3 + every existing caller):

```ts
export function buildSidecarReader(records: TranscriptRecord[], sources?: SourceEntry[]): BackupReader | undefined {
    const sessionIds = sessionIdsOf(records);
    if (sessionIds.length === 0) {
        return undefined;
    }
    // item 46: const root = getDefaultFileHistoryRoot().toString();
    const root = resolveFileHistoryRoot(records).toString();
    // spec S4a: with declared sources, each session reads from its OWN source's root;
    // sessions no source claims keep the single-root chain above.
    const sessionRoots = sources === undefined ? undefined : computeSessionFileHistoryRoots(records, sources);
    return (backupFileName, sessionId) => {
        const name = backupFileName.toString();
        // The engine passes the snapshot's OWNING session: across merged sessions the same `@vN` blob
        // name recurs with different content, so we MUST read the owner's copy. Fall back to a
        // first-existing search only when the owner is unknown (a pre-sessionId caller).
        const owner = sessionId ?? sessionIds.find((id) => existsSync(join(root, id.toString(), name)));
        const ownerRoot = sessionRoots?.get((owner ?? sessionIds[0]!).toString()) ?? root;
        return readFileSync(join(ownerRoot, (owner ?? sessionIds[0]!).toString(), name), "utf8");
    };
}
```

Why the per-source chain skips the global `fileHistoryRoot` override: that override is the
item-46 single-source knob, set from the same config entry's legacy `fileHistory` field. A
project that declares `sources` expresses per-source dirs instead; consulting both would
create a precedence tangle for zero real configurations. Sessions NOT matched to any
source (and sources-less callers) still get the full legacy chain via `root`.

### B3 (GREEN): the build seam in `src/viewer_api.ts`

Extend `buildProjectReconstruction` with a trailing optional `sources` parameter and pass
it to the reader — nothing else in the build changes:

```ts
export function buildProjectReconstruction(jsonlPaths: Path[], target: Path | undefined, onProgress?: ProgressSink, sources?: SourceEntry[]): BuiltReconstruction {
```

…and inside, change the reader line to:

```ts
    const reader = buildSidecarReader(records, sources);
```

Import: `import type { SourceEntry } from "./reconstruction_overrides.ts";` — merge into
the existing `reconstruction_overrides.ts` import line (it already imports
`getPathOverrides, serializePathOverrides`; `import type` symbols ride the same statement
as `type SourceEntry`).

Update the function's doc comment first line to mention the optional per-source list
(spec S4a). Do NOT touch `buildProjectDocument`, `buildReconstructionWithConsent`, or the
cache key — no caller passes `sources` yet (server plumbing is a later S4 task), and the
consent-layer cache key only needs a sources component when that plumbing lands.

### B4 (RED then GREEN with B3): smoke test in `tests/viewer-api-documents.test.ts`

One test proving the seam end-to-end at the build level — two minimal transcripts from two
trees plus a sources list build a document without throwing (deep multi-source behavior is
proven at the reader unit level; the 87-scenario sweep guards single-source regressions):

```ts
test("test_build_project_reconstruction_accepts_two_source_transcripts", () => {
    // Scenario (spec S4a): one reconstruction over JSONLs from TWO conversation-log
    // folders, with the sources list riding to the sidecar reader.
    // Step: two temp trees each holding one minimal single-session transcript.
    // (build the fixture with this test file's existing minimal-transcript/temp-dir
    // helpers, or the reconstruction_sidecar_reader.test.ts pattern if none exist here)
    // Step: build with both JSONL paths and both sources declared.
    // Step: a document comes back (records parsed from both folders, no throw).
});
```

Write the real body against the helpers that already exist in
`tests/viewer-api-documents.test.ts` (read it first; reuse its fixture pattern — do not
invent a parallel helper if one fits). Assert the build returns a document object and that
`document` is defined; do not assert deep content.

---

## Verification (the only commands to run)

1. `cd jfred && npm run typecheck` — must exit clean.
2. `wc -l src/reconstruction_overrides.ts src/reconstruction_sidecar_reader.ts src/viewer_api.ts` — all ≤ 250.
3. Do NOT run `npm test`, individual test files, or the scenario sweep — the user runs
   them after review. The RED phases therefore end at "test written", not "test observed
   failing"; write each test strictly before its implementation edit so the red→green
   order is preserved in authorship even though execution is deferred.

## Staging

Stage all changed/new files in `jfred/` (git add). Do not commit. Do not touch
`specs/SPEC.md` statuses — S3/S4 flip to done only when the user's test run passes and the
tasks are closed.
