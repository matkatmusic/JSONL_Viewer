// Prints the full JSON object for each task number given as an argument,
// looking in tasks.json (open) first, then completedTasks.json.
// Output goes to stdout because the tackle-tasks skill injects it via !`node scripts/getTaskDetails.ts <N...>`.
import { readFileSync } from "node:fs";

type TaskRecord = { taskNumber: number };

function readTaskFile(path: string): TaskRecord[] {
  return JSON.parse(readFileSync(path, "utf8"));
}

function describeTask(taskNumber: number, openTasks: TaskRecord[], completedTasks: TaskRecord[]): string {
  const open = openTasks.find(t => t.taskNumber === taskNumber);
  if (open) return `task ${taskNumber} (OPEN):\n${JSON.stringify(open, null, 2)}`;
  const completed = completedTasks.find(t => t.taskNumber === taskNumber);
  if (completed) return `task ${taskNumber} (COMPLETED):\n${JSON.stringify(completed, null, 2)}`;
  return `task ${taskNumber}: not found in tasks.json or completedTasks.json`;
}

const openTasks = readTaskFile("tasks.json");
const completedTasks = readTaskFile("completedTasks.json");
const taskNumbers = (process.argv.slice(2).join(" ").match(/\d+/g) ?? []).map(Number);
const report = taskNumbers.map(n => describeTask(n, openTasks, completedTasks));
process.stdout.write(report.join("\n") + "\n");
