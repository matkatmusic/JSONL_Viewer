// Presentation for the reconstruction engine: render a file's revisions as a
// full line-state view (--verbose) or as a diff between revisions (--diff).
// Pure functions over FileRevision[]; no IO. Design: reconstruction_engine.ts.

import type { FileRevision, LineEntry } from "./reconstruction_engine.ts";

// A line's believed content right now is the last value in its history.
function currentText(entry: LineEntry): string {
    return entry.values[entry.values.length - 1]!.line;
}

function renderNumberedLine(entry: LineEntry, index: number): string {
    return `  ${String(index + 1).padStart(4)} | ${currentText(entry)}`;
}

function renderRevisionState(revision: FileRevision, index: number): string {
    const count = revision.lines.length;
    const stamp = revision.timestamp.toISOString();
    const header = `revision ${index}  @ ${stamp}  (${count} lines)`;
    if (count === 0) {
        return `${header}\n  (file absent — 0 lines)`;
    }
    const body = revision.lines.map(renderNumberedLine).join("\n");
    return `${header}\n${body}`;
}

// Render each revision's full line state (the --verbose view).
export function renderVerbose(revisions: FileRevision[]): string {
    return revisions.map(renderRevisionState).join("\n\n");
}

function diffLabel(before: string[], after: string[]): string {
    if (before.length === 0) {
        return "created";
    }
    if (after.length === 0) {
        return "deleted";
    }
    return "changed";
}

// Render one revision as a diff against the previous one. s1's transitions are
// genesis (empty -> N) and delete (N -> empty), which never partially overlap, so
// a remove-all/add-all diff is exact; an LCS line-diff arrives with s2's Edits.
function diffBlock(
    previous: FileRevision | undefined,
    revision: FileRevision,
): string {
    const before = previous ? previous.lines.map(currentText) : [];
    const after = revision.lines.map(currentText);
    const header = `@@ ${diffLabel(before, after)} @ ${revision.timestamp.toISOString()} @@`;
    const removed = before.map((line) => `- ${line}`);
    const added = after.map((line) => `+ ${line}`);
    return [header, ...removed, ...added].join("\n");
}

// Render the changes between consecutive revisions as a diff (the --diff view).
export function renderDiff(revisions: FileRevision[]): string {
    const blocks: string[] = [];
    let previous: FileRevision | undefined;
    for (const revision of revisions) {
        blocks.push(diffBlock(previous, revision));
        previous = revision;
    }
    return blocks.join("\n");
}
