import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import { linesTextOf } from "../src/reconstruction_branches.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import {
    createSidecarReader,
    getDefaultFileHistoryRoot,
    findSessionId,
} from "../src/reconstruction_sidecar_reader.ts";
import { jsonlPathsForScenario, loadRecords } from "./utilities.ts";

const COMMENT = "# names normalized via rename script";

// The merged s37 records and an on-disk sidecar reader for its session.
function reconstructLedger() {
    const records = jsonlPathsForScenario("s37").flatMap((path) => loadRecords(path.toString()));
    const reader = createSidecarReader(findSessionId(records)!, getDefaultFileHistoryRoot());
    const histories = reconstructAll(records, reader);
    const ledger = histories.find(
        (history) =>
            history.target.toString().endsWith("/ledger.py") &&
            !history.target.toString().endsWith("test_ledger.py"),
    );
    assert.ok(ledger !== undefined, "ledger.py history present");
    return ledger;
}

// C5c/C7 — the script run is reconstructed as a script-execution revision of ledger.py: the engine
// COMPUTES the post-script content (the validated forward transform) rather than splicing a backup. The
// revision carries every rename (including the two undocumented `tot_*` subs recovered from the run-time
// CSV) and does NOT carry the out-of-band `# names normalized via rename script` comment.
test("test_s37_ledger_has_a_script_execution_revision_renamed_without_the_comment", () => {
    const ledger = reconstructLedger();
    const scriptRev = ledger.revisions.find(
        (revision) => revision.kind === EventKind.scriptExecution,
    );
    assert.ok(scriptRev !== undefined, "a script-execution revision exists");
    const text = linesTextOf(scriptRev).join("\n");
    assert.ok(text.includes("def record_entry("), "applied add_entry -> record_entry");
    assert.ok(text.includes("def total_debits("), "applied tot_debits -> total_debits");
    assert.ok(!text.includes("add_entry"), "no pre-rename name survives");
    assert.ok(!text.includes(COMMENT), "the out-of-band comment is not in the post-script revision");
});
