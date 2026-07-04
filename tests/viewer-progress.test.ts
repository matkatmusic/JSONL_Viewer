// Tests for the live progress stream that feeds the viewer's loading console: loadTranscript's
// per-record announcements (Step 1), the build's stage labels (Step 2), and the client's NDJSON
// line splitter (Step 4). The server's NDJSON wiring (Step 3) is deliberately untested thin glue.

import { test } from "node:test";
import assert from "node:assert/strict";
import { basename } from "node:path";
import {
    getRecordSource,
    loadTranscript,
    PROGRESS_LABEL_PARSING_RECORDS,
    type ProgressEvent,
} from "../src/parse/loadTranscript.ts";
import {
    buildDocumentWithConsent,
    PROGRESS_LABEL_READING_SIDECAR,
    PROGRESS_LABEL_CONSTRUCTING_BRANCHES,
    PROGRESS_LABEL_BUILDING_DOCUMENT,
} from "../src/viewer_api.ts";
import { reportReconstructionProgress } from "../src/reconstruction_progress.ts";
import { Path } from "../src/structures/domain.ts";
import { S19_JSONL } from "./fixtures.ts";
import { splitNdjsonChunk } from "../webapp/app.js";

// The uncounted (stageless) labels of a progress stream, in order — drops the per-record events.
function stageLabelsOf(events: ProgressEvent[]): string[] {
    return events.filter((event) => event.current === undefined).map((event) => event.label);
}

// True when `sub` appears as an in-order (not necessarily contiguous) subsequence of `full`.
function isOrderedSubsequence(full: string[], sub: string[]): boolean {
    let cursor = 0;
    for (const label of full) {
        if (cursor < sub.length && label === sub[cursor]) cursor += 1;
    }
    return cursor === sub.length;
}

// -------------------- Step 1: loadTranscript emits progress --------------------

test("test_loadTranscript_reports_file_then_parsing_then_per_record_classification", () => {
    // Scenario: loading a transcript announces the file, then that parsing began, then one
    // counted event per non-empty line classifying that record with a running 1..N count.
    // Steps: collect every event while loading the s19 fixture.
    const progressEvents: ProgressEvent[] = [];
    const records = loadTranscript(S19_JSONL, (event) => progressEvents.push(event));

    // event[0] announces the file, with no counts.
    assert.equal(progressEvents[0]!.label, `loading ${basename(S19_JSONL)}`);
    assert.equal(progressEvents[0]!.current, undefined);
    assert.equal(progressEvents[0]!.total, undefined);
    // event[1] announces parsing, with no counts.
    assert.equal(progressEvents[1]!.label, PROGRESS_LABEL_PARSING_RECORDS);
    assert.equal(progressEvents[1]!.current, undefined);
    assert.equal(progressEvents[1]!.total, undefined);
    // exactly one counted event per record: current runs 1..N, total = N, label = record .type.
    const countedEvents = progressEvents.filter((event) => event.current !== undefined);
    assert.equal(countedEvents.length, records.length);
    for (const [index, event] of countedEvents.entries()) {
        assert.equal(event.current, index + 1);
        assert.equal(event.total, records.length);
        assert.equal(event.label, records[index]!.type);
    }
});

test("test_loadTranscript_stamps_each_record_with_its_source_file_and_line", () => {
    // Scenario: every parsed record can be traced back to the transcript file and 1-based line
    // it came from (console labels append this so a broken line is findable in an editor), and
    // the stamp rides beside the record — its own top-level shape is untouched.
    // Steps: load the s19 fixture, check the first record's source, and that line numbers
    // strictly increase in file order.
    const records = loadTranscript(S19_JSONL);
    const firstSource = getRecordSource(records[0]!);
    assert.equal(firstSource?.filePath, S19_JSONL);
    assert.equal(firstSource?.lineNumber, 1);
    const lineNumbers = records.map((record) => getRecordSource(record)?.lineNumber ?? 0);
    for (let i = 1; i < lineNumbers.length; i += 1) {
        assert.ok(lineNumbers[i]! > lineNumbers[i - 1]!, `line numbers must increase (index ${i})`);
    }
});

test("test_loadTranscript_without_sink_returns_identical_records", () => {
    // Scenario: the sink is observation-only — the records returned are identical with or
    // without it, so no caller behaviour changes when it starts passing a sink.
    // Steps: load the fixture both ways and deep-equal the two arrays.
    const withoutSink = loadTranscript(S19_JSONL);
    const withSink = loadTranscript(S19_JSONL, () => {});
    assert.deepEqual(withSink, withoutSink);
});

// -------------------- Step 2: stage labels through the build --------------------

test("test_buildDocumentWithConsent_emits_stage_labels_in_order", () => {
    // Scenario: building a document announces each engine stage in order, after the per-record
    // parsing events.
    // Steps: build the s19 document with a collecting sink; assert the three stage labels appear
    // as an in-order subsequence of the uncounted labels.
    const progressEvents: ProgressEvent[] = [];
    buildDocumentWithConsent([new Path(S19_JSONL)], undefined, false, (event) => progressEvents.push(event));
    const stageLabels = stageLabelsOf(progressEvents);
    assert.ok(
        isOrderedSubsequence(stageLabels, [
            PROGRESS_LABEL_READING_SIDECAR,
            PROGRESS_LABEL_CONSTRUCTING_BRANCHES,
            PROGRESS_LABEL_BUILDING_DOCUMENT,
        ]),
        `stage labels in order; got ${JSON.stringify(stageLabels)}`,
    );
    // the stages come after the parsing announcement (the first non-file uncounted label).
    assert.ok(stageLabels.indexOf(PROGRESS_LABEL_PARSING_RECORDS) < stageLabels.indexOf(PROGRESS_LABEL_READING_SIDECAR));
});

test("test_buildDocumentWithConsent_with_sink_returns_document_identical_to_no_sink_build", () => {
    // Scenario: the sink observes only — the built document is identical with or without it.
    // Steps: build twice, with and without a sink, and deep-equal the two documents.
    const withoutSink = buildDocumentWithConsent([new Path(S19_JSONL)], undefined, false);
    const withSink = buildDocumentWithConsent([new Path(S19_JSONL)], undefined, false, () => {});
    assert.deepEqual(JSON.parse(JSON.stringify(withSink)), JSON.parse(JSON.stringify(withoutSink)));
});

// -------------------- deep engine progress (module sink) --------------------

test("test_buildDocumentWithConsent_streams_deep_engine_progress_and_clears_the_sink_after", () => {
    // Scenario: the deep reconstruction passes announce through the build-scoped module sink —
    // step-state reconstruction and counted per-file events — and the sink is cleared when the
    // build ends, so reporting afterwards reaches nothing.
    // Steps: build s19 with a collecting sink, assert the deep labels arrived, then report after
    // the build and assert nothing more was collected.
    const progressEvents: ProgressEvent[] = [];
    buildDocumentWithConsent([new Path(S19_JSONL)], undefined, false, (event) => progressEvents.push(event));

    const labels = progressEvents.map((event) => event.label);
    assert.ok(
        labels.some((label) => label.startsWith("reconstructing step states")),
        `expected a step-states label; got ${JSON.stringify(labels.filter((l) => l.startsWith("recon")))}`,
    );
    assert.ok(labels.includes("reconstructing step changes"));
    const countedFileEvents = progressEvents.filter(
        (event) => event.current !== undefined && event.label.startsWith("reconstructing /"),
    );
    assert.ok(countedFileEvents.length > 0, "expected counted per-file reconstruction events");

    const collectedBefore = progressEvents.length;
    reportReconstructionProgress("after the build");
    assert.equal(progressEvents.length, collectedBefore);
});

// -------------------- Step 4: client NDJSON line splitter --------------------

test("test_splitNdjsonChunk_reassembles_lines_across_chunk_boundaries", () => {
    // Scenario: NDJSON arrives in arbitrary chunks; a JSON object may be split across a chunk
    // boundary. The splitter yields only complete lines and carries the partial tail forward.
    // Steps: feed a chunk that ends mid-object, then the chunk that completes it.
    const first = splitNdjsonChunk("", '{"a":1}\n{"b"');
    assert.deepEqual(first.lines, ['{"a":1}']);
    assert.equal(first.remainder, '{"b"');
    const second = splitNdjsonChunk(first.remainder, ':2}\n');
    assert.deepEqual(second.lines, ['{"b":2}']);
    assert.equal(second.remainder, "");
});
