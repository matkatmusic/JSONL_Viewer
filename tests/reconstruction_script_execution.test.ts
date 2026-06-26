import { test } from "node:test";
import assert from "node:assert/strict";
import {
    parseRenameSubs,
    parseScriptTargets,
    applyRenameSubs,
    isScriptExecutionRun,
    findScriptExecutionRuns,
    deriveRenameSubs,
} from "../src/reconstruction_script_execution.ts";
import { replayEvents } from "../src/reconstruction_replay.ts";
import { linesTextOf } from "../src/reconstruction_branches.ts";
import { BlockType, EventKind, ToolName } from "../src/structures/vocabulary.ts";
import type { ToolUseBlock } from "../src/structures/content-blocks.ts";
import { Path, Uuid } from "../src/structures/domain.ts";
import type { FileEvent } from "../src/reconstruction_engine.ts";
import { jsonlPathsForScenario, loadRecords } from "./utilities.ts";
import {
    createSidecarReader,
    getDefaultFileHistoryRoot,
    findSessionId,
} from "../src/reconstruction_sidecar.ts";

// A synthetic tool_use block of `name` carrying `input` — for the run-detection predicate.
function toolUse(name: ToolName, input: Record<string, unknown>): ToolUseBlock {
    return { type: BlockType.tool_use, id: new Uuid("toolu_x"), name, input } as unknown as ToolUseBlock;
}

// The merged s37 records and an on-disk sidecar reader for its session.
function s37() {
    const records = jsonlPathsForScenario("s37").flatMap((path) => loadRecords(path.toString()));
    const reader = createSidecarReader(findSessionId(records)!, getDefaultFileHistoryRoot());
    return { records, reader };
}

// The s37 renames.csv (line 117), verbatim.
const S37_CSV = "old,new\nadd_entry,record_entry\nrm_entry,remove_entry\n";

// The s37 first run's inline code (line 158): relative paths, literal TARGETS list.
const S37_CODE_RELATIVE = `import csv, re

TARGETS = ["ledger.py", "tests/test_ledger.py"]

with open("renames.csv") as f:
    renames = [(r["old"], r["new"]) for r in csv.DictReader(f)]
`;

// The s37 second run's inline code (line 162): absolute BASE + comprehension over the literal list.
const S37_CODE_ABSOLUTE = `import csv, re, os

BASE = "/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.d9ezoq5d"
TARGETS = [os.path.join(BASE, p) for p in ["ledger.py", "tests/test_ledger.py"]]
`;

// C2 — each old,new row becomes a substitution; the header row is dropped.
test("test_parseRenameSubs_reads_each_old_new_row", () => {
    assert.deepEqual(parseRenameSubs(S37_CSV), [
        { old: "add_entry", new: "record_entry" },
        { old: "rm_entry", new: "remove_entry" },
    ]);
});

// C2 — a blank trailing line (or stray blank rows) is ignored, not parsed into an empty sub.
test("test_parseRenameSubs_ignores_a_blank_trailing_line", () => {
    assert.deepEqual(parseRenameSubs("old,new\nadd_entry,record_entry\n\n"), [
        { old: "add_entry", new: "record_entry" },
    ]);
});

// C3 — the quoted relative target paths are extracted from a literal TARGETS list.
test("test_parseScriptTargets_extracts_the_quoted_paths_from_a_literal_list", () => {
    assert.deepEqual(
        parseScriptTargets(S37_CODE_RELATIVE).map((path) => path.toString()),
        ["ledger.py", "tests/test_ledger.py"],
    );
});

// C3 — the same relative names are extracted from a comprehension form; the absolute BASE (a bare
// variable, not a quoted literal) is ignored.
test("test_parseScriptTargets_extracts_relative_paths_ignoring_absolute_base", () => {
    assert.deepEqual(
        parseScriptTargets(S37_CODE_ABSOLUTE).map((path) => path.toString()),
        ["ledger.py", "tests/test_ledger.py"],
    );
});

// C6a — substitutions rewrite only whole tokens: `add_entry` -> `record_entry`, but a token that
// merely contains it (`readd_entry`) is left untouched.
test("test_applyRenameSubs_renames_only_whole_tokens", () => {
    const before = ["def add_entry():", "def readd_entry():", "    add_entry()"];
    const after = applyRenameSubs(before, [{ old: "add_entry", new: "record_entry" }]);
    assert.deepEqual(after, ["def record_entry():", "def readd_entry():", "    record_entry()"]);
});

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

// C5 — over the real s37 transcript, the two ctx_execute rename runs are found and each derives the
// four whole-token subs from the run-time CSV (recovered from the file-history backup, not the stale
// 2-row transcript Write).
test("test_deriveRenameSubs_recovers_the_four_s37_subs_from_the_run_csv", () => {
    const { records, reader } = s37();
    const renameRuns = findScriptExecutionRuns(records).filter(
        (run) => deriveRenameSubs(run, records, reader) !== undefined,
    );
    assert.equal(renameRuns.length, 2);
    assert.deepEqual(deriveRenameSubs(renameRuns[0]!, records, reader), [
        { old: "add_entry", new: "record_entry" },
        { old: "rm_entry", new: "remove_entry" },
        { old: "tot_debits", new: "total_debits" },
        { old: "tot_credits", new: "total_credits" },
    ]);
});
