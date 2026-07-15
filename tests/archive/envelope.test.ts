import { test } from "node:test";
import assert from "node:assert/strict";
import { KNOWN_RECORD_TYPES } from "../src/structures/vocabulary.ts";

test("test_known_record_types_match_s1_vocabulary", () => {
    // Scenario: the known-record-type list is exactly the 10 record types that
    // occur in the s1-delete-file transcript (recon/06-s1-vocabulary.md).
    // Steps:
    // the expected set is the 10 s1 record types.
    const expected = [
        "ai-title",
        "assistant",
        "attachment",
        "bridge-session",
        "file-history-snapshot",
        "last-prompt",
        "mode",
        "permission-mode",
        "system",
        "user",
    ];
    // KNOWN_RECORD_TYPES must contain exactly those, no more and no less.
    assert.deepEqual([...KNOWN_RECORD_TYPES].sort(), expected);
});

