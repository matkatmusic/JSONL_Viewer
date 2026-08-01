// Rebuilds files from subagent-transcript Edit/Write calls. Writes only into --out.
//
// A comment-reflow hook rewrites files between edits, so seed from the newest Read.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const USAGE = "usage: replay-lost-edits.mts --repo <gitRepo> --base <commit> --out <dir> <transcript.jsonl>...";

type Operation = {
    kind: "edit" | "snapshot";
    repoRelativePath: string;
    timestamp: number;
    sequence: number;
    toolUseId: string;
    origin: string;
    oldString: string;
    newString: string;
    replaceAll: boolean;
    content: string;
    isWrite: boolean;
};

function toRepoRelativePath(recordedPath: string): string | undefined {
    const match = recordedPath.match(/group-\d+\/jfred\/(.+)$/);
    return match ? match[1] : undefined;
}

function getContentBlocks(record: any): any[] {
    const content = record?.message?.content;
    return Array.isArray(content) ? content : [];
}

function getToolResultText(block: any): string {
    const content = block?.content;
    if (typeof content === "string") {
        return content;
    }
    if (!Array.isArray(content)) {
        return "";
    }
    return content.map((part: any) => part?.text ?? "").join("");
}

// Errored tool calls never landed on disk; replaying them would corrupt the rebuild.
function collectFailedToolUseIds(records: any[]): Set<string> {
    const failed = new Set<string>();
    for (const record of records) {
        for (const block of getContentBlocks(record)) {
            if (block.type !== "tool_result") {
                continue;
            }
            if (block.is_error !== true) {
                continue;
            }
            failed.add(String(block.tool_use_id));
        }
    }
    return failed;
}

function indexToolResultTextById(records: any[]): Map<string, string> {
    const textById = new Map<string, string>();
    for (const record of records) {
        for (const block of getContentBlocks(record)) {
            if (block.type !== "tool_result") {
                continue;
            }
            textById.set(String(block.tool_use_id), getToolResultText(block));
        }
    }
    return textById;
}

// Read results are `<lineNo>\t<text>` with a possible trailing reminder block.
function parseReadResultIntoFileContent(resultText: string): string | undefined {
    const body = resultText.split("\n<system-reminder>")[0] ?? "";
    if (body.includes("more lines]") || body.includes("truncated")) {
        return undefined;
    }
    const lines = body.split("\n");
    const stripped: string[] = [];
    for (const line of lines) {
        const match = line.match(/^\s*\d+\t(.*)$/);
        if (!match) {
            if (line.trim() === "") {
                continue;
            }
            return undefined;
        }
        stripped.push(match[1]!);
    }
    // Read renders one phantom empty numbered line past the file's trailing newline.
    if (stripped[stripped.length - 1] === "") {
        stripped.pop();
    }
    return stripped.join("\n") + "\n";
}

function collectOperations(transcriptPath: string, startingSequence: number): Operation[] {
    const records = readFileSync(transcriptPath, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
    const failedToolUseIds = collectFailedToolUseIds(records);
    const resultTextById = indexToolResultTextById(records);
    const transcriptName = transcriptPath.split("/").pop() ?? transcriptPath;
    const operations: Operation[] = [];
    let sequence = startingSequence;
    for (const record of records) {
        if (record.type !== "assistant") {
            continue;
        }
        const timestamp = Date.parse(record.timestamp ?? "");
        if (Number.isNaN(timestamp)) {
            continue;
        }
        for (const block of getContentBlocks(record)) {
            if (block.type !== "tool_use") {
                continue;
            }
            const toolUseId = String(block.id);
            if (failedToolUseIds.has(toolUseId)) {
                continue;
            }
            const repoRelativePath = toRepoRelativePath(String(block.input?.file_path ?? ""));
            if (repoRelativePath === undefined) {
                continue;
            }
            const base = { repoRelativePath, timestamp, sequence: (sequence += 1), toolUseId, origin: transcriptName };
            if (block.name === "Write") {
                operations.push({ ...base, kind: "snapshot", oldString: "", newString: "", replaceAll: false, content: String(block.input?.content ?? ""), isWrite: true });
            } else if (block.name === "Edit") {
                operations.push({ ...base, kind: "edit", oldString: String(block.input?.old_string ?? ""), newString: String(block.input?.new_string ?? ""), replaceAll: block.input?.replace_all === true, content: "", isWrite: false });
            } else if (block.name === "Read" && block.input?.offset === undefined && block.input?.limit === undefined) {
                const content = parseReadResultIntoFileContent(resultTextById.get(toolUseId) ?? "");
                if (content !== undefined) {
                    operations.push({ ...base, kind: "snapshot", oldString: "", newString: "", replaceAll: false, content, isWrite: false });
                }
            }
        }
    }
    return operations;
}

function readBaseContent(repoDir: string, baseCommit: string, repoRelativePath: string): string | undefined {
    try {
        return execFileSync("git", ["-C", repoDir, "show", `${baseCommit}:${repoRelativePath}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return undefined;
    }
}

function applyEdit(current: string, operation: Operation): string {
    const occurrences = operation.oldString === "" ? 0 : current.split(operation.oldString).length - 1;
    if (occurrences === 0) {
        const reflowed = applyEditAcrossReflowedComment(current, operation);
        if (reflowed !== undefined) {
            return reflowed;
        }
        throw new Error(`old_string not found (${operation.toolUseId})`);
    }
    if (operation.replaceAll) {
        return current.split(operation.oldString).join(operation.newString);
    }
    if (occurrences > 1) {
        throw new Error(`old_string occurs ${occurrences}x with replace_all false (${operation.toolUseId})`);
    }
    return current.replace(operation.oldString, operation.newString);
}

function isCommentLine(line: string): boolean {
    return line.trimStart().startsWith("//");
}

// The reflow hook joins consecutive // lines with two spaces without recording a tool call.
function joinCommentRun(lines: string[]): string {
    const indent = lines[0]!.match(/^\s*/)![0];
    const parts = lines.map((line, index) => (index === 0 ? line.trim() : line.trim().replace(/^\/\/\s?/, "")));
    return indent + parts.join("  ");
}

// Retries a failed edit against comment runs the hook would have joined since the seed.
function applyEditAcrossReflowedComment(current: string, operation: Operation): string | undefined {
    if (!isCommentLine(operation.oldString)) {
        return undefined;
    }
    const lines = current.split("\n");
    for (let start = 0; start < lines.length; start += 1) {
        if (!isCommentLine(lines[start]!)) {
            continue;
        }
        let end = start;
        while (end + 1 < lines.length && isCommentLine(lines[end + 1]!)) {
            end += 1;
        }
        if (end > start && joinCommentRun(lines.slice(start, end + 1)) === operation.oldString) {
            return [...lines.slice(0, start), operation.newString, ...lines.slice(end + 1)].join("\n");
        }
        start = end;
    }
    return undefined;
}

type RebuildOutcome = { content: string; seed: string; editsApplied: number };

// Seeding from the newest snapshot at-or-before the last edit skips every untracked hook rewrite.
function rebuildFile(operations: Operation[], repoDir: string, baseCommit: string): RebuildOutcome {
    const repoRelativePath = operations[0]!.repoRelativePath;
    const lastEditIndex = operations.map((o) => o.kind).lastIndexOf("edit");
    if (lastEditIndex < 0) {
        const lastSnapshot = operations[operations.length - 1]!;
        return { content: lastSnapshot.content, seed: "snapshot", editsApplied: 0 };
    }
    let seedIndex = -1;
    for (let i = lastEditIndex; i >= 0; i -= 1) {
        if (operations[i]!.kind === "snapshot") {
            seedIndex = i;
            break;
        }
    }
    let current: string;
    let seed: string;
    if (seedIndex >= 0) {
        current = operations[seedIndex]!.content;
        seed = "snapshot";
    } else {
        current = readBaseContent(repoDir, baseCommit, repoRelativePath) ?? "";
        seed = current === "" ? "empty" : "git";
    }
    let editsApplied = 0;
    for (const operation of operations.slice(seedIndex + 1)) {
        if (operation.kind === "snapshot") {
            current = operation.content;
            continue;
        }
        current = applyEdit(current, operation);
        editsApplied += 1;
    }
    return { content: current, seed, editsApplied };
}

function extractValueFlag(argv: string[], flag: string): string | undefined {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
}

function main(): void {
    const argv = process.argv.slice(2);
    const repoDir = extractValueFlag(argv, "--repo");
    const baseCommit = extractValueFlag(argv, "--base");
    const outputDir = extractValueFlag(argv, "--out");
    const transcriptPaths = argv.filter((a) => a.endsWith(".jsonl"));
    if (!repoDir || !baseCommit || !outputDir || transcriptPaths.length === 0) {
        console.error(USAGE);
        process.exit(2);
    }
    let allOperations: Operation[] = [];
    for (const transcriptPath of transcriptPaths) {
        allOperations = allOperations.concat(collectOperations(transcriptPath, allOperations.length));
    }
    const byPath = new Map<string, Operation[]>();
    for (const operation of allOperations) {
        byPath.set(operation.repoRelativePath, [...(byPath.get(operation.repoRelativePath) ?? []), operation]);
    }
    let failures = 0;
    let rebuilt = 0;
    for (const [repoRelativePath, unsorted] of [...byPath].sort()) {
        const operations = unsorted.sort((a, b) => a.timestamp - b.timestamp || a.sequence - b.sequence);
        // Files only ever Read were never changed; emitting them would invent a diff.
        if (!operations.some((o) => o.kind === "edit" || o.isWrite)) {
            continue;
        }
        try {
            const outcome = rebuildFile(operations, repoDir, baseCommit);
            const destination = join(outputDir, repoRelativePath);
            mkdirSync(dirname(destination), { recursive: true });
            writeFileSync(destination, outcome.content);
            rebuilt += 1;
            console.log(`ok    ${repoRelativePath}  (seed=${outcome.seed}, +${outcome.editsApplied} edits, ${outcome.content.split("\n").length} lines)`);
        } catch (error) {
            failures += 1;
            console.log(`FAIL  ${repoRelativePath}  ${(error as Error).message}`);
        }
    }
    console.log(`\n${rebuilt} rebuilt, ${failures} failed  ->  ${outputDir}`);
    if (failures > 0) {
        process.exit(1);
    }
}

main();
