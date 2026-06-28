// Script-execution replay, part 1 of 2: event types, run detection, indirection resolution, and the
// forward-execution pipeline (getPreExecutionState + runScriptAgainstState). The validation/injection
// stage lives in reconstruction_script_stage.ts.

import { BlockType, EventKind, ToolName } from "./structures/vocabulary.ts";
import { Path, type Uuid } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { getContentBlocks, type ToolUseBlock } from "./structures/content-blocks.ts";
import { backupSeedWriteFor, type BackupReader } from "./reconstruction_sidecar.ts";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

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

// The tools that EXECUTE a script — and so can modify many tracked files with no per-file Write/Edit:
// the Bash shell and the context-mode MCP execution tools. A "run" is one such tool_use.
const EXECUTOR_TOOL_NAMES = new Set<string>([
    ToolName.Bash,
    ToolName.CtxExecute,
    ToolName.CtxExecuteFile,
    ToolName.CtxBatchExecute,
]);

// A recorded script-execution run: the script source it ran and when.
export type ScriptRun = { code: string; timestamp: Date };

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
    const runs: ScriptRun[] = [];
    for (const block of getContentBlocks(record)) {
        if (block.type !== BlockType.tool_use) {
            continue;
        }
        const code = scriptCodeOf(block);
        if (code !== undefined) {
            runs.push({ code, timestamp });
        }
    }
    return runs;
}

// The authored body of the Write whose file basename matches `basename`, or undefined.
function writtenContentByBasename(records: TranscriptRecord[], basename: string): string | undefined {
    for (const record of records) {
        for (const block of getContentBlocks(record)) {
            if (block.type !== BlockType.tool_use || block.name !== ToolName.Write) continue;
            const input = block.input as { file_path?: string; content?: string };
            if (input.file_path !== undefined && pathBasename(input.file_path) === basename) return input.content;
        }
    }
    return undefined;
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
        const filename = after.split(/\s/)[0] ?? "";
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

function resolveScriptIndirection(run: ScriptRun, records: TranscriptRecord[]): ScriptRun {
    const filename = parseDirectInvocation(run.code) ?? parseExecOpenIndirection(run.code);
    if (filename === undefined) {
        return run;
    }
    const body = writtenContentByBasename(records, pathBasename(filename));
    return body === undefined ? run : { ...run, code: body };
}

// Every script-execution run in the transcript, in record order, each with its source and timestamp.
// A run that invokes a written script file is resolved to that file's body (resolveScriptIndirection).
export function findScriptExecutionRuns(records: TranscriptRecord[]): ScriptRun[] {
    return records.flatMap(runsInRecord).map((run) => resolveScriptIndirection(run, records));
}

// The final path segment of a "/"-separated path string.
function pathBasename(value: string): string {
    const slash = value.lastIndexOf("/");
    return slash >= 0 ? value.slice(slash + 1) : value;
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
    const matches = code.match(/"([^"]+\.[a-z]{1,4})"/g) ?? [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

// The pre-execution state of all files a script references, keyed by the relative path the script
// uses. Each file's content is recovered from the file-history backup at or before the run time.
export function getPreExecutionState(
    run: ScriptRun,
    records: TranscriptRecord[],
    reader: BackupReader,
): Map<string, string> {
    const state = new Map<string, string>();
    for (const ref of parseScriptFileRefs(run.code)) {
        const absPath = resolvePathByBasename(records, pathBasename(ref));
        if (absPath === undefined) continue;
        const seed = backupSeedWriteFor(records, absPath, run.timestamp, reader);
        if (seed === undefined) continue;
        state.set(ref, seed.content);
    }
    return state;
}

// Execute the script in a temp dir against the pre-execution file state, return post-execution
// content of every referenced file. undefined if the script fails.
export function runScriptAgainstState(
    script: string,
    preState: Map<string, string>,
): Map<string, string> | undefined {
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
        for (const relativePath of preState.keys()) {
            try { result.set(relativePath, readFileSync(join(tempDir, relativePath), "utf8")); }
            catch { /* file deleted by script */ }
        }
        return result;
    } catch {
        return undefined;
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}

