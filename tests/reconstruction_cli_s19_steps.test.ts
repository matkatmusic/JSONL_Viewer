import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runCli } from "../src/reconstruction_cli.ts";
import {
    countStepsInTranscript,
    reconstructStepStates,
    snapshotFileText,
    stripTrailingNewline,
    someStepReproduces,
} from "../src/reconstruction_steps.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import {
    createSidecarReader,
    getDefaultFileHistoryRoot,
    findSessionId,
} from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S19_JSONL } from "./fixtures.ts";

// The authoritative per-step disk snapshots captured by the scenario runner when s19 was executed.
// The runner captures one folder per CODE-CHANGE instruction (keeping the original instruction number),
// so s19 has step-001 (write), step-002 (user tweak), step-003 (subtract), step-006 (multiply).
const S19_STEP_STATES_DIR =
    "/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s19-user-edit-conv-rewind/.step_states";

// The code-change step numbers the runner captured, read from the folder names (e.g. [1, 2, 3, 6]).
function capturedStepNumbers(): number[] {
    return readdirSync(S19_STEP_STATES_DIR)
        .filter((name) => name.startsWith("step-"))
        .map((name) => Number(name.slice("step-".length)))
        .sort((a, b) => a - b);
}

// The source files the reconstruction engine produces for s19 (the only files to diff; ignore
// manifest.json, .pytest_cache/, __pycache__/ in the step folders).
const S19_SOURCE_FILES = ["scenario19.py", "tests/test_scenario19.py"] as const;

// The engine reconstructs to absolute run-scenario temp paths, so match step-state files by suffix.
const ADD_ONLY = "def add(a, b):\n    return a + b";
const FINAL_SCENARIO =
    "def add(a, b):\n    return a + b\n\n\ndef multiply(a, b):\n    return a * b\n# user tweak\n\n\ndef subtract(a, b):\n    return a - b";

// The real on-disk file-history reader for this transcript's session, built exactly as the CLI builds it.
function realReader(records: ReturnType<typeof loadRecords>): BackupReader {
    return createSidecarReader(findSessionId(records)!, getDefaultFileHistoryRoot());
}

// Read the authoritative source-file contents of one .step_states/step-NNN folder.
function readStepStateSourceFiles(stepNumber: number): Map<string, string> {
    const label = `step-${String(stepNumber).padStart(3, "0")}`;
    const files = new Map<string, string>();
    for (const relativePath of S19_SOURCE_FILES) {
        files.set(relativePath, readFileSync(`${S19_STEP_STATES_DIR}/${label}/${relativePath}`, "utf8"));
    }
    return files;
}

test("test_countStepsInTranscript_returns_five_code_change_steps_for_s19", () => {
    // Behavior: s19 has five chronological code-change events — scenario19.py write, test write, the user
    // tweak, the subtract edit, and the multiply edit — so the engine reports five steps.
    // Step: load the s19 transcript records.
    const records = loadRecords(S19_JSONL);
    // Step: count the code-change steps.
    const stepCount = countStepsInTranscript(records, realReader(records));
    // Verify: exactly five steps.
    assert.equal(stepCount, 5);
});

test("test_first_step_holds_scenario_file_before_the_test_file_is_written", () => {
    // Behavior: the first code change writes scenario19.py (bare `add`); the test file does not exist yet
    // at that instant (it is the second write), so the first step's repo snapshot has only scenario19.py.
    // Step: produce every step's repo snapshot.
    const records = loadRecords(S19_JSONL);
    const steps = reconstructStepStates(records, realReader(records));
    // Verify: the first step has the bare add definition...
    assert.equal(snapshotFileText(steps[0]!, "scenario19.py"), ADD_ONLY);
    // ...and the test file is absent at the first step.
    assert.equal(snapshotFileText(steps[0]!, "tests/test_scenario19.py"), undefined);
});

test("test_each_step_states_folder_content_is_reproduced_by_some_engine_step", () => {
    // Behavior: every authoritative .step_states/step-NNN code-change disk state is reproduced
    // byte-for-byte by some engine step. This is the per-step diff against ground truth.
    // Step: produce every engine step snapshot.
    const records = loadRecords(S19_JSONL);
    const steps = reconstructStepStates(records, realReader(records));
    // Step: for each captured code-change step folder, confirm an engine step reproduces it.
    for (const stepNumber of capturedStepNumbers()) {
        const groundTruth = readStepStateSourceFiles(stepNumber);
        assert.ok(
            someStepReproduces(steps, groundTruth),
            `no engine step reproduces .step_states/step-${String(stepNumber).padStart(3, "0")}`,
        );
    }
});

test("test_final_step_byte_matches_last_code_change_ground_truth", () => {
    // Behavior: the last engine step is the final disk state — add → multiply → tweak → subtract — and
    // byte-matches the last captured code-change folder, step-006 (modulo the single trailing newline the
    // engine drops at replay).
    // Step: produce the steps and take the last one.
    const records = loadRecords(S19_JSONL);
    const steps = reconstructStepStates(records, realReader(records));
    const finalStep = steps[steps.length - 1]!;
    // Verify: scenario19.py matches the final code-change ground truth (step-006).
    const lastCapturedStep = capturedStepNumbers()[capturedStepNumbers().length - 1]!;
    const groundTruthScenario = readStepStateSourceFiles(lastCapturedStep).get("scenario19.py")!;
    assert.equal(snapshotFileText(finalStep, "scenario19.py"), stripTrailingNewline(groundTruthScenario));
    assert.equal(snapshotFileText(finalStep, "scenario19.py"), FINAL_SCENARIO);
});

test("test_cli_count_steps_flag_prints_step_count", () => {
    // Behavior: running the CLI with --count-steps prints just the step count.
    // Step: run the CLI on the s19 transcript with the count-steps flag.
    const output = runCli([S19_JSONL, "--count-steps"]);
    // Verify: the output is the integer five.
    assert.equal(output.trim(), "5");
});

test("test_cli_step_flag_prints_first_step_with_scenario_file_only", () => {
    // Behavior: --step 1 prints the repo snapshot after the first code change — scenario19.py with the
    // bare add definition, and no test file yet.
    // Step: run the CLI for step 1.
    const output = runCli([S19_JSONL, "--step", "1"]);
    // Verify: the scenario file header and the bare add definition are present...
    assert.match(output, /### .*scenario19\.py/);
    assert.ok(output.includes("def add(a, b):\n    return a + b"));
    // ...and the test file is absent at step 1.
    assert.ok(!output.includes("test_scenario19.py"));
});

test("test_cli_step_flag_prints_final_step_with_multiply_and_subtract", () => {
    // Behavior: --step 5 prints the final disk state, including the post-rewind multiply edit and the
    // off-branch subtract that survives on disk, plus the test file.
    // Step: run the CLI for the final step.
    const output = runCli([S19_JSONL, "--step", "5"]);
    // Verify: the final state has add, multiply, the user tweak, the surviving subtract, and the test file.
    for (const expected of ["def add", "def multiply", "# user tweak", "def subtract", "test_scenario19.py"]) {
        assert.ok(output.includes(expected), `expected step 5 output to contain ${expected}`);
    }
});
