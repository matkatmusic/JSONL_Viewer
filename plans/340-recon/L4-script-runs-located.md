# L4 recon — timeline nodes for script executions (located, not run)

## Identification chain (parse-only, effectively free, no consent gate)

`findScriptExecutionRuns` (src/reconstruction_script_execution.ts:99, memoized
on `getCorpusState(records).scriptRuns`) → `resolveScriptIndirection`
(src/reconstruction_script_indirection.ts:120, rewrites `run.code` to the
written script body for `python3 x.py` indirection) →
`scriptCodeMayWriteFiles` (src/reconstruction_script_prestate.ts:81, boolean
heuristic — NOT a path list).

`ScriptRun` = `{code, timestamp, cwd?, source? (RecordSource file/line),
toolUseId?, executorKind? (python|bash)}` (reconstruction_script_execution.ts:28-35).
No file paths, no changeId pre-target: `computeScriptExecutionChangeId(run,
target)` mints `scriptRun:<toolUseId|ts>:<target>` only once a target is known.

**Affected paths cannot be known statically/reliably.** Options:
- `runForTarget` (reconstruction_script_probe.ts:34) — basename substring
  match of a GIVEN target in run.code (speculative by design).
- Real answer needs `executeRunOnce` (~100 ms sandbox spawn, consent-gated
  `isImpureExecutionAllowed`) — that's L6's territory.

## S14 mockup (plans/script-run-detail-mockup.html, signed off)

Hollow-ring `.n-script` node (border 3.5px var(--c-script)); Detail pane:
<dl> metadata (kind/instant/session/evidence jsonl:Lnn/files read/files
written/"verified: no — speculative"), then `.scriptbody` <pre> with
provenance header, then `.affected` Fork-style tree+diff captioned
"before = nearest verified state at-or-before the run · after = next
verified state — same diff mechanism as segment selection, reuse".
NOTE: mockup's "(layer 7)"/"layer-10 replay pending" use the OLD engine
ladder numbers — spec must restate in UI numbering (L4/L6).

## Reusable AS-IS

- The identification chain (all three functions).
- `buildDiffView` / `displayDetailView` (webapp/layer1-diff-view.ts:29,80)
  for per-file before/after panes; before/after are EXISTING revision kinds
  so `describeCommitStep`/`describeSnapshotStep`/`describeDiskStep`
  (layer1-revision-sources.ts) suffice — no new DiffStep type.
- `layOutNodeLadders` + the `snapshots?` wire precedent.
- Fixture-view mirror pattern (`buildFixtureLayer1View`).

## Thin adapters needed

- Bracket function: run instant → nearest-before/nearest-after steps on a
  file's `listDatedSteps` list → baseIndex/targetIndex for buildDiffView.
- `.n-script` branch in layer1-drawer.ts `describeNode`/`openNodeDrawer` +
  new script-body/metadata markup (nothing renders script text today).
- `WireScriptRunOf<I,P,U>` + `scriptRuns?` on WirePairOf +
  `listPairLadderInstants` entry + buildLayer1View threading (~5 files,
  snapshot-shaped; zero existing webapp/server references to ScriptRun).
- "Speculative affected files for a run" helper: invert runForTarget — scan
  known pair paths for basename mentions in run.code.
- Fixture: canned SCRIPT_RUNS + placements; decide route for script-body
  fetch (new FixtureRevisionNode kind vs separate accessor).
- Switcher: `[4]` button + CSS gate.

## AMBIGUITIES (grilling)

1. Affected-file source at identification time: cheap static substring
   heuristic only (false pos/neg prone), or consent-gated ~100 ms sandbox
   spawn per run? THE crux.
2. Multi-file / file-unknown runs: N node instances (one per touched
   bubble, shared toolUseId) vs one canonical node + cross-links? Where
   does a zero-guess run render (global bucket/nav pane, or not drawn until
   L6 proves a target)?
3. Bash runs: sandbox always skips them — render with static-only affected
   files (never provable), or exclude/flag permanently unverifiable?
4. Ladder ordering at (near-)same instant: where does script-run insert
   among created→commits→onDisk→snapshots?
5. Indirection-resolved runs: node label shows invocation command, resolved
   filename, or both? scriptbody shows resolved body (what ran) or literal?
6. Node identity: `scriptRun:<toolUseId>` (one drawer state shared across
   bubbles) vs `scriptRun:<toolUseId>:<path>` (per-bubble, matches existing
   changeId minter)?
7. Switcher numbering: does [4] imply [3] exists first? (Ladder says yes —
   L3 ships before L4; confirm cumulative `layer >= N` gating.)
8. Same script filename rewritten and re-run 5×: tooltip/copy design to
   distinguish runs sharing a basename (server already resolves
   body-at-instant).
9. Fixture route for script body: extend /api/layer1-file's
   FixtureRevisionNode, or separate canned fetch path?
