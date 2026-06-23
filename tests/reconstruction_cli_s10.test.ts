import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S10_JSONL } from "./fixtures.ts";

// S10's CLI regression locks live in their own file because the 250-line cap on
// reconstruction_cli.test.ts is already reached; this mirrors the per-scenario engine-test split
// (reconstruction_engine_s10.test.ts). All three pass on the unchanged CLI — they LOCK the output so
// a future change cannot silently regress S10.

// Default (no flag): S10 has one surviving branch and zero rewound branches (the conversation-only
// rewind kept both files on disk; the read-only head is a file-less tangent), so it renders as a
// plain list like S1–S6 / S9 — no branch headers, no "no files touched". Both kept files appear with
// their real create change ids.
test("test_s10_default_view_is_a_plain_list_of_the_kept_files", () => {
    const out = runCli([S10_JSONL]);
    assert.ok(out.includes("scenario10.py"));
    assert.ok(out.includes("tests/test_scenario10.py"));
    assert.ok(out.includes("#01CmDQPd"));            // scenario10.py create
    assert.ok(out.includes("#0134iGZz"));            // test create
    assert.ok(!out.includes("## "));                 // no branch headers
    assert.ok(!out.includes("no files touched"));
});

// --list-branches: a single surviving line naming the write-turn tip #bfd9d428; no rewound line.
test("test_s10_list_branches_shows_only_the_surviving_branch", () => {
    const out = runCli([S10_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("#bfd9d428"));            // write-turn (surviving) tip
    assert.ok(!out.includes("rewound"));
});

// --surviving: the two kept files, no headers.
test("test_s10_surviving_flag_shows_the_kept_files", () => {
    const out = runCli([S10_JSONL, "--surviving"]);
    assert.ok(out.includes("scenario10.py"));
    assert.ok(out.includes("tests/test_scenario10.py"));
    assert.ok(!out.includes("## "));
});
