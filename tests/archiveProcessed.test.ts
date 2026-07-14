// archiveProcessed.ts retires processed notes/handoffs: move each given file into a
// sibling archived/ folder, never overwrite (COLLISION), and refuse to run with no args.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT = ".claude/skills/scripts/archiveProcessed.ts";

test("moves a file into sibling archived/ and reports collisions without overwriting", () => {
    const dir = mkdtempSync(join(tmpdir(), "archive-test-"));
    const moved = join(dir, "implementation-notes-a.md");
    writeFileSync(moved, "body A");
    const collides = join(dir, "handoff-b.md");
    writeFileSync(collides, "new body");
    mkdirSync(join(dir, "archived"));
    writeFileSync(join(dir, "archived", "handoff-b.md"), "old body");

    const output = execFileSync("node", [SCRIPT, moved, collides], { encoding: "utf8" });
    assert.ok(!existsSync(moved) && readFileSync(join(dir, "archived", "implementation-notes-a.md"), "utf8") === "body A");
    assert.ok(existsSync(collides), "collision source must stay in place");
    assert.equal(readFileSync(join(dir, "archived", "handoff-b.md"), "utf8"), "old body");
    assert.ok(output.includes("archived:") && output.includes("COLLISION"));
});

test("no arguments: exits non-zero without archiving anything", () => {
    assert.throws(() => execFileSync("node", [SCRIPT], { encoding: "utf8", stdio: "pipe" }));
});
