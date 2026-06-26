// Scenario coverage checker: run every executed scenario through the engine per code-change step and diff
// each engine step against its captured `.step_states` ground truth. On a mismatch, report the scenario,
// the instruction-numbered step folder, the differing file + first differing line, and the best-matching
// engine step's triggering JSONL line. Pass/fail is "some engine step reproduces this folder byte-for-byte"
// — never a positional alignment between engine steps and folders (their counts can differ). Run:
//   npx tsx scripts/check_scenario_coverage.ts
// Discovery/IO lives in coverage_scenarios.ts, comparison/selection in coverage_compare.ts.
// Design: plans/i-need-a-script-peppy-twilight.md (Phase 1).

import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadTranscript } from "../src/parse/loadTranscript.ts";
import {
    reconstructStepStates,
    reconstructStepChanges,
    stripTrailingNewline,
    snapshotFileText,
    someStepReproduces,
    type RepoSnapshot,
    type StepChange,
} from "../src/reconstruction_steps.ts";
import { buildSidecarReader } from "./coverage_sidecar.ts";
import { Path } from "../src/structures/domain.ts";
import {
    enableProvenance,
    disableProvenance,
    drainProvenance,
    type ProvenanceEntry,
} from "../src/reconstruction_provenance.ts";
import {
    listCoveredScenarios,
    findUncovered,
    buildUuidLineIndex,
    readStepStateFiles,
    stepFolders,
    stepNumberOf,
    type CoveredScenario,
} from "./coverage_scenarios.ts";
import {
    firstLineDifference,
    firstDifferingFile,
    selectBestEngineStep,
} from "./coverage_compare.ts";

// One step folder the engine failed to reproduce: the folder number, a best-effort JSONL-line lead, a
// first-line diff against the best-matching engine step, and the provenance stages that touched the
// differing file (empty when none).
export type StepMismatch = { stepNum: number; jsonlLine: string; diff: string; provenance: string };

// Whether a provenance entry's target is the repo-relative differing file (matched on a path boundary).
function targetMatchesFile(target: Path, differingFile: string): boolean {
    const path = target.toString();
    return path === differingFile || path.endsWith(`/${differingFile}`);
}

// One provenance entry as a line: "<stage>: <detail> (changeId …)".
function formatProvenanceEntry(entry: ProvenanceEntry): string {
    const changeId = entry.changeId ? ` (changeId ${entry.changeId})` : "";
    return `${entry.stage}: ${entry.detail}${changeId}`;
}

// The provenance entries that touched the differing file at or before the step, formatted one per line;
// "" when none match. Pure (no engine dependency) — the stage that actually fires per step is captured
// during reconstruction and passed in.
export function renderStepProvenance(
    entries: ProvenanceEntry[],
    differingFile: string,
    stepTime: Date,
): string {
    const matching = entries.filter(
        (entry) =>
            targetMatchesFile(entry.target, differingFile) &&
            (entry.when === undefined || entry.when.getTime() <= stepTime.getTime()),
    );
    return matching.map(formatProvenanceEntry).join("\n");
}

// A scenario's per-step result: how many captured folders some engine step reproduced, and the misses.
export type ScenarioResult = {
    scenario: CoveredScenario;
    passed: number;
    total: number;
    mismatches: StepMismatch[];
};


// The first changeId of the best step that resolves to a JSONL line, formatted; a sentinel when none do
// (a seeded/synthetic revision has no producing record).
function jsonlLineFor(change: StepChange | undefined, uuidLineIndex: Map<string, number>): string {
    for (const changeId of change?.changeIds ?? []) {
        const line = uuidLineIndex.get(changeId.toString());
        if (line !== undefined) {
            return `line ${line}`;
        }
    }
    return "(seeded — no JSONL line)";
}

// A one-line description of where the best engine step diverges from the ground-truth file.
function describeDiff(file: string, expected: string, actual: string): string {
    const lineDiff = firstLineDifference(expected, actual);
    if (lineDiff === undefined) {
        return `${file} (file absent or only-trailing difference)`;
    }
    return `${file} @line ${lineDiff.lineNo}: expected ${JSON.stringify(lineDiff.expected)} got ${JSON.stringify(lineDiff.actual)}`;
}

// Build the mismatch record for one failing step folder: the best-matching engine step drives the diff and
// the JSONL-line lead.
function buildStepMismatch(
    stepNum: number,
    groundTruth: ReadonlyMap<string, string>,
    steps: RepoSnapshot[],
    stepChanges: StepChange[],
    uuidLineIndex: Map<string, number>,
    provenance: ProvenanceEntry[],
): StepMismatch {
    if (steps.length === 0) {
        const file = [...groundTruth.keys()][0] ?? "(folder empty)";
        return {
            stepNum,
            jsonlLine: "(no engine steps)",
            diff: `${file}: engine produced 0 steps (scenario may need a baseline session excluded)`,
            provenance: "",
        };
    }
    const best = selectBestEngineStep(steps, groundTruth);
    const file = firstDifferingFile(steps[best]!, groundTruth) ?? [...groundTruth.keys()][0]!;
    const expected = stripTrailingNewline(groundTruth.get(file)!);
    const diff = describeDiff(file, expected, snapshotFileText(steps[best]!, file) ?? "");
    const stepProvenance = renderStepProvenance(provenance, file, stepChanges[best]!.when);
    return { stepNum, jsonlLine: jsonlLineFor(stepChanges[best], uuidLineIndex), diff, provenance: stepProvenance };
}

// Run one scenario: reconstruct its steps once, then for each captured folder record PASS (some engine step
// reproduces it) or a mismatch.
export function checkScenario(scenario: CoveredScenario): ScenarioResult {
    const records = scenario.jsonlPaths.flatMap((path) => loadTranscript(path.toString()));
    const reader = buildSidecarReader(records);
    const uuidLineIndex = buildUuidLineIndex(scenario.jsonlPaths);
    enableProvenance();
    const steps = reconstructStepStates(records, reader);
    const provenance = drainProvenance();
    disableProvenance();
    const stepChanges = reconstructStepChanges(records, reader);
    const mismatches: StepMismatch[] = [];
    let passed = 0;
    const folders = stepFolders(scenario.stepStatesDir);
    for (const folder of folders) {
        const groundTruth = readStepStateFiles(join(scenario.stepStatesDir, folder));
        if (someStepReproduces(steps, groundTruth)) {
            passed += 1;
            continue;
        }
        mismatches.push(
            buildStepMismatch(stepNumberOf(folder), groundTruth, steps, stepChanges, uuidLineIndex, provenance),
        );
    }
    return { scenario, passed, total: folders.length, mismatches };
}

// Run a scenario, turning any thrown error into an ERROR result (one synthetic mismatch) so one bad scenario
// never aborts the sweep.
export function checkScenarioResilient(scenario: CoveredScenario): ScenarioResult {
    try {
        return checkScenario(scenario);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            scenario,
            passed: 0,
            total: 1,
            mismatches: [{ stepNum: 0, jsonlLine: "(error)", diff: `ERROR: ${message}`, provenance: "" }],
        };
    }
}

// Print one scenario's row in the coverage matrix, plus a line per mismatch.
function printResult(result: ScenarioResult): void {
    const status = result.mismatches.length === 0 ? "OK  " : "FAIL";
    console.log(`${status} ${result.scenario.scenarioId.padEnd(5)} ${result.passed}/${result.total}  ${result.scenario.dirName}`);
    for (const mismatch of result.mismatches) {
        console.log(`       step ${mismatch.stepNum}  ${mismatch.jsonlLine}  ${mismatch.diff}`);
        for (const line of mismatch.provenance.split("\n").filter((entry) => entry.length > 0)) {
            console.log(`         ↳ ${line}`);
        }
    }
}

// Sweep every covered scenario (or just the one named by argv[2], matched on scenarioId or dir name), print
// the matrix and the uncovered list, and exit 1 when any covered step failed or errored. Exit 2 when a name
// filter matches nothing.
function main(): void {
    const executedRoot = new URL("../scenarios/executed/", import.meta.url);
    const filter = process.argv[2];
    const covered = listCoveredScenarios().filter(
        (scenario) => filter === undefined || scenario.scenarioId === filter || scenario.dirName === filter,
    );
    if (covered.length === 0 && filter !== undefined) {
        console.error(`no covered scenario matches "${filter}"`);
        process.exit(2);
    }
    const results = covered.map(checkScenarioResilient);
    for (const result of results) {
        printResult(result);
    }
    if (filter === undefined) {
        const uncovered = findUncovered(executedRoot, covered);
        console.log(`\nUncovered (no .step_states): ${uncovered.length === 0 ? "none" : uncovered.join(", ")}`);
    }
    const failed = results.filter((result) => result.mismatches.length > 0);
    console.log(`${results.length - failed.length}/${results.length} scenarios fully reproduced.`);
    process.exit(failed.length > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
