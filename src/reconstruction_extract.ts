// Extraction: turn a transcript's records into ordered file events (records ->
// events). Each tool_use becomes at most one event (Write -> create, Bash rm ->
// delete, Bash mv -> rename, Edit -> splice). The event model and replay live in
// reconstruction_engine.ts / reconstruction_replay.ts. Design: the engine file.

import { getContentBlocks } from "./structures/content-blocks.ts";
import type { ToolUseBlock } from "./structures/content-blocks.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import {
    indexToolUseNamesById,
    type EditResult,
    type StructuredPatchHunk,
} from "./structures/tool-results.ts";
import { BlockType, EventKind, EXECUTOR_TOOL_NAMES, ToolName, Verdict } from "./structures/vocabulary.ts";
import { recordVerdict } from "./reconstruction_parse_lines.ts";
import { Path } from "./structures/domain.ts";
import { resolveAgainstCwd } from "./structures/path-resolve.ts";
import type {
    CopyInfo,
    EditEvent,
    FileEvent,
    RenameInfo,
    WriteEvent,
} from "./reconstruction_engine.ts";
import { userEditEventFrom } from "./reconstruction_user_edit.ts";
import { getCorpusState } from "./reconstruction_corpus.ts";
import {
    bashAppendRedirect,
    bashCopyCommand,
    bashMoveCommand,
    bashOverwriteRedirect,
    bashRemoveCommand,
    renameArrowLine,
    whitespaceRun,
} from "./regex_expressions.ts";

// Turn a Write tool_use into a write event (file_path/content live in its input).
function writeEventFrom(block: ToolUseBlock, timestamp: Date): WriteEvent {
    const input = block.input as { file_path: string; content: string };
    return {
        kind: EventKind.write,
        changeId: block.id,
        target: new Path(input.file_path),
        content: input.content,
        timestamp,
    };
}

// Parse the target path out of an `rm <path>` Bash command (s1 has no flags).
// ponytail: splits on whitespace — no quoted-path support, add if a scenario needs it
export function parseRmTargets(command: string): Path[] {
    const match = command.trim().match(bashRemoveCommand);
    if (!match) {
        return [];
    }
    return match[1]!.trim().split(whitespaceRun).map((p) => new Path(p));
}

// Parse `mv <src> <dst>` or `git mv <src> <dst>` (two space-separated paths, no flags).
// s2 used plain `mv` with absolute paths; s6 uses `git mv` with cwd-relative paths.
export function parseMvPaths(command: string): RenameInfo | undefined {
    const match = command.trim().match(bashMoveCommand);
    if (!match) {
        return undefined;
    }
    return { from: new Path(match[1]!), to: new Path(match[2]!) };
}

// Parse `cp <src> <dst>` (two space-separated paths, no flags — the s3 form).
export function parseCpPaths(command: string): CopyInfo | undefined {
    const match = command.trim().match(bashCopyCommand);
    if (!match) {
        return undefined;
    }
    return { from: new Path(match[1]!), to: new Path(match[2]!) };
}

// The bash null device: `> /dev/null` discards output, so a redirect to it is not a write.
const NULL_DEVICE = "/dev/null";

// A parsed bash output redirection: the target file and whether it appends (`>>`)
// rather than overwrites (`>`).
type ParsedRedirect = {
    target: Path;
    appends: boolean;
};

// Parse a bash output redirection target: `>>` appends, `>` overwrites/creates. Returns the
// target and whether it appends, or undefined when there is no redirect. The content is NOT
// parsed from the command — it is recovered from the file-history sidecar (locked decision 3).
export function parseRedirect(command: string): ParsedRedirect | undefined {
    const appended = command.match(bashAppendRedirect);
    if (appended && appended[1] !== NULL_DEVICE) {
        return { target: new Path(appended[1]!), appends: true };
    }
    const overwritten = command.match(bashOverwriteRedirect);
    if (overwritten && overwritten[1] !== NULL_DEVICE) {
        return { target: new Path(overwritten[1]!), appends: false };
    }
    // `> /dev/null` (and `>>`) discards output — it is not a real file, so it must
    // never become a file event or show up in the Files list (task 76).
    return undefined;
}

// Turn a Bash tool_use into a file event: `rm` -> delete, `mv`/`git mv` -> rename, `cp` ->
// copy, else undefined (s1 uses rm; s2 uses mv; s3 uses cp; s6 uses git mv). The rename's
// relative paths are resolved against `cwd` so they match the absolute Write/Edit targets.
function bashEventsFrom(
    block: ToolUseBlock,
    timestamp: Date,
    cwd: Path | undefined,
): FileEvent[] {
    const input = block.input as { command: string };
    const removed = parseRmTargets(input.command);
    if (removed.length > 0) {
        return removed.map((target) => ({ kind: EventKind.delete as const, changeId: block.id, target, timestamp }));
    }
    const moved = parseMvPaths(input.command);
    if (moved) {
        return [{
            kind: EventKind.rename,
            changeId: block.id,
            from: new Path(resolveAgainstCwd(cwd, moved.from)),
            to: new Path(resolveAgainstCwd(cwd, moved.to)),
            timestamp,
        }];
    }
    const copied = parseCpPaths(input.command);
    if (copied) {
        return [{
            kind: EventKind.copy,
            changeId: block.id,
            from: copied.from,
            to: copied.to,
            seedLines: [],
            timestamp,
        }];
    }
    const redirected = parseRedirect(input.command);
    if (redirected) {
        const kind = redirected.appends ? EventKind.append : EventKind.overwrite;
        return [{ kind, changeId: block.id, target: redirected.target, content: "", timestamp }];
    }
    return [];
}

// The per-Edit detail from its result record: structuredPatch hunks + the literal pre-edit content.
type EditDetail = { hunks: StructuredPatchHunk[]; originalFile: string };

// Turn an Edit tool_use into an edit event, attaching the structuredPatch hunks and pre-edit content
// reported for it (looked up by tool_use id), or undefined when none are found.
function editEventFrom(
    block: ToolUseBlock,
    timestamp: Date,
    detailById: Map<string, EditDetail>,
): EditEvent | undefined {
    const input = block.input as { file_path: string };
    const detail = detailById.get(block.id.toString());
    if (!detail) {
        return undefined;
    }
    return {
        kind: EventKind.edit,
        changeId: block.id,
        target: new Path(input.file_path),
        hunks: detail.hunks,
        originalFile: detail.originalFile,
        timestamp,
    };
}

// Map a tool_use block to a file event (Write -> create, Bash rm/mv/git mv -> delete/
// rename, Edit -> in-place splice). `cwd` is the record's working directory, used to resolve
// a rename's relative paths to absolute.
function toFileEvents(
    block: ToolUseBlock,
    timestamp: Date,
    detailById: Map<string, EditDetail>,
    cwd: Path | undefined,
): FileEvent[] {
    if (block.name === ToolName.Write) {
        const e = writeEventFrom(block, timestamp);
        return e ? [e] : [];
    }
    if (block.name === ToolName.Bash) {
        return bashEventsFrom(block, timestamp, cwd);
    }
    if (block.name === ToolName.Edit) {
        const e = editEventFrom(block, timestamp, detailById);
        return e ? [e] : [];
    }
    return [];
}

function collectEventsFromRecord(
    record: TranscriptRecord,
    events: FileEvent[],
    detailById: Map<string, EditDetail>,
): void {
    // The single keep/ignore gate: a record the classifier marks `ignore` carries no file evidence,
    // so it can produce no event. Today this is a no-op (extraction already only emits from
    // Write/Edit/Bash-file-op/user-edit records); Phase C admits the script-rename run through it.
    if (recordVerdict(record) === Verdict.ignore) {
        return;
    }
    const timestamp = record.timestamp;
    if (!(timestamp instanceof Date)) {
        return;
    }
    const cwd = (record as { cwd?: Path }).cwd;
    for (const block of getContentBlocks(record)) {
        if (block.type !== BlockType.tool_use) {
            continue;
        }
        events.push(...toFileEvents(block, timestamp, detailById, cwd));
    }
    const userEdit = userEditEventFrom(record);
    if (userEdit) {
        events.push(userEdit);
    }
}

// Map each Edit's tool_use id -> its structuredPatch hunks and pre-edit content, read from the user
// record that reports the result (toolUseResult), keyed back via tool_use_id.
function indexEditDetailByToolUseId(
    records: TranscriptRecord[],
): Map<string, EditDetail> {
    const nameById = indexToolUseNamesById(records);
    const detailById = new Map<string, EditDetail>();
    for (const record of records) {
        collectEditDetailFromRecord(record, nameById, detailById);
    }
    return detailById;
}

function collectEditDetailFromRecord(
    record: TranscriptRecord,
    nameById: Map<string, string>,
    detailById: Map<string, EditDetail>,
): void {
    for (const block of getContentBlocks(record)) {
        if (block.type !== BlockType.tool_result) {
            continue;
        }
        const toolName = nameById.get(block.tool_use_id.toString());
        if (toolName !== ToolName.Edit) {
            continue;
        }
        const result = record.toolUseResult as EditResult | undefined;
        // Require structuredPatch — an Edit result lacking it produced no event before; don't build a hunkless edit.
        if (result && result.structuredPatch) {
            detailById.set(block.tool_use_id.toString(), { hunks: result.structuredPatch, originalFile: result.originalFile });
        }
    }
}

// The plain text of an executor's tool result across the shapes it takes: a Bash result object (`.stdout`),
// an MCP ctx_execute result (an array of `{type:"text", text}` blocks), or a bare string.
function toolResultText(record: TranscriptRecord): string {
    const raw = (record as { toolUseResult?: unknown }).toolUseResult;
    if (typeof raw === "string") {
        return raw;
    }
    if (Array.isArray(raw)) {
        const blockTexts = raw.map((block) => (block && typeof block === "object" && "text" in block ? String((block as { text: unknown }).text) : ""));
        return blockTexts.join("\n");
    }
    if (raw && typeof raw === "object" && typeof (raw as { stdout?: unknown }).stdout === "string") {
        return (raw as { stdout: string }).stdout;
    }
    return "";
}

// The final path segment of a "/"-separated path string.
function basenameOf(value: string): string {
    const slash = value.lastIndexOf("/");
    return slash >= 0 ? value.slice(slash + 1) : value;
}

// Renames performed by an EXECUTED script (Bash or MCP ctx_execute), recovered from the run's printed stdout:
// the transcript captures each `old -> new` line the script prints. A `shutil.move`/`os.rename` inside the
// code is invisible to extraction (it is not a Bash `mv`), so the printed mapping is the only in-transcript
// evidence of the move; parsing it into rename events lets the renamed-to path reconstruct as its source's
// lineage (buildRenameChain/distinctFinalPaths). Two guards keep it honest: the source basename must have been
// written/edited earlier (drops coincidental `x.y -> z.y` prose), and `renameArrowLine` only accepts
// dot-extension filenames on BOTH sides — so a function-rename print (`f_one -> alpha`) and the echoed
// f-string code (`{name}.py -> …`) never match.
export function extractScriptRenameEvents(records: TranscriptRecord[]): FileEvent[] {
    // executor tool_use id -> its run instant and cwd (MCP carries input.cwd; Bash uses the record cwd).
    const executors = new Map<string, { timestamp: Date; cwd: Path | undefined }>();
    // basenames of every file a Write/Edit targeted — a rename source must be one of these (phantom guard).
    const writtenBasenames = new Set<string>();
    for (const record of records) {
        const timestamp = record.timestamp;
        const recordCwd = (record as { cwd?: Path }).cwd;
        for (const block of getContentBlocks(record)) {
            if (block.type !== BlockType.tool_use) {
                continue;
            }
            if (block.name === ToolName.Write || block.name === ToolName.Edit) {
                const filePath = (block.input as { file_path?: string }).file_path;
                if (filePath !== undefined) {
                    writtenBasenames.add(basenameOf(filePath));
                }
            }
            if (EXECUTOR_TOOL_NAMES.has(block.name) && timestamp instanceof Date) {
                const cwd = (block.input as { cwd?: string }).cwd;
                executors.set(block.id.toString(), { timestamp, cwd: cwd !== undefined ? new Path(cwd) : recordCwd });
            }
        }
    }
    const events: FileEvent[] = [];
    for (const record of records) {
        for (const block of getContentBlocks(record)) {
            if (block.type !== BlockType.tool_result) {
                continue;
            }
            const executor = executors.get(block.tool_use_id.toString());
            if (executor === undefined) {
                continue;
            }
            for (const match of toolResultText(record).matchAll(renameArrowLine)) {
                const [, from, to] = match;
                if (!writtenBasenames.has(basenameOf(from!))) {
                    continue;
                }
                events.push({
                    kind: EventKind.rename,
                    changeId: block.tool_use_id,
                    from: new Path(resolveAgainstCwd(executor.cwd, new Path(from!))),
                    to: new Path(resolveAgainstCwd(executor.cwd, new Path(to!))),
                    timestamp: executor.timestamp,
                });
            }
        }
    }
    return events;
}

// Extract every file event across the transcript, ordered by timestamp. Bash/Write/Edit evidence comes from
// per-record extraction; script-run renames (Bash or MCP) are recovered separately from the runs' printed
// stdout, since the move happens inside script code that leaves no per-record tool_use event.
// Memoized per records identity in the corpus (pure group): the result depends on the records alone, and
// the per-file repair chain re-enters here for every reconstructed file and every pre-execution replay.
// Callers only filter/map the shared array — no pass mutates it or its events.
export function extractFileEvents(records: TranscriptRecord[]): FileEvent[] {
    const state = getCorpusState(records);
    if (state.fileEvents !== undefined) {
        return state.fileEvents;
    }
    const detailById = indexEditDetailByToolUseId(records);
    const events: FileEvent[] = [];
    for (const record of records) {
        collectEventsFromRecord(record, events, detailById);
    }
    events.push(...extractScriptRenameEvents(records));
    state.fileEvents = events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return state.fileEvents;
}
