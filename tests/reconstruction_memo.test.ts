// Tests for the pass-dedup memos (fix-1 bandaid): branch selection and top-level
// reconstructFileOver return the SAME instances for the same inputs, so the document build's
// repeated passes stop re-running deterministic work — and the exec-gate flip invalidates the
// reconstruction memo (a declined build's histories must never serve a consented build).

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTranscript } from "../src/parse/loadTranscript.ts";
import { selectLiveBranch } from "../src/reconstruction_branch.ts";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import {
    isImpureExecutionAllowed,
    setImpureExecutionAllowed,
} from "../src/reconstruction_exec_gate.ts";
import { S19_JSONL } from "./fixtures.ts";

test("test_selectLiveBranch_returns_the_same_array_instance_for_the_same_records", () => {
    // Scenario: branch selection is memoized per records-array identity, so downstream
    // identity-keyed caches (script executions, file histories) hit across document passes.
    const records = loadTranscript(S19_JSONL);
    assert.equal(selectLiveBranch(records), selectLiveBranch(records));
});

test("test_reconstructAll_reuses_memoized_histories_across_passes", () => {
    // Scenario: two reconstructAll passes over the same records (the document build's pass 1
    // and pass 5) share the memoized per-file revisions instead of recomputing them.
    const records = loadTranscript(S19_JSONL);
    const first = reconstructAll(records);
    const second = reconstructAll(records);
    assert.ok(first.length > 0);
    for (const [index, history] of first.entries()) {
        assert.equal(second[index]!.revisions, history.revisions);
    }
});

test("test_reconstruction_memo_is_invalidated_when_the_exec_gate_flips", () => {
    // Scenario: histories reconstructed with the gate on must not be served after it turns off
    // (and vice versa) — the gate changes what injectScriptExecutions may produce.
    assert.equal(isImpureExecutionAllowed(), true);
    const records = loadTranscript(S19_JSONL);
    const gateOn = reconstructAll(records);
    try {
        setImpureExecutionAllowed(false);
        const gateOff = reconstructAll(records);
        assert.notEqual(gateOff[0]!.revisions, gateOn[0]!.revisions);
    } finally {
        setImpureExecutionAllowed(true);
    }
});
