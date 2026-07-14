// The viewer server's logic layer: scan a projects folder, build ReconstructionDocuments over
// one-or-many JSONLs, decide when script-execution consent is needed, and render the two diff
// views. Pure functions over the existing engine — the HTTP wiring lives in viewer_server.ts.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { formatRecordSourceToken, getRecordSource, loadTranscript, type ProgressSink } from "./parse/loadTranscript.ts";
import {
    buildReconstructionDocument,
    type ReconstructionDocument,
    type BuiltReconstruction,
    type StepSnapshot,
} from "./reconstruction_json.ts";
import { resolveFilesAtStep } from "./reconstruction_steps.ts";
import { reconstructBranches, type FileHistory } from "./reconstruction_engine.ts";
import {
    buildSidecarReader,
    deriveSiblingFileHistoryRoot,
    getDefaultFileHistoryRoot,
} from "./reconstruction_sidecar_reader.ts";
import {
    hydrateProjectPaths,
    readProjectPathsConfig,
    serializePathOverrides,
    setPathOverrides,
} from "./reconstruction_overrides.ts";
import { findScriptExecutionRuns, scriptCodeMayWriteFiles, flushSandboxMemoToDisk, type ScriptRun } from "./reconstruction_script_execution.ts";
import { setImpureExecutionAllowed } from "./reconstruction_exec_gate.ts";
import { setReconstructionProgressSink } from "./reconstruction_progress.ts";
import { getCachedValueRefreshingRecency, evictLeastRecentlyUsedEntries } from "./cache_lru.ts";
import { readDocumentFromDiskCache, writeDocumentToDiskCache } from "./reconstruction_document_cache.ts";
import { renderDiffWithContext, renderGitFileDiff } from "./reconstruction_render.ts";
import { DocumentResponseKind } from "./structures/vocabulary.ts";
import { Path, Uuid } from "./structures/domain.ts";
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

// Emitted right BEFORE the two synchronous blocking steps the build's progress sink can't see
// into: JSON.stringify of the whole document (server) and its transfer. A single
// stringify/transfer can't be subdivided, so an honest label before each is what keeps the
// client from freezing on the previous line (item 82 — the 67 MB document is seconds of
// silent stringify + a browser-side parse of the same size).
export const PROGRESS_LABEL_SERIALIZING_DOCUMENT = "serializing document";

// byteLength is a genuine numeric measure, not a domain value, so it stays primitive (coding-req §1).
export function formatSendingDocumentLabel(byteLength: number): string {
    return `sending document (${(byteLength / 1_000_000).toFixed(1)} MB)`;
}

// Announce one build stage (a no-op when no sink is listening).
function reportStage(onProgress: ProgressSink | undefined, label: string): void {
    onProgress?.({ kind: DocumentResponseKind.progress, label });
}

// The app's runtime-switchable scan root (POST /api/config swaps it). There is NO default:
// the server refuses to start without --projects-dir, so reading it while unset is a bug.
// item 46: let activeProjectsDir = new Path(join(homedir(), ".claude", "projects"));
let activeProjectsDir: Path | undefined;

export function getProjectsDir(): Path {
    if (activeProjectsDir === undefined) {
        throw new Error("projects dir not set: start the server with --projects-dir <path>");
    }
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
    // item 46: a folder switch re-derives the file-history root — exactly the webapp's
    // prepopulate behavior (the response echoes the newly effective dir into the field).
    activeFileHistoryDir = undefined;
    return activeProjectsDir;
}

// item 46: the folder-level file-history override (POST /api/config / --file-history-dir).
// undefined = derive from the projects folder.
let activeFileHistoryDir: Path | undefined;

// Switch the file-history root. The empty string clears the override so derivation follows
// the projects folder again; a non-directory throws (server maps to 400) and leaves the
// override unchanged. Returns the new EFFECTIVE dir (what the webapp shows in its field).
export function setFileHistoryDir(requested: string): Path {
    if (requested === "") {
        activeFileHistoryDir = undefined;
        return getEffectiveFileHistoryDir();
    }
    if (!statSync(requested, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error(`not a directory: ${requested}`);
    }
    activeFileHistoryDir = new Path(resolve(requested));
    return activeFileHistoryDir;
}

// The file-history root the viewer serves and shows: explicit override → the file-history/
// sibling of the projects folder → the ~/.claude default (item 46's resolution chain).
export function getEffectiveFileHistoryDir(): Path {
    return activeFileHistoryDir
        ?? (activeProjectsDir === undefined ? undefined : deriveSiblingFileHistoryRoot(activeProjectsDir))
        ?? getDefaultFileHistoryRoot();
}

// item 46: set the engine's path overrides for this request — the project's reveng-paths.json
// entry (if any) plus the viewer's effective file-history dir. Every project-scoped route calls
// this BEFORE any build work; overrides are process-wide module state, so each request
// overwrites the previous request's (builds are synchronous and the server serializes them).
export function applyProjectOverrides(projectName: string): void {
    const entry = readProjectPathsConfig(getProjectsDir())[projectName];
    const overrides = entry === undefined ? {} : hydrateProjectPaths(entry);
    overrides.fileHistoryRoot = getEffectiveFileHistoryDir();
    setPathOverrides(overrides);
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

// A cache hit must still show counted per-record progress (never silence the console), but one
// line per record floods the stream with 20k+ lines for a large project (item 82 — the captured
// jot-backup load emitted 20,418). Emit at a stride so at most RECORD_PROGRESS_MAX_LINES lines go
// out, always including the final record so the bar reaches 100%. Sampled lines keep the clickable
// "[<jsonl>:<line>]" source token.
export const RECORD_PROGRESS_MAX_LINES = 50;

export function computeRecordProgressStride(total: number): number {
    return Math.max(1, Math.ceil(total / RECORD_PROGRESS_MAX_LINES));
}

function replayRecordProgress(records: TranscriptRecord[], onProgress: ProgressSink | undefined): void {
    if (onProgress === undefined) {
        return;
    }
    const stride = computeRecordProgressStride(records.length);
    records.forEach((record, index) => {
        const isSampled = (index + 1) % stride === 0;
        const isLast = index === records.length - 1;
        if (!isSampled && !isLast) {
            return;
        }
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

// One-or-many JSONLs -> the wire document AND its compact step-file histories (returned separately;
// the histories never ride the wire). Exactly the CLI --json composition, generalized to a merged
// multi-JSONL record stream (the coverage checker's proven pattern).
export function buildProjectReconstruction(jsonlPaths: Path[], target: Path | undefined, onProgress?: ProgressSink): BuiltReconstruction {
    // The per-record walk belongs to the caller's own loadProjectRecords call (the /api/document
    // route always pre-walks); the build emits stages and deep-engine progress only.
    const records = loadProjectRecords(jsonlPaths);
    reportStage(onProgress, PROGRESS_LABEL_READING_SIDECAR);
    const reader = buildSidecarReader(records);
    reportStage(onProgress, PROGRESS_LABEL_CONSTRUCTING_BRANCHES);
    const branched = reconstructBranches(records, reader);
    reportStage(onProgress, PROGRESS_LABEL_BUILDING_DOCUMENT);
    return buildReconstructionDocument(records, branched, reader, target);
}

// The wire document alone — the back-compat surface every non-range-patch caller uses (the histories
// are an implementation detail only the range-patch / step-files routes need).
export function buildProjectDocument(jsonlPaths: Path[], target: Path | undefined, onProgress?: ProgressSink): ReconstructionDocument {
    return buildProjectReconstruction(jsonlPaths, target, onProgress).document;
}

// One recorded script run plus the consent dialog's read-only verdict: the same conservative
// classifier execution uses (item 68) — uncertain code counts as may-write, i.e. Modifying.
export type ConsentScript = ScriptRun & { readOnly: boolean };

export type DocumentDecision =
    | { kind: DocumentResponseKind.consentRequired; scripts: ConsentScript[] }
    | { kind: DocumentResponseKind.document };

// Decide whether a document build must first ask the user to consent to running the transcript's
// scripts: consent is required only when script runs exist AND consent wasn't given. The scripts
// ride along so the client can show each one's code in the consent dialog.
export function decideDocumentResponse(records: TranscriptRecord[], allowScripts: boolean): DocumentDecision {
    const scripts = findScriptExecutionRuns(records);
    if (scripts.length > 0 && !allowScripts) {
        // The dialog marks read-only scripts; the flag rides the wire with each script (item 69).
        const taggedScripts = scripts.map((run) => ({ ...run, readOnly: !scriptCodeMayWriteFiles(run.code) }));
        return { kind: DocumentResponseKind.consentRequired, scripts: taggedScripts };
    }
    return { kind: DocumentResponseKind.document };
}

export const PROGRESS_LABEL_ARTIFACT_CACHE_HIT = "reusing cached document artifact";

// Built documents per (transcript-set stamp, consent, target). allowScripts is in the key
// because consented and degraded builds yield different documents and must never share an
// entry. target is in the key only to keep the /api/document?target= contract intact — the
// webapp never sends it, so in practice this holds one entry per (project, consent).
const builtDocumentCache = new Map<string, BuiltReconstruction>();

// Build a document under the consent decision: the exec gate is on only for a consented build's
// own (synchronous) duration, and always off afterwards — the server's resting posture. A declined
// build still yields a document, just degraded (no script-derived revisions). A cache hit returns
// before the gate/sink lifecycle: nothing impure runs when no build runs.
// Build (or reuse) the document AND its step-file histories under the consent decision. The cached
// value carries both, so range-patch / step-files requests reuse the compact histories instead of
// re-reconstructing (the histories are never serialized onto the wire).
export function buildReconstructionWithConsent(
    jsonlPaths: Path[],
    target: Path | undefined,
    allowScripts: boolean,
    onProgress?: ProgressSink,
): BuiltReconstruction {
    const targetKey = target === undefined ? "" : target.toString();
    // item 46: const cacheKey = `${computeTranscriptSetStamp(jsonlPaths)}|${allowScripts}|${targetKey}`;
    // The stamp reads the ACTIVE overrides — callers applyProjectOverrides first; a config-file
    // edit between requests changes the stamp and misses the cache, which is the point.
    const cacheKey = `${computeTranscriptSetStamp(jsonlPaths)}|${allowScripts}|${targetKey}|${serializePathOverrides()}`;
    const cachedBuild = getCachedValueRefreshingRecency(builtDocumentCache, cacheKey);
    if (cachedBuild !== undefined) {
        reportStage(onProgress, PROGRESS_LABEL_ARTIFACT_CACHE_HIT);
        return cachedBuild;
    }
    // item 79: an in-memory miss may still hit the disk cache after a server respawn — hydrate it,
    // repopulate the in-memory cache, and skip the multi-minute rebuild. No-op when the CLI/tests
    // leave the disk cache unconfigured.
    const diskBuild = readDocumentFromDiskCache(cacheKey);
    if (diskBuild !== undefined) {
        reportStage(onProgress, PROGRESS_LABEL_ARTIFACT_CACHE_HIT);
        builtDocumentCache.set(cacheKey, diskBuild);
        evictLeastRecentlyUsedEntries(builtDocumentCache, ARTIFACT_CACHE_CAPACITY);
        return diskBuild;
    }
    setImpureExecutionAllowed(allowScripts);
    // The deep engine stages (script sandbox runs, per-file reconstruction) announce through the
    // build-scoped module sink — same lifecycle as the exec gate: on for the build, off after.
    setReconstructionProgressSink(onProgress);
    try {
        const built = buildProjectReconstruction(jsonlPaths, target, onProgress);
        // The build's new sandbox spawns were persisted per batch; flush the final tail so nothing is
        // lost before the response (batched persist is the O(N²)-write fix — item Step 6).
        flushSandboxMemoToDisk();
        builtDocumentCache.set(cacheKey, built);
        evictLeastRecentlyUsedEntries(builtDocumentCache, ARTIFACT_CACHE_CAPACITY);
        // item 79: persist to disk so a server respawn reads this back (hydrated) instead of rebuilding.
        writeDocumentToDiskCache(cacheKey, built);
        return built;
    } finally {
        setImpureExecutionAllowed(false);
        setReconstructionProgressSink(undefined);
    }
}

// The wire document alone — the back-compat surface every non-range-patch caller uses.
export function buildDocumentWithConsent(
    jsonlPaths: Path[],
    target: Path | undefined,
    allowScripts: boolean,
    onProgress?: ProgressSink,
): ReconstructionDocument {
    return buildReconstructionWithConsent(jsonlPaths, target, allowScripts, onProgress).document;
}

// The on-disk file for a static request: the compiled webapp/dist copy when the build emitted
// one (transpiled .js), else the webapp/ source (index.html, styles.css, vendor/*.js). The
// server realpath+prefix-checks the result before reading it.
export function resolveStaticFilePath(relative: string, distDir: string, webappDir: string): string {
    const compiledCandidate = resolve(distDir, relative);
    if (existsSync(compiledCandidate)) {
        return compiledCandidate;
    }
    return resolve(webappDir, relative);
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

// The exact shapes a blob-snapshot read accepts — both values reach a filesystem join, so this
// is a trust boundary: a blob name is `<16 hex>@vN` and a session id is hex-and-dashes only.
// Neither pattern admits `/`, `\`, or `.`, so traversal is impossible.
const BLOB_NAME_PATTERN = /^[0-9a-f]{16}@v\d+$/;
const SESSION_ID_PATTERN = /^[0-9a-fA-F-]+$/;

// One file-history blob for the inspector's snapshot drawer: whether
// <file-history root>/<sessionId>/<blobName> exists, and its verbatim content when it does.
// Owner-session dir ONLY — no cross-session fallback (owner-keyed reads are the multi-session
// @vN collision fix; probing other sessions' dirs would reintroduce wrong-content risk).
export function readBlobSnapshot(sessionId: Uuid, blobName: Path): { exists: boolean; content: string | undefined } {
    if (!BLOB_NAME_PATTERN.test(blobName.toString())) {
        throw new Error(`not a backup blob name: ${blobName.toString()}`);
    }
    if (!SESSION_ID_PATTERN.test(sessionId.toString())) {
        throw new Error(`not a session id: ${sessionId.toString()}`);
    }
    // item 46: const blobPath = join(getDefaultFileHistoryRoot().toString(), sessionId.toString(), blobName.toString());
    const blobPath = join(getEffectiveFileHistoryDir().toString(), sessionId.toString(), blobName.toString());
    if (!existsSync(blobPath)) {
        return { exists: false, content: undefined };
    }
    return { exists: true, content: readFileSync(blobPath, "utf8") };
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
export function renderRevisionDiff(document: ReconstructionDocument, filePath: Path, fullContext: boolean = false): string {
    return renderDiffWithContext(findFileHistory(document, filePath).revisions, fullContext);
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
// prefix across every file the reconstruction ever tracked — in practice the session's cwd,
// since every tracked file lives under it. Stable for a given reconstruction regardless of the range.
// ponytail: prefix heuristic — carry the records' cwd on the document if multi-root projects appear.
export function computePatchRoot(stepFileHistories: FileHistory[]): string {
    const trackedPaths = new Set<string>();
    for (const history of stepFileHistories) {
        trackedPaths.add(history.target.toString());
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

// Trust-boundary parsing for GET /api/step-files: `step` is a required 1-based positive integer.
export function parseStepFilesQuery(query: URLSearchParams): { step: number } {
    return { step: parsePositiveIntegerParam(query, "step") };
}

// The { path: content } map of every file present at a 1-based step, resolved ON DEMAND from the
// compact histories (skeleton steps carry no file map). One step's map is one repo snapshot — bounded,
// not multiplied. Loud throw (server -> 400) when the step is out of range.
export function resolveStepFiles(stepFileHistories: FileHistory[], steps: StepSnapshot[], stepNumber: number): Record<string, string> {
    if (stepNumber < 1 || stepNumber > steps.length) {
        throw new Error(`step ${stepNumber} out of range 1..${steps.length}`);
    }
    return resolveFilesAtStep(stepFileHistories, steps[stepNumber - 1]!.when);
}

// One git-apply-able unified diff covering every file whose content differs between the snapshot
// BEFORE `fromStep` and the snapshot AT `toStep` (1-based step indexes; the snapshot before step 1
// is empty). A path present only in `after` is a creation; only in `before`, a deletion.
export function renderRangePatch(stepFileHistories: FileHistory[], steps: StepSnapshot[], fromStep: number, toStep: number): string {
    if (fromStep < 1) {
        throw new Error(`fromStep ${fromStep} out of range 1..${steps.length}`);
    }
    if (toStep > steps.length) {
        throw new Error(`toStep ${toStep} out of range 1..${steps.length}`);
    }
    if (fromStep > toStep) {
        throw new Error(`fromStep ${fromStep} exceeds toStep ${toStep}`);
    }
    // The snapshot BEFORE step 1 is empty; otherwise resolve each endpoint's files on demand from the
    // compact histories (no per-step file map exists on the document anymore).
    const before: Record<string, string> = fromStep >= 2 ? resolveFilesAtStep(stepFileHistories, steps[fromStep - 2]!.when) : {};
    const after = resolveFilesAtStep(stepFileHistories, steps[toStep - 1]!.when);
    const root = computePatchRoot(stepFileHistories);
    const changedPaths = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((path) => before[path] !== after[path])
        .sort();
    return changedPaths
        .map((path) => renderGitFileDiff(relative(root, path), before[path], after[path]))
        .join("");
}
