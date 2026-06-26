// Script-execution replay, part 2 of 2: the reconstruction stage. For each user-edit beacon that is
// the validated echo of a script-execution run, replace it with a synthetic ScriptExecutionEvent so
// replay COMPUTES the clean post-script content (the forward transform) instead of completeElidedBeacons
// splicing a file-history backup — which for s37 is the only renamed snapshot and carries an out-of-band
// comment the post-script state never had. The forward test: run the engine's pre-script state forward
// through the derived subs and confirm it reproduces every visible beacon line; on mismatch the beacon
// is left untouched (it falls back to completeElidedBeacons). Wired into reconstructFileOver before
// completeElidedBeacons. (Split from reconstruction_script_execution.ts for the 250-line cap.)
// Design: ~/.claude/plans/task-implement-script-replay-partitioned-puppy.md + this session's algorithm.

import { EventKind } from "./structures/vocabulary.ts";
import type { Path } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { splitLines } from "./reconstruction_replay_edit.ts";
import { noteStage } from "./reconstruction_provenance.ts";
import { beaconSnippetFor, type BeaconSnippet } from "./reconstruction_user_edit.ts";
import { backupSeedWriteFor, type BackupReader } from "./reconstruction_sidecar.ts";
import {
    applyRenameSubs,
    deriveRenameSubs,
    findScriptExecutionRuns,
    parseScriptTargets,
    type ScriptExecutionEvent,
    type ScriptRun,
} from "./reconstruction_script_execution.ts";
import type { FileEvent, UserEditEvent } from "./reconstruction_engine.ts";

// The forward test, windowed: whether `lines` reproduces every visible beacon line at its own (1-based)
// line number. The post-script beacon may be a WINDOW onto the file, so only its shown lines are checked.
function linesMatchBeacon(lines: string[], snippet: BeaconSnippet): boolean {
    for (const { lineNo, text } of snippet.lines) {
        if (lineNo - 1 >= lines.length || lines[lineNo - 1] !== text) {
            return false;
        }
    }
    return true;
}

// The latest run at or before `when` whose targets include `target` (s37 re-runs the rename twice; the
// latest run before the post-script beacon is the one that produced it), or undefined.
function runForTarget(runs: ScriptRun[], target: Path, when: Date): ScriptRun | undefined {
    const path = target.toString();
    let chosen: ScriptRun | undefined;
    for (const run of runs) {
        if (run.timestamp.getTime() > when.getTime()) {
            continue;
        }
        const targets = parseScriptTargets(run.code).map((each) => each.toString());
        if (targets.some((each) => path === each || path.endsWith(`/${each}`))) {
            chosen = run;
        }
    }
    return chosen;
}

// For a user-edit beacon that is the windowed echo of a script run, the validated ScriptExecutionEvent
// that REPLACES it: take the pre-script on-disk content (the file-history backup at or before the run),
// run it forward through the derived subs, and confirm the result reproduces every visible beacon line
// (the forward test). The event carries that computed post-script content. undefined when no run
// explains the beacon, the pre-script content is unavailable, or the forward result does not match —
// then the beacon is left for completeElidedBeacons.
function scriptExecutionForBeacon(
    beacon: UserEditEvent,
    runs: ScriptRun[],
    records: TranscriptRecord[],
    reader: BackupReader,
): ScriptExecutionEvent | undefined {
    const run = runForTarget(runs, beacon.target, beacon.timestamp);
    if (run === undefined) {
        return undefined;
    }
    const subs = deriveRenameSubs(run, records, reader);
    if (subs === undefined) {
        return undefined;
    }
    const preScript = backupSeedWriteFor(records, beacon.target, run.timestamp, reader);
    if (preScript === undefined) {
        return undefined;
    }
    const forward = applyRenameSubs(splitLines(preScript.content), subs);
    const snippet = beaconSnippetFor(records, beacon.changeId);
    if (snippet === undefined || !linesMatchBeacon(forward, snippet)) {
        return undefined;
    }
    return {
        kind: EventKind.scriptExecution,
        changeId: beacon.changeId,
        target: beacon.target,
        content: forward.join("\n"),
        timestamp: run.timestamp,
    };
}

// Record that an injection fired, tagging the beacon it replaced and the run time used.
function noteInjection(event: ScriptExecutionEvent): void {
    noteStage({
        stage: "injectScriptExecutions",
        target: event.target,
        changeId: event.changeId,
        detail: "replaced a script-echo user-edit beacon with the validated forward transform",
        when: event.timestamp,
    });
}

// One event's place in the rebuilt list: a user-edit beacon validated as a script echo becomes its
// ScriptExecutionEvent (carrying the precomputed post-script content); everything else passes through.
function rebuiltEvent(
    event: FileEvent,
    runs: ScriptRun[],
    records: TranscriptRecord[],
    reader: BackupReader,
): FileEvent {
    if (event.kind !== EventKind.userEdit) {
        return event;
    }
    const replacement = scriptExecutionForBeacon(event, runs, records, reader);
    if (replacement === undefined) {
        return event;
    }
    noteInjection(replacement);
    return replacement;
}

// Reconstruction stage: replace each user-edit beacon that is the validated echo of a script-execution
// run with a synthetic ScriptExecutionEvent (so replay emits the clean computed forward transform).
// Reader-only; a beacon with no explaining/validated run is passed through untouched (it falls back to
// completeElidedBeacons). A run-free transcript is returned unchanged.
export function injectScriptExecutions(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
): FileEvent[] {
    const runs = findScriptExecutionRuns(records);
    if (runs.length === 0) {
        return events;
    }
    return events.map((event) => rebuiltEvent(event, runs, records, reader));
}
