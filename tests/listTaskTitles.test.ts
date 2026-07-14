// The update-tasks skill injects listTaskTitles.ts output for de-duplication;
// it must emit one "OPEN|DONE <n>: <title>" line per task across both task files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("listTaskTitles prints one tagged line per task across both files", () => {
    const count = (f: string) => JSON.parse(readFileSync(f, "utf8")).length;
    const lines = execFileSync("node", [".claude/skills/update-tasks/scripts/listTaskTitles.ts"], { encoding: "utf8" })
        .trim().split("\n");
    assert.equal(lines.length, count("tasks.json") + count("completedTasks.json"));
    assert.ok(lines.every(line => /^(OPEN|DONE) \d+: /.test(line)));
});
