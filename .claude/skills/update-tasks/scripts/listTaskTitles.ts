// Prints "OPEN <n>: <title>" / "DONE <n>: <title>" for every task, for de-duplication.
// Output goes to stdout because the update-tasks skill injects it via !`node scripts/listTaskTitles.ts`.
import { readFileSync } from "node:fs";

type TaskRecord = { taskNumber: number; title?: string };

function readTaskFile(path: string): TaskRecord[] {
  return JSON.parse(readFileSync(path, "utf8"));
}

for (const [tag, file] of [["OPEN", "tasks.json"], ["DONE", "completedTasks.json"]] as const) {
  for (const task of readTaskFile(file)) console.log(`${tag} ${task.taskNumber}: ${task.title}`);
}
