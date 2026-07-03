// Script-execution replay, part 2 of 2: the reconstruction stage. Validates script execution by
// running the pre-script state through the actual script (in a temp dir) and comparing the result
// to the expected post-execution state derived from the file-history beacon.

import { randomUUID } from "node:crypto";
import { isImpureExecutionAllowed } from "./reconstruction_exec_gate.ts";
import { EventKind } from "./structures/vocabulary.ts";
import { Path, Uuid } from "./structures/domain.ts";
import { resolveAgainstCwd } from "./structures/path-resolve.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { splitLines } from "./reconstruction_replay_edit.ts";
import { noteStage } from "./reconstruction_provenance.ts";
import { beaconSnippetFor, type BeaconSnippet } from "./reconstruction_user_edit.ts";
import { backupSeedWriteFor, type BackupReader } from "./reconstruction_sidecar.ts";
import {
    findScriptExecutionRuns,
    getPreExecutionState,
    runScriptAgainstState,
    type LineageContentBefore,
    type ScriptExecutionEvent,
    type ScriptRun,
} from "./reconstruction_script_execution.ts";
import type { FileEvent, UserEditEvent } from "./reconstruction_engine.ts";

// One execution per distinct run per records array: pre-state build + sandbox run, memoized —
// Phases 3–4 multiply call sites and each sandbox run costs ~100ms.
type RunExecution = { pre: Map<string, string>; post: Map<string, string> | undefined };
const executionsByRecords = new WeakMap<TranscriptRecord[], Map<string, RunExecution>>();

export function executeRunOnce(
    run: ScriptRun,
    records: TranscriptRecord[],
    reader: BackupReader,
    seedContent?: LineageContentBefore,
): RunExecution {
    let byRun = executionsByRecords.get(records);
    if (byRun === undefined) {
        byRun = new Map<string, RunExecution>();
        executionsByRecords.set(records, byRun);
    }
    const key = `${run.timestamp.getTime()}|${run.code}`;
    const cached = byRun.get(key);
    if (cached !== undefined) return cached;
    const pre = getPreExecutionState(run, records, reader, seedContent);
    const post = pre.size === 0 ? undefined : runScriptAgainstState(run.code, pre);
    const execution: RunExecution = { pre, post };
    byRun.set(key, execution);
    return execution;
}

// The pre/post-state key that denotes `target`, or undefined when the run's sandbox never saw it.
function refForTarget(target: Path, stateKeys: string[]): string | undefined {
    const targetStr = target.toString();
    return stateKeys.find((ref) => targetStr === ref || targetStr.endsWith(`/${ref}`));
}

// Whether executing the run shows `target` changed or created — the glob-agnostic gate for a
// script that finds its files (glob.glob) instead of naming them.
function runTouchesTarget(
    run: ScriptRun,
    target: Path,
    records: TranscriptRecord[],
    reader: BackupReader,
    seedContent?: LineageContentBefore,
): boolean {
    const execution = executeRunOnce(run, records, reader, seedContent);
    if (execution.post === undefined) return false;
    const ref = refForTarget(target, [...execution.pre.keys(), ...execution.post.keys()]);
    if (ref === undefined) return false;
    const contentBefore = execution.pre.get(ref);
    const contentAfter = execution.post.get(ref);
    return contentAfter !== undefined && contentAfter !== contentBefore;
}

// The latest run at or before `when` whose source mentions `target`'s basename — or, when no run
// names it, the latest whose EXECUTION provably changes it. False positives are harmless — the
// forward test rejects them. Substring stays primary so existing scenarios keep their run selection.
export function runForTarget(
    runs: ScriptRun[],
    target: Path,
    when: Date,
    records: TranscriptRecord[],
    reader: BackupReader,
    seedContent?: LineageContentBefore,
): ScriptRun | undefined {
    const basename = target.toString().split("/").pop() ?? "";
    let chosen: ScriptRun | undefined;
    for (const run of runs) {
        if (run.timestamp.getTime() > when.getTime()) continue;
        if (run.code.includes(basename)) chosen = run;
    }
    if (chosen !== undefined) return chosen;
    for (const run of runs) {
        if (run.timestamp.getTime() > when.getTime()) continue;
        if (runTouchesTarget(run, target, records, reader, seedContent)) chosen = run;
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
    seedContent?: LineageContentBefore,
): ScriptExecutionEvent | undefined {
    const run = runForTarget(runs, beacon.target, beacon.timestamp, records, reader, seedContent);
    if (run === undefined) return undefined;

    const execution = executeRunOnce(run, records, reader, seedContent);
    const preExecutionState = execution.pre;
    const resultingState = execution.post;
    if (resultingState === undefined) return undefined;

    const targetRef = refForTarget(beacon.target, [...preExecutionState.keys()]);
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
    seedContent?: LineageContentBefore,
): FileEvent {
    if (event.kind !== EventKind.userEdit) return event;
    const replacement = scriptExecutionForBeacon(event, runs, records, reader, seedContent);
    if (replacement === undefined) return event;
    noteInjection(replacement, "replaced a script-echo user-edit beacon with the validated forward transform");
    return replacement;
}

// The target's known state on its chained lineage: the sandbox key it lives under and its content
// after the last injected run.
type RollingTargetState = { key: string; content: string };

// The post-execution content of `target` after `run`, or undefined when the run doesn't change it.
// With no rolling state this is the direct gate (the run names the target or provably touches it);
// with rolling state the run is re-executed against a sandbox seeded with the target's current
// content — a script-born file never appears in the run's own cached pre-state (s85's glob rename).
function runOutcomeForTarget(
    run: ScriptRun,
    target: Path,
    records: TranscriptRecord[],
    reader: BackupReader,
    seedContent: LineageContentBefore | undefined,
    rolling: RollingTargetState | undefined,
): RollingTargetState | undefined {
    if (rolling === undefined) {
        const basename = target.toString().split("/").pop() ?? "";
        if (!run.code.includes(basename) && !runTouchesTarget(run, target, records, reader, seedContent)) {
            return undefined;
        }
        const { pre: preState, post: postState } = executeRunOnce(run, records, reader, seedContent);
        if (postState === undefined) return undefined;
        // post keys included so a file the script CREATES resolves to its ref.
        const ref = refForTarget(target, [...preState.keys(), ...postState.keys()]);
        if (ref === undefined) return undefined;
        const pre = preState.get(ref);
        const post = postState.get(ref);
        // An undefined pre with a defined post is a legitimate birth.
        if (post === undefined || pre === post) return undefined;
        return { key: ref, content: post };
    }
    const { pre: preState } = executeRunOnce(run, records, reader, seedContent);
    const augmentedPre = new Map(preState);
    augmentedPre.set(rolling.key, rolling.content);
    const postState = runScriptAgainstState(run.code, augmentedPre);
    if (postState === undefined) return undefined;
    const content = postState.get(rolling.key);
    if (content === undefined || content === rolling.content) return undefined;
    return { key: rolling.key, content };
}

// When a script modifies a file but no user-edit beacon echoes the result (e.g. multi-session
// baseline+main where the baseline Write predates the script run), detect the modification by
// running the script and inject a ScriptExecutionEvent directly. Runs CHAIN: once one run births
// or changes the target, every later run is executed against the target's rolling content, so a
// move-then-rename pair yields two events even though the rename never names the born file.
function beaconlessScriptExecutions(
    target: Path,
    runs: ScriptRun[],
    records: TranscriptRecord[],
    reader: BackupReader,
    seedContent?: LineageContentBefore,
): ScriptExecutionEvent[] {
    const events: ScriptExecutionEvent[] = [];
    let rolling: RollingTargetState | undefined;
    for (const run of runs) {
        const outcome = runOutcomeForTarget(run, target, records, reader, seedContent, rolling);
        if (outcome === undefined) continue;
        events.push({
            kind: EventKind.scriptExecution,
            changeId: new Uuid(randomUUID()),
            target,
            content: outcome.content,
            timestamp: run.timestamp,
        });
        rolling = outcome;
    }
    return events;
}

// A sandbox artifact no scenario tracks: python bytecode caches.
function isJunkStateKey(key: string): boolean {
    return key.includes("__pycache__") || key.endsWith(".pyc");
}

// Absolute paths of files that exist only AFTER an executed run — script-born files (an out.txt,
// a shutil.move destination) that left no Write/Edit/Bash event.
export function discoverScriptCreatedPaths(
    records: TranscriptRecord[],
    reader: BackupReader,
    seedContent?: LineageContentBefore,
): Path[] {
    const created = new Map<string, Path>();
    for (const run of findScriptExecutionRuns(records)) {
        const execution = executeRunOnce(run, records, reader, seedContent);
        if (execution.post === undefined) continue;
        for (const key of execution.post.keys()) {
            if (execution.pre.has(key) || isJunkStateKey(key)) continue;
            const absolute = resolveAgainstCwd(run.cwd, new Path(key));
            if (!created.has(absolute)) created.set(absolute, new Path(absolute));
        }
    }
    return [...created.values()];
}

// Reconstruction stage: replace each user-edit beacon that is the validated echo of a script-execution
// run with a synthetic ScriptExecutionEvent, OR inject a new event when the script modified a file
// that has no beacon (multi-session transcripts where the baseline Write predates the script run).
export function injectScriptExecutions(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
    target?: Path,
    seedContent?: LineageContentBefore,
): FileEvent[] {
    if (!isImpureExecutionAllowed()) return events;
    const runs = findScriptExecutionRuns(records);
    if (runs.length === 0) return events;
    let anyReplaced = false;
    const result = events.map((event) => {
        const rebuilt = rebuiltEvent(event, runs, records, reader, seedContent);
        if (rebuilt !== event) anyReplaced = true;
        return rebuilt;
    });
    if (anyReplaced || target === undefined) return result;
    for (const injection of beaconlessScriptExecutions(target, runs, records, reader, seedContent)) {
        noteInjection(injection, "injected script-execution effect for a file with no user-edit beacon");
        const insertAt = result.findIndex((e) => e.timestamp > injection.timestamp);
        if (insertAt < 0) result.push(injection);
        else result.splice(insertAt, 0, injection);
    }
    return result;
}
