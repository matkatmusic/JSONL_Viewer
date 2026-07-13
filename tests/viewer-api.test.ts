// Tests for the viewer server's logic layer (src/viewer_api.ts): project scanning, document
// building over one-or-many JSONLs, the script-consent decision, consent-scoped building, and
// the two diff renderers. Pure logic only — the HTTP wiring in viewer_server.ts stays thin.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import {
    scanProjects,
    buildProjectDocument,
    decideDocumentResponse,
    buildDocumentWithConsent,
    readBlobSnapshot,
    renderRevisionDiff,
    renderDiffVsBase,
    resolveProjectFile,
    getProjectsDir,
    setProjectsDir,
    setFileHistoryDir,
    getEffectiveFileHistoryDir,
    applyProjectOverrides,
    ROOT_PROJECT_NAME,
} from "../src/viewer_api.ts";
import {
    getPathOverrides,
    setPathOverrides,
    PROJECT_PATHS_CONFIG_NAME,
} from "../src/reconstruction_overrides.ts";
import { isImpureExecutionAllowed, setImpureExecutionAllowed } from "../src/reconstruction_exec_gate.ts";
import { scriptCodeMayWriteFiles } from "../src/reconstruction_script_execution.ts";
import { getDefaultFileHistoryRoot } from "../src/reconstruction_sidecar_reader.ts";
import { runCli } from "../src/reconstruction_cli.ts";
import { BlockType, DocumentResponseKind, EventKind, RecordType, ToolName } from "../src/structures/vocabulary.ts";
import { Path, Uuid } from "../src/structures/domain.ts";
import type { TranscriptRecord } from "../src/structures/envelope.ts";
import { jsonlPathsForScenario, loadRecords } from "./utilities.ts";
import { S19_JSONL, S37_JSONL, S43_JSONL_PATHS } from "./fixtures.ts";

// -------------------- 2.2 scanProjects --------------------

test("test_scanProjects_lists_directories_with_jsonl_counts", () => {
    // Scenario: a projects dir with two project dirs — one holding 2 JSONLs, one holding none —
    // scans to two listings sorted by most recent activity, the empty one included with [].
    const projectsDir = mkdtempSync(join(tmpdir(), "reveng-scan-"));
    try {
        // Steps:
        // create project dir "alpha" with two .jsonl files at known mtimes.
        mkdirSync(join(projectsDir, "alpha"));
        writeFileSync(join(projectsDir, "alpha", "one.jsonl"), "{}\n");
        writeFileSync(join(projectsDir, "alpha", "two.jsonl"), "{}\n");
        utimesSync(join(projectsDir, "alpha", "one.jsonl"), new Date("2026-01-01T00:00:01Z"), new Date("2026-01-01T00:00:01Z"));
        utimesSync(join(projectsDir, "alpha", "two.jsonl"), new Date("2026-01-02T00:00:02Z"), new Date("2026-01-02T00:00:02Z"));
        // create project dir "beta" with no JSONLs.
        mkdirSync(join(projectsDir, "beta"));
        // scan.
        const listings = scanProjects(new Path(projectsDir));
        // assert both projects appear, most recently active first, the empty one with [].
        assert.deepEqual(listings.map((listing) => listing.name), ["alpha", "beta"]);
        assert.equal(listings[0]!.jsonlFiles.length, 2);
        assert.deepEqual(listings[1]!.jsonlFiles, []);
        // assert each JSONL entry carries fileName, sizeBytes, and modifiedAt.
        const fileEntry = listings[0]!.jsonlFiles.find((entry) => entry.fileName.toString() === "two.jsonl");
        assert.ok(fileEntry !== undefined);
        assert.equal(fileEntry.sizeBytes, 3);
        assert.equal(fileEntry.modifiedAt.toISOString(), "2026-01-02T00:00:02.000Z");
    } finally {
        rmSync(projectsDir, { recursive: true, force: true });
    }
});

test("test_scanProjects_ignores_non_directories", () => {
    // Scenario: a stray non-JSONL file sitting in the projects dir is not a project.
    const projectsDir = mkdtempSync(join(tmpdir(), "reveng-scan-"));
    try {
        // Steps: put one real project dir and one stray file in the projects dir, then scan.
        mkdirSync(join(projectsDir, "alpha"));
        writeFileSync(join(projectsDir, "stray.txt"), "not a project");
        const listings = scanProjects(new Path(projectsDir));
        // assert only the directory is listed.
        assert.deepEqual(listings.map((listing) => listing.name), ["alpha"]);
    } finally {
        rmSync(projectsDir, { recursive: true, force: true });
    }
});

test("test_scanProjects_treats_loose_jsonls_as_root_project", () => {
    // Scenario: .jsonl files sitting directly in the scanned dir (a folder that is not
    // .claude/projects-shaped) appear as one synthetic "(root)" project, so any folder of
    // JSONLs is loadable.
    const projectsDir = mkdtempSync(join(tmpdir(), "reveng-scan-"));
    try {
        // Steps: put one loose JSONL directly in the scanned dir, then scan.
        writeFileSync(join(projectsDir, "loose.jsonl"), "{}\n");
        const listings = scanProjects(new Path(projectsDir));
        // assert a synthetic (root) project carries it.
        const rootListing = listings.find((listing) => listing.name === ROOT_PROJECT_NAME);
        assert.ok(rootListing !== undefined);
        assert.deepEqual(rootListing.jsonlFiles.map((entry) => entry.fileName.toString()), ["loose.jsonl"]);
    } finally {
        rmSync(projectsDir, { recursive: true, force: true });
    }
});

// -------------------- 2.3 buildProjectDocument --------------------

test("test_buildProjectDocument_single_jsonl_matches_cli_json", () => {
    // Scenario: for one JSONL, the viewer's document is byte-identical (after JSON
    // round-trip) to what the CLI --json path produces for the same file.
    // Steps: build via the viewer path and via the CLI, compare deep-equal.
    const viaViewer = JSON.parse(JSON.stringify(buildProjectDocument([new Path(S19_JSONL)], undefined)));
    const viaCli = JSON.parse(runCli([S19_JSONL, "--json"]));
    assert.deepEqual(viaViewer, viaCli);
});

test("test_buildProjectDocument_multi_jsonl_unifies_records", () => {
    // Scenario: s53's two agent transcripts unify into ONE document whose filesTouched
    // covers the files of both.
    // Steps:
    // collect each transcript's own touched targets.
    const paths = jsonlPathsForScenario("s53");
    assert.ok(paths.length >= 2, "s53 spans multiple JSONLs");
    const perTranscriptTargets = paths.map((path) =>
        buildProjectDocument([path], undefined).filesTouched.map((history) => history.target.toString()),
    );
    // build the unified document over both transcripts.
    const unified = buildProjectDocument(paths, undefined);
    const unifiedTargets = unified.filesTouched.map((history) => history.target.toString());
    // assert every per-transcript file appears in the one unified document.
    for (const targets of perTranscriptTargets) {
        for (const target of targets) {
            assert.ok(unifiedTargets.includes(target), `unified document covers ${target}`);
        }
    }
});

// -------------------- 2.4 decideDocumentResponse --------------------

test("test_decideDocumentResponse_requires_consent_when_scripts_present", () => {
    // Scenario: a transcript with script-execution runs and no consent yields a
    // consent-required decision carrying each script's code for the dialog.
    const records = loadRecords(S37_JSONL);
    const decision = decideDocumentResponse(records, false);
    assert.equal(decision.kind, DocumentResponseKind.consentRequired);
    assert.ok(decision.kind === DocumentResponseKind.consentRequired && decision.scripts.length > 0);
    for (const script of decision.kind === DocumentResponseKind.consentRequired ? decision.scripts : []) {
        assert.ok(script.code.length > 0, "each script surfaces non-empty code");
    }
});

test("test_decideDocumentResponse_tags_each_script_with_read_only_flag", () => {
    // Scenario: the consent-required decision tags every script with readOnly, and the
    // tag agrees with the execution gate's classifier (item 68) for that script's code.
    const records = loadRecords(S37_JSONL);
    const decision = decideDocumentResponse(records, false);
    assert.equal(decision.kind, DocumentResponseKind.consentRequired);
    for (const script of decision.kind === DocumentResponseKind.consentRequired ? decision.scripts : []) {
        // Test verification: the flag exists and matches the gate for this exact code.
        assert.equal(typeof script.readOnly, "boolean");
        assert.equal(script.readOnly, !scriptCodeMayWriteFiles(script.code));
    }
});

test("test_decideDocumentResponse_builds_when_consented", () => {
    // Scenario: the same script-bearing records WITH consent decide to build.
    const records = loadRecords(S37_JSONL);
    const decision = decideDocumentResponse(records, true);
    assert.equal(decision.kind, DocumentResponseKind.document);
});

test("test_decideDocumentResponse_builds_when_no_scripts", () => {
    // Scenario: a script-free transcript never prompts, consent or not. Synthetic fixture:
    // every executed scenario carries harness-probe script runs (ls/pytest), so no real
    // captured transcript is script-free.
    const records = [
        {
            type: RecordType.assistant,
            timestamp: new Date("2026-01-01T00:00:01Z"),
            message: {
                content: [{
                    type: BlockType.tool_use,
                    id: "toolu_x",
                    name: ToolName.Write,
                    input: { file_path: "/proj/a.py", content: "x = 1\n" },
                    caller: { type: "direct" },
                }],
            },
        } as unknown as TranscriptRecord,
    ];
    const decision = decideDocumentResponse(records, false);
    assert.equal(decision.kind, DocumentResponseKind.document);
});

// -------------------- 2.5 buildDocumentWithConsent --------------------

test("test_buildDocumentWithConsent_declined_still_returns_document", () => {
    // Scenario: declining consent on a script scenario still yields a document — degraded
    // (no script-derived revisions), with the gate off for the whole build.
    try {
        // Steps: build s37's document with consent declined.
        const document = buildDocumentWithConsent([new Path(S37_JSONL)], undefined, false);
        // assert a document was produced.
        assert.ok(Array.isArray(document.filesTouched));
        // assert it is degraded: no revision anywhere came from a script execution.
        for (const history of document.filesTouched) {
            for (const revision of history.revisions) {
                assert.ok(revision.kind !== EventKind.scriptExecution, "no script-derived revision when declined");
            }
        }
        // assert the gate stayed off (the declined build never enabled it).
        assert.equal(isImpureExecutionAllowed(), false);
    } finally {
        setImpureExecutionAllowed(true);
    }
});

test("test_buildDocumentWithConsent_restores_gate_after_build", () => {
    // Scenario: a CONSENTED build enables the gate only for its own duration — script
    // revisions appear in the document, and the gate is off again afterwards.
    try {
        // Steps: build s37's document with consent granted.
        const document = buildDocumentWithConsent([new Path(S37_JSONL)], undefined, true);
        // assert the consented build actually ran the scripts (a script revision exists).
        const scriptRevisions = document.filesTouched.flatMap((history) =>
            history.revisions.filter((revision) => revision.kind === EventKind.scriptExecution),
        );
        assert.ok(scriptRevisions.length > 0, "consented build carries script-derived revisions");
        // assert the gate is OFF after the build (server posture restored).
        assert.equal(isImpureExecutionAllowed(), false);
    } finally {
        setImpureExecutionAllowed(true);
    }
});

// -------------------- 3.1 runtime-switchable projects dir --------------------

test("test_getProjectsDir_throws_before_any_setProjectsDir", () => {
    // Scenario: there is no default scan root — the server refuses to start without
    // --projects-dir, so reading the dir while unset is a loud error.
    // NOTE: module state — this must stay the FIRST test that touches the projects dir.
    assert.throws(() => getProjectsDir(), /--projects-dir/);
});

test("test_setProjectsDir_rejects_missing_directory", () => {
    // Scenario: pointing the app at a nonexistent path is a loud error (the server maps it
    // to 400), and the active dir is left unchanged.
    const knownDir = mkdtempSync(join(tmpdir(), "reveng-known-"));
    try {
        const before = setProjectsDir(knownDir);
        assert.throws(() => setProjectsDir("/nonexistent/definitely/not/a/dir"));
        assert.equal(getProjectsDir().toString(), before.toString());
    } finally {
        rmSync(knownDir, { recursive: true, force: true });
    }
});

test("test_setProjectsDir_switches_scan_root", () => {
    // Scenario: switching the active dir at runtime makes the scan reflect the new root.
    const projectsDir = mkdtempSync(join(tmpdir(), "reveng-switch-"));
    try {
        // Steps: put one fake project in a temp root and switch to it.
        mkdirSync(join(projectsDir, "gamma"));
        writeFileSync(join(projectsDir, "gamma", "one.jsonl"), "{}\n");
        const switched = setProjectsDir(projectsDir);
        // assert the scan over the active dir now lists the fake project.
        const listings = scanProjects(switched);
        assert.deepEqual(listings.map((listing) => listing.name), ["gamma"]);
        assert.equal(getProjectsDir().toString(), switched.toString());
    } finally {
        rmSync(projectsDir, { recursive: true, force: true });
    }
});

// -------------------- 2.7 project-file resolver (trust boundary) --------------------

test("test_resolveProjectFile_resolves_names_within_projects_dir", () => {
    // Scenario: a project name + JSONL file name resolve to the real file under the projects dir.
    const projectsDir = mkdtempSync(join(tmpdir(), "reveng-resolve-"));
    try {
        mkdirSync(join(projectsDir, "alpha"));
        writeFileSync(join(projectsDir, "alpha", "one.jsonl"), "{}\n");
        const resolved = resolveProjectFile(new Path(projectsDir), "alpha", "one.jsonl");
        assert.ok(resolved.toString().endsWith(join("alpha", "one.jsonl")));
    } finally {
        rmSync(projectsDir, { recursive: true, force: true });
    }
});

test("test_resolveProjectFile_rejects_traversal", () => {
    // Scenario: `project` and `jsonl` are NAMES, not paths — an escape attempt in either
    // position must be rejected, never resolved outside the projects dir.
    const projectsDir = mkdtempSync(join(tmpdir(), "reveng-resolve-"));
    try {
        mkdirSync(join(projectsDir, "alpha"));
        writeFileSync(join(projectsDir, "alpha", "one.jsonl"), "{}\n");
        // a traversal in the jsonl position is rejected.
        assert.throws(() => resolveProjectFile(new Path(projectsDir), "alpha", "../../etc/passwd"));
        // a traversal in the project position is rejected.
        assert.throws(() => resolveProjectFile(new Path(projectsDir), "../..", "one.jsonl"));
    } finally {
        rmSync(projectsDir, { recursive: true, force: true });
    }
});

test("test_resolveProjectFile_resolves_root_project_files", () => {
    // Scenario: the synthetic "(root)" project resolves its files directly against the
    // projects dir itself.
    const projectsDir = mkdtempSync(join(tmpdir(), "reveng-resolve-"));
    try {
        writeFileSync(join(projectsDir, "loose.jsonl"), "{}\n");
        const resolved = resolveProjectFile(new Path(projectsDir), ROOT_PROJECT_NAME, "loose.jsonl");
        assert.ok(resolved.toString().endsWith("loose.jsonl"));
    } finally {
        rmSync(projectsDir, { recursive: true, force: true });
    }
});

// -------------------- 2.8 blob-snapshot reads (trust boundary) --------------------

// A live (owning session, blob name) pair derived from the s43 capture: scan each transcript's
// file-history-snapshot records for trackedFileBackups entries and return the first whose blob
// file exists under the real ~/.claude/file-history root (reader-dependent, like the sidecar
// tests — there is no root override in this repo). undefined when none is on disk.
function findExistingS43Backup(): { session: Uuid; blobName: Path } | undefined {
    const root = getDefaultFileHistoryRoot().toString();
    for (const jsonlPath of S43_JSONL_PATHS) {
        const session = basename(jsonlPath.toString(), ".jsonl");
        for (const line of readFileSync(jsonlPath.toString(), "utf8").split("\n")) {
            if (!line.includes("file-history-snapshot")) {
                continue;
            }
            let parsed: { snapshot?: { trackedFileBackups?: Record<string, { backupFileName?: string }> } };
            try {
                parsed = JSON.parse(line);
            } catch {
                continue;
            }
            const backups = parsed.snapshot?.trackedFileBackups;
            if (backups === undefined) {
                continue;
            }
            for (const entry of Object.values(backups)) {
                if (entry.backupFileName !== undefined && existsSync(join(root, session, entry.backupFileName))) {
                    return { session: new Uuid(session), blobName: new Path(entry.backupFileName) };
                }
            }
        }
    }
    return undefined;
}

test("test_readBlobSnapshot_rejects_a_blob_name_with_path_separators", () => {
    // Scenario: both arguments reach a filesystem join, so anything that is not a bare
    // `<16 hex>@vN` blob name (or a bare session id) is refused — traversal is impossible.
    assert.throws(() => readBlobSnapshot(new Uuid("a"), new Path("../etc/passwd")));
});

test("test_readBlobSnapshot_reports_a_nonexistent_blob_as_missing", () => {
    // Scenario: a well-formed name that is simply not on disk is not an error — the client
    // renders it as "(missing from disk)", so the read reports { exists: false }.
    const result = readBlobSnapshot(
        new Uuid("00000000-0000-0000-0000-000000000000"),
        new Path("0000000000000000@v1"),
    );
    assert.deepEqual(result, { exists: false, content: undefined });
});

test("test_readBlobSnapshot_reads_an_existing_blob_from_the_owning_session_dir", () => {
    // Scenario: a blob named by an s43 file-history snapshot reads back verbatim from its
    // OWNING session's dir under ~/.claude/file-history (owner-dir only — no cross-session
    // fallback, per the multi-session @vN collision fix).
    // Steps: derive a live (session, blob) pair from the s43 transcripts, then read it.
    const pair = findExistingS43Backup();
    assert.ok(pair !== undefined, "s43 tracks at least one backup blob that is on disk");
    const result = readBlobSnapshot(pair.session, pair.blobName);
    assert.equal(result.exists, true);
    assert.ok(result.content !== undefined && result.content.length > 0);
});

// -------------------- 2.6 diff renderers --------------------

// s19's reconstructed scenario19.py — the one file the scenario touches.
function buildS19DocumentAndTarget(): { document: ReturnType<typeof buildProjectDocument>; target: Path } {
    const document = buildProjectDocument([new Path(S19_JSONL)], undefined);
    const history = document.filesTouched.find((entry) => entry.target.toString().endsWith("scenario19.py"));
    assert.ok(history !== undefined, "s19 touches scenario19.py");
    return { document, target: history.target };
}

test("test_renderRevisionDiff_shows_consecutive_changes_for_a_file", () => {
    // Scenario: the revision-timeline diff for s19's scenario19.py contains the
    // user's out-of-band tweak line as an addition.
    const { document, target } = buildS19DocumentAndTarget();
    const diffText = renderRevisionDiff(document, target);
    assert.ok(diffText.includes("# user tweak"), "the revision diff carries the scenario's added line");
});

test("test_renderDiffVsBase_diffs_first_revision_against_selected", () => {
    // Scenario: diffing the base (first revision) against the final revision of s19's
    // scenario19.py shows the multiply function that only exists at the end.
    const { document, target } = buildS19DocumentAndTarget();
    const history = document.filesTouched.find((entry) => entry.target.equals(target))!;
    const diffText = renderDiffVsBase(document, target, history.revisions.length - 1);
    assert.ok(diffText.includes("def multiply(a, b):"), "the vs-base diff carries the final-only function");
});

// -------------------- item 46: file-history dir + per-project path overrides --------------------

// Overrides are process-wide module state — never let one test's state leak into the next.
afterEach(() => {
    setPathOverrides({});
});

test("test_effective_file_history_dir_derives_sibling_of_projects_dir", () => {
    // Scenario: a copied claude-data tree has file-history/ sitting next to projects/; with
    // no explicit override the viewer serves that sibling.
    const treeRoot = mkdtempSync(join(tmpdir(), "reveng-fhs-derive-"));
    try {
        // Steps: build <X>/projects and <X>/file-history, switch the scan root to <X>/projects.
        mkdirSync(join(treeRoot, "projects"));
        mkdirSync(join(treeRoot, "file-history"));
        setProjectsDir(join(treeRoot, "projects"));
        // assert the effective file-history dir is the derived sibling.
        assert.equal(getEffectiveFileHistoryDir().toString(), join(treeRoot, "file-history"));
    } finally {
        rmSync(treeRoot, { recursive: true, force: true });
    }
});

test("test_set_file_history_dir_override_wins_then_clears_on_projects_switch", () => {
    // Scenario: an explicit file-history dir beats the sibling derivation; "" clears it; and
    // switching the projects folder clears it too (the webapp prepopulate behavior).
    const treeRoot = mkdtempSync(join(tmpdir(), "reveng-fhs-override-"));
    try {
        mkdirSync(join(treeRoot, "projects"));
        mkdirSync(join(treeRoot, "file-history"));
        mkdirSync(join(treeRoot, "explicit"));
        setProjectsDir(join(treeRoot, "projects"));
        // Step: an explicit override wins over the sibling derivation.
        setFileHistoryDir(join(treeRoot, "explicit"));
        assert.equal(getEffectiveFileHistoryDir().toString(), join(treeRoot, "explicit"));
        // Step: a non-directory throws and leaves the override in place.
        assert.throws(() => setFileHistoryDir("/nonexistent/definitely/not/a/dir"));
        assert.equal(getEffectiveFileHistoryDir().toString(), join(treeRoot, "explicit"));
        // Step: the empty string clears the override — back to the derived sibling.
        setFileHistoryDir("");
        assert.equal(getEffectiveFileHistoryDir().toString(), join(treeRoot, "file-history"));
        // Step: an override set before a projects-folder switch clears with the switch.
        setFileHistoryDir(join(treeRoot, "explicit"));
        setProjectsDir(join(treeRoot, "projects"));
        assert.equal(getEffectiveFileHistoryDir().toString(), join(treeRoot, "file-history"));
    } finally {
        rmSync(treeRoot, { recursive: true, force: true });
    }
});

test("test_apply_project_overrides_reads_config_entry_and_effective_fhs_root", () => {
    // Scenario: each project-scoped request applies its reveng-paths.json entry plus the
    // effective file-history root; a project without an entry keeps only the root.
    const treeRoot = mkdtempSync(join(tmpdir(), "reveng-apply-"));
    try {
        // Steps: a projects dir with a config entry for project "p" and a file-history sibling.
        mkdirSync(join(treeRoot, "projects"));
        mkdirSync(join(treeRoot, "file-history"));
        const wireConfig = { p: { cwd: "/original/p", repo: "/repos/p", baseCommit: "deadbeef" } };
        writeFileSync(join(treeRoot, "projects", PROJECT_PATHS_CONFIG_NAME), JSON.stringify(wireConfig));
        setProjectsDir(join(treeRoot, "projects"));
        // Step: applying project "p" hydrates its entry and stamps the effective FHS root.
        applyProjectOverrides("p");
        assert.equal(getPathOverrides().projectCwd?.toString(), "/original/p");
        assert.equal(getPathOverrides().repoDir?.toString(), "/repos/p");
        assert.equal(getPathOverrides().baseCommit?.toString(), "deadbeef");
        assert.equal(getPathOverrides().fileHistoryRoot?.toString(), join(treeRoot, "file-history"));
        // Step: applying a project with no entry drops the per-project fields, keeps the root.
        applyProjectOverrides("other");
        assert.equal(getPathOverrides().projectCwd, undefined);
        assert.equal(getPathOverrides().repoDir, undefined);
        assert.equal(getPathOverrides().baseCommit, undefined);
        assert.equal(getPathOverrides().fileHistoryRoot?.toString(), join(treeRoot, "file-history"));
    } finally {
        rmSync(treeRoot, { recursive: true, force: true });
    }
});

test("test_document_cache_key_includes_override_serialization", () => {
    // Scenario: a config-file edit between requests must never serve a stale cached document —
    // the built-document cache key carries the serialized overrides.
    // Step: build once with empty overrides (allowScripts false keeps the build pure).
    setPathOverrides({});
    const firstDocument = buildDocumentWithConsent([new Path(S19_JSONL)], undefined, false);
    // Step: a repeat with unchanged overrides returns the SAME cached object.
    assert.strictEqual(buildDocumentWithConsent([new Path(S19_JSONL)], undefined, false), firstDocument);
    // Step: changing an override misses the cache — a fresh document object is built.
    setPathOverrides({ projectCwd: new Path("/somewhere/else") });
    assert.notStrictEqual(buildDocumentWithConsent([new Path(S19_JSONL)], undefined, false), firstDocument);
});
