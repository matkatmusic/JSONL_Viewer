import { test } from "node:test";
import assert from "node:assert/strict";
import {
    computeScriptExecutionChangeId,
    configureSandboxMemoPersistence,
    flushSandboxMemoToDisk,
    resetSandboxMemoOnDisk,
    findScriptExecutionRuns,
    resolveScriptRunChangeIdToSourceId,
    getPreExecutionState,
    isScriptExecutionRun,
    parseScriptFileRefs,
    runScriptAgainstState,
    scriptCodeMayWriteFiles,
    PROGRESS_LABEL_SANDBOX_SPAWN_PREFIX,
    type ScriptRun,
} from "../src/reconstruction_script_execution.ts";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setReconstructionProgressSink } from "../src/reconstruction_progress.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { replayEvents } from "../src/reconstruction_replay.ts";
import { linesTextOf } from "../src/reconstruction_branches.ts";
import { BlockType, EventKind, RecordType, ToolName } from "../src/structures/vocabulary.ts";
import type { ToolUseBlock } from "../src/structures/content-blocks.ts";
import type { TranscriptRecord } from "../src/structures/envelope.ts";
import { Path, Uuid } from "../src/structures/domain.ts";
import type { FileEvent } from "../src/reconstruction_engine.ts";

// A synthetic assistant record carrying one tool_use of `name` with `input`, at `timestamp`,
// with the record-level `cwd` transcripts carry.
function buildToolRecord(
    name: ToolName,
    input: Record<string, unknown>,
    timestamp: string,
    cwd?: string,
): TranscriptRecord {
    return {
        type: RecordType.assistant,
        timestamp: new Date(timestamp),
        cwd: cwd !== undefined ? new Path(cwd) : undefined,
        message: { content: [{ type: BlockType.tool_use, id: "toolu_x", name, input, caller: { type: "direct" } }] },
    } as unknown as TranscriptRecord;
}

// A synthetic tool_use block of `name` carrying `input` — for the run-detection predicate.
function toolUse(name: ToolName, input: Record<string, unknown>): ToolUseBlock {
    return { type: BlockType.tool_use, id: new Uuid("toolu_x"), name, input } as unknown as ToolUseBlock;
}

// C6b — replaying a scriptExecution event emits one full-content revision (every line genesis) of its
// precomputed post-script content, under the script-execution kind (wholesale, like an overwrite).
test("test_replay_scriptExecution_emits_its_precomputed_content", () => {
    const events: FileEvent[] = [
        {
            kind: EventKind.write,
            changeId: new Uuid("toolu_write"),
            target: new Path("ledger.py"),
            content: "def add_entry():\n    pass",
            timestamp: new Date("2026-06-26T10:27:38.450Z"),
        },
        {
            kind: EventKind.scriptExecution,
            changeId: new Uuid("toolu_run"),
            target: new Path("ledger.py"),
            content: "def record_entry():\n    pass",
            timestamp: new Date("2026-06-26T10:29:53.899Z"),
        },
    ];
    const revisions = replayEvents(events);
    const final = revisions[revisions.length - 1]!;
    assert.equal(final.kind, EventKind.scriptExecution);
    assert.deepEqual(linesTextOf(final), ["def record_entry():", "    pass"]);
});

// C5b — a run is any Bash or MCP-execution tool_use carrying script source; a Read is not a run.
test("test_isScriptExecutionRun_recognizes_executors_and_rejects_a_read", () => {
    assert.ok(isScriptExecutionRun(toolUse(ToolName.CtxExecute, { code: "import re\n" })));
    assert.ok(isScriptExecutionRun(toolUse(ToolName.Bash, { command: "python apply_renames.py" })));
    assert.ok(!isScriptExecutionRun(toolUse(ToolName.Read, { file_path: "/x/ledger.py" })));
});

// parseScriptFileRefs extracts all file-path-like quoted strings from script source.
test("test_parseScriptFileRefs_extracts_file_paths", () => {
    const code = `TARGETS = ["ledger.py", "tests/test_ledger.py"]\nwith open("renames.csv") as f:`;
    const refs = parseScriptFileRefs(code);
    assert.deepEqual(refs.sort(), ["ledger.py", "renames.csv", "tests/test_ledger.py"]);
});

test("test_findScriptExecutionRuns_carries_the_records_cwd_on_each_run", () => {
    // Scenario: a Bash script run record includes a cwd; the collected ScriptRun exposes it.
    // Steps:
    // build one transcript record whose tool_use is a Bash python3 run and whose record cwd is "/tmp/proj".
    const records = [buildToolRecord(ToolName.Bash, { command: "python3 -c 'print(1)'" }, "2026-01-01T00:00:01Z", "/tmp/proj")];
    // collect the runs with findScriptExecutionRuns.
    const runs = findScriptExecutionRuns(records);
    // assert the single run's cwd equals "/tmp/proj".
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.cwd?.toString(), "/tmp/proj");
});

// An assistant record writing `filePath` with `content`.
function buildWriteRecord(filePath: string, content: string, timestamp: string, cwd?: string): TranscriptRecord {
    return buildToolRecord(ToolName.Write, { file_path: filePath, content }, timestamp, cwd);
}

// A file-history snapshot record backing up `path` (cwd-relative) under `backupFileName`.
function buildSnapshotRecord(path: string, backupFileName: string, backupTime: string): TranscriptRecord {
    return {
        type: RecordType.fileHistorySnapshot,
        messageId: "m-" + backupFileName,
        isSnapshotUpdate: false,
        snapshot: {
            messageId: "m-" + backupFileName,
            timestamp: backupTime,
            trackedFileBackups: { [path]: { backupFileName, version: 1, backupTime } },
        },
    } as unknown as TranscriptRecord;
}

// A reader with no backups to offer — every seed must come from lineage or the authored Write.
const emptyReader: BackupReader = () => "";

test("test_getPreExecutionState_preserves_subdirectory_qualified_keys", () => {
    // Scenario: a script opens "tests/test_inventory.py"; the pre-state key must keep the
    // "tests/" prefix so the sandbox materializes the file where the script opens it.
    // Steps:
    // build records with a Write of /proj/tests/test_inventory.py and a run whose cwd is /proj
    // and whose code contains open("tests/test_inventory.py").
    const records = [buildWriteRecord("/proj/tests/test_inventory.py", "def test(): pass\n", "2026-01-01T00:00:01Z", "/proj")];
    const run: ScriptRun = {
        code: 'text = open("tests/test_inventory.py").read()',
        timestamp: new Date("2026-01-01T00:00:02Z"),
        cwd: new Path("/proj"),
    };
    // build the pre-state.
    const state = getPreExecutionState(run, records, emptyReader);
    // assert the state has the key "tests/test_inventory.py" and NOT "test_inventory.py".
    assert.ok(state.has("tests/test_inventory.py"));
    assert.ok(!state.has("test_inventory.py"));
});

test("test_getPreExecutionState_prefers_lineage_content_over_backups", () => {
    // Scenario: the reconstructed lineage at run time carries an Edit the last backup missed;
    // the pre-state must use the lineage content.
    // Steps:
    // build records with a Write of /proj/core.py and a later run; supply a reader whose backup
    // returns the stale pre-Edit content and a seedContent callback returning the post-Edit content.
    const records = [
        buildWriteRecord("/proj/core.py", "def add(): pass\n", "2026-01-01T00:00:01Z", "/proj"),
        buildSnapshotRecord("core.py", "core@v1", "2026-01-01T00:00:02Z"),
    ];
    const staleReader: BackupReader = () => "def add(): pass\n";
    const run: ScriptRun = { code: "print(1)", timestamp: new Date("2026-01-01T00:00:05Z"), cwd: new Path("/proj") };
    // build the pre-state with the callback.
    const state = getPreExecutionState(run, records, staleReader, () => "def add(): pass\n\ndef remove(): pass\n");
    // assert the state value for "core.py" is the post-Edit content.
    assert.equal(state.get("core.py"), "def add(): pass\n\ndef remove(): pass\n");
});

test("test_runScriptAgainstState_returns_files_the_script_creates", () => {
    // Scenario: the script writes a new file the pre-state never contained; the result includes it.
    // Steps:
    // run a script that writes "out.txt" against an empty-but-nonempty pre-state.
    const script = 'open("out.txt", "w").write("created\\n")\n';
    const preState = new Map([["keep.py", "x = 1\n"]]);
    const result = runScriptAgainstState(script, preState);
    // assert the result map contains "out.txt" with the written content.
    assert.ok(result !== undefined);
    assert.equal(result!.get("out.txt"), "created\n");
});

// runScriptAgainstState executes a script in a temp dir and returns modified file content.
test("test_runScriptAgainstState_applies_rename", () => {
    const script = `import re\ntext = open("demo.py").read()\ntext = re.sub(r"\\badd\\b", "record", text)\nopen("demo.py", "w").write(text)\n`;
    const preState = new Map([["demo.py", "def add():\n    add()"]]);
    const result = runScriptAgainstState(script, preState);
    assert.ok(result !== undefined);
    assert.equal(result!.get("demo.py"), "def record():\n    record()");
});

// Collect sandbox-SPAWN announcements while `action` runs (memo hits announce differently).
function collectSandboxSpawnLabels(action: () => void): string[] {
    const spawnLabels: string[] = [];
    setReconstructionProgressSink((event) => {
        if (event.label.startsWith(PROGRESS_LABEL_SANDBOX_SPAWN_PREFIX)) {
            spawnLabels.push(event.label);
        }
    });
    try {
        action();
    } finally {
        setReconstructionProgressSink(undefined);
    }
    return spawnLabels;
}

test("test_runScriptAgainstState_memoizes_identical_input", () => {
    // Scenario: two calls with byte-identical (script, seeded state) spawn ONE sandbox — the
    // second returns the memoized outcome (s84 in logs1.txt asked 208 times for 14 distinct
    // inputs; this memo is the fix).
    // Steps:
    // run the same transform twice, counting spawn announcements.
    const preState = new Map([["data.txt", "before\n"]]);
    const script = 'open("data.txt", "w").write("after\\n")\n';
    let firstResult: Map<string, string> | undefined;
    let secondResult: Map<string, string> | undefined;
    const spawnLabels = collectSandboxSpawnLabels(() => {
        firstResult = runScriptAgainstState(script, preState);
        secondResult = runScriptAgainstState(script, preState);
    });
    // one spawn, the same result object back, and the transform is correct.
    assert.equal(spawnLabels.length, 1);
    assert.equal(secondResult, firstResult);
    assert.equal(firstResult?.get("data.txt"), "after\n");
});

test("test_sandboxMemoDiskWrite_is_batched_and_flushed_at_end", () => {
    // Scenario: N distinct spawns below the batch size cause FEWER than N disk writes (the
    // O(N²)-write amplification fix), and the end-of-build flush persists every outcome.
    // Steps:
    // point memo persistence at a temp file (clears the in-memory memo).
    // drive 10 DISTINCT spawns (each a unique script -> no memo hit, one real spawn each).
    // read the on-disk memo BEFORE flushing: batching means it holds fewer than 10 outcomes.
    // flush, then re-read: the file now holds all 10.
    const memoFile = new Path(join(mkdtempSync(join(tmpdir(), "memo-batch-")), "memo.json"));
    configureSandboxMemoPersistence(memoFile);
    try {
        for (let index = 0; index < 10; index += 1) {
            // distinct script text -> distinct input key -> a real spawn (not a memo hit).
            runScriptAgainstState(`open("out.txt", "w").write("run-${index}")\n`, new Map());
        }
        const persistedBeforeFlush = existsSync(memoFile.toString())
            ? Object.keys(JSON.parse(readFileSync(memoFile.toString(), "utf8"))).length
            : 0;
        // Batched (batch size 64): 10 spawns trigger NO mid-run persist, so the file lags behind memory.
        assert.ok(persistedBeforeFlush < 10, `expected <10 persisted before flush, got ${persistedBeforeFlush}`);
        flushSandboxMemoToDisk();
        const persistedAfterFlush = Object.keys(JSON.parse(readFileSync(memoFile.toString(), "utf8"))).length;
        assert.equal(persistedAfterFlush, 10);
    } finally {
        // Restore memory-only mode so sibling tests keep their deterministic spawn counts.
        configureSandboxMemoPersistence(undefined);
    }
});

test("test_runScriptAgainstState_distinguishes_seeded_content", () => {
    // Scenario: same script, different seeded CONTENT — the memo must key on content, never on
    // path names or file counts.
    // Steps:
    // run one appending script over two different seeds.
    const script = 'data = open("data.txt").read()\nopen("data.txt", "w").write(data + "x\\n")\n';
    const firstResult = runScriptAgainstState(script, new Map([["data.txt", "a\n"]]));
    const secondResult = runScriptAgainstState(script, new Map([["data.txt", "b\n"]]));
    // each seed got its own execution and its own correct output.
    assert.equal(firstResult?.get("data.txt"), "a\nx\n");
    assert.equal(secondResult?.get("data.txt"), "b\nx\n");
});

test("test_runScriptAgainstState_memoizes_failed_runs", () => {
    // Scenario: a failing script memoizes too — its repeats must not re-pay the spawn (or its
    // 5-second timeout) for a run already known to fail.
    // Steps:
    // run a script that exits nonzero, twice, counting spawn announcements.
    const preState = new Map([["data.txt", "x\n"]]);
    const script = "raise SystemExit(1)\n";
    let firstResult: Map<string, string> | undefined;
    let secondResult: Map<string, string> | undefined;
    const spawnLabels = collectSandboxSpawnLabels(() => {
        firstResult = runScriptAgainstState(script, preState);
        secondResult = runScriptAgainstState(script, preState);
    });
    // one spawn; both calls report the failure as undefined.
    assert.equal(spawnLabels.length, 1);
    assert.equal(firstResult, undefined);
    assert.equal(secondResult, undefined);
});

// The on-disk shape of one persisted memo entry (`post: null` = memoized failure).
type PersistedOutcome = { post: Record<string, string> | null };

test("test_configureSandboxMemoPersistence_writes_new_outcomes_to_disk", () => {
    // Scenario: persistence is configured at an absent file; the first spawned outcome
    // lands in that JSON file.
    // Steps:
    // configure persistence at <tempdir>/memo.json (file does not exist yet).
    const tempDir = mkdtempSync(join(tmpdir(), "reveng-artifact-"));
    const memoFile = join(tempDir, "memo.json");
    try {
        configureSandboxMemoPersistence(new Path(memoFile));
        // run a script unique to this run (temp dir embedded in a comment, so a leaked
        // memo entry from another test can never satisfy the lookup), counting spawns.
        const script = `# ${tempDir}\nopen("out.txt", "w").write("persisted\\n")\n`;
        const spawnLabels = collectSandboxSpawnLabels(() => {
            runScriptAgainstState(script, new Map([["keep.py", "x = 1\n"]]));
        });
        // exactly one sandbox spawn happened.
        assert.equal(spawnLabels.length, 1);
        // persistence is batched now — flush so the single sub-batch outcome reaches disk.
        flushSandboxMemoToDisk();
        // the JSON file now exists, parses, and holds exactly one outcome whose post
        // carries the script-created file's path and content.
        const persisted = JSON.parse(readFileSync(memoFile, "utf8")) as Record<string, PersistedOutcome>;
        const outcomes = Object.values(persisted);
        assert.equal(outcomes.length, 1);
        assert.equal(outcomes[0]!.post?.["out.txt"], "persisted\n");
    } finally {
        configureSandboxMemoPersistence(undefined);
    }
});

test("test_configureSandboxMemoPersistence_seeds_memo_from_disk", () => {
    // Scenario: configuring persistence at a previously written file seeds the memo from
    // disk, so a run already persisted never spawns again — even across a memo clear.
    const tempDir = mkdtempSync(join(tmpdir(), "reveng-artifact-"));
    const fileA = join(tempDir, "memo-a.json");
    const fileB = join(tempDir, "memo-b.json");
    const script = `# ${tempDir}\nopen("data.txt", "w").write("after\\n")\n`;
    const preState = new Map([["data.txt", "before\n"]]);
    try {
        // Steps:
        // configure at file A (absent) and run once → one spawn, outcome persisted to A.
        configureSandboxMemoPersistence(new Path(fileA));
        let firstResult: Map<string, string> | undefined;
        const firstSpawns = collectSandboxSpawnLabels(() => {
            firstResult = runScriptAgainstState(script, preState);
        });
        assert.equal(firstSpawns.length, 1);
        // flush the batched outcome to file A before switching away (else A stays empty on disk).
        flushSandboxMemoToDisk();
        // configure at a different, absent file B → memo replaced with empty; the same
        // run must spawn again.
        configureSandboxMemoPersistence(new Path(fileB));
        const secondSpawns = collectSandboxSpawnLabels(() => {
            runScriptAgainstState(script, preState);
        });
        assert.equal(secondSpawns.length, 1);
        // configure back at file A → memo seeded from disk; the same run spawns ZERO times
        // and returns the first run's content.
        configureSandboxMemoPersistence(new Path(fileA));
        let seededResult: Map<string, string> | undefined;
        const thirdSpawns = collectSandboxSpawnLabels(() => {
            seededResult = runScriptAgainstState(script, preState);
        });
        assert.equal(thirdSpawns.length, 0);
        assert.deepEqual(seededResult, firstResult);
    } finally {
        configureSandboxMemoPersistence(undefined);
    }
});

test("test_persisted_failure_outcomes_round_trip", () => {
    // Scenario: a memoized FAILURE survives the disk round trip — it must stay
    // distinguishable from a cache miss (post: null on disk, 0 spawns after reseed).
    const tempDir = mkdtempSync(join(tmpdir(), "reveng-artifact-"));
    const memoFile = join(tempDir, "memo.json");
    const clearFile = join(tempDir, "memo-clear.json");
    const script = `# ${tempDir}\nraise SystemExit(1)\n`;
    const preState = new Map([["data.txt", "x\n"]]);
    try {
        // Steps:
        // configure at a fresh file; the failing run spawns once and yields undefined.
        configureSandboxMemoPersistence(new Path(memoFile));
        let firstResult: Map<string, string> | undefined;
        const firstSpawns = collectSandboxSpawnLabels(() => {
            firstResult = runScriptAgainstState(script, preState);
        });
        assert.equal(firstSpawns.length, 1);
        assert.equal(firstResult, undefined);
        // batched persistence — flush so the single failure outcome reaches disk.
        flushSandboxMemoToDisk();
        // the file's single persisted outcome records the failure as post: null.
        const persisted = JSON.parse(readFileSync(memoFile, "utf8")) as Record<string, PersistedOutcome>;
        const outcomes = Object.values(persisted);
        assert.equal(outcomes.length, 1);
        assert.equal(outcomes[0]!.post, null);
        // clear the memo (absent file), then configure back at the written file.
        configureSandboxMemoPersistence(new Path(clearFile));
        configureSandboxMemoPersistence(new Path(memoFile));
        // the failing run again: zero new spawns, result still undefined (a memoized
        // failure, not a miss — the sentinel proves the callback overwrote it).
        let seededResult: Map<string, string> | undefined = new Map();
        const secondSpawns = collectSandboxSpawnLabels(() => {
            seededResult = runScriptAgainstState(script, preState);
        });
        assert.equal(secondSpawns.length, 0);
        assert.equal(seededResult, undefined);
    } finally {
        configureSandboxMemoPersistence(undefined);
    }
});

test("test_resetSandboxMemoOnDisk_deletes_an_existing_memo_file", () => {
    // Scenario: resetSandboxMemoOnDisk removes a present memo file so the next load starts empty.
    const dir = mkdtempSync(join(tmpdir(), "memo-reset-"));
    const memoFile = join(dir, "memo.json");
    writeFileSync(memoFile, "{}");
    assert.ok(existsSync(memoFile));
    // Verify: after the reset the file is gone.
    resetSandboxMemoOnDisk(new Path(memoFile));
    assert.ok(!existsSync(memoFile));
});

test("test_resetSandboxMemoOnDisk_is_a_noop_when_the_memo_file_is_absent", () => {
    // Scenario: resetSandboxMemoOnDisk on a missing file does not throw (force delete).
    const dir = mkdtempSync(join(tmpdir(), "memo-reset-"));
    const memoFile = join(dir, "absent.json");
    assert.ok(!existsSync(memoFile));
    // Verify: no throw, and the file still does not exist.
    assert.doesNotThrow(() => resetSandboxMemoOnDisk(new Path(memoFile)));
    assert.ok(!existsSync(memoFile));
});

// --- item 34: deterministic synthetic changeIds -----------------------------------------------------

test("test_computeScriptExecutionChangeId_is_deterministic_for_same_run_and_target", () => {
    // Scenario: the step-timeline replay and the file-history replay each derive the changeId for
    // the same run+target independently; both derivations must yield the identical value.
    // Steps:
    // a run with a tool_use id and a target path exists.
    const run: ScriptRun = {
        code: "python3 apply_renames.py",
        timestamp: new Date("2026-07-01T20:53:49.772Z"),
        toolUseId: new Uuid("toolu_01GkePu7Mj4DmkPivZapZB8z"),
    };
    const target = new Path("/tmp/demo/core_inventory.py");
    // computing the id twice must yield the identical value.
    const firstChangeId = computeScriptExecutionChangeId(run, target);
    const secondChangeId = computeScriptExecutionChangeId(run, target);
    assert.equal(firstChangeId.toString(), secondChangeId.toString());
});

test("test_computeScriptExecutionChangeId_differs_per_target", () => {
    // Scenario: one run changing two files yields two distinct changeIds, so each file's
    // synthetic event stays individually addressable.
    // Steps:
    // one run, two different targets.
    const run: ScriptRun = {
        code: "python3 apply_renames.py",
        timestamp: new Date("2026-07-01T20:53:49.772Z"),
        toolUseId: new Uuid("toolu_01GkePu7Mj4DmkPivZapZB8z"),
    };
    const firstChangeId = computeScriptExecutionChangeId(run, new Path("/tmp/demo/core_inventory.py"));
    const secondChangeId = computeScriptExecutionChangeId(run, new Path("/tmp/demo/reports.py"));
    // the two ids must differ.
    assert.notEqual(firstChangeId.toString(), secondChangeId.toString());
});

test("test_computeScriptExecutionChangeId_embeds_tool_use_id", () => {
    // Scenario: the id's source segment is the run's tool_use id, so session attribution can
    // unwrap the id back to a tool_use the session index knows.
    const run: ScriptRun = {
        code: "python3 apply_renames.py",
        timestamp: new Date("2026-07-01T20:53:49.772Z"),
        toolUseId: new Uuid("toolu_01GkePu7Mj4DmkPivZapZB8z"),
    };
    const changeId = computeScriptExecutionChangeId(run, new Path("/tmp/demo/core_inventory.py"));
    // the id is the prefix, then the tool_use id, then the target path.
    assert.equal(changeId.toString(), "scriptRun:toolu_01GkePu7Mj4DmkPivZapZB8z:/tmp/demo/core_inventory.py");
});

test("test_computeScriptExecutionChangeId_falls_back_to_timestamp_without_tool_use_id", () => {
    // Scenario: a synthetic run no tool_use produced still gets a deterministic id, derived
    // from its epoch-ms timestamp (which never contains ":").
    const timestamp = new Date("2026-07-01T20:53:49.772Z");
    const run: ScriptRun = { code: "python3 apply_renames.py", timestamp };
    const changeId = computeScriptExecutionChangeId(run, new Path("/tmp/demo/core_inventory.py"));
    assert.equal(changeId.toString(), `scriptRun:${timestamp.getTime()}:/tmp/demo/core_inventory.py`);
});

test("test_resolveScriptRunChangeIdToSourceId_extracts_source_segment", () => {
    // Scenario: unwrapping a scriptRun changeId exposes the tool_use id the session index knows.
    assert.equal(resolveScriptRunChangeIdToSourceId("scriptRun:toolu_abc:/a/b.py"), "toolu_abc");
});

test("test_resolveScriptRunChangeIdToSourceId_returns_undefined_for_other_ids", () => {
    // Scenario: real record uuids and originalFile: seed ids are not scriptRun ids and must
    // pass through the resolver untouched.
    assert.equal(resolveScriptRunChangeIdToSourceId("0b7f2b4c-1234-4abc-8def-0123456789ab"), undefined);
    assert.equal(resolveScriptRunChangeIdToSourceId("originalFile:toolu_x"), undefined);
});

test("test_findScriptExecutionRuns_carries_the_tool_use_id", () => {
    // Scenario: a run parsed from a transcript record remembers which tool_use block produced
    // it, so the synthetic event's changeId can embed a session-attributable id.
    // Steps:
    // one assistant record with a Bash tool_use block.
    const records = [buildToolRecord(ToolName.Bash, { command: "python3 apply_renames.py" }, "2026-07-01T20:53:49.772Z")];
    // find the runs.
    const runs = findScriptExecutionRuns(records);
    // assert the run carries the block's id.
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.toolUseId?.toString(), "toolu_x");
});

test("test_scriptCodeMayWriteFiles_accepts_a_read_only_analysis_script", () => {
    // Scenario: the dominant recorded shape — a grep/count/print analysis script that only
    // reads files — must classify read-only so the sandbox is skipped (TASKS.md item 68).
    const script = 'import os\nimport re\nimport json\n'
        + 'text = open("ledger.py").read()\n'
        + 'hits = [line for line in text.splitlines() if re.search(r"def ", line)]\n'
        + 'print(json.dumps(len(hits)))\n';
    assert.equal(scriptCodeMayWriteFiles(script), false);
});

test("test_scriptCodeMayWriteFiles_flags_write_mode_opens", () => {
    // Scenario: literal "w"/"a" open modes are the classic write channel.
    assert.equal(scriptCodeMayWriteFiles('open("out.txt", "w").write("x")\n'), true);
    assert.equal(scriptCodeMayWriteFiles('open("log.txt", "a").write("x")\n'), true);
});

test("test_scriptCodeMayWriteFiles_flags_an_unprovable_open_mode", () => {
    // Scenario: a variable mode or nested-call arguments cannot be parsed cheaply — the
    // verdict must fall to may-write (a false may-write is harmless; the reverse is not).
    assert.equal(scriptCodeMayWriteFiles("open(p, mode)\n"), true);
    assert.equal(scriptCodeMayWriteFiles("open(os.path.join(a, b))\n"), true);
});

test("test_scriptCodeMayWriteFiles_accepts_read_mode_opens", () => {
    // Scenario: single-argument opens and literal read modes (incl. keyword-only forms)
    // stay read-only.
    assert.equal(scriptCodeMayWriteFiles('open("f.py", "r").read()\n'), false);
    assert.equal(scriptCodeMayWriteFiles('open("f.py", "rb").read()\n'), false);
    assert.equal(scriptCodeMayWriteFiles('open("f.py", encoding="utf-8").read()\n'), false);
});

test("test_scriptCodeMayWriteFiles_flags_pathlib_and_os_write_methods", () => {
    // Scenario: pathlib write methods, Path.open (whose FIRST argument is the mode), and
    // os rename/remove are write channels.
    assert.equal(scriptCodeMayWriteFiles('from pathlib import Path\nPath("f").write_text("x")\n'), true);
    assert.equal(scriptCodeMayWriteFiles('from pathlib import Path\nPath("f").open("w")\n'), true);
    assert.equal(scriptCodeMayWriteFiles('import os\nos.rename("a", "b")\n'), true);
    assert.equal(scriptCodeMayWriteFiles('import os\nos.remove("a")\n'), true);
});

test("test_scriptCodeMayWriteFiles_flags_unknown_and_escaping_imports", () => {
    // Scenario: a non-allowlisted import may be a seeded local module whose top level
    // writes (the s34 script-indirection family); shutil writes outright; a from-import
    // can smuggle a writing name out of a safe root; exec escapes static analysis.
    assert.equal(scriptCodeMayWriteFiles('import shutil\nshutil.move("a", "b")\n'), true);
    assert.equal(scriptCodeMayWriteFiles("import apply_renames\n"), true);
    assert.equal(scriptCodeMayWriteFiles('from os import remove\nremove("a")\n'), true);
    assert.equal(scriptCodeMayWriteFiles("exec(compiled)\n"), true);
});
