import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import type { FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { M3_JSONL } from "./fixtures.ts";

// The real backup blobs, keyed by the backupFileName the snapshots name (an in-memory
// sidecar — mirrors tests/reconstruction_engine_s5.test.ts). The `>>` redirects (C, E)
// have no content in the JSONL; the engine recovers them from these snapshots.
const M3_BACKUPS: Record<string, string> = {
    "936191f45d79faed@v2": "line one\n",
    "936191f45d79faed@v3": "line one\nline two\n",
    "936191f45d79faed@v4": "LINE ONE\nline two\n",
    "936191f45d79faed@v5": "LINE ONE\nline two\nline three\n",
};
const m3Reader: BackupReader = (name) => M3_BACKUPS[name.toString()] ?? "";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// m3 is one file mutated four times (write, >> append, edit, >> append). The single Edit
// becomes the engine's standard removal+addition pair, so the history is FIVE revisions
// [write, append, edit, edit, append], ending at the 29-byte ground truth.
test("test_m3_history_is_write_append_edit_edit_append_five_revisions", () => {
    const histories = reconstructAll(loadRecords(M3_JSONL), m3Reader);
    assert.equal(histories.length, 1);
    const revisions = histories[0]!.revisions;
    assert.equal(revisions.length, 5);
    assert.deepEqual(
        revisions.map((r) => r.kind),
        [EventKind.write, EventKind.append, EventKind.edit, EventKind.edit, EventKind.append],
    );
    assert.equal(finalTextOf(revisions[4]!), "LINE ONE\nline two\nline three");
});

// Property 1 (backup-recovered append content): both `>>` redirects carry the present
// file forward and birth their tail line from the file-history backup. The tool result
// is empty — `line two`/`line three` come ONLY from the BackupReader.
test("test_m3_bash_appends_recover_tail_lines_from_file_history_backups", () => {
    const revisions = reconstructAll(loadRecords(M3_JSONL), m3Reader)[0]!.revisions;
    // revision 1 = append C: line one carried (oldLineNum 0), line two born from @v3.
    assert.equal(revisions[1]!.kind, EventKind.append);
    assert.equal(revisions[1]!.lines[0]!.oldLineNum, 0);
    assert.equal(finalTextOf(revisions[1]!), "line one\nline two");
    // revision 4 = append E: LINE ONE + line two carried, line three born from @v5.
    assert.equal(revisions[4]!.kind, EventKind.append);
    assert.equal(revisions[4]!.lines[0]!.oldLineNum, 0);
    assert.equal(revisions[4]!.lines[1]!.oldLineNum, 1);
    assert.equal(finalTextOf(revisions[4]!), "LINE ONE\nline two\nline three");
});

// THE CRUX (property 2 — the edit splices onto the backup-recovered append base): the
// single Edit (line one -> LINE ONE) is the established two-revision pair. The removal
// revision drops `line one` leaving the appended `line two`; the addition revision births
// `LINE ONE` over the carried `line two`. Both share the Edit's changeId.
test("test_m3_edit_is_paired_removal_then_addition_over_appended_base", () => {
    const revisions = reconstructAll(loadRecords(M3_JSONL), m3Reader)[0]!.revisions;
    // revision 2 = edit removal: line one (index 0) gone, the appended line two survives.
    assert.equal(revisions[2]!.kind, EventKind.edit);
    assert.equal(finalTextOf(revisions[2]!), "line two");
    // revision 3 = edit addition: LINE ONE born over the carried line two.
    assert.equal(revisions[3]!.kind, EventKind.edit);
    assert.equal(finalTextOf(revisions[3]!), "LINE ONE\nline two");
    // both halves come from the one Edit, so they share a changeId.
    assert.equal(revisions[2]!.changeId.toString(), revisions[3]!.changeId.toString());
});

// Property 3 (reseed INERT): the Edit's recorded base (line one/line two) matches the
// reconstructed append revision exactly, so editBaseIsStale is false and seedStaleEditBases
// injects NO synthetic Write. The proof: there is exactly ONE write-kind revision (rev 0),
// and the history stays at five revisions — a spurious reseed would add a second write.
test("test_m3_aligned_edit_base_keeps_reseed_inert_single_write_revision", () => {
    const revisions = reconstructAll(loadRecords(M3_JSONL), m3Reader)[0]!.revisions;
    assert.equal(revisions.length, 5);
    const writeRevisions = revisions.filter((r) => r.kind === EventKind.write);
    assert.equal(writeRevisions.length, 1);
    assert.equal(writeRevisions[0]!.changeId.toString(), revisions[0]!.changeId.toString());
});
