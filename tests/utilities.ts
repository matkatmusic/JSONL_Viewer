import { readFileSync } from "node:fs";
import { parseRecord } from "../src/parse/parseRecord.ts";
import type { TranscriptRecord } from "../src/structures/envelope.ts";

// Read a text file and return its non-empty lines — the shared JSONL line reader
// used across the transcript tests. Generic: takes any file path.
export function readNonEmptyLines(file: string): string[] {
    return readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0);
}

// Parse every non-empty line of a transcript JSONL file into typed records (no
// field gate; use loadTranscript for the gated path). Generic: takes any path.
export function loadRecords(file: string): TranscriptRecord[] {
    return readNonEmptyLines(file).map(parseRecord);
}
