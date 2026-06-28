// Script-execution replay, part 2 of 2: the reconstruction stage. Validates script execution by
// running the pre-script state through the actual script (in a temp dir) and comparing the result
// to the expected post-execution state derived from the file-history beacon.

import { randomUUID } from "node:crypto";
import { EventKind } from "./structures/vocabulary.ts";
import { Uuid, type Path } from "./structures/domain.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { splitLines } from "./reconstruction_replay_edit.ts";
import { noteStage } from "./reconstruction_provenance.ts";
import { beaconSnippetFor, type BeaconSnippet } from "./reconstruction_user_edit.ts";
import { backupSeedWriteFor, type BackupReader } from "./reconstruction_sidecar.ts";
import {
    findScriptExecutionRuns,
    getPreExecutionState,
    runScriptAgainstState,
    type ScriptExecutionEvent,
    type ScriptRun,
} from "./reconstruction_script_execution.ts";
import type { FileEvent, UserEditEvent } from "./reconstruction_engine.ts";

// The latest run at or before `when` whose source mentions `target`'s basename. False positives are
// harmless — the forward test rejects them.
function runForTarget(runs: ScriptRun[], target: Path, when: Date): ScriptRun | undefined {
    const basename = target.toString().split("/").pop() ?? "";
    let chosen: ScriptRun | undefined;
    for (const run of runs) {
        if (run.timestamp.getTime() > when.getTime()) continue;
        if (run.code.includes(basename)) chosen = run;
    }
    return chosen;
}

// Windowed forward test: whether `lines` reproduces every visible beacon line at its own (1-based)
// line number. The beacon may be a WINDOW, so only its shown lines are checked.
function linesMatchBeacon(lines: string[], snippet: BeaconSnippet): boolean {
    for (const { lineNo, text } of snippet.lines) {
        if (lineNo - 1 >= lines.length || lines[lineNo - 1] !== text) return false;
    }
    return true;
}

// The full file content at the beacon's observation time — the post-execution anchor.
function getPostExecutionBeacon(
    target: Path,
    beaconTimestamp: Date,
    records: TranscriptRecord[],
    reader: BackupReader,
): string | undefined {
    const backup = backupSeedWriteFor(records, target, beaconTimestamp, reader);
    return backup?.content;
}

// ponytail: identity — no scenarios have edits between script run and beacon; add rewind when needed
function getImmediatePostExecutionState(beaconContent: string): string {
    return beaconContent;
}

// The VALIDATE pipeline from Script-execution-algorithm.md (lines 33-47): for a user-edit beacon that
// is the echo of a script run, execute the script against the pre-execution state and compare to the
// expected post-execution state. On match, return a ScriptExecutionEvent carrying the computed content.
function scriptExecutionForBeacon(
    beacon: UserEditEvent,
    runs: ScriptRun[],
    records: TranscriptRecord[],
    reader: BackupReader,
): ScriptExecutionEvent | undefined {
    const run = runForTarget(runs, beacon.target, beacon.timestamp);
    if (run === undefined) return undefined;

    const preExecutionState = getPreExecutionState(run, records, reader);
    if (preExecutionState.size === 0) return undefined;

    const resultingState = runScriptAgainstState(run.code, preExecutionState);
    if (resultingState === undefined) return undefined;

    const targetStr = beacon.target.toString();
    const targetRef = [...preExecutionState.keys()].find(
        (ref) => targetStr === ref || targetStr.endsWith(`/${ref}`),
    );
    if (targetRef === undefined) return undefined;

    const resultContent = resultingState.get(targetRef);
    if (resultContent === undefined) return undefined;

    // Guard: if the script didn't change this file, it's not a script-execution event
    const preContent = preExecutionState.get(targetRef);
    if (resultContent === preContent) return undefined;

    // VALIDATE: compare resultingState to expectedState
    // Primary: full content match against beacon backup
    const beaconContent = getPostExecutionBeacon(beacon.target, beacon.timestamp, records, reader);
    if (beaconContent !== undefined) {
        const expectedState = getImmediatePostExecutionState(beaconContent);
        if (resultContent === expectedState) {
            return {
                kind: EventKind.scriptExecution,
                changeId: beacon.changeId,
                target: beacon.target,
                content: resultContent,
                timestamp: run.timestamp,
            };
        }
    }
    // Fallback: windowed comparison (handles out-of-band changes between script and beacon)
    const snippet = beaconSnippetFor(records, beacon.changeId);
    if (snippet !== undefined && linesMatchBeacon(splitLines(resultContent), snippet)) {
        return {
            kind: EventKind.scriptExecution,
            changeId: beacon.changeId,
            target: beacon.target,
            content: resultContent,
            timestamp: run.timestamp,
        };
    }
    return undefined;
}

function noteInjection(event: ScriptExecutionEvent, detail: string): void {
    noteStage({
        stage: "injectScriptExecutions",
        target: event.target,
        changeId: event.changeId,
        detail,
        when: event.timestamp,
    });
}

function rebuiltEvent(
    event: FileEvent,
    runs: ScriptRun[],
    records: TranscriptRecord[],
    reader: BackupReader,
): FileEvent {
    if (event.kind !== EventKind.userEdit) return event;
    const replacement = scriptExecutionForBeacon(event, runs, records, reader);
    if (replacement === undefined) return event;
    noteInjection(replacement, "replaced a script-echo user-edit beacon with the validated forward transform");
    return replacement;
}

// When a script modifies a file but no user-edit beacon echoes the result (e.g. multi-session
// baseline+main where the baseline Write predates the script run), detect the modification by
// running the script and inject a ScriptExecutionEvent directly.
function beaconlessScriptExecution(
    target: Path,
    runs: ScriptRun[],
    records: TranscriptRecord[],
    reader: BackupReader,
): ScriptExecutionEvent | undefined {
    const targetStr = target.toString();
    const basename = targetStr.split("/").pop() ?? "";
    for (const run of runs) {
        if (!run.code.includes(basename)) continue;
        const preState = getPreExecutionState(run, records, reader);
        if (preState.size === 0) continue;
        const postState = runScriptAgainstState(run.code, preState);
        if (postState === undefined) continue;
        const ref = [...preState.keys()].find(
            (r) => targetStr === r || targetStr.endsWith(`/${r}`),
        );
        if (ref === undefined) continue;
        const pre = preState.get(ref);
        const post = postState.get(ref);
        if (!pre || !post || pre === post) continue;
        return {
            kind: EventKind.scriptExecution,
            changeId: new Uuid(randomUUID()),
            target,
            content: post,
            timestamp: run.timestamp,
        };
    }
    return undefined;
}

// Reconstruction stage: replace each user-edit beacon that is the validated echo of a script-execution
// run with a synthetic ScriptExecutionEvent, OR inject a new event when the script modified a file
// that has no beacon (multi-session transcripts where the baseline Write predates the script run).
export function injectScriptExecutions(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
    target?: Path,
): FileEvent[] {
    const runs = findScriptExecutionRuns(records);
    if (runs.length === 0) return events;
    let anyReplaced = false;
    const result = events.map((event) => {
        const rebuilt = rebuiltEvent(event, runs, records, reader);
        if (rebuilt !== event) anyReplaced = true;
        return rebuilt;
    });
    if (anyReplaced || target === undefined) return result;
    const injection = beaconlessScriptExecution(target, runs, records, reader);
    if (injection === undefined) return result;
    noteInjection(injection, "injected script-execution effect for a file with no user-edit beacon");
    const insertAt = result.findIndex((e) => e.timestamp > injection.timestamp);
    if (insertAt < 0) result.push(injection);
    else result.splice(insertAt, 0, injection);
    return result;
}
