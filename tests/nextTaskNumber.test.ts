// The create-task skill injects nextTaskNumber.ts output as the new task's number;
// it must be one past the highest taskNumber across tasks.json AND completedTasks.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("nextTaskNumber prints the highest taskNumber across both task files, plus one", () => {
    const readNumbers = (path: string): number[] =>
        JSON.parse(readFileSync(path, "utf8")).map((t: { taskNumber: number }) => t.taskNumber);
    const expected = Math.max(0, ...readNumbers("tasks.json"), ...readNumbers("completedTasks.json")) + 1;
    const printed = Number(
        execFileSync("node", [".claude/skills/create-task/scripts/nextTaskNumber.ts"], { encoding: "utf8" }),
    );
    assert.equal(printed, expected);
});
