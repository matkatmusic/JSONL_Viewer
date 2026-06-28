import { test } from "node:test";
import assert from "node:assert/strict";
import {
    isScriptExecutionRun,
    parseScriptFileRefs,
    runScriptAgainstState,
} from "../src/reconstruction_script_execution.ts";
import { replayEvents } from "../src/reconstruction_replay.ts";
import { linesTextOf } from "../src/reconstruction_branches.ts";
import { BlockType, EventKind, ToolName } from "../src/structures/vocabulary.ts";
import type { ToolUseBlock } from "../src/structures/content-blocks.ts";
import { Path, Uuid } from "../src/structures/domain.ts";
import type { FileEvent } from "../src/reconstruction_engine.ts";

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

// runScriptAgainstState executes a script in a temp dir and returns modified file content.
test("test_runScriptAgainstState_applies_rename", () => {
    const script = `import re\ntext = open("demo.py").read()\ntext = re.sub(r"\\badd\\b", "record", text)\nopen("demo.py", "w").write(text)\n`;
    const preState = new Map([["demo.py", "def add():\n    add()"]]);
    const result = runScriptAgainstState(script, preState);
    assert.ok(result !== undefined);
    assert.equal(result!.get("demo.py"), "def record():\n    record()");
});
