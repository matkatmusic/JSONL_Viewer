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

## AMBIGUITIES (grilling)

1. Trigger: switching to L6 computes all visible eagerly, vs per-node/
   per-bubble "Run" button? (No precedent either way.)
2. Scope of one replay request: one run, one file's history, one bubble, or
   viewport/time-window?
3. Persistence: reuse sandbox-memo disk file so results survive restarts, or
   always fresh?
4. Failed match: distinct mismatch node kind (red marker) vs suppressed (the
   engine's current silent behaviour)?
5. "Next known-good state" = next user-edit beacon (stage's current
   definition), next commit, next snapshot, or configurable?
6. Bash runs (never executable): "not verifiable" nodes or hidden?
7. Read-only + pre-baseline runs: distinct "no result" node or absent?
8. Timeout/crash vs mismatch: currently indistinguishable (both
   post=undefined) — surface differently?
9. Consent UX: entering L6 needs its own "allow script execution" gate?
   Reuse isImpureExecutionAllowed or per-request threading?
10. Concurrency/cost cap per L6 activation (avoid hundreds of spawns)?
11. Beaconless runs (script-created file, no later beacon): skip, or verify
    against current on-disk state?
12. Progress UI: reuse global #loadbar or per-node spinner?
