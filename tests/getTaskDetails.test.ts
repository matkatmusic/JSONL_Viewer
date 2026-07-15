// getTaskDetails.ts backs the task skills' dynamic injections:
// no args -> one "OPEN|DONE <n>: <title>" line per task across both task files;
// with numbers -> the full JSON object per task.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function runScript(...args: string[]): string {
    return execFileSync("node", [".claude/skills/scripts/getTaskDetails.ts", ...args], {
        encoding: "utf8",
    });
}

test("no args: prints one tagged title line per task across both files", () => {
    const count = (f: string) => JSON.parse(readFileSync(f, "utf8")).length;
    const lines = runScript().trim().split("\n");
    assert.equal(lines.length, count("tasks.json") + count("completedTasks.json"));
    assert.ok(lines.every(line => /^(OPEN|DONE) \d+: /.test(line)));
});

test("with a task number: prints that task's full JSON object", () => {
    const firstOpenTask = JSON.parse(readFileSync("tasks.json", "utf8"))[0];
    const output = runScript(String(firstOpenTask.taskNumber));
    assert.ok(output.startsWith(`task ${firstOpenTask.taskNumber} (OPEN):`));
    assert.deepEqual(JSON.parse(output.slice(output.indexOf("{"))), firstOpenTask);
});

