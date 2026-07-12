// Script-execution replay, part 1 of 2: event types, run detection, indirection resolution, and the
// forward-execution pipeline (getPreExecutionState + runScriptAgainstState). The validation/injection
// stage lives in reconstruction_script_stage.ts.

import { BlockType, EventKind, EXECUTOR_TOOL_NAMES, ToolName } from "./structures/vocabulary.ts";
import { Path, Uuid } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { getContentBlocks, type ToolUseBlock } from "./structures/content-blocks.ts";
import { backupSeedWriteFor, type BackupReader } from "./reconstruction_sidecar.ts";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import {
    fromImportStatementLine,
    importStatementLine,
    openCallToken,
    pythonWritePrimitive,
    quotedFilename,
    readOnlyOpenArgument,
    singleWhitespace,
    writingImportedName,
} from "./regex_expressions.ts";
import { extractFileEvents } from "./reconstruction_extract.ts";
import { buildRenameChain, resolveFinalPath } from "./reconstruction_lineage.ts";
import { reportReconstructionProgress } from "./reconstruction_progress.ts";
import { getCachedValueRefreshingRecency, evictLeastRecentlyUsedEntries } from "./cache_lru.ts";
import { getCorpusState } from "./reconstruction_corpus.ts";
import { formatRecordSourceToken, getRecordSource, type RecordSource } from "./parse/loadTranscript.ts";

// The proven post-execution state of a script run for one target file: the forward transform already
// applied to the pre-script content. Injected as a synthetic authored event at the run's timestamp and
// replayed as a full-content revision (like userEdit / overwrite). `content` is precomputed (not subs
// re-applied at replay) so the revision is independent of replay ordering / earlier beacon completion.
// One event per target file.
export type ScriptExecutionEvent = {
    kind: EventKind.scriptExecution;
    changeId: Uuid;
    target: Path;
    content: string;
    timestamp: Date;
};

// --- run detection ----------------------------------------------------------------------------------

// A recorded script-execution run: the script source it ran, when, the directory it ran from
// (the MCP executor's input.cwd when present, else the record's cwd), the transcript
// file:line the run was parsed from (absent for synthetic test records), and the id of the
// tool_use block that produced the run (absent for synthetic runs) — the session-attributable
// source a synthetic script-execution changeId embeds.
export type ScriptRun = { code: string; timestamp: Date; cwd?: Path; source?: RecordSource; toolUseId?: Uuid };

// Prefix marking a synthetic script-execution changeId. Follows the originalFile: precedent
// (reconstruction_reseed.ts): a prefixed id that resolveSyntheticChangeIdToSourceId can unwrap.
export const SCRIPT_RUN_CHANGE_ID_PREFIX = "scriptRun:";

// Deterministic changeId for a synthetic script-execution event. Both the step-timeline replay
// and the file-history replay derive it from the same records, so their events join — the fix
// for per-replay randomUUID ids that could never match (TASKS.md item 34). The source segment
// (tool_use id, or epoch-ms timestamp for a run no tool_use produced) never contains ":", so
// the first ":" after the prefix always terminates it even when the target path is unusual.
export function computeScriptExecutionChangeId(run: ScriptRun, target: Path): Uuid {
    const sourceSegment = run.toolUseId?.toString() ?? String(run.timestamp.getTime());
    return new Uuid(`${SCRIPT_RUN_CHANGE_ID_PREFIX}${sourceSegment}:${target.toString()}`);
}

// The session-attributable source id inside a scriptRun: changeId, or undefined when the id is
// not a scriptRun: id (real record uuids, originalFile: seeds, and blob refs pass through).
export function resolveScriptRunChangeIdToSourceId(changeId: string): string | undefined {
    if (!changeId.startsWith(SCRIPT_RUN_CHANGE_ID_PREFIX)) {
        return undefined;
    }
    const rest = changeId.slice(SCRIPT_RUN_CHANGE_ID_PREFIX.length);
    const separatorIndex = rest.indexOf(":");
    return separatorIndex === -1 ? rest : rest.slice(0, separatorIndex);
}

// " [file.jsonl:123]" for a run parsed from a transcript line, or "" for a synthetic run —
// appended to progress labels so a console line points at the exact JSONL line being processed.
export function formatRunSource(run: ScriptRun): string {
    return formatRecordSourceToken(run.source);
}

// The runnable source a script-execution block carries: `input.code` (MCP execute) or `input.command`
// (Bash). undefined for a non-executor tool, or an executor carrying neither.
function scriptCodeOf(block: ToolUseBlock): string | undefined {
    if (!EXECUTOR_TOOL_NAMES.has(block.name)) {
        return undefined;
    }
    const input = block.input as { code?: string; command?: string };
    return input.code ?? input.command;
}

// True when a tool_use is a script-execution run (a Bash or MCP-execution tool carrying script source).
export function isScriptExecutionRun(block: ToolUseBlock): boolean {
    return scriptCodeOf(block) !== undefined;
}

// The script-execution runs carried by one record's tool_use blocks (at the record's timestamp).
function runsInRecord(record: TranscriptRecord): ScriptRun[] {
    const timestamp = record.timestamp;
    if (!(timestamp instanceof Date)) {
        return [];
    }
    const recordCwd = (record as { cwd?: Path }).cwd;
    const source = getRecordSource(record);
    const runs: ScriptRun[] = [];
    for (const block of getContentBlocks(record)) {
        if (block.type !== BlockType.tool_use) {
            continue;
        }
        const code = scriptCodeOf(block);
        if (code !== undefined) {
            const blockCwd = (block.input as { cwd?: string }).cwd;
            const cwd = blockCwd !== undefined ? new Path(blockCwd) : recordCwd;
            runs.push({ code, timestamp, cwd, source, toolUseId: block.id });
        }
    }
    return runs;
}

// The authored Write body for every file basename, first Write wins (same first-match
// semantics as the retired per-basename scan, including a matching Write with an absent
// content). One pass over the records — previously every resolved run re-scanned them all.
function indexWrittenContentByBasename(records: TranscriptRecord[]): Map<string, string | undefined> {
    const writtenBodyByBasename = new Map<string, string | undefined>();
    for (const record of records) {
        for (const block of getContentBlocks(record)) {
            if (block.type !== BlockType.tool_use) {
                continue;
            }
            if (block.name !== ToolName.Write) {
                continue;
            }
            const input = block.input as { file_path?: string; content?: string };
            if (input.file_path === undefined) {
                continue;
            }
            const basename = pathBasename(input.file_path);
            if (!writtenBodyByBasename.has(basename)) {
                writtenBodyByBasename.set(basename, input.content);
            }
        }
    }
    return writtenBodyByBasename;
}

// Resolve script-file indirection: when a run merely invokes a written script file, replace
// the run's code with the invoked file's authored Write body. Handles two forms:
//   1. Direct invocation: `python3 script.py`, `bash script.sh`, `node script.js`, `npx tsx script.ts`
//   2. exec(open()) indirection: MCP ctx_execute wraps a script as `exec(open("file.py").read())`
// A run that already inlines its code, or whose invoked file has no Write, is returned unchanged.
// The script file extensions we resolve through indirection.
const SCRIPT_EXTENSIONS = [".py", ".sh", ".js", ".ts"];

// Whether a filename ends with a known script extension.
function isScriptFile(name: string): boolean {
    return SCRIPT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

// Extract the invoked script filename from a direct-invocation command like
// `python3 script.py`, `bash script.sh`, `node script.js`, `npx tsx script.ts`.
function parseDirectInvocation(code: string): string | undefined {
    const runners = ["python3", "python", "bash", "sh", "node", "npx tsx"];
    for (const runner of runners) {
        if (!code.includes(runner)) {
            continue;
        }
        const after = code.slice(code.indexOf(runner) + runner.length).trimStart();
        // first word after the runner, e.g. "apply.py --dry-run" -> "apply.py".
        const filename = after.split(singleWhitespace)[0] ?? "";
        if (isScriptFile(filename)) {
            return filename;
        }
    }
    return undefined;
}

// Extract the script filename from an exec(open()) wrapper like
// `exec(open("rename_inv.py").read())` — the MCP ctx_execute form.
function parseExecOpenIndirection(code: string): string | undefined {
    const marker = 'exec(open("';
    let start = code.indexOf(marker);
    if (start < 0) {
        start = code.indexOf("exec(open('");
        if (start < 0) {
            return undefined;
        }
        start += "exec(open('".length;
    } else {
        start += marker.length;
    }
    const end = code.indexOf('"', start) !== -1 ? code.indexOf('"', start) : code.indexOf("'", start);
    if (end < 0) {
        return undefined;
    }
    const filename = code.slice(start, end);
    return isScriptFile(filename) ? filename : undefined;
}

function resolveScriptIndirection(run: ScriptRun, writtenBodyByBasename: Map<string, string | undefined>): ScriptRun {
    const filename = parseDirectInvocation(run.code) ?? parseExecOpenIndirection(run.code);
    if (filename === undefined) {
        return run;
    }
    const body = writtenBodyByBasename.get(pathBasename(filename));
    return body === undefined ? run : { ...run, code: body };
}

// Every script-execution run in the transcript, in record order, each with its source and timestamp.
// A run that invokes a written script file is resolved to that file's body (resolveScriptIndirection).
// Memoized per records identity in the corpus (pure group): the result depends on the records alone,
// and the per-file repair chain calls this once per reconstructed file.
export function findScriptExecutionRuns(records: TranscriptRecord[]): ScriptRun[] {
    const state = getCorpusState(records);
    if (state.scriptRuns !== undefined) {
        return state.scriptRuns;
    }
    const writtenBodyByBasename = indexWrittenContentByBasename(records);
    state.scriptRuns = records.flatMap(runsInRecord).map((run) => resolveScriptIndirection(run, writtenBodyByBasename));
    return state.scriptRuns;
}

// The final path segment of a "/"-separated path string.
function pathBasename(value: string): string {
    const slash = value.lastIndexOf("/");
    return slash >= 0 ? value.slice(slash + 1) : value;
}

// --- static read-only detection (TASKS.md item 68) --------------------------------------------------

// Python stdlib roots a read-only analysis script may import without becoming a writer. Any
// other import marks the script may-write: a seeded local module can run write code at import
// time (the s34 script-indirection family), and shutil/subprocess/sqlite3 write outright.
// A missing safe module only costs sandbox savings, never correctness — extend freely.
const READ_ONLY_SAFE_IMPORT_ROOTS = new Set([
    "os", "sys", "re", "json", "csv", "glob", "pathlib", "collections", "itertools",
    "functools", "math", "statistics", "textwrap", "difflib", "datetime", "time", "string",
    "typing", "dataclasses", "enum", "pprint", "fnmatch", "bisect", "heapq", "operator",
    "hashlib", "unicodedata", "copy", "ast", "tokenize", "keyword", "inspect", "traceback",
    "argparse", "random", "io", "base64", "struct", "uuid",
]);

// Whether every import statement in `code` names only read-only-safe stdlib roots, and no
// from-import smuggles a writing name (`from os import remove`) out of a safe root.
function allImportsAreReadOnlySafe(code: string): boolean {
    for (const match of code.matchAll(importStatementLine)) {
        for (const item of match[1]!.split(",")) {
            const root = item.trim().split(singleWhitespace)[0]?.split(".")[0] ?? "";
            if (!READ_ONLY_SAFE_IMPORT_ROOTS.has(root)) return false;
        }
    }
    for (const match of code.matchAll(fromImportStatementLine)) {
        const root = match[1]!.split(".")[0] ?? "";
        if (!READ_ONLY_SAFE_IMPORT_ROOTS.has(root)) return false;
        if (writingImportedName.test(match[2]!)) return false;
    }
    return true;
}

// Whether every open( call in `code` is provably a read: builtin open with one argument or a
// read-mode/keyword second argument; a dot-call (Path.open, io.open) must show a read mode or
// keyword-only args as its FIRST argument (Path.open's first parameter IS the mode). Anything
// the cheap first-")" parse cannot prove (nested calls, variable modes) counts as may-write.
function allOpenCallsAreReads(code: string): boolean {
    for (const match of code.matchAll(openCallToken)) {
        const argsStart = match.index! + match[0].length;
        const argsEnd = code.indexOf(")", argsStart);
        if (argsEnd < 0) return false;
        const args = code.slice(argsStart, argsEnd);
        // A nested call defeats the first-")" slice (an f-string's embedded call can even
        // hide a write mode past it) — bail to may-write.
        if (args.includes("(")) return false;
        const parts = args.split(",");
        const isDotCall = match.index! > 0 && code[match.index! - 1] === ".";
        if (isDotCall) {
            // Path.open(): no arguments defaults to mode "r".
            if (args.trim() === "") continue;
            if (!readOnlyOpenArgument.test(parts[0]!)) return false;
            continue;
        }
        // builtin open(file): a single argument defaults to mode "r".
        if (parts.length === 1) continue;
        if (!readOnlyOpenArgument.test(parts[1]!)) return false;
    }
    return true;
}

// Whether the script could write, delete, rename, or create files when run under the python3
// sandbox. Conservative by construction: any unparseable construct answers true (may-write),
// which merely executes the run as before the gate; only a provably-read-only script answers
// false. Shell/JS-only tokens are irrelevant to correctness — a non-python script crashes in
// the sandbox and yields post:undefined with or without the gate.
// ponytail: raw-text scan — aliased builtins (`o = open`) and getattr tricks evade it; no
// recorded transcript uses them, and task 67's executed-outcome check is the exact answer.
export function scriptCodeMayWriteFiles(code: string): boolean {
    if (pythonWritePrimitive.test(code)) return true;
    if (!allImportsAreReadOnlySafe(code)) return true;
    if (!allOpenCallsAreReads(code)) return true;
    return false;
}

// The absolute path of the tracked file whose basename matches `basename`, from any tool_use block.
function resolvePathByBasename(records: TranscriptRecord[], basename: string): Path | undefined {
    for (const record of records) {
        for (const block of getContentBlocks(record)) {
            if (block.type !== BlockType.tool_use) continue;
            const filePath = (block.input as { file_path?: string }).file_path;
            if (filePath !== undefined && pathBasename(filePath) === basename) return new Path(filePath);
        }
    }
    return undefined;
}

// --- forward execution pipeline --------------------------------------------------------------------

// All file-path-like quoted strings in the script source (e.g. "billing.py", "renames.csv").
export function parseScriptFileRefs(code: string): string[] {
    const matches = code.match(quotedFilename) ?? [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

// A callback that returns a file's reconstructed content just before `before`, or undefined
// when the lineage has no revision strictly before that instant.
export type LineageContentBefore = (target: Path, before: Date) => string | undefined;

// The name the script uses for this file from the run's cwd: the cwd-relative path when the
// file lives under cwd (preserving subdirectories like "tests/"), else the flat basename.
export function computeScriptStateKey(filePath: Path, runCwd: Path | undefined): string {
    if (runCwd !== undefined) {
        const cwdRelativePath = relative(runCwd.toString(), filePath.toString());
        if (cwdRelativePath !== "" && !cwdRelativePath.startsWith("..")) {
            return cwdRelativePath;
        }
    }
    return pathBasename(filePath.toString());
}

// The pre-execution state of every file the run could touch, keyed by the path the script uses
// from its cwd: every file Written before the run (at its rename-resolved current name), plus any
// file the script source references that only a backup knows.
export function getPreExecutionState(
    run: ScriptRun,
    records: TranscriptRecord[],
    reader: BackupReader,
    seedContent?: LineageContentBefore,
): Map<string, string> {
    reportReconstructionProgress(`building pre-execution state for run @ ${run.timestamp.toISOString()}${formatRunSource(run)}`);
    const events = extractFileEvents(records);
    const renameChain = buildRenameChain(events);
    const state = new Map<string, string>();
    for (const event of events) {
        if (event.kind !== EventKind.write) continue;
        if (event.timestamp.getTime() > run.timestamp.getTime()) continue;
        const currentPath = resolveFinalPath(event.target, renameChain);
        // Lineage first (it carries post-backup Edits and earlier runs' effects); then the
        // backup at the current name; then the rename source's backup; then the authored Write.
        const content = seedContent?.(currentPath, run.timestamp)
            ?? backupSeedWriteFor(records, currentPath, run.timestamp, reader)?.content
            ?? backupSeedWriteFor(records, event.target, run.timestamp, reader)?.content
            ?? event.content;
        state.set(computeScriptStateKey(currentPath, run.cwd), content);
    }
    for (const ref of parseScriptFileRefs(run.code)) {
        if (state.has(ref)) continue;
        const absolutePath = resolvePathByBasename(records, pathBasename(ref));
        if (absolutePath === undefined) continue;
        const content = seedContent?.(absolutePath, run.timestamp)
            ?? backupSeedWriteFor(records, absolutePath, run.timestamp, reader)?.content;
        if (content !== undefined) state.set(ref, content);
    }
    return state;
}

// Every file under `dir`, as [pathRelativeToBase, utf8 content], recursing into subdirectories.
function readAllFiles(dir: string, base: string = dir): [string, string][] {
    const files: [string, string][] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...readAllFiles(full, base));
        } else if (entry.isFile()) {
            files.push([relative(base, full), readFileSync(full, "utf8")]);
        }
    }
    return files;
}

// Execute the script in a temp dir against the pre-execution file state, return the post-execution
// content of EVERY file left in the dir — not just the seeded ones — so a file the script CREATES
// (a redirect target, an out.txt) or RENAMES-TO (a shutil.move destination) is captured, and a file
// it deletes is absent. undefined if the script fails.
// The script's first line, capped, so a progress line identifies which run is executing.
function summarizeScriptForProgress(script: string): string {
    const firstLine = script.split("\n", 1)[0] ?? "";
    if (firstLine.length <= 60) {
        return firstLine;
    }
    return `${firstLine.slice(0, 59)}…`;
}

export const PROGRESS_LABEL_SANDBOX_SPAWN_PREFIX = "running script in sandbox";
export const PROGRESS_LABEL_SANDBOX_MEMO_PREFIX = "reusing sandbox result";

// Sandbox outcomes per (script, seeded state) content hash. The engine's replay premise is
// that a recorded script is a deterministic transform of its seeded files, so one spawn per
// distinct input suffices — lineage replays and rolling re-seeds re-ask constantly (s84:
// 208 asks, 14 distinct inputs, ~23s of the 25s load). Failed runs memoize too. The outcome
// wrapper makes a memoized failure (`post: undefined`) distinguishable from a cache miss.
// ponytail: outcomes are returned by reference — every caller treats post-states as read-only.
type SandboxOutcome = { post: Map<string, string> | undefined };
const sandboxOutcomesByInput = new Map<string, SandboxOutcome>();
// Sized above the largest observed corpus run count (the 33-session RevEng project holds 1000+
// distinct runs): a capacity below the corpus size evicts outcomes before persistSandboxMemoToDisk
// snapshots the map, so every cold process re-spawned nearly every run instead of reading the disk
// memo. ponytail: flat constant, not corpus-derived — revisit if a project exceeds it.
const SANDBOX_MEMO_CAPACITY = 4096;

// Item 11: opt-in disk persistence for the sandbox memo. Only the viewer server configures a
// path (engine CLI + tests stay memory-only, keeping spawn-count tests deterministic). The
// whole memo is rewritten after each new spawn — a spawn costs ~100ms, the write is trivial.
let sandboxMemoFilePath: Path | undefined;

// Wire shape of one memo entry on disk: `post: null` records a memoized failure.
type PersistedSandboxOutcome = { post: Record<string, string> | null };

export function configureSandboxMemoPersistence(filePath: Path | undefined): void {
    sandboxMemoFilePath = filePath;
    sandboxOutcomesByInput.clear();
    if (filePath === undefined) {
        return;
    }
    loadSandboxMemoFromDisk(filePath);
}

// Seed the (just-cleared) memo from a previously persisted file; absent file = start empty.
function loadSandboxMemoFromDisk(filePath: Path): void {
    if (!existsSync(filePath.toString())) {
        return;
    }
    try {
        const persisted = JSON.parse(readFileSync(filePath.toString(), "utf8")) as Record<
            string,
            PersistedSandboxOutcome
        >;
        for (const [inputKey, outcome] of Object.entries(persisted)) {
            sandboxOutcomesByInput.set(inputKey, {
                post: outcome.post === null ? undefined : new Map(Object.entries(outcome.post)),
            });
        }
    } catch (error) {
        // A corrupt cache file must not kill the server — log once and continue empty.
        console.error(`sandbox memo cache unreadable, starting empty: ${String(error)}`);
    }
}

// Mirror the capped memo to disk (called after set + evict, so the file inherits the 256 cap).
function persistSandboxMemoToDisk(): void {
    if (sandboxMemoFilePath === undefined) {
        return;
    }
    try {
        const persisted: Record<string, PersistedSandboxOutcome> = {};
        for (const [inputKey, outcome] of sandboxOutcomesByInput) {
            persisted[inputKey] = { post: outcome.post === undefined ? null : Object.fromEntries(outcome.post) };
        }
        mkdirSync(dirname(sandboxMemoFilePath.toString()), { recursive: true });
        writeFileSync(sandboxMemoFilePath.toString(), JSON.stringify(persisted));
    } catch (error) {
        // Persistence failure is tolerable; losing the reconstruction is not.
        console.error(`sandbox memo cache not persisted: ${String(error)}`);
    }
}

// One collision-safe key per distinct sandbox input: the script plus every seeded (path,
// content) pair in sorted-path order, NUL-separated, hashed.
function computeSandboxInputKey(script: string, preState: Map<string, string>): string {
    const hash = createHash("sha256");
    hash.update(script);
    const sortedPaths = [...preState.keys()].sort();
    for (const path of sortedPaths) {
        hash.update("\0");
        hash.update(path);
        hash.update("\0");
        hash.update(preState.get(path)!);
    }
    return hash.digest("hex");
}

export function runScriptAgainstState(
    script: string,
    preState: Map<string, string>,
    sourceLabel = "",
): Map<string, string> | undefined {
    const inputKey = computeSandboxInputKey(script, preState);
    const memoizedOutcome = getCachedValueRefreshingRecency(sandboxOutcomesByInput, inputKey);
    if (memoizedOutcome !== undefined) {
        reportReconstructionProgress(
            `${PROGRESS_LABEL_SANDBOX_MEMO_PREFIX}${sourceLabel}: ${summarizeScriptForProgress(script)}`,
        );
        return memoizedOutcome.post;
    }
    reportReconstructionProgress(
        `${PROGRESS_LABEL_SANDBOX_SPAWN_PREFIX} (${preState.size} seeded files)${sourceLabel}: ${summarizeScriptForProgress(script)}`,
    );
    const post = spawnSandboxRun(script, preState);
    sandboxOutcomesByInput.set(inputKey, { post });
    evictLeastRecentlyUsedEntries(sandboxOutcomesByInput, SANDBOX_MEMO_CAPACITY);
    persistSandboxMemoToDisk();
    return post;
}

// The sandbox execution itself, extracted verbatim from the pre-memo body: seed a temp dir,
// run python3, read back the resulting tree (undefined on any script failure).
function spawnSandboxRun(script: string, preState: Map<string, string>): Map<string, string> | undefined {
    const tempDir = mkdtempSync(join(tmpdir(), "reveng-"));
    try {
        for (const [relativePath, content] of preState) {
            const dest = join(tempDir, relativePath);
            mkdirSync(dirname(dest), { recursive: true });
            writeFileSync(dest, content);
        }
        writeFileSync(join(tempDir, "__script__.py"), script);
        execSync("python3 __script__.py", { cwd: tempDir, timeout: 5000, stdio: "pipe" });
        const result = new Map<string, string>();
        for (const [relativePath, content] of readAllFiles(tempDir)) {
            if (relativePath === "__script__.py") continue;
            result.set(relativePath, content);
        }
        return result;
    } catch {
        return undefined;
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}

