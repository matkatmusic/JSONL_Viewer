// Per-step reconstruction: the state of every file the transcript touches, at each chronological
// code-change "step". A step is one disk mutation (one FileRevision boundary across all files), so the
// step sequence is the repo's literal disk history in time order. Built on the branch-AGNOSTIC core
// (`reconstructFilesOver`, NOT the surviving-branch `reconstructAll`): the disk keeps abandoned-branch
// writes after a conv-only rewind, exactly as the scenario runner's `.step_states` snapshots record.
// Design: plans/reconstruction-engine-design.md; verification against .step_states in
// tests/reconstruction_cli_s19_steps.test.ts.

import type { TranscriptRecord } from "./structures/envelope.ts";
import type { Path, Uuid } from "./structures/domain.ts";
import {
    lastRevisionAtOrBefore,
    linesTextOf,
    reconstructFilesOver,
} from "./reconstruction_branches.ts";
import type { FileHistory, FileRevision, RenameInfo } from "./reconstruction_engine.ts";
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

// The path a file's lineage went by at instant `when`: the latest rename revision's `to` at or before
// `when`; the first rename's `from` when `when` precedes all renames; else history.target (no rename).
// ponytail: if two lineages ever resolve to the same name-at-time the later wins — impossible on a real
// disk; revisit only if it occurs.
function pathAtTime(history: FileHistory, when: Date): Path {
    const renames = history.revisions.filter(
        (revision): revision is FileRevision & { rename: RenameInfo } => revision.rename !== undefined,
    );
    renames.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    if (renames.length === 0) {
        return history.target;
    }
    const renamesAtOrBefore = renames.filter((revision) => revision.timestamp.getTime() <= when.getTime());
    const latestAtOrBefore = renamesAtOrBefore.at(-1);
    if (latestAtOrBefore !== undefined) {
        return latestAtOrBefore.rename.to;
    }
    return renames[0]!.rename.from;
}

// The repo's disk state at an instant: each file's latest revision at or before `when`, rendered to text
// and keyed by the name the file held AT `when` (not its final path), so a step before a rename shows the
// old name. Files with no revision yet at `when` are omitted (they do not exist on disk at that instant).
function produceRepoStateAtTime(histories: FileHistory[], when: Date): RepoSnapshot {
    const snapshot = new Map<Path, string>();
    for (const history of histories) {
        const revision = lastRevisionAtOrBefore(history.revisions, when);
        if (revision !== undefined) {
            snapshot.set(pathAtTime(history, when), renderRevisionText(revision));
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
    console.log(`   Reconstructing step states from ${records.length} transcript records`);
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

// --- Comparison helpers (the single home for per-step ground-truth diffing) ------------------------

// Whether an engine snapshot key (an absolute temp path) denotes the file at this repo-relative path,
// matched on a path boundary so `s2_original.py` does not spuriously match `tests/test_s2_original.py`.
function keyDenotes(keyPath: Path, relativePath: string): boolean {
    const key = keyPath.toString();
    return key === relativePath || key.endsWith(`/${relativePath}`);
}

// The engine text reconstructed for a file at a step, found by repo-relative path; undefined when the file
// does not exist at that step.
export function snapshotFileText(snapshot: RepoSnapshot, relativePath: string): string | undefined {
    for (const [path, text] of snapshot) {
        if (keyDenotes(path, relativePath)) {
            return text;
        }
    }
    return undefined;
}

// Drop a single trailing newline so the engine's newline-joined text (which omits it) compares equal to
// on-disk ground-truth files (which keep it).
export function stripTrailingNewline(text: string): string {
    return text.endsWith("\n") ? text.slice(0, -1) : text;
}

// Whether one snapshot reproduces every file in the ground-truth folder, byte-for-byte (each on-disk file's
// single trailing newline stripped before comparing).
function snapshotReproduces(snapshot: RepoSnapshot, groundTruth: ReadonlyMap<string, string>): boolean {
    return [...groundTruth].every(([relativePath, content]) => {
        const reconstructed = snapshotFileText(snapshot, relativePath);
        return reconstructed !== undefined && reconstructed === stripTrailingNewline(content);
    });
}

// Whether SOME engine step reproduces the ground-truth folder. Pass/fail is "some step matches", never a
// positional alignment between engine steps and instruction-numbered folders.
export function someStepReproduces(
    steps: RepoSnapshot[],
    groundTruth: ReadonlyMap<string, string>,
): boolean {
    return steps.some((snapshot) => snapshotReproduces(snapshot, groundTruth));
}

// --- Per-step triggering changeIds (aligned 1:1 with reconstructStepStates) -------------------------

// One step's change instant and the changeIds of every revision that landed at it (one step = one
// millisecond), so a mismatch can name the JSONL record(s) that produced the step's bytes.
export type StepChange = { when: Date; changeIds: Uuid[] };

// The changeIds of every revision occurring at exactly `when`, across all files.
function changeIdsAt(histories: FileHistory[], when: Date): Uuid[] {
    return histories.flatMap((history) => {
        const revisionsAtInstant = history.revisions.filter((revision) => revision.timestamp.getTime() === when.getTime());
        return revisionsAtInstant.map((revision) => revision.changeId);
    });
}

// Each code-change step's triggering changeIds, in the SAME order and count as reconstructStepStates (both
// map over collectChangeTimes), so stepChanges[i] explains steps[i].
export function reconstructStepChanges(
    records: TranscriptRecord[],
    reader?: BackupReader,
): StepChange[] {
    const histories = reconstructFilesOver(records, reader);
    return collectChangeTimes(histories).map((when) => ({ when, changeIds: changeIdsAt(histories, when) }));
}

// Render one step's repo snapshot: each file under its `### <path>` header (sorted by path), raw content,
// blank line between files — the same `### <path>` framing the verbose/diff views use.
export function renderRepoSnapshot(snapshot: RepoSnapshot): string {
    const paths = [...snapshot.keys()].sort((a, b) => a.toString().localeCompare(b.toString()));
    return paths.map((path) => `### ${path}\n${snapshot.get(path)}`).join("\n\n");
}
