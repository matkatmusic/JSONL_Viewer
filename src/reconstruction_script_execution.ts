// Script-execution replay (s37-script-rename-driver-back-and-forth-mcp), part 1 of 2: the event type,
// the rename transform, run detection, and transform derivation. A recorded script run — a Bash
// command or an MCP ctx_execute/ctx_batch_execute — transforms many tracked files at time T but leaves
// NO per-file Write/Edit in the transcript. This module turns a run into the substitutions it applies
// and the forward transform; the reconstruction stage that validates and injects it lives in
// reconstruction_script_stage.ts (split to keep both within the 250-line cap — split, never condense).
// Design: ~/.claude/plans/task-implement-script-replay-partitioned-puppy.md + this session's algorithm.

import { BlockType, EventKind, ToolName } from "./structures/vocabulary.ts";
import { Path, type Uuid } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { getContentBlocks, type ToolUseBlock } from "./structures/content-blocks.ts";
import { backupSeedWriteFor, type BackupReader } from "./reconstruction_sidecar.ts";

// One whole-token substitution a rename-script run applies: every `\bold\b` becomes `new`.
export type RenameSub = { old: string; new: string };

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

// --- transform derivation (the rename-CSV script-type) ----------------------------------------------

// Parse a renames CSV (`old,new` header + rows) into whole-token substitutions. Blank lines are
// skipped (a trailing newline is harmless) and the `old,new` header row is dropped.
export function parseRenameSubs(csvContent: string): RenameSub[] {
    const rows = csvContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    const subs: RenameSub[] = [];
    for (const row of rows) {
        const [oldToken, newToken] = row.split(",");
        if (oldToken === undefined || newToken === undefined) {
            continue;
        }
        if (oldToken === "old" && newToken === "new") {
            continue;
        }
        subs.push({ old: oldToken, new: newToken });
    }
    return subs;
}

// The target file paths a script run rewrites: the quoted strings in its `TARGETS = ...` line. Works
// whether TARGETS is a literal list (`["a.py", "b.py"]`) or a comprehension over one
// (`[os.path.join(BASE, p) for p in ["a.py", "b.py"]]`) — only the relative names are quoted, so an
// absolute BASE prefix (a bare variable) is ignored. Relative names match the engine's cwd-resolved
// targets.
export function parseScriptTargets(code: string): Path[] {
    const assignment = code.match(/TARGETS\s*=\s*(.+)/);
    if (!assignment) {
        return [];
    }
    const quoted = assignment[1]!.match(/"([^"]+)"/g) ?? [];
    return quoted.map((token) => new Path(token.slice(1, -1)));
}

// Escape a literal string for safe use inside a RegExp pattern.
export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Apply each whole-token substitution across the joined text: `\bold\b` -> `new`, case-sensitive.
// This is the forward script transform — the same `re.sub(rf"\b{re.escape(old)}\b", new, text)` the
// recorded run performs.
export function applyRenameSubs(lines: string[], subs: RenameSub[]): string[] {
    let text = lines.join("\n");
    for (const sub of subs) {
        const pattern = new RegExp(`\\b${escapeRegExp(sub.old)}\\b`, "g");
        text = text.replace(pattern, sub.new);
    }
    return text.split("\n");
}

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

// Every script-execution run in the transcript, in record order, each with its source and timestamp.
export function findScriptExecutionRuns(records: TranscriptRecord[]): ScriptRun[] {
    return records.flatMap(runsInRecord);
}

// The final path segment of a "/"-separated path string.
function pathBasename(value: string): string {
    const slash = value.lastIndexOf("/");
    return slash >= 0 ? value.slice(slash + 1) : value;
}

// The basename of the first `*.csv` literal a script references, or undefined when it references none
// (then it is not the rename-CSV script-type — the one script-type modelled so far).
function csvBasenameOf(code: string): string | undefined {
    const match = code.match(/"([^"]*\.csv)"/);
    return match ? pathBasename(match[1]!) : undefined;
}

// The absolute file_path of the Write in one record whose basename matches `basename`, or undefined.
function writtenPathInRecord(record: TranscriptRecord, basename: string): Path | undefined {
    for (const block of getContentBlocks(record)) {
        if (block.type !== BlockType.tool_use || block.name !== ToolName.Write) {
            continue;
        }
        const filePath = (block.input as { file_path?: string }).file_path;
        if (filePath !== undefined && pathBasename(filePath) === basename) {
            return new Path(filePath);
        }
    }
    return undefined;
}

// The absolute path of the tracked file whose basename matches `basename`, taken from the Write that
// created it (the rename CSV lives beside the targets). undefined when no such Write exists.
function writtenPathByBasename(records: TranscriptRecord[], basename: string): Path | undefined {
    for (const record of records) {
        const found = writtenPathInRecord(record, basename);
        if (found !== undefined) {
            return found;
        }
    }
    return undefined;
}

// The whole-token substitutions a rename-CSV run applies, recovered from the run's CSV as of the run
// time. The CSV's file-history backup is the on-disk data input — preferred over the transcript Write,
// which can be stale (s37's recorded Write holds 2 rows but the file ran with 4). undefined when the
// run is not the rename-CSV script-type or its CSV cannot be recovered.
export function deriveRenameSubs(
    run: ScriptRun,
    records: TranscriptRecord[],
    reader: BackupReader,
): RenameSub[] | undefined {
    const basename = csvBasenameOf(run.code);
    if (basename === undefined) {
        return undefined;
    }
    const csvPath = writtenPathByBasename(records, basename);
    if (csvPath === undefined) {
        return undefined;
    }
    const csv = backupSeedWriteFor(records, csvPath, run.timestamp, reader, true);
    if (csv === undefined) {
        return undefined;
    }
    const subs = parseRenameSubs(csv.content);
    return subs.length > 0 ? subs : undefined;
}
