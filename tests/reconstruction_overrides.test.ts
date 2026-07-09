// Tests for the item-46 path-overrides module: process-wide override state, stable
// serialization for cache stamps, and the reveng-paths.json per-project config file.
// Also home to the Phase-2 file-history-root resolution tests (FHS resolution is
// override-adjacent; one test file covers both).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Path, Uuid } from "../src/structures/domain.ts";
import type { TranscriptRecord } from "../src/structures/envelope.ts";
import { RecordType } from "../src/structures/vocabulary.ts";
import {
    getPathOverrides,
    setPathOverrides,
    serializePathOverrides,
    readProjectPathsConfig,
    hydrateProjectPaths,
    PROJECT_PATHS_CONFIG_NAME,
} from "../src/reconstruction_overrides.ts";
import {
    buildSidecarReader,
    deriveFileHistoryRootFromRecords,
    deriveSiblingFileHistoryRoot,
    findSessionId,
    getDefaultFileHistoryRoot,
    resolveFileHistoryRoot,
} from "../src/reconstruction_sidecar_reader.ts";
import { loadTranscript } from "../src/parse/loadTranscript.ts";
import { S43_JSONL_PATHS } from "./fixtures.ts";

// Overrides are process-wide module state — never let one test's state leak into the next.
afterEach(() => {
    setPathOverrides({});
});

function makeTempDir(): string {
    return mkdtempSync(join(tmpdir(), "reveng-overrides-"));
}

test("test_set_and_get_path_overrides_round_trip", () => {
    // Scenario: the module stores exactly what was set, and setting {} clears it.
    // Step: set a fully-populated override object.
    const overrides = {
        fileHistoryRoot: new Path("/tmp/claude-data/file-history"),
        projectCwd: new Path("/tmp/original/project"),
        repoDir: new Path("/tmp/original/project"),
        baseCommit: new Uuid("abc123def456"),
    };
    setPathOverrides(overrides);
    // Step: get returns the same values.
    assert.equal(getPathOverrides().fileHistoryRoot?.toString(), "/tmp/claude-data/file-history");
    assert.equal(getPathOverrides().projectCwd?.toString(), "/tmp/original/project");
    assert.equal(getPathOverrides().repoDir?.toString(), "/tmp/original/project");
    assert.equal(getPathOverrides().baseCommit?.toString(), "abc123def456");
    // Step: setting {} returns the module to empty.
    setPathOverrides({});
    assert.equal(getPathOverrides().fileHistoryRoot, undefined);
    assert.equal(getPathOverrides().projectCwd, undefined);
    assert.equal(getPathOverrides().repoDir, undefined);
    assert.equal(getPathOverrides().baseCommit, undefined);
});

test("test_serialize_path_overrides_is_stable_and_distinguishes_values", () => {
    // Scenario: the serialization is a cache-stamp component — identical overrides must
    // serialize identically, any field change must change the string.
    // Step: empty overrides serialize to a fixed constant.
    setPathOverrides({});
    const emptySerialization = serializePathOverrides();
    // Step: the same override set serializes identically across two set calls.
    setPathOverrides({ repoDir: new Path("/tmp/repo") });
    const firstSerialization = serializePathOverrides();
    setPathOverrides({ repoDir: new Path("/tmp/repo") });
    assert.equal(serializePathOverrides(), firstSerialization);
    // Step: changing one field changes the string.
    setPathOverrides({ repoDir: new Path("/tmp/other-repo") });
    assert.notEqual(serializePathOverrides(), firstSerialization);
    // Step: a defined field never serializes like the empty state.
    assert.notEqual(firstSerialization, emptySerialization);
});

test("test_read_project_paths_config_returns_empty_map_when_file_missing", () => {
    // Scenario: a projects folder with no reveng-paths.json means "no overrides".
    // Step: point at a temp dir that has no config file.
    const projectsDir = makeTempDir();
    // Step: the read yields an empty map, no throw.
    assert.deepEqual(readProjectPathsConfig(new Path(projectsDir)), {});
});

test("test_read_project_paths_config_reads_project_entry", () => {
    // Scenario: a config file maps project dir names to their path entries.
    // Step: write a config with one project entry into a temp projects dir.
    const projectsDir = makeTempDir();
    const wireConfig = {
        "-Users-me-Programming-jot": {
            cwd: "/Users/me/Programming/jot",
            repo: "/Users/me/Programming/jot",
            baseCommit: "deadbeef",
        },
    };
    writeFileSync(join(projectsDir, PROJECT_PATHS_CONFIG_NAME), JSON.stringify(wireConfig));
    // Step: reading it back yields the same entry under the project name.
    const config = readProjectPathsConfig(new Path(projectsDir));
    assert.deepEqual(config["-Users-me-Programming-jot"], wireConfig["-Users-me-Programming-jot"]);
});

test("test_read_project_paths_config_throws_on_malformed_json", () => {
    // Scenario: a typo'd config must fail loudly, never silently drop the overrides.
    // Step: write malformed JSON as the config file.
    const projectsDir = makeTempDir();
    writeFileSync(join(projectsDir, PROJECT_PATHS_CONFIG_NAME), "not json");
    // Step: the read throws.
    assert.throws(() => readProjectPathsConfig(new Path(projectsDir)));
});

test("test_hydrate_project_paths_builds_domain_types", () => {
    // Scenario: parsing hydrates wire strings into domain objects (coding-req §1).
    // Step: hydrate a full wire entry.
    const overrides = hydrateProjectPaths({
        cwd: "/Users/me/Programming/jot",
        repo: "/Users/me/Programming/jot",
        baseCommit: "deadbeef",
    });
    // Step: each field is a real domain instance carrying the wire value.
    assert.ok(overrides.projectCwd instanceof Path);
    assert.ok(overrides.repoDir instanceof Path);
    assert.ok(overrides.baseCommit instanceof Uuid);
    assert.equal(overrides.projectCwd.toString(), "/Users/me/Programming/jot");
    assert.equal(overrides.baseCommit.toString(), "deadbeef");
    // Step: absent wire fields stay absent after hydration.
    const partialOverrides = hydrateProjectPaths({ repo: "/tmp/repo" });
    assert.equal(partialOverrides.projectCwd, undefined);
    assert.equal(partialOverrides.baseCommit, undefined);
    assert.equal(partialOverrides.fileHistoryRoot, undefined);
});

// ---------------------------------------------------------------------------
// Phase 2 — file-history root resolution (item 46)
// ---------------------------------------------------------------------------

// A copied-out-of-~/.claude tree: <X>/projects (with one project dir) and, when asked
// for, the <X>/file-history sibling. Returns the tree root and the project dir path.
function makeCopiedTree(withSibling: boolean): { treeRoot: string; projectDir: string } {
    const treeRoot = makeTempDir();
    const projectDir = join(treeRoot, "projects", "-copied-project");
    mkdirSync(projectDir, { recursive: true });
    if (withSibling) {
        mkdirSync(join(treeRoot, "file-history"));
    }
    return { treeRoot, projectDir };
}

// A minimal one-record transcript written into <projectDir>/<name>, loaded through
// loadTranscript so each record carries a real source (file path + line number).
function loadMinimalTranscript(projectDir: string, name: string): TranscriptRecord[] {
    const jsonlPath = join(projectDir, name);
    const minimalRecord = { type: RecordType.aiTitle, sessionId: "11111111-2222-3333-4444-555555555555", aiTitle: "t" };
    writeFileSync(jsonlPath, `${JSON.stringify(minimalRecord)}\n`);
    return loadTranscript(jsonlPath);
}

test("test_derive_sibling_file_history_root_finds_existing_sibling", () => {
    // Scenario: a projects folder copied out of ~/.claude keeps its file-history dir
    // as a sibling — the derivation must find it.
    // Step: build a temp tree with both <X>/projects and <X>/file-history.
    const { treeRoot } = makeCopiedTree(true);
    // Step: derivation from <X>/projects lands on <X>/file-history.
    const derived = deriveSiblingFileHistoryRoot(new Path(join(treeRoot, "projects")));
    assert.equal(derived?.toString(), join(treeRoot, "file-history"));
});

test("test_derive_sibling_file_history_root_returns_undefined_without_sibling", () => {
    // Scenario: a projects folder with no file-history sibling yields no derived root.
    // Step: build a temp tree holding only <X>/projects.
    const { treeRoot } = makeCopiedTree(false);
    // Step: derivation returns undefined (the resolution chain moves on to the default).
    assert.equal(deriveSiblingFileHistoryRoot(new Path(join(treeRoot, "projects"))), undefined);
});

test("test_resolve_file_history_root_prefers_override_over_derivation", () => {
    // Scenario: an explicit fileHistoryRoot override outranks the transcript-derived sibling.
    // Step: build a copied tree whose transcript WOULD derive a sibling root.
    const { treeRoot, projectDir } = makeCopiedTree(true);
    const records = loadMinimalTranscript(projectDir, "session.jsonl");
    // Step: sanity — without an override, derivation does find the sibling.
    assert.equal(deriveFileHistoryRootFromRecords(records)?.toString(), join(treeRoot, "file-history"));
    // Step: set an explicit override.
    setPathOverrides({ fileHistoryRoot: new Path("/tmp/override-file-history") });
    // Step: resolution returns the override, not the derivable sibling.
    assert.equal(resolveFileHistoryRoot(records).toString(), "/tmp/override-file-history");
});

test("test_resolve_file_history_root_falls_back_to_default_without_source_or_override", () => {
    // Scenario: records that never went through loadTranscript carry no source; with no
    // override either, resolution lands on the ~/.claude default (today's exact behavior).
    // Step: build a record that has no recorded source and set no override.
    const records = [{ type: RecordType.aiTitle } as unknown as TranscriptRecord];
    // Step: resolution returns getDefaultFileHistoryRoot().
    assert.equal(resolveFileHistoryRoot(records).toString(), getDefaultFileHistoryRoot().toString());
});

// The first scenario transcript (among the s43 captures) whose session left real blob
// files under the live default file-history root, with one blob name to copy.
function findTranscriptWithBlobs(): { jsonlPath: Path; sessionId: Uuid; blobName: string } | undefined {
    for (const jsonlPath of S43_JSONL_PATHS) {
        const records = loadTranscript(jsonlPath.toString());
        const sessionId = findSessionId(records);
        if (!sessionId) {
            continue;
        }
        const blobDir = join(getDefaultFileHistoryRoot().toString(), sessionId.toString());
        if (!existsSync(blobDir)) {
            continue;
        }
        const blobNames = readdirSync(blobDir);
        if (blobNames.length === 0) {
            continue;
        }
        return { jsonlPath, sessionId, blobName: blobNames[0]! };
    }
    return undefined;
}

test("test_build_sidecar_reader_reads_blob_from_derived_sibling_root", () => {
    // Scenario: the audit use case end-to-end at the reader level — a transcript COPIED
    // into <X>/projects/<project>/ with its blobs copied into <X>/file-history/<session>/
    // must be readable without touching ~/.claude.
    // Step: find a real s43 transcript whose session has on-disk blobs to copy from.
    const fixture = findTranscriptWithBlobs();
    assert.ok(fixture, "expected an s43 transcript with on-disk file-history blobs");
    // Step: build the copied tree — the transcript under <X>/projects/<project>/copy.jsonl.
    const { treeRoot, projectDir } = makeCopiedTree(true);
    const copiedJsonlPath = join(projectDir, "copy.jsonl");
    copyFileSync(fixture.jsonlPath.toString(), copiedJsonlPath);
    // Step: copy ONE real blob file under <X>/file-history/<sessionId>/.
    const originalBlobPath = join(
        getDefaultFileHistoryRoot().toString(), fixture.sessionId.toString(), fixture.blobName);
    const copiedBlobDir = join(treeRoot, "file-history", fixture.sessionId.toString());
    mkdirSync(copiedBlobDir, { recursive: true });
    copyFileSync(originalBlobPath, join(copiedBlobDir, fixture.blobName));
    // Step: load records from the COPY so their source points into the temp tree.
    const records = loadTranscript(copiedJsonlPath);
    // Step: derivation from those records lands on the temp tree's sibling file-history dir.
    assert.equal(deriveFileHistoryRootFromRecords(records)?.toString(), join(treeRoot, "file-history"));
    // Step: the reader built from these records resolves the SIBLING root and reads the blob.
    const reader = buildSidecarReader(records);
    assert.ok(reader, "expected the copied transcript to yield a sidecar reader");
    const content = reader(new Path(fixture.blobName), fixture.sessionId);
    // Step: the bytes match the original blob file's.
    assert.equal(content, readFileSync(originalBlobPath, "utf8"));
});
