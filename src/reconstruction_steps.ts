// Per-step reconstruction: the state of every file the transcript touches, at each chronological
// code-change "step". A step is one disk mutation (one FileRevision boundary across all files), so the
// step sequence is the repo's literal disk history in time order. Built on the branch-AGNOSTIC core
// (`reconstructFilesOver`, NOT the surviving-branch `reconstructAll`): the disk keeps abandoned-branch
// writes after a conv-only rewind, exactly as the scenario runner's `.step_states` snapshots record.
// Design: plans/reconstruction-engine-design.md; verification against .step_states in
// tests/reconstruction_cli_s19_steps.test.ts.

import type { TranscriptRecord } from "./structures/envelope.ts";
import type { Path } from "./structures/domain.ts";
import {
    lastRevisionAtOrBefore,
    linesTextOf,
    reconstructFilesOver,
} from "./reconstruction_branches.ts";
import type { FileHistory, FileRevision } from "./reconstruction_engine.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";

// One file's reconstructed text at a step, keyed by the path it lives at (a file absent at the step is
// simply not a key).
export type RepoSnapshot = ReadonlyMap<Path, string>;

// A revision's believed file text: each line's latest value, newline-joined. The engine drops the file's
// single trailing newline at replay, so this equals the on-disk file with that newline stripped.
function renderRevisionText(revision: FileRevision): string {
    return linesTextOf(revision).join("\n");
}

// Every distinct code-change instant across all files, ascending. Two revisions sharing a timestamp are
// one step (the same disk state), so timestamps are de-duplicated by their millisecond value.
function collectChangeTimes(histories: FileHistory[]): Date[] {
    const byMillis = new Map<number, Date>();
    for (const history of histories) {
        for (const revision of history.revisions) {
            byMillis.set(revision.timestamp.getTime(), revision.timestamp);
        }
    }
    return [...byMillis.values()].sort((a, b) => a.getTime() - b.getTime());
}

// The repo's disk state at an instant: each file's latest revision at or before `when`, rendered to text.
// Files with no revision yet at `when` are omitted (they do not exist on disk at that instant).
function produceRepoStateAtTime(histories: FileHistory[], when: Date): RepoSnapshot {
    const snapshot = new Map<Path, string>();
    for (const history of histories) {
        const revision = lastRevisionAtOrBefore(history.revisions, when);
        if (revision !== undefined) {
            snapshot.set(history.target, renderRevisionText(revision));
        }
    }
    return snapshot;
}

// The repo's disk state after each code-change step, in chronological order. Reconstructs over EXACTLY
// the given records (no surviving-branch filter) so the timeline is literal disk, then snapshots the repo
// at each change instant.
export function reconstructStepStates(
    records: TranscriptRecord[],
    reader?: BackupReader,
): RepoSnapshot[] {
    const histories = reconstructFilesOver(records, reader);
    return collectChangeTimes(histories).map((when) => produceRepoStateAtTime(histories, when));
}

// The number of code-change steps in the transcript (one per chronological disk mutation).
export function countStepsInTranscript(
    records: TranscriptRecord[],
    reader?: BackupReader,
): number {
    return reconstructStepStates(records, reader).length;
}

// Render one step's repo snapshot: each file under its `### <path>` header (sorted by path), raw content,
// blank line between files — the same `### <path>` framing the verbose/diff views use.
export function renderRepoSnapshot(snapshot: RepoSnapshot): string {
    const paths = [...snapshot.keys()].sort((a, b) => a.toString().localeCompare(b.toString()));
    return paths.map((path) => `### ${path}\n${snapshot.get(path)}`).join("\n\n");
}
