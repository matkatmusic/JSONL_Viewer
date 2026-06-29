import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { recordVerdict } from "../src/reconstruction_parse_lines.ts";
import { BlockType, EventKind, RecordType, ToolName, Verdict } from "../src/structures/vocabulary.ts";
import type { AppendEvent, OverwriteEvent } from "../src/reconstruction_engine.ts";
import type { TranscriptRecord } from "../src/structures/envelope.ts";
import { Path } from "../src/structures/domain.ts";
import { loadRecords, jsonlPathsForScenario } from "./utilities.ts";
import { S1_JSONL, S2_JSONL, S3_JSONL, S4_JSONL } from "./fixtures.ts";

// Phase B parity: extraction's `ignore` gate is a no-op. Dropping every record the classifier marks
// `ignore` BEFORE extraction yields the same file events as extracting from the full record list —
// so `evaluateLine`/`recordVerdict` is a safe single gate: it never withholds a record extraction
// needs. Not tautological even though extractFileEvents now gates internally: hunk-indexing runs over
// the un-gated input, so a misclassified hunk-bearing edit-result would make the evidence-only run
// lose its hunks and diverge here.
test("test_extraction_ignore_gate_changes_no_s37_events", () => {
    const full = jsonlPathsForScenario("s37").flatMap((path) => loadRecords(path.toString()));
    const evidence = full.filter((record) => recordVerdict(record) !== Verdict.ignore);
    // The gate is non-vacuous: s37 carries records the classifier ignores (prose, thinking, the
    // ctx_execute run, non-file-op bash).
    assert.ok(evidence.length < full.length);
    assert.deepStrictEqual(extractFileEvents(evidence), extractFileEvents(full));
});

// A synthetic Bash tool_use content block running `command`.
function buildBashBlock(id: string, command: string): Record<string, unknown> {
    return {
        type: BlockType.tool_use,
        id,
        name: ToolName.Bash,
        input: { command },
        caller: { type: "direct" },
    };
}

// A synthetic assistant record carrying one Bash tool_use whose command is `command`.
function buildBashRecord(id: string, command: string, timestamp: string): TranscriptRecord {
    return {
        type: RecordType.assistant,
        timestamp: new Date(timestamp),
        message: { content: [buildBashBlock(id, command)] },
    } as unknown as TranscriptRecord;
}

// One assistant record running `git mv a.py b.py` with the transcript cwd set to /work — the
// shape `collectEventsFromRecord` reads cwd from to resolve the rename's relative paths.
function buildGitMvRecords(): TranscriptRecord[] {
    return [
        {
            type: RecordType.assistant,
            timestamp: new Date("2026-01-01T00:00:10Z"),
            cwd: new Path("/work"),
            message: { content: [buildBashBlock("toolu_gitmv", "git mv a.py b.py")] },
        } as unknown as TranscriptRecord,
    ];
}

// `git mv a.py b.py` issued with cwd /work extracts to one rename whose from/to are resolved
// absolute against that cwd — so the rename can later link to the absolute Write/Edit targets.
test("test_extract_maps_git_mv_to_a_rename_with_cwd_resolved_paths", () => {
    // Build one assistant record: a Bash tool_use `git mv a.py b.py`, on a record whose cwd is /work.
    const records = buildGitMvRecords();
    // Extract the file events from that record.
    const events = extractFileEvents(records);
    // Exactly one event is produced, and it is a rename — git mv is recognized like a plain mv.
    assert.equal(events.length, 1);
    const rename = events.find((event) => event.kind === EventKind.rename)!;
    // The relative args were resolved against cwd, so both endpoints are absolute under /work.
    assert.equal(rename.from.toString(), "/work/a.py");
    assert.equal(rename.to.toString(), "/work/b.py");
});

// One `>>` then one `>` redirect to /a/f.txt, in timestamp order.
function buildRedirectRecords(): TranscriptRecord[] {
    return [
        buildBashRecord("toolu_app", 'echo "line two" >> /a/f.txt', "2026-01-01T00:00:10Z"),
        buildBashRecord("toolu_ovr", 'echo "replaced content" > /a/f.txt', "2026-01-01T00:00:20Z"),
    ];
}

// `>>` extracts an append event; `>` an overwrite event — both with empty content and the redirect target.
test("test_extract_maps_redirects_to_append_and_overwrite_events", () => {
    const events = extractFileEvents(buildRedirectRecords());
    const append = events.find((event) => event.kind === EventKind.append)!;
    const overwrite = events.find((event) => event.kind === EventKind.overwrite)!;
    // Both target the redirected file; neither carries content yet (the sidecar fills it).
    assert.equal(append.target.toString(), "/a/f.txt");
    assert.equal((append as AppendEvent).content, "");
    assert.equal(overwrite.target.toString(), "/a/f.txt");
    assert.equal((overwrite as OverwriteEvent).content, "");
});

// s1 — extraction finds the file events, time-ordered, with one delete.
test("test_extract_finds_writes_and_one_time_ordered_delete", () => {
    const events = extractFileEvents(loadRecords(S1_JSONL));
    const deletes = events.filter((event) => event.kind === EventKind.delete);
    // s1's rm command deletes two files in one invocation.
    assert.equal(deletes.length, 2);
    assert.ok(deletes[0]!.target.toString().endsWith("s1_delete.py"));
    assert.ok(deletes[1]!.target.toString().endsWith("test_s1_delete.py"));
    // events come out in timestamp order.
    for (let i = 1; i < events.length; i++) {
        const prev = events[i - 1]!.timestamp.getTime();
        assert.ok(events[i]!.timestamp.getTime() >= prev);
    }
});

// s2 performs exactly two Edits; each carries its structuredPatch hunks verbatim.
test("test_extract_finds_two_edits_with_their_hunks", () => {
    const events = extractFileEvents(loadRecords(S2_JSONL));
    const edits = events.filter((event) => event.kind === EventKind.edit);
    // S2 performs exactly two Edits.
    assert.equal(edits.length, 2);
    // The import-swap edit carries its single hunk verbatim.
    const importEdit = edits.find((event) =>
        event.target.toString().includes("test_s2_original.py"),
    )!;
    assert.equal(importEdit.hunks[0]!.oldStart, 1);
    assert.equal(importEdit.hunks[0]!.oldLines, 4);
    assert.equal(importEdit.hunks[0]!.lines[0], "-from s2_original import hello");
    assert.equal(importEdit.hunks[0]!.lines[1], "+from s2_moved import hello");
});

// s3 — extraction finds exactly one copy event from the cp, with from/to + changeId.
test("test_extract_finds_copy_from_cp", () => {
    // Extract every file event from the S3 transcript.
    const events = extractFileEvents(loadRecords(S3_JSONL));
    // Keep only the copy events.
    const copies = events.filter((event) => event.kind === EventKind.copy);
    // The single cp produces exactly one copy event.
    assert.equal(copies.length, 1);
    // It copies s3_source.py to s3_copy.py.
    assert.ok(copies[0]!.from.toString().endsWith("/s3_source.py"));
    assert.ok(copies[0]!.to.toString().endsWith("/s3_copy.py"));
});

// S4 performs four writes: create + overwrite for each of the two files.
test("test_extract_finds_four_writes_two_per_file", () => {
    // Keep only the write events from the S4 transcript.
    const writes = extractFileEvents(loadRecords(S4_JSONL)).filter(
        (event) => event.kind === EventKind.write,
    );
    // Exactly four writes (no rm/mv/cp; the Bash ls/pytest calls yield no events).
    assert.equal(writes.length, 4);
    // Two of them target s4_overwrite.py, in timestamp order create then overwrite.
    const overwriteFile = writes.filter((event) =>
        event.target.toString().endsWith("/s4_overwrite.py"),
    );
    assert.equal(overwriteFile.length, 2);
    // The later write carries the version2 content.
    assert.ok(overwriteFile[1]!.content.includes("def version2():"));
});

// The mv produces exactly one rename event, s2_original.py -> s2_moved.py.
test("test_extract_finds_rename_from_mv", () => {
    const renames = extractFileEvents(loadRecords(S2_JSONL)).filter(
        (event) => event.kind === EventKind.rename,
    );
    assert.equal(renames.length, 1);
    assert.ok(renames[0]!.from.toString().endsWith("/s2_original.py"));
    assert.ok(renames[0]!.to.toString().endsWith("/s2_moved.py"));
});
