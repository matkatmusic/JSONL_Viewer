// Prints the next free taskNumber: highest across tasks.json and completedTasks.json, plus 1.
// Output goes to stdout because the create-task skill injects it via !`node scripts/nextTaskNumber.ts`.
import { readFileSync } from "node:fs";

type TaskRecord = { taskNumber: number };

function readTaskFile(path: string): TaskRecord[] {
  return JSON.parse(readFileSync(path, "utf8"));
}

const taskNumbers = [...readTaskFile("tasks.json"), ...readTaskFile("completedTasks.json")]
  .map(t => t.taskNumber);
process.stdout.write(`${Math.max(0, ...taskNumbers) + 1}\n`);
