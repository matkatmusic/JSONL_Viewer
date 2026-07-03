// The viewer server's logic layer: scan a projects folder, build ReconstructionDocuments over
// one-or-many JSONLs, decide when script-execution consent is needed, and render the two diff
// views. Pure functions over the existing engine — the HTTP wiring lives in viewer_server.ts.

import { readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { loadTranscript } from "./parse/loadTranscript.ts";
import {
    buildReconstructionDocument,
    type ReconstructionDocument,
} from "./reconstruction_json.ts";
import { reconstructBranches, type FileHistory } from "./reconstruction_engine.ts";
import { buildSidecarReader } from "./reconstruction_sidecar_reader.ts";
import { findScriptExecutionRuns, type ScriptRun } from "./reconstruction_script_execution.ts";
import { setImpureExecutionAllowed } from "./reconstruction_exec_gate.ts";
import { renderDiff } from "./reconstruction_render.ts";
import { DocumentResponseKind } from "./structures/vocabulary.ts";
import { Path } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";

export type JsonlFileEntry = {
    fileName: Path;
    sizeBytes: number;
    modifiedAt: Date;
};

export type ProjectListing = {
    name: string;
    jsonlFiles: JsonlFileEntry[];
};

// The synthetic project holding .jsonl files that sit directly in the scanned folder (an
// alternate folder that isn't .claude/projects-shaped), so any folder of JSONLs is loadable.
export const ROOT_PROJECT_NAME = "(root)";

// The app's runtime-switchable scan root (POST /api/config swaps it; Claude Code's default first).
let activeProjectsDir = new Path(join(homedir(), ".claude", "projects"));

export function getProjectsDir(): Path {
    return activeProjectsDir;
}

// Switch the active scan root. Validation is existence-only, by design: this is a typed/pasted
// path in a localhost app on the user's own machine — the trust boundary is existence, not
// authorization. Throws (server maps to 400) and leaves the active dir unchanged on a bad path.
export function setProjectsDir(requested: string): Path {
    if (!statSync(requested, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error(`not a directory: ${requested}`);
    }
    activeProjectsDir = new Path(resolve(requested));
    return activeProjectsDir;
}

// The .jsonl entries directly inside `dir`, newest first.
function listJsonlFiles(dir: string): JsonlFileEntry[] {
    const entries: JsonlFileEntry[] = [];
    for (const name of readdirSync(dir)) {
        if (!name.endsWith(".jsonl")) continue;
        const stats = statSync(join(dir, name));
        if (!stats.isFile()) continue;
        entries.push({ fileName: new Path(name), sizeBytes: stats.size, modifiedAt: stats.mtime });
    }
    entries.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    return entries;
}

// A project's most recent JSONL activity, for sorting; a JSONL-less project sorts last.
function computeLatestActivity(listing: ProjectListing): number {
    if (listing.jsonlFiles.length === 0) return 0;
    return listing.jsonlFiles[0]!.modifiedAt.getTime();
}

// Scan a projects folder (each subdirectory = one project; loose .jsonl files = the synthetic
// "(root)" project) into listings sorted by most recent activity.
export function scanProjects(projectsDir: Path): ProjectListing[] {
    const root = projectsDir.toString();
    const listings: ProjectListing[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        listings.push({ name: entry.name, jsonlFiles: listJsonlFiles(join(root, entry.name)) });
    }
    const looseJsonlFiles = listJsonlFiles(root);
    if (looseJsonlFiles.length > 0) {
        listings.push({ name: ROOT_PROJECT_NAME, jsonlFiles: looseJsonlFiles });
    }
    listings.sort((a, b) => computeLatestActivity(b) - computeLatestActivity(a));
    return listings;
}

// One-or-many JSONLs -> one ReconstructionDocument. Exactly the CLI --json composition,
// generalized to a merged multi-JSONL record stream (the coverage checker's proven pattern).
export function buildProjectDocument(jsonlPaths: Path[], target: Path | undefined): ReconstructionDocument {
    const records = jsonlPaths.flatMap((path) => loadTranscript(path.toString()));
    const reader = buildSidecarReader(records);
    const branched = reconstructBranches(records, reader);
    return buildReconstructionDocument(records, branched, reader, target);
}

export type DocumentDecision =
    | { kind: DocumentResponseKind.consentRequired; scripts: ScriptRun[] }
    | { kind: DocumentResponseKind.document };

// Decide whether a document build must first ask the user to consent to running the transcript's
// scripts: consent is required only when script runs exist AND consent wasn't given. The scripts
// ride along so the client can show each one's code in the consent dialog.
export function decideDocumentResponse(records: TranscriptRecord[], allowScripts: boolean): DocumentDecision {
    const scripts = findScriptExecutionRuns(records);
    if (scripts.length > 0 && !allowScripts) {
        return { kind: DocumentResponseKind.consentRequired, scripts };
    }
    return { kind: DocumentResponseKind.document };
}

// Build a document under the consent decision: the exec gate is on only for a consented build's
// own (synchronous) duration, and always off afterwards — the server's resting posture. A declined
// build still yields a document, just degraded (no script-derived revisions).
export function buildDocumentWithConsent(
    jsonlPaths: Path[],
    target: Path | undefined,
    allowScripts: boolean,
): ReconstructionDocument {
    setImpureExecutionAllowed(allowScripts);
    try {
        return buildProjectDocument(jsonlPaths, target);
    } finally {
        setImpureExecutionAllowed(false);
    }
}

// Trust boundary for the HTTP layer: `project` and `jsonl` arrive as NAMES, never paths.
// Resolve them against the projects dir and verify the resolved REAL path is still under it;
// anything escaping (traversal, absolute names, symlink tricks) is a loud error the server maps
// to 400. A nonexistent file throws here too (realpath), which is equally a refusal.
export function resolveProjectFile(projectsDir: Path, projectName: string, fileName: string): Path {
    const base = realpathSync(projectsDir.toString());
    const projectDir = projectName === ROOT_PROJECT_NAME ? base : resolve(base, projectName);
    const resolved = realpathSync(resolve(projectDir, fileName));
    if (!resolved.startsWith(base + sep)) {
        throw new Error(`refusing to resolve outside the projects dir: ${projectName}/${fileName}`);
    }
    return new Path(resolved);
}

// The document's reconstructed history for one file, or a loud error naming the path.
function findFileHistory(document: ReconstructionDocument, filePath: Path): FileHistory {
    const history = document.filesTouched.find((entry) => entry.target.equals(filePath));
    if (history === undefined) {
        throw new Error(`no reconstructed history for ${filePath.toString()}`);
    }
    return history;
}

// The revision-timeline view's text: consecutive-revision diffs for one file (renderDiff reused).
export function renderRevisionDiff(document: ReconstructionDocument, filePath: Path): string {
    return renderDiff(findFileHistory(document, filePath).revisions);
}

// The Diff-vs-Base view's text: the file's first revision against the selected one (0-based).
export function renderDiffVsBase(document: ReconstructionDocument, filePath: Path, revisionIndex: number): string {
    const revisions = findFileHistory(document, filePath).revisions;
    const first = revisions[0];
    const selected = revisions[revisionIndex];
    if (first === undefined || selected === undefined) {
        throw new Error(`revision ${revisionIndex} out of range 0..${revisions.length - 1}`);
    }
    return renderDiff([first, selected]);
}
