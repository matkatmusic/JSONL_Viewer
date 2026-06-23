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
import { renderDiff, renderVerbose } from "./reconstruction_render.ts";
import {
    formatBranchHeader,
    renderBranchSummary,
    renderHistoryList,
} from "./reconstruction_render_list.ts";
import {
    createSidecarReader,
    getDefaultFileHistoryRoot,
    findSessionId,
    type BackupReader,
} from "./reconstruction_sidecar.ts";

const USAGE =
    "usage: reconstruction_cli <transcript.jsonl> [--target <path>] [--verbose|--diff] [--surviving|--list-branches|--branch <id>]";

export type CliOptions = {
    jsonlPath: string;
    target: Path | undefined;
    branch: string | undefined;
    verbose: boolean;
    diff: boolean;
    surviving: boolean;
    listBranches: boolean;
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

// Parse argv: a required transcript path, the value-taking flags (--target, --branch), and the
// boolean view flags. Throws the usage message when no transcript path is given.
export function parseArgs(argv: string[]): CliOptions {
    const targetFlag = extractValueFlag(argv, "--target");
    const branchFlag = extractValueFlag(targetFlag.rest, "--branch");
    const rest = branchFlag.rest;
    const jsonlPath = rest.find((arg) => !arg.startsWith("--"));
    if (!jsonlPath) {
        throw new Error(USAGE);
    }
    return {
        jsonlPath,
        target: targetFlag.value !== undefined ? new Path(targetFlag.value) : undefined,
        branch: branchFlag.value,
        verbose: rest.includes("--verbose"),
        diff: rest.includes("--diff"),
        surviving: rest.includes("--surviving"),
        listBranches: rest.includes("--list-branches"),
    };
}

// The on-disk file-history reader for this transcript's session, or undefined when the
// session id can't be determined (then redirects resolve to empty content).
function buildSidecarReader(records: TranscriptRecord[]): BackupReader | undefined {
    const sessionId = findSessionId(records);
    if (!sessionId) {
        return undefined;
    }
    return createSidecarReader(sessionId, getDefaultFileHistoryRoot());
}

// Render histories in the verbose/diff mode, each under its `### <path>` header.
function renderHistories(
    histories: FileHistory[],
    render: (revisions: FileRevision[]) => string,
): string {
    return histories
        .map((history) => `### ${history.target}\n${render(history.revisions)}`)
        .join("\n\n");
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

// The default view: all branches. With no rewound branch the output is byte-identical to the plain
// list (the S1-S6 passthrough); otherwise the surviving branch and each rewound branch print under
// a header naming its tip and (for rewound) its rewind point.
function renderAllBranches(
    branched: BranchedReconstruction,
    options: CliOptions,
): string {
    if (branched.rewound.length === 0) {
        return renderChosen(branched.surviving, options);
    }
    const sections: string[] = [];
    if (branched.survivingTip !== undefined) {
        const header = formatBranchHeader("surviving", branched.survivingTip, undefined);
        sections.push(`${header}\n${renderChosen(branched.surviving, options)}`);
    }
    for (const entry of branched.rewound) {
        const header = formatBranchHeader("rewound", entry.tip, entry.rewindPoint);
        sections.push(`${header}\n${renderChosen(entry.histories, options)}`);
    }
    return sections.join("\n\n");
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

// Load the transcript, reconstruct every branch, and render per the chosen branch view.
export function runCli(argv: string[]): string {
    const options = parseArgs(argv);
    const records = loadTranscript(options.jsonlPath);
    const reader = buildSidecarReader(records);
    const branched = reconstructBranches(records, reader);
    if (options.listBranches) {
        return renderBranchSummary(branched);
    }
    if (options.branch !== undefined) {
        return renderOneBranch(branched, options);
    }
    if (options.surviving) {
        return renderChosen(branched.surviving, options);
    }
    return renderAllBranches(branched, options);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log(runCli(process.argv.slice(2)));
}
