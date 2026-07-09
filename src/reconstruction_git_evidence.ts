// Git-commit blobs as an evidence channel: a transcript records `git commit` commands (with cwd and
// timestamps) but not the committed content. When the repo still exists on disk, the commit resolved
// by timestamp yields the committed bytes — evidence for content no other channel carries (s85's
// out-of-band `# reviewed by ops` comment exists ONLY in its `post-rename` commit).

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { isImpureExecutionAllowed } from "./reconstruction_exec_gate.ts";
import { dirname, join, relative } from "node:path";
import { getRecordSource } from "./parse/loadTranscript.ts";
import { getPathOverrides } from "./reconstruction_overrides.ts";
import {
    BlockType,
    EventKind,
    GitOperationKind,
    KNOWN_GIT_OPERATION_KINDS,
    ToolName,
} from "./structures/vocabulary.ts";
import { Path, Uuid } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { getContentBlocks } from "./structures/content-blocks.ts";
import { gitCommandStart, gitCommitCommand, shellCommandToken } from "./regex_expressions.ts";
import { splitLines } from "./reconstruction_replay_edit.ts";
import { noteStage } from "./reconstruction_provenance.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";
import { executeRunOnce } from "./reconstruction_script_stage.ts";
import {
    computeScriptStateKey,
    findScriptExecutionRuns,
    runScriptAgainstState,
    type ScriptExecutionEvent,
    type ScriptRun,
} from "./reconstruction_script_execution.ts";
import type { FileEvent, UserEditEvent, WriteEvent } from "./reconstruction_engine.ts";

// A recorded `git commit`: the repo it committed in (the -C dir, else the record cwd), when, and
// the session whose Bash call ran it (for timeline attribution).
export type GitCommitEvent = { cwd?: Path; timestamp: Date; sessionId?: Uuid };

// Every `git commit` Bash command in the transcript, in record order.
export function findGitCommitEvents(records: TranscriptRecord[]): GitCommitEvent[] {
    const commits: GitCommitEvent[] = [];
    for (const record of records) {
        const timestamp = record.timestamp;
        if (!(timestamp instanceof Date)) continue;
        const recordCwd = (record as { cwd?: Path }).cwd;
        for (const block of getContentBlocks(record)) {
            if (block.type !== BlockType.tool_use || block.name !== ToolName.Bash) continue;
            const command = (block.input as { command?: string }).command;
            if (command === undefined) continue;
            const match = command.match(gitCommitCommand);
            if (match === null) continue;
            const dashCDir = match[1];
            commits.push({
                cwd: dashCDir !== undefined ? new Path(dashCDir) : recordCwd,
                timestamp,
                sessionId: record.sessionId,
            });
        }
    }
    return commits;
}

// One recorded git command, parsed for the timeline: the subcommand family, the human detail its
// row shows (commit message, add paths, branch name), the verbatim command, when/which session
// ran it (for turn attribution), and the Bash record's own uuid (the viewer resolves the
// command's JSONL line through it).
export type GitOperation = {
    kind: GitOperationKind;
    detail: string;
    command: string;
    timestamp: Date;
    sessionId: Uuid | undefined;
    uuid: Uuid | undefined;
};

// Global git flags that consume the NEXT token as their argument (`git -C <dir> …`,
// `git -c key=val …`) — skipped, argument included, when locating the subcommand.
const GIT_FLAGS_WITH_ARGUMENT = new Set(["-C", "-c"]);

// The index of the subcommand token: the first token after `git` that is not a global flag.
// tokens.length when the command has flags but no subcommand.
function findSubcommandIndex(tokens: string[]): number {
    let index = 1;
    while (index < tokens.length) {
        const token = tokens[index]!;
        if (GIT_FLAGS_WITH_ARGUMENT.has(token)) {
            index += 2;
            continue;
        }
        if (token.startsWith("-")) {
            index += 1;
            continue;
        }
        return index;
    }
    return tokens.length;
}

// The wire kind for a subcommand word: its GitOperationKind member, or `other` for any
// subcommand outside the annotated set (this is the hydration point — wire word -> enum member).
function parseGitOperationKind(subcommand: string | undefined): GitOperationKind {
    const known = KNOWN_GIT_OPERATION_KINDS.find((kind) => kind === subcommand);
    if (known === undefined) return GitOperationKind.other;
    return known;
}

// `token` without its surrounding quote pair, when it has one ("baseline" -> baseline).
// ponytail: escaped quotes inside the token are left as-is — no fixture exercises them.
function stripSurroundingQuotes(token: string): string {
    if (token.length < 2) return token;
    const first = token[0]!;
    const last = token[token.length - 1]!;
    if (first !== last) return token;
    if (first === '"') return token.slice(1, -1);
    if (first === "'") return token.slice(1, -1);
    return token;
}

// The first argument that is not a flag, or "" — a branch/checkout command's branch name.
function findFirstNonFlagArgument(argumentTokens: string[]): string {
    const found = argumentTokens.find((token) => !token.startsWith("-"));
    if (found === undefined) return "";
    return found;
}

// The row detail for one parsed command: commit -> its first -m message; add -> its path
// arguments; branch/checkout -> the branch name; anything else -> "".
function parseGitOperationDetail(kind: GitOperationKind, tokens: string[], subcommandIndex: number): string {
    const argumentTokens = tokens.slice(subcommandIndex + 1);
    if (kind === GitOperationKind.commit) {
        const messageFlagIndex = argumentTokens.indexOf("-m");
        if (messageFlagIndex < 0) return "";
        const message = argumentTokens[messageFlagIndex + 1];
        if (message === undefined) return "";
        return stripSurroundingQuotes(message);
    }
    if (kind === GitOperationKind.add) {
        return argumentTokens.filter((token) => !token.startsWith("-")).join(" ");
    }
    if (kind === GitOperationKind.branch) {
        return findFirstNonFlagArgument(argumentTokens);
    }
    if (kind === GitOperationKind.checkout) {
        return findFirstNonFlagArgument(argumentTokens);
    }
    return "";
}

// One git command string -> its parsed operation (kind + detail from the tokenized words).
function parseGitOperation(
    command: string,
    timestamp: Date,
    sessionId: Uuid | undefined,
    uuid: Uuid | undefined,
): GitOperation {
    const tokens = command.match(shellCommandToken) ?? [];
    const subcommandIndex = findSubcommandIndex(tokens);
    const kind = parseGitOperationKind(tokens[subcommandIndex]);
    return {
        kind,
        detail: parseGitOperationDetail(kind, tokens, subcommandIndex),
        command,
        timestamp,
        sessionId,
        uuid,
    };
}

// Every git Bash command in the transcript, in record order, parsed for the timeline's
// `* git <kind> <detail> *` rows. Reads the transcript records directly — the consent scan's
// ScriptRun list serves script consent, not git history.
export function findGitOperations(records: TranscriptRecord[]): GitOperation[] {
    const operations: GitOperation[] = [];
    for (const record of records) {
        const timestamp = record.timestamp;
        if (!(timestamp instanceof Date)) continue;
        for (const block of getContentBlocks(record)) {
            if (block.type !== BlockType.tool_use) continue;
            if (block.name !== ToolName.Bash) continue;
            const command = (block.input as { command?: string }).command;
            if (command === undefined) continue;
            const trimmed = command.trim();
            if (trimmed.match(gitCommandStart) === null) continue;
            operations.push(parseGitOperation(trimmed, timestamp, record.sessionId, record.uuid));
        }
    }
    return operations;
}

// How far a repo's commit time may sit from the record's command time and still be "that commit"
// (the commit lands a couple of seconds after the Bash record; distinct commits sit minutes apart).
const COMMIT_MATCH_TOLERANCE_MS = 60_000;

// The commit hash in `repoCwd` whose committer time is nearest `commitTimestamp` (within tolerance),
// or undefined when the repo is absent or no commit is near enough.
function resolveCommitByTimestamp(repoCwd: Path, commitTimestamp: Date): string | undefined {
    let log: string;
    try {
        log = execSync("git log --format='%H %cI'", { cwd: repoCwd.toString(), stdio: "pipe" }).toString();
    } catch {
        return undefined;
    }
    let bestHash: string | undefined;
    let bestDistance = COMMIT_MATCH_TOLERANCE_MS;
    for (const line of log.split("\n")) {
        const [hash, committedAt] = line.split(" ");
        if (hash === undefined || committedAt === undefined) continue;
        const distance = Math.abs(new Date(committedAt).getTime() - commitTimestamp.getTime());
        if (distance <= bestDistance) {
            bestDistance = distance;
            bestHash = hash;
        }
    }
    return bestHash;
}

// The committed bytes of `filePath` at the commit recorded at `commitTimestamp` in `repoCwd`, or
// undefined when the repo, the commit, or the path is absent — absence is a silent no-op so every
// non-git scenario is untouched. When the recorded cwd's repo has decayed (macOS purges idle temp
// files after ~3 days), each of `fallbackRepoDirs` — mirrors of the recorded repo's layout at
// other disk locations (configured overrides, the transcript-sibling preserved clone) — is
// consulted in order with the SAME cwd-relative path (item 46).
export function readCommittedFileContent(
    repoCwd: Path,
    commitTimestamp: Date,
    filePath: Path,
    // item 46: preservedRepoDir?: Path,
    fallbackRepoDirs: Path[] = [],
): string | undefined {
    const cwdRelativePath = relative(repoCwd.toString(), filePath.toString());
    if (cwdRelativePath === "" || cwdRelativePath.startsWith("..")) return undefined;
    // item 46: const repoDirs = preservedRepoDir === undefined ? [repoCwd] : [repoCwd, preservedRepoDir];
    const repoDirs = [repoCwd, ...fallbackRepoDirs];
    for (const repoDir of repoDirs) {
        const hash = resolveCommitByTimestamp(repoDir, commitTimestamp);
        if (hash === undefined) continue;
        try {
            return execSync(`git show ${hash}:${JSON.stringify(cwdRelativePath)}`, {
                cwd: repoDir.toString(),
                stdio: "pipe",
            }).toString();
        } catch {
            continue;
        }
    }
    return undefined;
}

// The directory the records' transcript was loaded from, when it carries a git repo — scenario
// captures preserve a clone of the recorded repo next to the transcript, which outlives the
// recorded temp cwd. Undefined for records without a source or a repo (live viewer transcripts
// sit in ~/.claude/projects, which is not a repo).
function findPreservedRepoDir(records: TranscriptRecord[]): Path | undefined {
    for (const record of records) {
        const source = getRecordSource(record);
        if (source === undefined) continue;
        const transcriptDir = dirname(source.filePath);
        if (!existsSync(join(transcriptDir, ".git"))) return undefined;
        return new Path(transcriptDir);
    }
    return undefined;
}

// Every fallback repo dir to try after the recorded cwd, most-explicit first: the configured
// repoDir override, the configured projectCwd (the project's current disk location often
// contains the repo), then the transcript-sibling preserved clone (item 46). Empty overrides
// reduce this to the old preserved-dir singleton.
export function findFallbackRepoDirs(records: TranscriptRecord[]): Path[] {
    const candidates = [getPathOverrides().repoDir, getPathOverrides().projectCwd, findPreservedRepoDir(records)];
    return candidates.filter((dir): dir is Path => dir !== undefined);
}

// --- the placement stage ----------------------------------------------------------------------------

// A lineage event carrying the file's FULL content at its instant (not a hunk-based edit).
type FullContentEvent = WriteEvent | UserEditEvent | ScriptExecutionEvent;

function isFullContentEvent(event: FileEvent): event is FullContentEvent {
    return event.kind === EventKind.write
        || event.kind === EventKind.userEdit
        || event.kind === EventKind.scriptExecution;
}

// One line the blob carries beyond the base, anchored to the base line it follows (undefined =
// inserted at the start of the file).
type LineAddition = { anchor: string | undefined; line: string };

// The blob as the base plus pure line insertions, or undefined when the blob deletes or changes
// any base line (then the diff is not "unexplained additions" and the stage must stay silent).
function pureAdditionsFrom(baseLines: string[], blobLines: string[]): LineAddition[] | undefined {
    const additions: LineAddition[] = [];
    let baseIndex = 0;
    for (const line of blobLines) {
        if (baseIndex < baseLines.length && line === baseLines[baseIndex]) {
            baseIndex += 1;
            continue;
        }
        additions.push({ anchor: baseIndex > 0 ? baseLines[baseIndex - 1] : undefined, line });
    }
    if (baseIndex !== baseLines.length || additions.length === 0) return undefined;
    return additions;
}

// `lines` with each addition inserted after the LAST occurrence of its anchor (or at the start),
// or undefined when an anchor line is absent — the addition cannot be re-anchored onto this base.
function applyAdditions(lines: string[], additions: LineAddition[]): string[] | undefined {
    const result = [...lines];
    for (const { anchor, line } of additions) {
        if (anchor === undefined) {
            result.unshift(line);
            continue;
        }
        const at = result.lastIndexOf(anchor);
        if (at < 0) return undefined;
        result.splice(at + 1, 0, line);
    }
    return result;
}

// The recorded run whose instant stamps `event`, or undefined (a script-execution event is always
// injected at its run's timestamp, so the instant is the join key).
function runAtInstant(runs: ScriptRun[], event: FileEvent): ScriptRun | undefined {
    return runs.find((run) => run.timestamp.getTime() === event.timestamp.getTime());
}

// Replay `content` through the runs behind `events`, seeding each run's sandbox with the rolling
// content; returns the final content and each event's recomputed content, or undefined when any
// event has no run or the run drops the file.
function replayRunsOver(
    content: string,
    eventIndices: number[],
    events: FileEvent[],
    runs: ScriptRun[],
    target: Path,
    records: TranscriptRecord[],
    reader: BackupReader,
): { final: string; rewrites: Map<number, string> } | undefined {
    let rolling = content;
    const rewrites = new Map<number, string>();
    for (const index of eventIndices) {
        const event = events[index]!;
        if (event.kind !== EventKind.scriptExecution) return undefined;
        const run = runAtInstant(runs, event);
        if (run === undefined) return undefined;
        const key = computeScriptStateKey(target, run.cwd);
        const preState = new Map(executeRunOnce(run, records, reader).pre);
        preState.set(key, rolling);
        const postState = runScriptAgainstState(run.code, preState);
        const post = postState?.get(key);
        if (post === undefined) return undefined;
        rewrites.set(index, post);
        rolling = post;
    }
    return { final: rolling, rewrites };
}

// The instant halfway between an event and its successor (or the commit) — "strictly after" the
// base event and "strictly before" the next.
function midpointAfter(events: FileEvent[], index: number, fallbackEnd: Date): Date {
    const start = events[index]!.timestamp.getTime();
    const end = index + 1 < events.length ? events[index + 1]!.timestamp.getTime() : fallbackEnd.getTime();
    return new Date(Math.floor((start + end) / 2));
}

// Try splicing the additions right after `events[baseIndex]`: re-anchor them onto that event's
// content, replay every later pre-commit run over the edited content, and accept only when the
// replayed end-state reproduces the committed blob byte-exactly.
function placementAfter(
    baseIndex: number,
    additions: LineAddition[],
    laterIndices: number[],
    blob: string,
    events: FileEvent[],
    runs: ScriptRun[],
    target: Path,
    records: TranscriptRecord[],
    reader: BackupReader,
    commitTimestamp: Date,
): FileEvent[] | undefined {
    const base = events[baseIndex] as FullContentEvent;
    const editedLines = applyAdditions(splitLines(base.content), additions);
    if (editedLines === undefined) return undefined;
    const edited = editedLines.join("\n") + "\n";
    const replayed = replayRunsOver(edited, laterIndices, events, runs, target, records, reader);
    if (replayed === undefined || replayed.final !== blob) return undefined;
    const userEdit: UserEditEvent = {
        kind: EventKind.userEdit,
        changeId: new Uuid(randomUUID()),
        target,
        content: edited,
        timestamp: midpointAfter(events, baseIndex, commitTimestamp),
    };
    noteStage({
        stage: "placeGitCommitEvidence",
        target,
        changeId: userEdit.changeId,
        detail: "spliced a committed-blob diff as a user edit at the earliest evidence-consistent point",
        when: userEdit.timestamp,
    });
    const result = events.map((event, index) => {
        const rewrite = replayed.rewrites.get(index);
        return rewrite === undefined ? event : { ...event, content: rewrite };
    });
    result.splice(baseIndex + 1, 0, userEdit);
    return result;
}

// Place one commit's unexplained diff onto the lineage, or undefined when the blob is absent,
// already explained, not a pure addition, or no placement survives forward re-execution.
function placeOneCommitDiff(
    commit: GitCommitEvent,
    events: FileEvent[],
    runs: ScriptRun[],
    target: Path,
    records: TranscriptRecord[],
    reader: BackupReader,
): FileEvent[] | undefined {
    if (commit.cwd === undefined) return undefined;
    // item 46: const blob = readCommittedFileContent(commit.cwd, commit.timestamp, target, findPreservedRepoDir(records));
    const blob = readCommittedFileContent(commit.cwd, commit.timestamp, target, findFallbackRepoDirs(records));
    if (blob === undefined) return undefined;
    const indexedEvents = events.map((event, index) => ({ event, index }));
    const atOrBeforeCommit = indexedEvents.filter(({ event }) => event.timestamp.getTime() <= commit.timestamp.getTime());
    const fullContentEvents = atOrBeforeCommit.filter(({ event }) => isFullContentEvent(event));
    const beforeCommit = fullContentEvents.map(({ index }) => index);
    if (beforeCommit.length === 0) return undefined;
    const atCommit = events[beforeCommit[beforeCommit.length - 1]!] as FullContentEvent;
    if (atCommit.content === blob) return undefined;
    const additions = pureAdditionsFrom(splitLines(atCommit.content), splitLines(blob));
    if (additions === undefined) return undefined;
    for (let position = 0; position < beforeCommit.length; position += 1) {
        const placed = placementAfter(
            beforeCommit[position]!,
            additions,
            beforeCommit.slice(position + 1),
            blob,
            events,
            runs,
            target,
            records,
            reader,
            commit.timestamp,
        );
        if (placed !== undefined) return placed;
    }
    return undefined;
}

// Reconstruction stage: when a recorded `git commit`'s blob for `target` differs from the lineage
// content at the commit instant by pure line additions no event explains, splice those additions
// as a synthetic user edit at the earliest point from which forward re-execution of the remaining
// runs reproduces the blob byte-exactly (s85: the out-of-band comment lands between the move and
// the rename runs). Every absence — no commits, no repo, no blob, no valid placement — is a
// silent no-op.
export function placeGitCommitEvidence(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
    target: Path,
): FileEvent[] {
    if (!isImpureExecutionAllowed()) return events;
    const commits = findGitCommitEvents(records);
    if (commits.length === 0) return events;
    const runs = findScriptExecutionRuns(records);
    for (const commit of commits) {
        const placed = placeOneCommitDiff(commit, events, runs, target, records, reader);
        if (placed !== undefined) return placed;
    }
    return events;
}
