// Default list view for the reconstruction engine: one block per touched file
// with its numbered entries (kind, line count or rename/copy detail, short time,
// short change id). Pure over FileHistory[]. Design: reconstruction_engine.ts.

import type { FileHistory, FileRevision } from "./reconstruction_engine.ts";
import { EventKind } from "./structures/vocabulary.ts";
import type { Path, Uuid } from "./structures/domain.ts";

// The tail component of a path (its file name).
function baseName(path: Path): string {
    const parts = path.toString().split("/");
    return parts[parts.length - 1]!;
}

// A change id, shortened for display: drop a leading `toolu_`, keep 8 chars.
function shortChangeId(id: Uuid): string {
    return id.toString().replace(/^toolu_/, "").slice(0, 8);
}

// The clock portion of a timestamp (HH:MM:SSZ).
function shortTime(date: Date): string {
    return `${date.toISOString().slice(11, 19)}Z`;
}

// A short label for the kind that produced an entry.
function entryLabel(kind: EventKind): string {
    if (kind === EventKind.write) {
        return "create";
    }
    if (kind === EventKind.edit) {
        return "edit";
    }
    if (kind === EventKind.rename) {
        return "rename";
    }
    if (kind === EventKind.copy) {
        return "copy";
    }
    if (kind === EventKind.overwrite) {
        return "overwrite";
    }
    return "delete";
}

// The line-count change versus the previous entry, e.g. `  (+4)` / `  (−1)`.
function entryDelta(
    previous: FileRevision | undefined,
    revision: FileRevision,
): string {
    if (!previous) {
        return "";
    }
    const diff = revision.lines.length - previous.lines.length;
    if (diff === 0) {
        return "";
    }
    return diff > 0 ? `  (+${diff})` : `  (−${-diff})`;
}

// The middle column: a rename shows its from -> to; others show their line count.
function entryDetail(
    previous: FileRevision | undefined,
    revision: FileRevision,
): string {
    if (revision.kind === EventKind.rename && revision.rename) {
        return `${baseName(revision.rename.from)} → ${baseName(revision.rename.to)}`;
    }
    if (revision.kind === EventKind.copy && revision.copy) {
        return `${revision.lines.length} lines  (copied from ${baseName(revision.copy.from)})`;
    }
    return `${revision.lines.length} lines${entryDelta(previous, revision)}`;
}

function renderEntry(
    revision: FileRevision,
    index: number,
    previous: FileRevision | undefined,
): string {
    const label = entryLabel(revision.kind).padEnd(6);
    const detail = entryDetail(previous, revision);
    return `  ${index}  ${label}  ${detail}   ${shortTime(revision.timestamp)}  #${shortChangeId(revision.changeId)}`;
}

// The pre-rename path a history started life at, if it was ever renamed.
function originalPathOf(revisions: FileRevision[]): Path | undefined {
    const renamed = revisions.find(
        (revision) => revision.kind === EventKind.rename && revision.rename,
    );
    return renamed?.rename?.from;
}

// The source path a copied history was born from, if it began as a copy.
function copyOriginOf(revisions: FileRevision[]): Path | undefined {
    const copied = revisions.find(
        (revision) => revision.kind === EventKind.copy && revision.copy,
    );
    return copied?.copy?.from;
}

function renderHistoryBlock(history: FileHistory): string {
    const was = originalPathOf(history.revisions);
    const copiedFrom = copyOriginOf(history.revisions);
    let header = `${history.target}`;
    if (was) {
        header = `${history.target}   (was ${baseName(was)})`;
    } else if (copiedFrom) {
        header = `${history.target}   (copy of ${baseName(copiedFrom)})`;
    }
    const entries: string[] = [];
    let previous: FileRevision | undefined;
    history.revisions.forEach((revision, index) => {
        entries.push(renderEntry(revision, index, previous));
        previous = revision;
    });
    return `${header}\n${entries.join("\n")}`;
}

// The default view: each touched file with its numbered entries (kind, line
// count or rename arrow, short time, short change id).
export function renderHistoryList(histories: FileHistory[]): string {
    if (histories.length === 0) {
        return "no files touched";
    }
    return histories.map(renderHistoryBlock).join("\n\n");
}
