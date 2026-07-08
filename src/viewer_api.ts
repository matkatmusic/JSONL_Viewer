// The viewer server's logic layer: scan a projects folder, build ReconstructionDocuments over
// one-or-many JSONLs, decide when script-execution consent is needed, and render the two diff
// views. Pure functions over the existing engine — the HTTP wiring lives in viewer_server.ts.

import { readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { formatRecordSourceToken, getRecordSource, loadTranscript, type ProgressSink } from "./parse/loadTranscript.ts";
import {
    buildReconstructionDocument,
    type ReconstructionDocument,
} from "./reconstruction_json.ts";
import { reconstructBranches, type FileHistory } from "./reconstruction_engine.ts";
import { buildSidecarReader } from "./reconstruction_sidecar_reader.ts";
import { findScriptExecutionRuns, type ScriptRun } from "./reconstruction_script_execution.ts";
import { setImpureExecutionAllowed } from "./reconstruction_exec_gate.ts";
import { setReconstructionProgressSink } from "./reconstruction_progress.ts";
import { getCachedValueRefreshingRecency, evictLeastRecentlyUsedEntries } from "./cache_lru.ts";
import { renderDiffWithContext, renderGitFileDiff } from "./reconstruction_render.ts";
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

// The build's post-parse stage announcements, in the order buildProjectDocument runs them. Tests
// compare against these constants, never string literals (coding-req §2 — one vocabulary home).
export const PROGRESS_LABEL_READING_SIDECAR = "reading sidecar backups";
export const PROGRESS_LABEL_CONSTRUCTING_BRANCHES = "constructing branches";
export const PROGRESS_LABEL_BUILDING_DOCUMENT = "building document";

// Announce one build stage (a no-op when no sink is listening).
function reportStage(onProgress: ProgressSink | undefined, label: string): void {
    onProgress?.({ kind: DocumentResponseKind.progress, label });
}

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

// One string identifying a transcript set's on-disk state: sorted "path:mtimeMs:size" segments.
// Two calls agree exactly when no file was added, removed, or modified. ponytail: mtimeMs+size
// misses a same-millisecond same-size rewrite — switch to content hashing if that ever bites.
export function computeTranscriptSetStamp(jsonlPaths: Path[]): string {
    const stampSegments = jsonlPaths.map((path) => {
        const stats = statSync(path.toString());
        return `${path.toString()}:${stats.mtimeMs}:${stats.size}`;
    });
    stampSegments.sort();
    return stampSegments.join("|");
}

export const PROGRESS_LABEL_RECORDS_CACHE_HIT = "reusing cached transcript records";

// Bound for both viewer caches. Documents carry full per-step file snapshots, so unbounded
// growth is a real leak on a long-running localhost server. 8 fits one project-wide artifact
// plus a healthy run of per-conversation entries without evicting the big one (reads refresh
// recency). ponytail: raise if hit/miss thrash ever shows in the loading console.
export const ARTIFACT_CACHE_CAPACITY = 8;

// Parsed records per transcript-set stamp. Entries never go stale silently: a file touch
// changes the stamp, so a stale entry is simply never keyed again and ages out via LRU.
const parsedRecordsCache = new Map<string, TranscriptRecord[]>();

// Replay one counted per-record event per cached record — a cache hit must never silence the
// console's per-line processing output, and each replayed line keeps its clickable
// "[<jsonl>:<line>]" source token.
function replayRecordProgress(records: TranscriptRecord[], onProgress: ProgressSink | undefined): void {
    if (onProgress === undefined) {
        return;
    }
    records.forEach((record, index) => {
        onProgress({
            kind: DocumentResponseKind.progress,
            label: `${record.type}${formatRecordSourceToken(getRecordSource(record))}`,
            current: index + 1,
            total: records.length,
        });
    });
}

// The parsed, merged record stream for a transcript set — parsed at most once per on-disk
// state. Returning the SAME array object also keeps the engine's per-records WeakMap memos
// (reconstruction_branches.ts) warm across requests.
export function loadProjectRecords(jsonlPaths: Path[], onProgress?: ProgressSink): TranscriptRecord[] {
    const stamp = computeTranscriptSetStamp(jsonlPaths);
    const cachedRecords = getCachedValueRefreshingRecency(parsedRecordsCache, stamp);
    if (cachedRecords !== undefined) {
        reportStage(onProgress, PROGRESS_LABEL_RECORDS_CACHE_HIT);
        replayRecordProgress(cachedRecords, onProgress);
        return cachedRecords;
    }
    // The viewer opens arbitrary real sessions: tolerate (and log) fields the scenarios never
    // modeled instead of hard-failing the whole document. Unknown record types still throw.
    const transcripts = jsonlPaths.map((path) => loadTranscript(path.toString(), onProgress, true));
    sortTranscriptsChronologically(transcripts);
    const records = transcripts.flat();
    parsedRecordsCache.set(stamp, records);
    evictLeastRecentlyUsedEntries(parsedRecordsCache, ARTIFACT_CACHE_CAPACITY);
    return records;
}

// The first stamped record's timestamp, for ordering whole transcripts; a transcript with no
// timestamp sorts last (stably).
function findFirstTimestamp(records: TranscriptRecord[]): number | undefined {
    for (const record of records) {
        if (record.timestamp !== undefined) {
            return record.timestamp.getTime();
        }
    }
    return undefined;
}

// Whole-session chronology: the branch model and every "last head = latest" heuristic assume the
// merged record stream is time-ordered ACROSS sessions (it always is within one). Callers hand
// paths in UI order (newest first), so re-order here, oldest session first; intra-file order is
// untouched.
function sortTranscriptsChronologically(transcripts: TranscriptRecord[][]): void {
    transcripts.sort((a, b) =>
        (findFirstTimestamp(a) ?? Number.POSITIVE_INFINITY) - (findFirstTimestamp(b) ?? Number.POSITIVE_INFINITY));
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
export function buildProjectDocument(jsonlPaths: Path[], target: Path | undefined, onProgress?: ProgressSink): ReconstructionDocument {
    const records = loadProjectRecords(jsonlPaths, onProgress);
    reportStage(onProgress, PROGRESS_LABEL_READING_SIDECAR);
    const reader = buildSidecarReader(records);
    reportStage(onProgress, PROGRESS_LABEL_CONSTRUCTING_BRANCHES);
    const branched = reconstructBranches(records, reader);
    reportStage(onProgress, PROGRESS_LABEL_BUILDING_DOCUMENT);
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

export const PROGRESS_LABEL_ARTIFACT_CACHE_HIT = "reusing cached document artifact";

// Built documents per (transcript-set stamp, consent, target). allowScripts is in the key
// because consented and degraded builds yield different documents and must never share an
// entry. target is in the key only to keep the /api/document?target= contract intact — the
// webapp never sends it, so in practice this holds one entry per (project, consent).
const builtDocumentCache = new Map<string, ReconstructionDocument>();

// Build a document under the consent decision: the exec gate is on only for a consented build's
// own (synchronous) duration, and always off afterwards — the server's resting posture. A declined
// build still yields a document, just degraded (no script-derived revisions). A cache hit returns
// before the gate/sink lifecycle: nothing impure runs when no build runs.
export function buildDocumentWithConsent(
    jsonlPaths: Path[],
    target: Path | undefined,
    allowScripts: boolean,
    onProgress?: ProgressSink,
): ReconstructionDocument {
    const targetKey = target === undefined ? "" : target.toString();
    const cacheKey = `${computeTranscriptSetStamp(jsonlPaths)}|${allowScripts}|${targetKey}`;
    const cachedDocument = getCachedValueRefreshingRecency(builtDocumentCache, cacheKey);
    if (cachedDocument !== undefined) {
        reportStage(onProgress, PROGRESS_LABEL_ARTIFACT_CACHE_HIT);
        // The build is skipped, but the per-line record output must still show — loading the
        // (records-cached) transcripts replays it.
        loadProjectRecords(jsonlPaths, onProgress);
        return cachedDocument;
    }
    setImpureExecutionAllowed(allowScripts);
    // The deep engine stages (script sandbox runs, per-file reconstruction) announce through the
    // build-scoped module sink — same lifecycle as the exec gate: on for the build, off after.
    setReconstructionProgressSink(onProgress);
    try {
        const document = buildProjectDocument(jsonlPaths, target, onProgress);
        builtDocumentCache.set(cacheKey, document);
        evictLeastRecentlyUsedEntries(builtDocumentCache, ARTIFACT_CACHE_CAPACITY);
        return document;
    } finally {
        setImpureExecutionAllowed(false);
        setReconstructionProgressSink(undefined);
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

// The revision-timeline view's text: consecutive-revision diffs for one file, with unified
// hunks + context so the client can render surrounding lines and line-number gutters.
export function renderRevisionDiff(document: ReconstructionDocument, filePath: Path): string {
    return renderDiffWithContext(findFileHistory(document, filePath).revisions);
}

// The Diff-vs-Base view's text: the file's first revision against the selected one (0-based).
export function renderDiffVsBase(document: ReconstructionDocument, filePath: Path, revisionIndex: number): string {
    const revisions = findFileHistory(document, filePath).revisions;
    const first = revisions[0];
    const selected = revisions[revisionIndex];
    if (first === undefined || selected === undefined) {
        throw new Error(`revision ${revisionIndex} out of range 0..${revisions.length - 1}`);
    }
    return renderDiffWithContext([first, selected]);
}

// The directory every range-patch path is relativized against: the longest common directory
// prefix across every file the document's steps ever tracked — in practice the session's cwd,
// since every tracked file lives under it. Stable for a given document regardless of the range.
// ponytail: prefix heuristic — carry the records' cwd on the document if multi-root projects appear.
export function computePatchRoot(document: ReconstructionDocument): string {
    const trackedPaths = new Set<string>();
    for (const step of document.steps) {
        for (const key of Object.keys(step.files)) {
            trackedPaths.add(key);
        }
    }
    const directorySegmentLists = [...trackedPaths].map((path) => path.split(sep).slice(0, -1));
    if (directorySegmentLists.length === 0) {
        return sep;
    }
    let prefix = directorySegmentLists[0]!;
    for (const segments of directorySegmentLists.slice(1)) {
        let shared = 0;
        const limit = Math.min(prefix.length, segments.length);
        while (shared < limit) {
            if (prefix[shared] !== segments[shared]) {
                break;
            }
            shared += 1;
        }
        prefix = prefix.slice(0, shared);
    }
    return prefix.join(sep) || sep;
}

// One positive-integer query param, or a loud throw the server maps to 400.
function parsePositiveIntegerParam(query: URLSearchParams, name: string): number {
    const raw = query.get(name);
    if (raw === null) {
        throw new Error(`missing query param: ${name}`);
    }
    const value = Number(raw);
    if (!Number.isInteger(value)) {
        throw new Error(`${name} must be an integer, got: ${raw}`);
    }
    if (value < 1) {
        throw new Error(`${name} must be >= 1, got: ${raw}`);
    }
    return value;
}

// Trust-boundary parsing for GET /api/range-patch: both step params are required 1-based positive
// integers. Range validation against the document happens in renderRangePatch (it knows steps.length).
export function parseRangePatchQuery(query: URLSearchParams): { fromStep: number; toStep: number } {
    return {
        fromStep: parsePositiveIntegerParam(query, "fromStep"),
        toStep: parsePositiveIntegerParam(query, "toStep"),
    };
}

// One git-apply-able unified diff covering every file whose content differs between the snapshot
// BEFORE `fromStep` and the snapshot AT `toStep` (1-based step indexes; the snapshot before step 1
// is empty). A path present only in `after` is a creation; only in `before`, a deletion.
export function renderRangePatch(document: ReconstructionDocument, fromStep: number, toStep: number): string {
    if (fromStep < 1) {
        throw new Error(`fromStep ${fromStep} out of range 1..${document.steps.length}`);
    }
    if (toStep > document.steps.length) {
        throw new Error(`toStep ${toStep} out of range 1..${document.steps.length}`);
    }
    if (fromStep > toStep) {
        throw new Error(`fromStep ${fromStep} exceeds toStep ${toStep}`);
    }
    const before: Record<string, string> = fromStep >= 2 ? document.steps[fromStep - 2]!.files : {};
    const after = document.steps[toStep - 1]!.files;
    const root = computePatchRoot(document);
    const changedPaths = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((path) => before[path] !== after[path])
        .sort();
    return changedPaths
        .map((path) => renderGitFileDiff(relative(root, path), before[path], after[path]))
        .join("");
}
