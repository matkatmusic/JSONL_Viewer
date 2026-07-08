// Presentation for the reconstruction engine: render a file's revisions as a
// full line-state view (--verbose) or as a diff between revisions (--diff).
// Pure functions over FileRevision[]; no IO. Design: reconstruction_engine.ts.

import type { FileRevision, LineEntry } from "./reconstruction_engine.ts";
import { EventKind } from "./structures/vocabulary.ts";
import { DOES_NOT_EXIST_YET } from "./structures/line-model.ts";
import type { Path } from "./structures/domain.ts";

// A line's believed content right now is the last value in its history.
function currentText(entry: LineEntry): string {
    return entry.values[entry.values.length - 1]!.line;
}

function renderNumberedLine(entry: LineEntry, index: number): string {
    return `  ${String(index + 1).padStart(4)} | ${currentText(entry)}`;
}

// Describe a path transition as `from → to` (the two paths a rename or copy
// connects, joined by an arrow).
function renderPathArrow(transition: { from: Path; to: Path }): string {
    return `${transition.from} → ${transition.to}`;
}

function renderRevisionState(revision: FileRevision, index: number): string {
    const stamp = revision.timestamp.toISOString();
    if (revision.kind === EventKind.rename && revision.rename) {
        return `revision ${index}  rename  ${renderPathArrow(revision.rename)}  @ ${stamp}`;
    }
    if (revision.kind === EventKind.copy && revision.copy) {
        const count = revision.lines.length;
        const header = `revision ${index}  copy  ${renderPathArrow(revision.copy)}  @ ${stamp}  (${count} lines)`;
        const body = revision.lines.map(renderNumberedLine).join("\n");
        return `${header}\n${body}`;
    }
    const count = revision.lines.length;
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

// The previous-revision indices a current revision still keeps (via back-pointer).
function keptOldIndices(revision: FileRevision): Set<number> {
    const indices = new Set<number>();
    for (const entry of revision.lines) {
        if (entry.oldLineNum >= 0) {
            indices.add(entry.oldLineNum);
        }
    }
    return indices;
}

// Previous lines whose index no current entry points back to (a real removal).
function removedLines(
    previous: FileRevision | undefined,
    revision: FileRevision,
): string[] {
    if (!previous) {
        return [];
    }
    const kept = keptOldIndices(revision);
    const removed: string[] = [];
    previous.lines.forEach((entry, index) => {
        if (!kept.has(index)) {
            removed.push(`- ${currentText(entry)}`);
        }
    });
    return removed;
}

// Current entries born here (oldLineNum DOES_NOT_EXIST_YET) are the real additions.
function addedLines(revision: FileRevision): string[] {
    const bornEntries = revision.lines.filter((entry) => entry.oldLineNum === DOES_NOT_EXIST_YET);
    const added = bornEntries.map((entry) => `+ ${currentText(entry)}`);
    return added;
}

// The kind-specific "@@ … @@" block header line, shared by both diff renderers.
function computeDiffBlockHeader(
    previous: FileRevision | undefined,
    revision: FileRevision,
): string {
    const stamp = revision.timestamp.toISOString();
    if (revision.kind === EventKind.rename && revision.rename) {
        return `@@ renamed ${renderPathArrow(revision.rename)} @ ${stamp} @@`;
    }
    if (revision.kind === EventKind.copy && revision.copy) {
        return `@@ copied ${renderPathArrow(revision.copy)} @ ${stamp} @@`;
    }
    if (revision.kind === EventKind.overwrite) {
        return `@@ overwritten @ ${stamp} @@`;
    }
    if (revision.kind === EventKind.append) {
        return `@@ appended @ ${stamp} @@`;
    }
    const before = previous ? previous.lines.map(currentText) : [];
    const after = revision.lines.map(currentText);
    return `@@ ${diffLabel(before, after)} @ ${stamp} @@`;
}

// Render one revision as a diff against the previous one. Real changes only: a
// removal is a previous line no current entry points back to; an addition is a
// line born here (oldLineNum DOES_NOT_EXIST_YET). A rename is its own block with no line churn.
function diffBlock(
    previous: FileRevision | undefined,
    revision: FileRevision,
): string {
    const header = computeDiffBlockHeader(previous, revision);
    if (revision.kind === EventKind.rename && revision.rename) {
        return header;
    }
    if (revision.kind === EventKind.copy && revision.copy) {
        return [header, ...addedLines(revision)].join("\n");
    }
    if (revision.kind === EventKind.append) {
        return [header, ...addedLines(revision)].join("\n");
    }
    return [header, ...removedLines(previous, revision), ...addedLines(revision)].join("\n");
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

// --- Context diff (the webapp's diff text): unified hunks with line numbers ---

const DIFF_CONTEXT_LINE_COUNT = 3;

// One aligned line in a revision-vs-previous comparison: its unified-diff sign plus the
// 1-based line number it holds on each side (0 = absent on that side).
type AlignedDiffLine = { sign: " " | "-" | "+"; text: string; oldLineNumber: number; newLineNumber: number };

function isRenameRevision(revision: FileRevision): boolean {
    if (revision.kind === EventKind.rename) {
        if (revision.rename !== undefined) {
            return true;
        }
    }
    return false;
}

// Walk a revision's back-pointers against the previous revision: kept entries are context,
// born entries additions, unreferenced previous indices removals. Within a change region the
// removals come first (unified-diff order). Sound because the engine carries kept lines
// forward unchanged (reconstruction_replay_edit.ts) — a changed line is always kill + born.
function computeAlignedDiffLines(
    previous: FileRevision | undefined,
    revision: FileRevision,
): AlignedDiffLine[] {
    const previousLines = previous === undefined ? [] : previous.lines;
    const alignedLines: AlignedDiffLine[] = [];
    let oldCursor = 0;
    let pendingAdditions: AlignedDiffLine[] = [];
    const flushChangeRegion = (stopOldIndex: number) => {
        while (oldCursor < stopOldIndex) {
            alignedLines.push({ sign: "-", text: currentText(previousLines[oldCursor]!), oldLineNumber: oldCursor + 1, newLineNumber: 0 });
            oldCursor++;
        }
        alignedLines.push(...pendingAdditions);
        pendingAdditions = [];
    };
    revision.lines.forEach((entry, newIndex) => {
        if (entry.oldLineNum >= 0) {
            flushChangeRegion(entry.oldLineNum);
            alignedLines.push({ sign: " ", text: currentText(entry), oldLineNumber: entry.oldLineNum + 1, newLineNumber: newIndex + 1 });
            oldCursor = entry.oldLineNum + 1;
            return;
        }
        pendingAdditions.push({ sign: "+", text: currentText(entry), oldLineNumber: 0, newLineNumber: newIndex + 1 });
    });
    flushChangeRegion(previousLines.length);
    return alignedLines;
}

// Which aligned-line index ranges become hunks: each change expanded by the context window,
// overlapping or adjacent windows merged.
function computeHunkRanges(alignedLines: AlignedDiffLine[]): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    alignedLines.forEach((line, index) => {
        if (line.sign === " ") {
            return;
        }
        const start = Math.max(0, index - DIFF_CONTEXT_LINE_COUNT);
        const end = Math.min(alignedLines.length - 1, index + DIFF_CONTEXT_LINE_COUNT);
        const lastRange = ranges[ranges.length - 1];
        if (lastRange !== undefined) {
            if (start <= lastRange.end + 1) {
                lastRange.end = Math.max(lastRange.end, end);
                return;
            }
        }
        ranges.push({ start, end });
    });
    return ranges;
}

// One hunk: the standard "@@ -oldStart,oldCount +newStart,newCount @@" header (1-based;
// 0,0 for an absent side) followed by its sign-prefixed lines.
function renderHunk(hunkLines: AlignedDiffLine[]): string {
    const oldSidedLines = hunkLines.filter((line) => line.oldLineNumber > 0);
    const newSidedLines = hunkLines.filter((line) => line.newLineNumber > 0);
    const oldStart = oldSidedLines.length === 0 ? 0 : oldSidedLines[0]!.oldLineNumber;
    const newStart = newSidedLines.length === 0 ? 0 : newSidedLines[0]!.newLineNumber;
    const header = `@@ -${oldStart},${oldSidedLines.length} +${newStart},${newSidedLines.length} @@`;
    const body = hunkLines.map((line) => line.sign + line.text);
    return [header, ...body].join("\n");
}

// The webapp's diff text: renderDiff's per-revision kind headers, but each block carries
// standard unified hunks with context lines around every change — enough for the client to
// render surrounding lines and line-number gutters. renderDiff (the CLI's human-oriented
// changes-only view) is untouched.
export function renderDiffWithContext(revisions: FileRevision[]): string {
    const blocks: string[] = [];
    let previous: FileRevision | undefined;
    for (const revision of revisions) {
        const blockLines = [computeDiffBlockHeader(previous, revision)];
        if (!isRenameRevision(revision)) {
            const alignedLines = computeAlignedDiffLines(previous, revision);
            for (const range of computeHunkRanges(alignedLines)) {
                blockLines.push(renderHunk(alignedLines.slice(range.start, range.end + 1)));
            }
        }
        blocks.push(blockLines.join("\n"));
        previous = revision;
    }
    return blocks.join("\n");
}

// --- Standard unified diff (git-apply-able) — separate from renderDiff's human-oriented blocks ---

// Split patchable text into lines, tracking whether it ends with a newline (git needs the
// `\ No newline at end of file` marker to reproduce byte-exact content). "" is zero lines.
function splitPatchLines(text: string): { lines: string[]; endsWithNewline: boolean } {
    if (text === "") {
        return { lines: [], endsWithNewline: true };
    }
    const endsWithNewline = text.endsWith("\n");
    const lines = text.split("\n");
    if (endsWithNewline) {
        lines.pop();
    }
    return { lines, endsWithNewline };
}

// One hunk side's lines prefixed with its sign, plus git's no-newline marker when needed.
function renderHunkSide(sign: string, text: string): string[] {
    const { lines, endsWithNewline } = splitPatchLines(text);
    const rendered = lines.map((line) => sign + line);
    if (!endsWithNewline) {
        rendered.push("\\ No newline at end of file");
    }
    return rendered;
}

// One file's git-format diff block as a whole-file replacement hunk (every old line removed,
// every new line added) — a valid unified diff that `git apply` accepts; renderDiff's custom
// headers are not apply-compatible, hence this separate emitter. `undefined` text marks absence:
// creation when before is absent, deletion when after is.
// ponytail: whole-file hunks and unquoted paths — add an LCS hunk builder / git-style quoting
// only if patch size or paths-with-spaces ever matter.
export function renderGitFileDiff(
    relativePath: string,
    beforeText: string | undefined,
    afterText: string | undefined,
): string {
    const headerLines = [`diff --git a/${relativePath} b/${relativePath}`];
    if (beforeText === undefined) {
        headerLines.push("new file mode 100644");
    }
    if (afterText === undefined) {
        headerLines.push("deleted file mode 100644");
    }
    const beforeCount = splitPatchLines(beforeText ?? "").lines.length;
    const afterCount = splitPatchLines(afterText ?? "").lines.length;
    if (beforeCount === 0 && afterCount === 0) {
        // Empty creation/deletion: the mode line alone is the whole (valid) block.
        return headerLines.join("\n") + "\n";
    }
    const oldPath = beforeText === undefined ? "/dev/null" : `a/${relativePath}`;
    const newPath = afterText === undefined ? "/dev/null" : `b/${relativePath}`;
    const hunkHeader = `@@ -${beforeCount === 0 ? 0 : 1},${beforeCount} +${afterCount === 0 ? 0 : 1},${afterCount} @@`;
    return [
        ...headerLines,
        `--- ${oldPath}`,
        `+++ ${newPath}`,
        hunkHeader,
        ...renderHunkSide("-", beforeText ?? ""),
        ...renderHunkSide("+", afterText ?? ""),
    ].join("\n") + "\n";
}
