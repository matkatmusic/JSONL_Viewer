// Real-git unified diff between two in-memory line arrays (item 51): git's hunk headers
// carry function context ("@@ -a,b +c,d @@ def reorder(...)"), which the pure-TS renderer
// cannot produce. Used by renderDiffWithContext for the viewer's /api/diff surfaces only.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Serialize one side for git: exact lines, always newline-terminated so git never emits
// "\ No newline at end of file" markers into the webapp's row renderers.
function writeSideFile(directory: string, name: string, lines: string[]): string {
    const path = join(directory, name);
    writeFileSync(path, lines.length === 0 ? "" : lines.join("\n") + "\n");
    return path;
}

// The unified hunks (headers + bodies, preamble stripped) git produces between before and
// after; "" when the sides are identical. Throws on a real git failure (exit >= 2).
export function runGitUnifiedDiff(beforeLines: string[], afterLines: string[]): string {
    const directory = mkdtempSync(join(tmpdir(), "reveng-diff-"));
    try {
        const beforePath = writeSideFile(directory, "before", beforeLines);
        const afterPath = writeSideFile(directory, "after", afterLines);
        // ponytail: one spawn per revision per request; memoize on (before, after) content
        // hashes if diff-route latency ever matters.
        const result = spawnSync(
            "git",
            ["diff", "--no-index", "--no-color", "--unified=3", "--", beforePath, afterPath],
            { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
        );
        if (result.status !== 0 && result.status !== 1) {
            throw new Error(`git diff --no-index failed (${result.status}): ${result.stderr}`);
        }
        const lines = result.stdout.split("\n");
        const firstHunkIndex = lines.findIndex((line) => line.startsWith("@@ -"));
        if (firstHunkIndex < 0) {
            return "";
        }
        return lines.slice(firstHunkIndex).join("\n").replace(/\n+$/, "");
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}
