# L6 recon — actual script execution result nodes (on-demand replay)

## Replay machinery (reusable AS-IS)

`executeRunOnce(run, records, reader, seedContent?)` →
`RunExecution {pre, post|undefined}` (src/reconstruction_script_runs.ts:73-115);
derives its own pre-state via `getPreExecutionState`
(reconstruction_script_prestate.ts:122). Python ONLY — bash executor
short-circuits to post:undefined; also skipped: pre-baseline, read-only
(`scriptCodeMayWriteFiles` false), empty pre-state.
`runScriptAgainstState(script, preState, sourceLabel?, recordedCwd?)`
(reconstruction_script_sandbox.ts:143-172): temp dir, seeds files, execSync
`python3 __script__.py` timeout 5000 ms, reads tree back; any error →
undefined; cwd remapped into the sandbox so scripts can't escape.

## Memo/persistence — Q21 ALREADY SATISFIED

Sandbox memo key = SHA-256(script + cwd + sorted pre-state pairs)
(`computeSandboxInputKey` :126-141); in-memory LRU 4096; disk persistence via
`configureSandboxMemoPersistence`/`flushSandboxMemoToDisk` (:60-74,
batched every 64 spawns, corrupt-tolerant load, `post:null` = memoized
failure). executeRunOnce's own memo is in-memory per derived-cache only.

## Verification (exists, internal-only today)

`scriptExecutionForBeacon` (reconstruction_script_stage.ts:66-111):
executeRunOnce → primary full-content equality vs
`getPostExecutionBeacon(target, beaconTimestamp, records, reader)` →
fallback windowed line match (`linesMatchBeacon`). On mismatch it returns
undefined and the caller silently keeps the original event — NO
"verification failed" state ever surfaces. layer1.html has zero script/result
rendering precedent (only n-commit/n-disk/n-snap/n-created).

## Progress + cost

Slow parts: process spawn per run (≤5 s), pre-state reconstruction walk,
temp-dir I/O. `reportReconstructionProgress` sink +
`streamNdjsonBuild` (viewer_api_layer1_route.ts:43-61, the ?progress=1
NDJSON framing) exist; scoped single-file GET precedent = /api/layer1-diff.
"Scoped + progress-streamed" combined = new but straightforward composition.

## Critical precedent breaks

- Layer switcher is PURE CSS, never refetch/compute
  (layer1-layer-toggle.ts:1,:23). L6 "compute on switch with progress" is a
  genuinely new switcher interaction — no precedent.
- Consent: `isImpureExecutionAllowed()` (reconstruction_exec_gate.ts) is
  PROCESS-WIDE, its own comment says thread an options object if per-request
  gating is ever needed — on-demand HTTP-triggered replay is exactly that
  case.

## Thin adapters needed

- New POST route: run/node id → executeRunOnce + stage match check →
  streamNdjsonBuild progress. Ninth fixture handler for parity.
- New wire type (WireScriptResultOf) + node classes (verified / mismatch?).
- Per-request consent threading (or reuse of the process gate — grill).

## SETTLED (user, 2026-07-30)

### Only what's on screen gets executed, and only once

Compute script results **for the nodes actually visible in the rendered
viewport** and nothing else — the same region the minimap's green box marks.
Zoom level therefore changes which scripts run.

If a run affects nodes that are off screen, those nodes are simply already
done: when they later scroll into view, their script run is **skipped, because
it has already run**. A script run happens **once per node**, ever.

### Run it exactly as the conversation ran it

Replay the script exactly as it was executed in the conversation. One
execution then updates **every bubble it touched** — all affected files, from
that single run.

### Execution is sequential, in timeline order

There is no concurrency to design. Runs depend on the file state reconstructed
by earlier points in the timeline, so they must execute in timeline order.
(This replaces the old "concurrency/cost cap" question — the cap is inherent.)

### Persistence: reuse the sandbox memo disk file, plus a clear button

Results survive restarts via the existing sandbox memo disk file
(`configureSandboxMemoPersistence` / `flushSandboxMemoToDisk`). Add a button in
the **GUI top-row header** that clears the memo, forcing **every layer** to
recompute from scratch, script execution included.

### A mismatch is its own node kind

When replay output does not match the expected state, that is a distinct
**mismatch** node — not the engine's current silent suppression.

### Read-only runs are beacons, not "no result"

A read-only script event yields beacon-level data (it reports full contents),
so it is a beacon like any other — not an absent or empty node.

### Consent: reuse what exists

Reuse the existing gate. It was built once; do not build it again.

### Bash runs — see L4, not here

The old Q6 ("bash runs: not-verifiable nodes or hidden?") is a duplicate. Bash
handling was settled in L3 (beacon source only, never a change source), and the
one remaining piece — whether a bash node is visibly marked as never
replay-provable — is tracked as **L4 open item A**. Nothing to decide in L6.

## SETTLED (user, 2026-07-31) — popup over the timeline

**Execution progress UI.** The **global load bar** carries overall progress, as
already settled. The separate live-output console is a **popup layered over the
timeline** — the user picked it from the three placements mocked up for task
#347 (popup, anchored panel, drawer), so anchored-panel and drawer are rejected.

The console shows the script's output as it streams plus a cancel button that
kills the in-flight run, with distinct terminal states for cancelled,
completed-with-mismatch, and normal completion. Panel chrome follows
`plans/mvp-app-mockup.html:126-157`'s `.details`/`.dpane` styling. Mockup:
`plans/l6-console-mockup/`.

Do not design a second progress-bar idiom — the load bar
(`webapp/layer1-progress.ts`, fed by the NDJSON `?progress=1` stream) is shipped
and out of scope.

## RESOLVED (grilling, 2026-07-30) — only the console mockup remains

Answers first; the questions and their evidence are kept below as the record.

- **A — one beacon definition across all layers.** L6 verifies against whatever
  L3 calls a beacon: file-history backups, full-file Reads, `Bash(cat)` output,
  commits, snapshots — nearest after the run. Extending
  `getPostExecutionBeacon` past the backup timeline is real engine work, taken
  deliberately so "beacon" never means two things in two layers.
- **B — yes, tell them apart.** `original-failed` is one of the seven
  confidence states. Cost objection withdrawn: `executeRunOnce` already
  receives `records` and `ScriptRun` already carries `toolUseId`, so honouring
  `is_error` is ~10-15 lines with no signature change.
- **C — read the live working tree, but only to confirm.** A match promotes the
  node to verified. A mismatch or a missing file changes nothing and shows no
  marker, because the file may have been edited many times since — a difference
  is not evidence. This is a first-ever capability: `process.cwd()` appears
  nowhere in src today.

## The questions, as asked

**A. What counts as the "next known-good state" to verify a replay against?**

_Correction first: the engine **does** detect real user edits — the earlier
belief that it does not is wrong._ When a human edits a file outside Claude,
the harness writes an `attachment` record of type `edited_text_file` whose
snippet is the full post-edit content in `cat -n` form. `userEditEventFrom`
(src/reconstruction_user_edit.ts:23) strips the line numbers and produces a
first-class `UserEditEvent` — a **full-content** event, replayed like an
overwrite (reconstruction_replay.ts:87-93). It is directly tested
(tests/reconstruction_user_edit.test.ts) and exercised by recorded scenarios
**s15, s18–s23, s27, s33, s35, s36, s38, s40, s51**, with **s52** as the
negative control.

Two things are easy to confuse, so naming both:
- **`UserEditEvent`** — the engine *saw* an `edited_text_file` attachment and
  knows exactly what changed. Real detection.
- **`presumedUserEdit`** (LayeredNodeKind, layered_end_state.ts:23-31) — the
  engine saw two verified states disagree with no event explaining the
  difference, so it *presumes* a user edit. No evidence behind it.

One wrinkle: the IDE emits `edited_text_file` on writes and reads too, not only
edits, so the engine drops snapshots whose content matches what it already
knows (`userEditChangesContent`, reconstruction_replay.ts:118-119).

**The real logs are full of them.** Surveyed
`~/Programming/jot-recovery/claude-data/projects` (2,228 real session files):
**10,149 `edited_text_file` occurrences across 512 files**. The live
`~/.claude/projects` (2,301 files): **2,685 occurrences across 320 files**.
Timestamps span **2026-04-11 → 2026-07-30** — three and a half months, not a
recent handful. (Test scenarios add 158.) So "user-edit beacon" is a
well-populated target, not a theoretical one.

**Code re-check (2026-07-30) — the question's premise was wrong.** The stage's
current definition is *not* "user-edit beacon." `getPostExecutionBeacon`
(reconstruction_script_stage.ts:35-43) never reads a beacon event's content at
all. It calls `backupSeedWriteFor` → the generic **file-history backup
timeline** (reconstruction_backup_timeline.ts:30-76, built from
`trackedFileBackups` for the whole session regardless of what changed the file)
and takes the single latest backup **at-or-before** the timestamp — no
look-ahead. Provenance-agnostic. There is exactly one fallback, and only that
one is type-specific: the windowed line comparison
(reconstruction_script_stage.ts:99-109) uses `beaconSnippetFor`, which matches
`edited_text_file` records only. No commit or read-echo path exists, and
nothing is configurable.

So the real question is narrower: **keep the nearest-prior-backup rule**, or
**extend the accepted set** to commits and snapshots?

**B. A failed original run and a failed replay are currently the same thing.
Should they be told apart?**

The user's instinct — "if the log says the script failed, don't re-execute it"
— requires a signal the engine does not currently use:

- The transcript **does** carry `is_error` on tool_result blocks
  (structures/content-blocks.ts:29). The engine reads it in exactly two narrow
  places: script-rename gating (reconstruction_script_renames.ts:87) and git
  operations (reconstruction_git_operations.ts:26). **Never** for general
  Bash/script runs.
- There is **no `exitCode` anywhere** in the engine. `BashResult`
  (structures/tool-results.ts:18-24) types `stderr`/`stdout`/`interrupted`, but
  no consumer reads them as a failure signal.
- Worse, `getToolResultForUserRecord` (structures/tool-results.ts:158-171)
  **discards** errored runs outright — Claude Code writes "Error: …" / "User
  rejected tool use" as a plain string, and the parser returns `undefined`
  rather than typing it.
- Meanwhile `executeRunOnce` collapses **six different outcomes** into the same
  `post: undefined`: sandbox crash, 5-second timeout, bash executor, read-only
  code, pre-baseline timestamp, empty pre-state.

So today the engine cannot distinguish "the original run failed" from "our
replay failed" from "we chose not to replay."

**The transcripts do record failures, in one shape only.** Survey of the real
corpus: **4,361 `"is_error": true`** tool_result blocks (live
`~/.claude/projects`: 1,216). That is the signal. What is *not* available:

- `toolUseResult` for a Bash call has the shape
  `{stdout, stderr, interrupted, isImage, noOutputExpected}` — **no `exitCode`
  at that level, zero occurrences.** The 812 nonzero `exitCode` hits in the
  corpus all live under a separate `attachment` object and are **hook**
  execution results, not Bash tool calls.
- `interrupted` appears ~24,500 times and is **always `false`** — never once
  `true` in either real corpus or the scenarios. Useless as a signal.
- Non-empty `stderr` covers 179,746 of 219,573 fields — mostly ordinary
  build/test chatter. An upper bound, not a failure count.

Question: does L6 need "original failed" / "replay failed" / "not replayed"
told apart?

**Code re-check (2026-07-30): wiring `is_error` in is cheap — ~10-15 lines, no
plumbing.** `executeRunOnce` already receives the full `records` array, and
`ScriptRun` already carries `toolUseId` and a `source` RecordSource. The
toolUseId → tool_result lookup idiom is already written twice
(`indexToolResultsByToolUseId`, reconstruction_git_operations.ts:154-164;
`collectRenameCandidatesFromToolResult`, reconstruction_script_renames.ts:78-89).
Adding a short-circuit on `is_error` needs no signature change and touches
nothing upstream. So the cost objection is withdrawn — this is a design
decision, not a budget one.

**C. Beaconless script-created files: they happen, roughly 1 in 3.**

Rough survey of the real corpus — 29,155 Bash `tool_use` records, 1,470 matched
a file-write pattern (`open(...,'w')`, `Path(...).write_text`, `>` redirect,
`tee`), and **482 of those (~33%) had the created filename never reappear later
in the same session**. Typical shapes: log files written by a redirect and
never read back, scratch handoff `.txt`/`.md` files.

_Treat the number as order-of-magnitude only._ The proxy misses heredocs,
multi-line scripts, files written by a program Bash merely invokes, and
variable-expanded paths; and "reappears later" was a raw substring search, not
scoped to Read/Write/Edit records, so it both over- and under-counts. No
cross-session tracking either.

**Code re-check (2026-07-30) — today they are neither skipped nor verified;
they are injected unverified.** `injectScriptExecutions`
(reconstruction_script_stage.ts:143-169): when no existing beacon event was
replaced and a target is known, it calls `beaconlessScriptExecutions`
(reconstruction_script_beaconless.ts:59-81), which runs the script through the
sandbox and injects the computed content as a `ScriptExecutionEvent` **with no
VALIDATE step at all** — unlike the beacon path, nothing is compared to
anything.

And the on-disk option does not exist as a capability: `process.cwd()` appears
**nowhere** in src, and every `readFileSync`/`existsSync` in the script stack
reads the sandbox's own `mkdtemp` directory, never the real repo tree. The
engine's entire verification universe today is {file-history backups, sandbox
re-execution}.

So the choice is: **keep injecting unverified** (status quo, but now visibly
marked as such), or **read the live working tree** — which would be a
first-ever capability for this engine, not a configuration.
