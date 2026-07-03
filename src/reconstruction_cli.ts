// Runnable entry point for the reconstruction engine. Reconstructs every file a
// transcript touches (or one --target) and prints the history (--verbose) or its
// changes (--diff). Defaults to showing ALL conversation branches; --surviving,
// --list-branches and --branch <id> select among them. Design:
// plans/reconstruction-engine-design.md.

import { fileURLToPath } from "node:url";
import { loadTranscript } from "./parse/loadTranscript.ts";
import { Path } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import {
    reconstructBranches,
    type BranchedReconstruction,
    type FileHistory,
    type FileRevision,
} from "./reconstruction_engine.ts";
import { findBranchById, shortUuid } from "./reconstruction_branch.ts";
import { isGenuineUserPrompt } from "./reconstruction_tree.ts";
import { recordVerdict } from "./reconstruction_parse_lines.ts";
import {
    buildStepSnapshots,
    summarizeBranches,
    buildReconstructionDocument,
} from "./reconstruction_json.ts";
import { renderDiff, renderVerbose } from "./reconstruction_render.ts";
import {
    renderBranchSummary,
    renderHistoryList,
} from "./reconstruction_render_list.ts";
import { renderGraphs } from "./reconstruction_graph_render.ts";
import {
    countStepsInTranscript,
    reconstructStepStates,
    renderRepoSnapshot,
} from "./reconstruction_steps.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";
import { buildSidecarReader } from "./reconstruction_sidecar_reader.ts";
import { parseTraceArgs, runTrace } from "./reconstruction_cli_trace.ts";

const USAGE =
    "usage: reconstruction_cli <transcript.jsonl> [--target|--file <path>] [--count-steps|--step <n>] [--verbose|--diff] [--graphConvo|--graphFile|--surviving|--list-branches|--branch <id>] [--json] [--allRecords]";

export type CliOptions = {
    jsonlPath: string;
    target: Path | undefined;
    branch: string | undefined;
    countSteps: boolean;
    stepNumber: number | undefined;
    verbose: boolean;
    diff: boolean;
    surviving: boolean;
    listBranches: boolean;
    graphConvo: boolean;
    graphFile: boolean;
    json: boolean;
    allRecords: boolean;
};

// Pull a value-taking flag (e.g. `--target <path>`) out of argv: return its value (undefined when
// absent) and argv with both the flag and its value removed, so the positional transcript-path scan
// never mistakes a flag value for the path.
function extractValueFlag(
    argv: string[],
    flag: string,
): { value: string | undefined; rest: string[] } {
    const at = argv.indexOf(flag);
    if (at < 0) {
        return { value: undefined, rest: argv };
    }
    const value = argv[at + 1];
    const rest = argv.filter((_, index) => index !== at && index !== at + 1);
    return { value, rest };
}

// The graph flags: honor explicit --graphConvo/--graphFile; otherwise default BOTH on when the CLI was
// given no other intent (no selector and no content-view modifier) — the new global bare default that
// prints both DAGs for every scenario.
function resolveGraphFlags(
    rest: string[],
    branch: string | undefined,
    surviving: boolean,
    listBranches: boolean,
    verbose: boolean,
    diff: boolean,
): { convo: boolean; file: boolean } {
    const convo = rest.includes("--graphConvo");
    const file = rest.includes("--graphFile");
    const explicit = convo || file;
    if (explicit) {
        return { convo, file };
    }
    const hasOtherIntent = surviving || listBranches || branch !== undefined || verbose || diff;
    if (hasOtherIntent) {
        return { convo: false, file: false };
    }
    return { convo: true, file: true };
}

// Parse argv: a required transcript path, the value-taking flags (--target, --branch), and the
// boolean view flags. Throws the usage message when no transcript path is given.
export function parseArgs(argv: string[]): CliOptions {
    const targetFlag = extractValueFlag(argv, "--target");
    const fileAlias = targetFlag.value === undefined ? extractValueFlag(targetFlag.rest, "--file") : targetFlag;
    const branchFlag = extractValueFlag(fileAlias.rest, "--branch");
    const stepFlag = extractValueFlag(branchFlag.rest, "--step");
    const rest = stepFlag.rest;
    const jsonlPath = rest.find((arg) => !arg.startsWith("--"));
    if (!jsonlPath) {
        throw new Error(USAGE);
    }
    const stepNumber = parseStepNumber(stepFlag.value);
    const countSteps = rest.includes("--count-steps");
    const surviving = rest.includes("--surviving");
    const listBranches = rest.includes("--list-branches");
    const verbose = rest.includes("--verbose");
    const diff = rest.includes("--diff");
    const allRecords = rest.includes("--allRecords");
    const json = rest.includes("--json") || allRecords;
    const graphs = resolveGraphFlags(rest, branchFlag.value, surviving, listBranches, verbose, diff);
    return {
        jsonlPath,
        target: fileAlias.value !== undefined ? new Path(fileAlias.value) : undefined,
        branch: branchFlag.value,
        countSteps,
        stepNumber,
        verbose,
        diff,
        surviving,
        listBranches,
        graphConvo: graphs.convo,
        graphFile: graphs.file,
        json,
        allRecords,
    };
}

// Parse the `--step <n>` value into a 1-based step number, or undefined when the flag is absent. A
// present-but-non-integer value is a usage error (caught here so the positional path scan never sees it).
function parseStepNumber(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const stepNumber = Number(value);
    if (!Number.isInteger(stepNumber)) {
        throw new Error(USAGE);
    }
    return stepNumber;
}

// Render histories in the verbose/diff mode, each under its `### <path>` header.
function renderHistories(
    histories: FileHistory[],
    render: (revisions: FileRevision[]) => string,
): string {
    const sections = histories.map((history) => `### ${history.target}\n${render(history.revisions)}`);
    return sections.join("\n\n");
}

// The histories matching --target (by exact final path), or all of them when no --target is given.
function filterByTarget(
    histories: FileHistory[],
    target: Path | undefined,
): FileHistory[] {
    if (target === undefined) {
        return histories;
    }
    return histories.filter((history) => history.target.toString() === target.toString());
}

// Render a chosen set of histories in the selected view (list/verbose/diff), narrowed to --target
// when one is given. Shared by every branch view so the flags compose uniformly.
function renderChosen(histories: FileHistory[], options: CliOptions): string {
    const chosen = filterByTarget(histories, options.target);
    if (options.diff) {
        return renderHistories(chosen, renderDiff);
    }
    if (options.verbose) {
        return renderHistories(chosen, renderVerbose);
    }
    return renderHistoryList(chosen);
}

// The selectable branch ids for the `--branch` error message: "surviving" plus each rewound tip.
function listAvailableBranchIds(branched: BranchedReconstruction): string {
    const ids: string[] = [];
    if (branched.survivingTip !== undefined) {
        ids.push(`surviving (#${shortUuid(branched.survivingTip)})`);
    }
    for (const entry of branched.rewound) {
        ids.push(`#${shortUuid(entry.tip)}`);
    }
    return ids.join(", ");
}

// Render exactly one branch, selected by `--branch <id>` (a tip short id, or the literal
// "surviving"). Throws the usage message plus the available ids when the id matches no branch.
function renderOneBranch(
    branched: BranchedReconstruction,
    options: CliOptions,
): string {
    const histories = findBranchById(branched, options.branch!);
    if (histories === undefined) {
        throw new Error(`${USAGE}\navailable branches: ${listAvailableBranchIds(branched)}`);
    }
    return renderChosen(histories, options);
}

// Render one code-change step's full-repo snapshot, selected by `--step <n>` (1-based). Throws the usage
// message plus the valid range when the step number is out of bounds.
function renderStep(
    records: TranscriptRecord[],
    reader: BackupReader | undefined,
    stepNumber: number,
): string {
    const steps = reconstructStepStates(records, reader);
    if (stepNumber < 1 || stepNumber > steps.length) {
        throw new Error(`${USAGE}\nstep must be in 1..${steps.length}`);
    }
    return renderRepoSnapshot(steps[stepNumber - 1]!);
}

// Render the reconstruction as JSON, composing with the existing selectors. --allRecords dumps every
// parsed record enriched with the engine's per-line classification; --step emits one step's file map;
// --branch / --list-branches narrow as their text twins do; bare --json emits the full document.
function renderJson(
    records: TranscriptRecord[],
    reader: BackupReader | undefined,
    options: CliOptions,
): string {
    if (options.allRecords) {
        // Full body + the engine's per-line classification on each record (the deep-dump twin of the
        // document's compact lineVerdicts). Length stays records.length; line-aligned by array order.
        const enriched = records.map((record) => ({
            ...record,
            verdict: recordVerdict(record),
            isGenuinePrompt: isGenuineUserPrompt(record),
        }));
        return JSON.stringify(enriched, null, 2);
    }
    if (options.stepNumber !== undefined) {
        const steps = buildStepSnapshots(records, reader, options.target);
        if (options.stepNumber < 1 || options.stepNumber > steps.length) {
            throw new Error(`${USAGE}\nstep must be in 1..${steps.length}`);
        }
        return JSON.stringify(steps[options.stepNumber - 1]!.files, null, 2);
    }
    const branched = reconstructBranches(records, reader);
    if (options.branch !== undefined) {
        const histories = findBranchById(branched, options.branch);
        if (histories === undefined) {
            throw new Error(`${USAGE}\navailable branches: ${listAvailableBranchIds(branched)}`);
        }
        return JSON.stringify(filterByTarget(histories, options.target), null, 2);
    }
    if (options.listBranches) {
        return JSON.stringify(summarizeBranches(records), null, 2);
    }
    return JSON.stringify(buildReconstructionDocument(records, branched, reader, options.target), null, 2);
}

// Load the transcript and render the chosen view. The bare default (no flags) prints both DAGs; the
// graph flags take precedence, then the branch selectors, then the surviving content view (the
// back-compat path for --surviving and for --verbose/--diff with no selector).
export function runCli(argv: string[]): string {
    const traced = parseTraceArgs(argv);
    if (traced !== undefined) return runTrace(traced);
    const options = parseArgs(argv);
    const records = loadTranscript(options.jsonlPath);
    const reader = buildSidecarReader(records);
    if (options.json) {
        return renderJson(records, reader, options);
    }
    if (options.countSteps) {
        return String(countStepsInTranscript(records, reader));
    }
    if (options.stepNumber !== undefined) {
        return renderStep(records, reader, options.stepNumber);
    }
    if (options.graphConvo || options.graphFile) {
        return renderGraphs(records, { convo: options.graphConvo, file: options.graphFile }, reader);
    }
    const branched = reconstructBranches(records, reader);
    if (options.listBranches) {
        return renderBranchSummary(branched);
    }
    if (options.branch !== undefined) {
        return renderOneBranch(branched, options);
    }
    return renderChosen(branched.surviving, options);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(runCli(process.argv.slice(2)));
