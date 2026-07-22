// tools/probe_166_scan.ts — task 167 (spec S1a): tolerant extraction of jot-plugin
// edit events from every conversation-log root. READ-ONLY. The strict engine loader
// is deliberately NOT reused: real jot logs span wire formats it rejects.
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Path, Uuid } from "../jfred/src/structures/domain.ts";
import { BlockType, ToolName } from "../jfred/src/structures/vocabulary.ts";

// ponytail: MultiEdit/NotebookEdit are real wire tool names not modeled in the engine's
// ToolName vocabulary; kept local to the probe rather than widening the engine enum.
export const MULTI_EDIT_TOOL = "MultiEdit";
export const NOTEBOOK_EDIT_TOOL = "NotebookEdit";
const MUTATING_TOOL_NAMES = new Set<string>([ToolName.Write, ToolName.Edit, MULTI_EDIT_TOOL, NOTEBOOK_EDIT_TOOL]);

const HOME = homedir();
export const JOT_PATH_PREFIX = join(HOME, "Programming/jot");
const PROGRAMMING_PREFIX = join(HOME, "Programming");

export interface SourceRoot {
    label: string;
    dir: string;
}

export const CONVERSATION_ROOTS: SourceRoot[] = [
    { label: "live", dir: join(HOME, ".claude/projects") },
    { label: "claude-data", dir: join(HOME, "Programming/jot-recovery/claude-data/projects") },
    { label: "probe-fixture", dir: join(HOME, "Programming/jot-recovery/probe-fixture-20260615/projects") },
];

export const FILE_HISTORY_ROOTS: SourceRoot[] = [
    { label: "live", dir: join(HOME, ".claude/file-history") },
    { label: "claude-data", dir: join(HOME, "Programming/jot-recovery/claude-data/file-history") },
    { label: "probe-fixture", dir: join(HOME, "Programming/jot-recovery/probe-fixture-20260615/file-history") },
];

export const CLAUDE_DATA_EXTRAS: string[] = ["backups", "sessions", "history.jsonl", "tracked-projects.txt"]
    .map((name) => join(HOME, "Programming/jot-recovery/claude-data", name));

// One file-mutating tool_use on a path under ~/Programming/jot*.
export interface EditEvent {
    rootLabel: string;
    projectFolder: string;
    sessionId: Uuid;
    recordUuid: Uuid;
    timestamp: Date;
    absPath: Path;
    jotRoot: string; // the Programming/<jotRoot> segment, e.g. "jot", "jot-backup"
    relPath: string; // absPath minus the jot-root prefix
    tool: string;
    contentHash: string;
}

export interface ScanResult {
    allEvents: EditEvent[];
    parseFailuresByRoot: Map<string, number>;
    // projectFolder -> rootLabel -> jsonl file names scanned there
    scannedJsonlsByFolder: Map<string, Map<string, string[]>>;
}

export function hashText(text: string): string {
    return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

// Content evidence for conflict detection (NOT reconstruction): hash the tool input.
export function deriveContentHash(toolName: string, input: Record<string, unknown>): string {
    if (toolName === ToolName.Write) {
        return hashText(String(input.content ?? ""));
    }
    if (toolName === ToolName.Edit) {
        return hashText(String(input.old_string ?? "") + " " + String(input.new_string ?? ""));
    }
    if (toolName === MULTI_EDIT_TOOL) {
        return hashText(JSON.stringify(input.edits ?? []));
    }
    return hashText(String(input.new_source ?? "")); // NotebookEdit
}

// Split an absolute path under ~/Programming/jot* into its jot root dir + rel path.
export function splitJotPath(absPath: string): { jotRoot: string; relPath: string } | null {
    if (!absPath.startsWith(JOT_PATH_PREFIX)) {
        return null;
    }
    const afterProgramming = absPath.slice(PROGRAMMING_PREFIX.length + 1);
    const firstSlash = afterProgramming.indexOf("/");
    if (firstSlash < 0) {
        return { jotRoot: afterProgramming, relPath: "" };
    }
    return { jotRoot: afterProgramming.slice(0, firstSlash), relPath: afterProgramming.slice(firstSlash + 1) };
}

function buildEventFromBlock(root: SourceRoot, projectFolder: string, sessionId: Uuid, record: any, block: any): EditEvent | null {
    if (block?.type !== BlockType.tool_use) {
        return null;
    }
    if (!MUTATING_TOOL_NAMES.has(block.name)) {
        return null;
    }
    const rawPath = String(block.input?.file_path ?? block.input?.notebook_path ?? "");
    const splitPath = splitJotPath(rawPath);
    if (splitPath === null) {
        return null;
    }
    return {
        rootLabel: root.label,
        projectFolder,
        sessionId,
        recordUuid: new Uuid(String(record.uuid ?? "")),
        timestamp: new Date(String(record.timestamp ?? 0)),
        absPath: new Path(rawPath),
        jotRoot: splitPath.jotRoot,
        relPath: splitPath.relPath,
        tool: String(block.name),
        contentHash: deriveContentHash(String(block.name), block.input ?? {}),
    };
}

function collectEventsFromRecord(root: SourceRoot, projectFolder: string, sessionId: Uuid, record: any): EditEvent[] {
    const contentBlocks = record?.message?.content;
    if (!Array.isArray(contentBlocks)) {
        return [];
    }
    const collectedEvents: EditEvent[] = [];
    for (const block of contentBlocks) {
        const editEvent = buildEventFromBlock(root, projectFolder, sessionId, record, block);
        if (editEvent === null) {
            continue;
        }
        collectedEvents.push(editEvent);
    }
    return collectedEvents;
}

async function collectEventsFromJsonl(root: SourceRoot, projectFolder: string, jsonlName: string, onParseFailure: () => void): Promise<EditEvent[]> {
    const jsonlFile = join(root.dir, projectFolder, jsonlName);
    const lineReader = createInterface({ input: createReadStream(jsonlFile), crlfDelay: Infinity });
    const sessionId = new Uuid(jsonlName.replace(/\.jsonl$/, ""));
    const collectedEvents: EditEvent[] = [];
    for await (const line of lineReader) {
        if (line.trim() === "") {
            continue;
        }
        let record: any;
        try {
            record = JSON.parse(line);
        } catch {
            onParseFailure();
            continue;
        }
        collectedEvents.push(...collectEventsFromRecord(root, projectFolder, sessionId, record));
    }
    return collectedEvents;
}

function listJsonlFiles(projectDir: string): string[] {
    return readdirSync(projectDir).filter((name) => name.endsWith(".jsonl"));
}

async function scanProjectFolder(root: SourceRoot, projectFolder: string, scanResult: ScanResult): Promise<void> {
    const projectDir = join(root.dir, projectFolder);
    if (!statSync(projectDir).isDirectory()) {
        return;
    }
    const jsonlNames = listJsonlFiles(projectDir);
    if (jsonlNames.length === 0) {
        return;
    }
    if (!scanResult.scannedJsonlsByFolder.has(projectFolder)) {
        scanResult.scannedJsonlsByFolder.set(projectFolder, new Map());
    }
    scanResult.scannedJsonlsByFolder.get(projectFolder)!.set(root.label, jsonlNames);
    const countParseFailure = (): void => {
        scanResult.parseFailuresByRoot.set(root.label, (scanResult.parseFailuresByRoot.get(root.label) ?? 0) + 1);
    };
    for (const jsonlName of jsonlNames) {
        const fileEvents = await collectEventsFromJsonl(root, projectFolder, jsonlName, countParseFailure);
        scanResult.allEvents.push(...fileEvents);
    }
    process.stderr.write(`scanned ${root.label}/${projectFolder} (${jsonlNames.length} jsonl)\n`);
}

// Scan every project folder under every conversation-log root for jot edit events.
export async function scanConversationRoots(): Promise<ScanResult> {
    const scanResult: ScanResult = { allEvents: [], parseFailuresByRoot: new Map(), scannedJsonlsByFolder: new Map() };
    for (const root of CONVERSATION_ROOTS) {
        if (!existsSync(root.dir)) {
            continue;
        }
        scanResult.parseFailuresByRoot.set(root.label, 0);
        for (const projectFolder of readdirSync(root.dir)) {
            await scanProjectFolder(root, projectFolder, scanResult);
        }
    }
    return scanResult;
}
