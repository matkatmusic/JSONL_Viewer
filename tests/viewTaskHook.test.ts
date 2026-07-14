// The view-task UserPromptSubmit hook must answer "/view-task <N>" with a block-decision
// JSON whose reason holds the task text with REAL newlines, and stay silent on other prompts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function runHook(prompt: string): string {
  return execFileSync("node", [".claude/hooks/viewTaskHook.ts"], {
    encoding: "utf8",
    input: JSON.stringify({ prompt, cwd: process.cwd() }),
  });
}

test("non-view-task prompts pass through silently", () => {
  assert.equal(runHook("how does the engine work?"), "");
});

test("/view-task <N> blocks with the task's title and unescaped description", () => {
  const firstOpenTask = JSON.parse(readFileSync("tasks.json", "utf8"))[0];
  const output = JSON.parse(runHook(`/view-task ${firstOpenTask.taskNumber}`));
  assert.equal(output.decision, "block");
  assert.ok(output.reason.includes(`Task ${firstOpenTask.taskNumber} (OPEN): ${firstOpenTask.title}`));
  assert.ok(output.reason.includes(firstOpenTask.description));
});

test("/view-task with no number blocks with usage and the open-task listing", () => {
  const output = JSON.parse(runHook("/view-task"));
  assert.equal(output.decision, "block");
  assert.ok(output.reason.startsWith("Usage: /view-task <N...>"));
});

test("unknown task number reports not-found instead of crashing", () => {
  const output = JSON.parse(runHook("/view-task 99999"));
  assert.ok(output.reason.includes("Task 99999: not found"));
});
