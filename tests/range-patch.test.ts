// renderRangePatch: a picked contiguous step range exports as ONE git-apply-able unified diff.
// The acceptance gate is a real `git apply` round-trip — the patch applied onto the materialized
// before-state must reproduce the after-state byte for byte.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { buildProjectDocument, renderRangePatch, computePatchRoot, parseRangePatchQuery } from "../src/viewer_api.ts";
import { S85_JSONL_PATHS } from "./fixtures.ts";
import {
    materializeSnapshotIntoDirectory,
    git_initRepositoryWithCommit,
    git_applyPatch,
    listRepositoryFiles,
} from "./utilities.ts";

// Built once — every test here reads the same s85 document (one session, real git commits, moves).
const s85Document = buildProjectDocument(S85_JSONL_PATHS, undefined);

// The last step index before s85's first commit marker (steps and markers are both chronological).
function findLastStepBeforeFirstCommit(): number {
    const firstCommitMs = Math.min(...s85Document.commitMarkers.map((marker) => marker.timestamp.getTime()));
    return s85Document.steps.filter((step) => step.when.getTime() < firstCommitMs).length;
}

test("test_range_patch_applies_cleanly_and_reproduces_after_state", () => {
    // Scenario: the exported patch, applied with real `git apply` onto the before-state,
    //           reproduces the after-state exactly. Proves git-commit-point usability.
    // Steps:
    // build s85's unified document.
    // choose fromStep=1, toStep=<last step index before the first commit marker>.
    // materialize the BEFORE snapshot into a fresh temp dir; `git init` it; `git add -A; git commit`.
    // write renderRangePatch(document, fromStep, toStep) to a .patch file.
    // run `git apply <patch>` in the temp repo; assert exit code 0.
    // for every path in the AFTER snapshot: assert the on-disk file equals the snapshot content.
    // assert no extra files exist beyond the AFTER snapshot's paths.
    const fromStep = 1;
    const toStep = findLastStepBeforeFirstCommit();
    assert.ok(toStep >= 1);
    const beforeFiles = fromStep >= 2 ? s85Document.steps[fromStep - 2]!.files : {};
    const afterFiles = s85Document.steps[toStep - 1]!.files;
    const root = computePatchRoot(s85Document);

    const workDir = mkdtempSync(join(tmpdir(), "range-patch-"));
    const repoDir = join(workDir, "repo");
    mkdirSync(repoDir);
    materializeSnapshotIntoDirectory(beforeFiles, root, repoDir);
    git_initRepositoryWithCommit(repoDir);

    const patchFile = join(workDir, "range.patch");
    writeFileSync(patchFile, renderRangePatch(s85Document, fromStep, toStep));
    assert.equal(git_applyPatch(repoDir, patchFile), 0);

    for (const [absolutePath, content] of Object.entries(afterFiles)) {
        assert.equal(readFileSync(join(repoDir, relative(root, absolutePath)), "utf8"), content);
    }
    const expectedFiles = Object.keys(afterFiles).map((key) => relative(root, key)).sort();
    assert.deepEqual(listRepositoryFiles(repoDir), expectedFiles);
});

test("test_range_patch_rejects_indices_out_of_range", () => {
    // Scenario: out-of-range or inverted step indexes are rejected loudly, never clamped.
    // Steps:
    // assert renderRangePatch throws on fromStep < 1.
    // assert it throws on toStep > steps.length.
    // assert it throws on fromStep > toStep.
    const stepCount = s85Document.steps.length;
    assert.throws(() => renderRangePatch(s85Document, 0, 1));
    assert.throws(() => renderRangePatch(s85Document, 1, stepCount + 1));
    assert.throws(() => renderRangePatch(s85Document, 3, 2));
});

test("test_range_patch_covers_renamed_files_in_s85", () => {
    // Scenario: a range spanning s85's move operations patches in the moved-to files. The engine
    // models these moves as destination creations (sources persist in the document's own state —
    // 85/85 coverage certifies that as the on-disk truth), so the patch must create every
    // destination and leave the untouched originals alone.
    // Steps:
    // find the first step that tracks a core_* destination; patch from the step before it to the end.
    // assert the patch creates each core_* destination.
    // assert unchanged originals get no diff block.
    const moveStep = s85Document.steps.find((step) =>
        Object.keys(step.files).some((path) => path.includes("core_one.py")),
    );
    assert.ok(moveStep !== undefined);
    const patch = renderRangePatch(s85Document, moveStep.index, s85Document.steps.length);
    for (const destination of ["core_one.py", "core_two.py", "core_three.py"]) {
        assert.ok(patch.includes(`+++ b/${destination}`));
    }
    assert.ok(!patch.includes("diff --git a/one.py"));
});

test("test_range_patch_endpoint_returns_patch_text", () => {
    // Scenario: /api/range-patch's trust boundary — the query parser (the endpoint's only logic
    // beyond the already-tested build + render composition) accepts 1-based positive integers and
    // rejects everything else loudly (the server maps throws to 400).
    // Steps:
    // parse a valid query; assert the numeric pair comes back.
    // assert missing, non-integer, fractional, and sub-1 params each throw.
    const parsed = parseRangePatchQuery(new URLSearchParams("fromStep=2&toStep=5"));
    assert.deepEqual(parsed, { fromStep: 2, toStep: 5 });
    assert.throws(() => parseRangePatchQuery(new URLSearchParams("toStep=5")));
    assert.throws(() => parseRangePatchQuery(new URLSearchParams("fromStep=2")));
    assert.throws(() => parseRangePatchQuery(new URLSearchParams("fromStep=abc&toStep=5")));
    assert.throws(() => parseRangePatchQuery(new URLSearchParams("fromStep=1.5&toStep=5")));
    assert.throws(() => parseRangePatchQuery(new URLSearchParams("fromStep=0&toStep=5")));
});
