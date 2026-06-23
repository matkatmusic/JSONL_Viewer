// Runnable entry point for the reconstruction engine. Reconstructs every file a
// transcript touches (or one --target) and prints the history (--verbose) or its
// changes (--diff). Run: tsx src/reconstruction_cli.ts <transcript.jsonl> --diff
// Design: plans/reconstruction-engine-design.md.

import { fileURLToPath } from "node:url";
import { loadTranscript } from "./parse/loadTranscript.ts";
import { Path } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import {
    reconstructAll,
    reconstructFile,
    type FileHistory,
    type FileRevision,
} from "./reconstruction_engine.ts";
import { renderDiff, renderVerbose } from "./reconstruction_render.ts";
import { renderHistoryList } from "./reconstruction_render_list.ts";
import {
    createSidecarReader,
    getDefaultFileHistoryRoot,
    findSessionId,
    type BackupReader,
} from "./reconstruction_sidecar.ts";

const USAGE =
    "usage: reconstruction_cli <transcript.jsonl> [--target <path>] [--verbose|--diff]";

export type CliOptions = {
    jsonlPath: string;
    target: Path | undefined;
    verbose: boolean;
    diff: boolean;
};

// Parse argv: a required transcript path, an optional --target, and the view
// flags. Throws the usage message when no transcript path is given.
export function parseArgs(argv: string[]): CliOptions {
    const at = argv.indexOf("--target");
    const target = at >= 0 ? new Path(argv[at + 1]!) : undefined;
    const rest = at >= 0 ? argv.filter((_, i) => i !== at && i !== at + 1) : argv;
    const jsonlPath = rest.find((arg) => !arg.startsWith("--"));
    if (!jsonlPath) {
        throw new Error(USAGE);
    }
    return {
        jsonlPath,
        target,
        verbose: rest.includes("--verbose"),
        diff: rest.includes("--diff"),
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

// One file's history (--target), else every file the transcript touches. A bash-redirect's
// content is recovered through the sidecar reader built from the transcript's session.
function selectHistories(
    options: CliOptions,
    records: TranscriptRecord[],
): FileHistory[] {
    const reader = buildSidecarReader(records);
    if (options.target) {
        const revisions = reconstructFile(records, options.target, reader);
        return [{ target: options.target, revisions }];
    }
    return reconstructAll(records, reader);
}

function renderHistories(
    histories: FileHistory[],
    render: (revisions: FileRevision[]) => string,
): string {
    return histories
        .map((history) => `### ${history.target}\n${render(history.revisions)}`)
        .join("\n\n");
}

// Load the transcript, reconstruct, and render per the chosen view.
export function runCli(argv: string[]): string {
    const options = parseArgs(argv);
    const records = loadTranscript(options.jsonlPath);
    const histories = selectHistories(options, records);
    if (options.diff) {
        return renderHistories(histories, renderDiff);
    }
    if (options.verbose) {
        return renderHistories(histories, renderVerbose);
    }
    return renderHistoryList(histories);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log(runCli(process.argv.slice(2)));
}
