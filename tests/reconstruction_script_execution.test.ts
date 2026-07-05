import { test } from "node:test";
import assert from "node:assert/strict";
import {
    findScriptExecutionRuns,
    getPreExecutionState,
    isScriptExecutionRun,
    parseScriptFileRefs,
    runScriptAgainstState,
    PROGRESS_LABEL_SANDBOX_SPAWN_PREFIX,
    type ScriptRun,
} from "../src/reconstruction_script_execution.ts";
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
