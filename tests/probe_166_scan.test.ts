// tests/probe_166_scan.test.ts — unit checks for the pure helpers of the task-167
// jot source probe (path splitting + content-evidence hashing).
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveContentHash, splitJotPath } from "../tools/probe_166_scan.ts";

test("splitJotPath splits a path under the jot plugin root", () => {
    const splitPath = splitJotPath("/Users/matkatmusicllc/Programming/jot/skills/jot/SKILL.md");
    assert.deepEqual(splitPath, { jotRoot: "jot", relPath: "skills/jot/SKILL.md" });
});

test("splitJotPath keeps sibling jot roots distinct", () => {
    const splitPath = splitJotPath("/Users/matkatmusicllc/Programming/jot-backup/hooks/stop.py");
    assert.deepEqual(splitPath, { jotRoot: "jot-backup", relPath: "hooks/stop.py" });
});

test("splitJotPath rejects paths outside ~/Programming/jot*", () => {
    assert.equal(splitJotPath("/Users/matkatmusicllc/Programming/other/file.py"), null);
});

test("deriveContentHash separates Write content from Edit strings", () => {
    const writeHash = deriveContentHash("Write", { content: "body" });
    const editHash = deriveContentHash("Edit", { old_string: "bo", new_string: "dy" });
    assert.notEqual(writeHash, editHash);
});

test("deriveContentHash is stable for identical input", () => {
    const firstHash = deriveContentHash("Write", { content: "same" });
    const secondHash = deriveContentHash("Write", { content: "same" });
    assert.equal(firstHash, secondHash);
});
