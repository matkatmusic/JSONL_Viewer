// Parsing recorded git Bash commands out of the transcript: commit events (task 89: one per `&&`
// segment) and the timeline's parsed git operations (item 66: kind + detail + commit-hash pill).

import { getCorpusState } from "./reconstruction_corpus.ts";
import { BlockType, GitOperationKind, KNOWN_GIT_OPERATION_KINDS, ToolName } from "./structures/vocabulary.ts";
import { Path, Uuid } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { getContentBlocks } from "./structures/content-blocks.ts";
import { bareCommitHashToken, gitCommandStart, gitCommitCommand, gitCommitResultHashLine, shellCommandToken } from "./regex_expressions.ts";

// A recorded `git commit`: the repo it committed in (the -C dir, else the record cwd), when, and
// the session whose Bash call ran it (for timeline attribution).
export type GitCommitEvent = { cwd?: Path; timestamp: Date; sessionId?: Uuid };

// A compound Bash command's `&&`-chained segments, each trimmed — `git add a && git commit -m "x"`
// -> ["git add a", 'git commit -m "x"']. A command with no `&&` comes back as its own single
// segment. Task 89: each git segment then gets its own operation/commit-event.
// ponytail: a literal `&&` INSIDE a quoted argument would split wrongly — no transcript
// exercises that; move to a quote-aware scan if one ever does.
function splitCompoundCommandSegments(command: string): string[] {
    return command.split("&&").map((segment) => segment.trim());
}

// One Bash command's commit events: one per `&&` segment matching `gitCommitCommand`, each with
// the segment's own -C dir (else the record cwd).
function parseCommitEventsFromCommand(
    command: string,
    recordCwd: Path | undefined,
    timestamp: Date,
    sessionId: Uuid | undefined,
): GitCommitEvent[] {
    const events: GitCommitEvent[] = [];
    for (const segment of splitCompoundCommandSegments(command)) {
        const match = segment.match(gitCommitCommand);
        if (match === null) continue;
        const dashCDir = match[1];
        events.push({
            cwd: dashCDir !== undefined ? new Path(dashCDir) : recordCwd,
            timestamp,
            sessionId,
        });
    }
    return events;
}

// Every `git commit` Bash command in the transcript, in record order. Memoized per records
// identity in the corpus (pure group): the per-file repair chain re-enters here for every
// reconstructed file, and the result depends on the records alone.
export function findGitCommitEvents(records: TranscriptRecord[]): GitCommitEvent[] {
    const state = getCorpusState(records);
    if (state.gitCommitEvents !== undefined) {
        return state.gitCommitEvents;
    }
    const commits: GitCommitEvent[] = [];
    for (const record of records) {
        const timestamp = record.timestamp;
        if (!(timestamp instanceof Date)) continue;
        const recordCwd = (record as { cwd?: Path }).cwd;
        for (const block of getContentBlocks(record)) {
            if (block.type !== BlockType.tool_use || block.name !== ToolName.Bash) continue;
            const command = (block.input as { command?: string }).command;
            if (command === undefined) continue;
            commits.push(...parseCommitEventsFromCommand(command, recordCwd, timestamp, record.sessionId));
        }
    }
    state.gitCommitEvents = commits;
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
    // The short commit hash from the commit's own tool_result text (`[master 4fa08d2] …`), only on
    // kind commit and only when the output carried git's summary line — the viewer's commit pill.
    // A git hash abbreviation is free-form text, so it stays a primitive (coding-requirements 1).
    resultHash?: string;
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

// One Bash command's operations: one per `&&` segment that IS a git invocation. Commit segments
// read their short hash from `resultText` — the compound's single tool_result serves every segment.
function parseOperationsFromCommand(
    command: string,
    timestamp: Date,
    sessionId: Uuid | undefined,
    uuid: Uuid | undefined,
    resultText: string | undefined,
): GitOperation[] {
    const operations: GitOperation[] = [];
    for (const segment of splitCompoundCommandSegments(command)) {
        if (segment.match(gitCommandStart) === null) continue;
        const operation = parseGitOperation(segment, timestamp, sessionId, uuid);
        if (operation.kind === GitOperationKind.commit && resultText !== undefined) {
            operation.resultHash = extractCommitHashFromResultText(resultText);
        }
        operations.push(operation);
    }
    return operations;
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

// The short hash in a commit's tool_result text — git's `[branch hash] message` summary line
// (`[master 4fa08d2] fix: x`, `[master (root-commit) ab12cd3] init`) — falling back to a
// whole-word hex token when the summary was piped away but the hash still got printed
// (scenario captures echo `ok 928eaa9`); undefined when neither form is present.
export function extractCommitHashFromResultText(resultText: string): string | undefined {
    const summaryMatch = resultText.match(gitCommitResultHashLine);
    if (summaryMatch !== null) return summaryMatch[1];
    const bareTokenMatch = resultText.match(bareCommitHashToken);
    if (bareTokenMatch === null) return undefined;
    return bareTokenMatch[1];
}

// Every tool_result's text, keyed by its tool_use id — the lookup a commit operation resolves its
// own printed output through (same hydrated-block pattern as reconstruction_extract's result walk).
function indexToolResultTextByToolUseId(records: TranscriptRecord[]): Map<string, string> {
    const textById = new Map<string, string>();
    for (const record of records) {
        for (const block of getContentBlocks(record)) {
            if (block.type !== BlockType.tool_result) continue;
            if (typeof block.content !== "string") continue;
            textById.set(block.tool_use_id.toString(), block.content);
        }
    }
    return textById;
}

// Every git Bash command in the transcript, in record order, parsed for the timeline's
// `* git <kind> <detail> *` rows. A compound `&&`-chained command contributes one operation per
// git segment (task 89: the chained commit gets its own row). Reads the transcript records
// directly — the consent scan's ScriptRun list serves script consent, not git history. Commit
// operations additionally carry the short hash printed in their own tool_result (item 66: the
// viewer's `GIT COMMIT [hash]` pill).
export function findGitOperations(records: TranscriptRecord[]): GitOperation[] {
    const resultTextById = indexToolResultTextByToolUseId(records);
    const operations: GitOperation[] = [];
    for (const record of records) {
        const timestamp = record.timestamp;
        if (!(timestamp instanceof Date)) continue;
        for (const block of getContentBlocks(record)) {
            if (block.type !== BlockType.tool_use) continue;
            if (block.name !== ToolName.Bash) continue;
            const command = (block.input as { command?: string }).command;
            if (command === undefined) continue;
            const resultText = resultTextById.get(block.id.toString());
            operations.push(...parseOperationsFromCommand(command, timestamp, record.sessionId, record.uuid, resultText));
        }
    }
    return operations;
}
