# Task 191 — CLI per-stage progress on stderr, behind verbosity flags

## Goal

Two new reconstruction-CLI flags: `--progress` (stage-level progress lines) and
`--progress-all` (stage-level plus the counted per-record events). All progress output goes to
**stderr**, and the pre-existing `Loading transcript from <path>` stdout line is removed, so
stdout stays pure JSON for `--json` consumers. Default (no flag) stays completely silent.

The engine is **already fully instrumented**: ~20 call sites emit through
`reportReconstructionProgress` (`src/reconstruction_progress.ts`), which forwards to a
process-wide sink that only the viewer currently installs (`viewer_api.ts:187`). The CLI just
never installs a sink. This plan wires a stderr sink into `runCli`, adds the two missing stage
announcements (merge, sidecar reader), and moves the one stdout print off stdout. No engine
module changes beyond those two one-line announcements.

All code lives in the `jfred` submodule (`RevEng/jfred`). Follow
`jfred/plans/coding-requirements.md`, `~/.claude/guides/coding-standards.md`, and
`~/.claude/guides/single-condition-branching.md`. Tests run via `node --test` (NOT vitest);
do NOT run the full suite — the user runs it. Line-cap note: `src/reconstruction_cli.ts` is at
205 lines of a 250 cap; the edits below add ~20 lines, which fits.

## Verbosity model (the "levels")

- *(no flag)* — silent. No stdout noise, no stderr noise.
- `--progress` — every **uncounted** progress event (`event.current === undefined`) printed to
  stderr as `<label>\n`. These are the stage labels: `loading <file>`, `parsing records`,
  `reconstructing <target> — <stage>`, `building step snapshots`, etc. Counted per-item events
  are skipped (the per-record parse events are one-per-JSONL-line — millions on a 292MB run).
- `--progress-all` — everything: uncounted events as above, counted events printed as
  `<label> (<current>/<total>)\n`. Implies `--progress`.

## Step 1 — RED: failing tests in `jfred/tests/reconstruction_cli.test.ts`

Append to the existing file (it already imports `runCli` and the fixture constants; `S1_JSONL`
is the fixture to use — small, single transcript). Add two capture helpers at the bottom of the
file next to the new tests, each patching-then-restoring in `try/finally`:

```ts
// Run `action` with console.log captured; return every line it tried to print.
function captureConsoleLogLines(action: () => void): string[] {
    const capturedLines: string[] = [];
    const originalLog = console.log;
    console.log = (...parts: unknown[]) => { capturedLines.push(parts.join(" ")); };
    try {
        action();
    } finally {
        console.log = originalLog;
    }
    return capturedLines;
}

// Run `action` with process.stderr.write captured; return every chunk written.
function captureStderrLines(action: () => void): string[] {
    const capturedLines: string[] = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: unknown) => { capturedLines.push(String(chunk)); return true; }) as typeof process.stderr.write;
    try {
        action();
    } finally {
        process.stderr.write = originalWrite;
    }
    return capturedLines;
}
```

Four tests, each with plain-English step comments per `~/.claude/guides/tdd.md`:

1. `test_json_stdout_carries_no_loading_lines`
   - Run `runCli([S1_JSONL, "--json"])` inside `captureConsoleLogLines`.
   - Assert `JSON.parse(out)` succeeds (stdout payload is pure JSON).
   - Assert no captured console.log line contains `Loading transcript` (the old stdout print is
     gone).

2. `test_progress_flag_writes_stage_labels_to_stderr`
   - Run `runCli([S1_JSONL, "--json", "--progress"])` inside `captureStderrLines`.
   - Assert the joined stderr output contains `parsing records` (an uncounted stage label from
     `loadTranscript`) and `building sidecar backup reader` (the new stage announcement).
   - Assert NO captured line matches `/\(\d+\/\d+\)\n$/` (counted per-record events are
     filtered at this level).

3. `test_progress_all_flag_writes_counted_record_events`
   - Run `runCli([S1_JSONL, "--json", "--progress-all"])` inside `captureStderrLines`.
   - Assert at least one captured line matches `/\(\d+\/\d+\)\n$/` (counted events included).

4. `test_progress_sink_is_cleared_after_run`
   - Run `runCli([S1_JSONL, "--json", "--progress"])` (sink installed and, per the fix, cleared
     in `finally`).
   - Then run `runCli([S1_JSONL, "--json"])` (no flag) inside `captureStderrLines`.
   - Assert the second run wrote nothing to stderr (no sink leak between in-process runs —
     mirrors the task-119 `clearReconstructionFailures` precedent at
     `reconstruction_cli.ts:171-173`).

Run ONLY the new tests to see them fail:
`cd jfred && node --test --test-name-pattern "progress|loading_lines" tests/reconstruction_cli.test.ts`
(Tests 1 and 4 fail on the stdout print / missing flag; tests 2 and 3 fail on the unknown-flag…
actually unknown boolean flags are ignored by `parseArgs`, so they fail on empty stderr. Either
way: RED.)

## Step 2 — GREEN: flag parsing in `jfred/src/reconstruction_cli_args.ts`

- `CliOptions` (line 23): add two fields after `allRecords`:
  ```ts
  progress: boolean;
  progressAll: boolean;
  ```
- `parseArgs` (line 88), next to the other boolean flags (line 107-113):
  ```ts
  const progressAll = rest.includes("--progress-all");
  const progress = rest.includes("--progress") || progressAll;
  ```
  (`--progress-all` implies `--progress`; this is value selection, not control flow, so the
  `||` is fine.) Add both to the returned object.
- `USAGE` (line 20): append `[--progress|--progress-all]` before `[--file-history-loc…]`.

## Step 3 — GREEN: sink wiring in `jfred/src/reconstruction_cli.ts`

- Add imports:
  ```ts
  import { reportReconstructionProgress, setReconstructionProgressSink } from "./reconstruction_progress.ts";
  import type { ProgressSink } from "./parse/loadTranscript.ts";
  ```
- Add the sink builder (above `runCli`):
  ```ts
  // task 191: CLI progress goes to stderr so stdout stays pure JSON for --json consumers.
  // Stage level (--progress) drops the counted per-item events; --progress-all keeps them.
  function buildStderrProgressSink(showCountedEvents: boolean): ProgressSink {
      return (event) => {
          if (event.current !== undefined) {
              if (!showCountedEvents) {
                  return;
              }
              process.stderr.write(`${event.label} (${event.current}/${event.total})\n`);
              return;
          }
          process.stderr.write(`${event.label}\n`);
      };
  }
  ```
- Restructure `runCli` (line 166): keep trace/parse/overrides/clearFailures as-is, then install
  the sink around the rest of the body, which moves verbatim into a new function
  `renderTranscriptView` (same file — current lines 177-202):
  ```ts
  export function runCli(argv: string[]): string {
      const traced = parseTraceArgs(argv);
      if (traced !== undefined) return runTrace(traced);
      const options = parseArgs(argv);
      applyCliPathOverrides(options);
      // task 119: a previous in-process run's aborted leftovers must not leak into this run's
      // failure notes (the tests drive runCli repeatedly in one process).
      clearReconstructionFailures();
      const sink = options.progress ? buildStderrProgressSink(options.progressAll) : undefined;
      setReconstructionProgressSink(sink);
      try {
          return renderTranscriptView(options, sink);
      } finally {
          // task 191, same in-process concern as task 119 above: the sink must not outlive its run.
          setReconstructionProgressSink(undefined);
      }
  }
  ```
- `renderTranscriptView(options: CliOptions, sink: ProgressSink | undefined): string` is the
  moved body with three edits:
  1. `loadTranscript(jsonlPath)` → `loadTranscript(jsonlPath, sink)` (the engine's module-level
     sink cannot be reached from `loadTranscript` — `reconstruction_progress.ts` imports the
     `ProgressSink` type FROM it, so importing back would be circular; hence the explicit pass).
  2. Before the `mergeMultiSourceRecords` line, announce the merge stage only when it will run:
     ```ts
     if (sources !== undefined) {
         reportReconstructionProgress(`merging ${recordLists.length} transcripts across ${sources.length} sources`);
     }
     ```
  3. Before `buildSidecarReader`:
     ```ts
     reportReconstructionProgress("building sidecar backup reader");
     ```
  Keep the existing comments (spec S4b, multi-source) with the moved code.

## Step 4 — GREEN: retire the stdout print in `jfred/src/parse/loadTranscript.ts`

Line 161 — comment out, do not delete (user preference), and say where the line went:

```ts
    // task 191: console.log(`   Loading transcript from ${filePath}`);   — retired from stdout;
    // the `loading <file>` progress event on the next line is its replacement (the CLI's
    // --progress flag prints it to stderr; the viewer's sink already prints it server-side).
```

The `loading ${basename(filePath)}` `onProgress` event on line 162 already covers the same
information. The viewer is unaffected: it passes its own sink and prints events at
`viewer_server_routes.ts:58`. A repo-wide grep confirmed nothing in `tests/`, `scripts/`, or
`webapp/` matches `Loading transcript`.

## Step 5 — verify GREEN

`cd jfred && node --test --test-name-pattern "progress|loading_lines" tests/reconstruction_cli.test.ts`
— all four new tests pass. Then typecheck: `cd jfred && npx tsc --noEmit -p tsconfig.json`.
Do NOT run the full suite (user runs it).

## Out of scope (deliberate)

- No throttling of `--progress-all` counted events (the existing `ponytail:` note at
  `loadTranscript.ts:189-190` already marks that ceiling).
- No progress in `runTrace` (it has its own tracing output) and no viewer changes.
- No timestamps/elapsed on progress lines — add only if the user asks.
