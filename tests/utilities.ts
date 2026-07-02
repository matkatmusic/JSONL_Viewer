import { readFileSync } from "node:fs";
import { parseRecord } from "../src/parse/parseRecord.ts";
import type { TranscriptRecord } from "../src/structures/envelope.ts";
import type { Path } from "../src/structures/domain.ts";
import { listCoveredScenarios } from "../scripts/coverage_scenarios.ts";

// The session transcript(s) for a scenario id (e.g. "s37"), resolved from the discovered coverage
// scenarios. Throws when the scenario is not captured, so a missing ground truth fails loudly rather than
// silently skipping. Tests asserting on a specific line take the single path; reconstruction tests take all.
export function jsonlPathsForScenario(scenarioId: string): Path[] {
    const scenario = listCoveredScenarios().find((covered) => covered.scenarioId === scenarioId);
    if (scenario === undefined) {
        throw new Error(`no covered scenario with id ${scenarioId}`);
    }
    return scenario.jsonlPaths;
}

// Read a text file and return its non-empty lines — the shared JSONL line reader
// used across the transcript tests. Generic: takes any file path.
export function readNonEmptyLines(file: string): string[] {
    const fileText = readFileSync(file, "utf8");
    const lines = fileText.split("\n");
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    return nonEmptyLines;
}

// Parse every non-empty line of a transcript JSONL file into typed records (no
// field gate; use loadTranscript for the gated path). Generic: takes any path.
export function loadRecords(file: string): TranscriptRecord[] {
    return readNonEmptyLines(file).map(parseRecord);
}
