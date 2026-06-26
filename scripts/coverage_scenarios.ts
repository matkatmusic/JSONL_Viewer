// Discovery + ground-truth IO for the scenario coverage checker: enumerate scenarios that have captured
// `.step_states`, index a transcript's record uuids to line numbers, and read a step folder's source files.
// Design: plans/i-need-a-script-peppy-twilight.md (Phase 1).

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { Path } from "../src/structures/domain.ts";

// A scenario that has captured ground truth: its id (s19), dir name, transcript, and `.step_states` dir.
export type CoveredScenario = {
    scenarioId: string;
    dirName: string;
    jsonlPath: Path;
    stepStatesDir: string;
};

// Names that are never scenario source files in a `.step_states` folder.
const NON_SOURCE_NAMES = new Set(["manifest.json", "__pycache__", ".pytest_cache"]);

// Whether a path is a directory (false for files / dangling entries).
export function isDirectory(path: string): boolean {
    return existsSync(path) && statSync(path).isDirectory();
}

// The scenario id prefix of a dir name (s19-user-edit-conv-rewind -> s19), or the whole name if it has no
// leading `<letters><digits>` token.
function scenarioIdOf(dirName: string): string {
    return dirName.match(/^[a-z]+\d+/)?.[0] ?? dirName;
}

// The single `*.jsonl` in a dir, or undefined when there is not exactly one.
export function soleJsonl(dir: string): string | undefined {
    const jsonls = readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
    return jsonls.length === 1 ? join(dir, jsonls[0]!) : undefined;
}

// Every scenario under `executedRoot` that has a `.step_states/` dir AND exactly one transcript. A dir with
// `.step_states` but zero/multiple jsonl is logged and skipped (it cannot be checked unambiguously).
export function findCoveredScenarios(executedRoot: URL): CoveredScenario[] {
    const root = fileURLToPath(executedRoot);
    const covered: CoveredScenario[] = [];
    for (const dirName of readdirSync(root)) {
        const dir = join(root, dirName);
        const stepStatesDir = join(dir, ".step_states");
        if (!isDirectory(dir) || !existsSync(stepStatesDir)) {
            continue;
        }
        const jsonl = soleJsonl(dir);
        if (jsonl === undefined) {
            console.warn(`skip ${dirName}: expected exactly one .jsonl`);
            continue;
        }
        covered.push({ scenarioId: scenarioIdOf(dirName), dirName, jsonlPath: new Path(jsonl), stepStatesDir });
    }
    return covered;
}

// The scenario dir names that look like scenarios (one jsonl) but have no `.step_states` — reported as
// uncovered (informational).
export function findUncovered(executedRoot: URL, covered: CoveredScenario[]): string[] {
    const root = fileURLToPath(executedRoot);
    const coveredDirs = new Set(covered.map((scenario) => scenario.dirName));
    return readdirSync(root).filter((dirName) => {
        const dir = join(root, dirName);
        return isDirectory(dir) && !coveredDirs.has(dirName) && soleJsonl(dir) !== undefined;
    });
}

// The uuid of one JSONL line, or undefined when the line is blank / not JSON / carries no uuid.
function uuidOfLine(line: string): string | undefined {
    if (line.trim().length === 0) {
        return undefined;
    }
    try {
        const uuid = (JSON.parse(line) as { uuid?: unknown }).uuid;
        return typeof uuid === "string" ? uuid : undefined;
    } catch {
        return undefined;
    }
}

// A map from each transcript record's uuid to its 1-based line number, for attributing a step to its JSONL
// line. Non-JSON or uuid-less lines are skipped but still counted (line numbers stay true to the file).
export function buildUuidLineIndex(jsonlPath: Path): Map<string, number> {
    const index = new Map<string, number>();
    const lines = readFileSync(jsonlPath.toString(), "utf8").split("\n");
    lines.forEach((line, offset) => {
        const uuid = uuidOfLine(line);
        if (uuid !== undefined) {
            index.set(uuid, offset + 1);
        }
    });
    return index;
}

// Every source file under `dir`, recursively, skipping manifest.json / __pycache__ / .pytest_cache.
function walkSourceFiles(dir: string): string[] {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
        if (NON_SOURCE_NAMES.has(name)) {
            continue;
        }
        const absolute = join(dir, name);
        found.push(...(isDirectory(absolute) ? walkSourceFiles(absolute) : [absolute]));
    }
    return found;
}

// The source-file contents of a `.step_states/step-NNN` folder, keyed by path relative to the folder
// (e.g. "tests/test_x.py"). Skips manifest.json and the Python cache dirs.
export function readStepStateFiles(stepDir: string): Map<string, string> {
    const files = new Map<string, string>();
    for (const absolute of walkSourceFiles(stepDir)) {
        files.set(relative(stepDir, absolute), readFileSync(absolute, "utf8"));
    }
    return files;
}

// The 1-based step number a `step-NNN` folder name encodes.
export function stepNumberOf(folderName: string): number {
    return Number(folderName.slice("step-".length));
}

// The sorted `step-NNN` folder names under a `.step_states` dir.
export function stepFolders(stepStatesDir: string): string[] {
    return readdirSync(stepStatesDir)
        .filter((name) => name.startsWith("step-"))
        .sort((a, b) => stepNumberOf(a) - stepNumberOf(b));
}
