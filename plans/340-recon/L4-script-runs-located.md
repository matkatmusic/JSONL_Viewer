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

## SETTLED (user, 2026-07-30)

### Affected files: name them when parsing gives them, otherwise don't

If the files a script touched can be determined while parsing the run (the
static path/basename scan), show the file name on the node. If they cannot,
the timeline still shows **that a script execution occurred** — clicking the
node shows the script that was executed. No sandbox spawn in L4; that is L6.

Getting the script body is already a solved problem in the engine
(`findScriptExecutionRuns` → `resolveScriptIndirection` rewrites `run.code` to
the written script body). L4 does not need to re-solve it.

### Node identity + the connector line

Identity is `scriptRun:<toolUseId>` — **one drawer state shared across all
bubbles** the run touches, not one per path.

Visually, all bubbles' `scriptRun` nodes for the same execution are linked by a
horizontal rectangle or horizontal dashed line, so it reads as one execution
rather than N unrelated events. **That connector is itself clickable** and
opens the detail view showing the executed script.

This also settles the multi-file / file-unknown case: N node instances sharing
one toolUseId and one drawer, joined by the connector; a run with no
determinable file is still drawn, showing only that a script ran.

### Ladder ordering

Use the engine's existing timestamp sort — the same sort that already orders
JSONL rows correctly. Revisit only if real data shows a problem.

### Layer gating is cumulative, for every layer

`[4]` implies `[3]` is present: `layer >= N` gating. **This rule applies to
every future layer**, not just L4.

## STILL OPEN

**A. Should a bash run look different from a python run?**

_Correction first: the earlier wording "the sandbox always skips bash runs" was
wrong. Verified against the code:_

- _The sandbox has no bash/python branching at all — it is hard-coded
  `execSync("python3 __script__.py")`, the single execution point in the engine
  (reconstruction_script_sandbox.ts:190)._
- _What actually skips bash is an explicit early return in `executeRunOnce`
  (reconstruction_script_runs.ts:94-99): `executorKind === bash` → returns
  `post: undefined`, no pre-state, no spawn. Test:
  `test_bash_run_skips_prestate_and_sandbox`._
- _Bash runs **are** identified and **do** appear in the `ScriptRun` list
  (reconstruction_script_execution.ts:91) — nothing filters them out._
- _One exception: a bash command that shells out to a written `.py` file is
  reclassified to `executorKind: python` by `resolveScriptIndirection` **before**
  the gate, and it does execute (`test_bash_indirection_to_python_file_executes`)._
- _Bash `mv` and friends still yield rename evidence — through a separate
  static channel, not the sandbox (`test_bash_static_rename_evidence_survives_gate`)._

So bash runs render as script nodes like any other, with affected files named
when the static channel supplies them (per the settled rule above). The open
question is narrower: a genuine bash run can **never** be proven by replay,
because L6's sandbox will never run it. Does the node carry a visible mark
saying so, or does it look identical to a python run that simply has not been
replayed yet?

_Code re-check (2026-07-30): **the visual language already exists — it just
isn't in layer 1 yet.** The sibling older viewer styles byteless nodes as a
hollow dashed ring: `.kind-pre-anchor-stub { background: transparent; border:
2px dashed #9ca3af }` (layered-styles.css:135), with
`.kind-presumed-user-edit` at :137 for the presumed case. `layer1-styles.css`
has no equivalent (its only `dashed` rules are leader lines and the orphan
bucket border) and layer 1 renders neither `preAnchorStub` nor
`presumedUserEdit` today. So "mark it unprovable" is a **port of an existing
idiom**, not a new design — which makes marking the cheap option._

**B. Indirection-resolved runs — which text goes where?**
When the log shows `python3 rename_inv.py`, the engine rewrites `run.code` to
the *body* of `rename_inv.py` as it existed at that moment. So there are two
different strings: the invocation (`python3 rename_inv.py`) and the resolved
body (the actual Python). Question: does the node's **label** read the
invocation, the resolved filename, or both — and does the detail view's script
pane show the resolved body (what actually ran) or the literal command line?
May be deferred until real data makes the choice obvious.

**C. Telling apart repeated runs of the same script.**
`rename_inv.py` gets written, run, edited, run again — five times. The timeline
then holds five script nodes that all say `rename_inv.py`, and each one ran a
*different* body.

_Code re-check (2026-07-30): **confirmed — this is purely a copy/tooltip
question, no resolution logic needed.** `ScriptExecutionEvent`
(reconstruction_script_execution.ts:11-17) carries its own `content` and
`timestamp` per event, with the comment "a script run's proven post-execution
content… precomputed so replay order can't affect it." Each run is its own
event with its own changeId and body, keyed by its own instant. Distinct
bodies come free; only the label design is open._

**D. Fixture route for the script body.** Yes — this is asking where in the
fixture data the simulated script text lives, and how the mockup fetches it.

_Code re-check (2026-07-30): **the two "routes" turn out to be the same route.**
`FixtureRevisionNode` (viewer_api_layer1_fixture_content.ts:6-11) is strictly
identity — `kind`/`hash`/`version`/`session` — and carries no text. Bytes come
from `contentLines(path, node)` (:73-90), which procedurally builds text from a
per-language `TEMPLATES` entry seeded off the revision stamp; an unrecognised
`kind` falls through to a generic "working tree" template. That function **is**
the per-node canned-content accessor, dispatched from
`fixtureNodeFor`/`handleFixtureFileRequest` (viewer_api_layer1_fixture.ts:65-99)._

_So the real question is smaller: a literal canned script body needs a branch
in `contentLines` **before** the generic template logic — it cannot ride on
`FixtureRevisionNode`. Remaining choice is only whether the canned bodies live
in `fixture_data.ts` or a new sibling file; cross-file reuse is already proven
(`ms`, `sessionFileFor`, `sessionIdFor` are plain exports already imported by
two other fixture modules)._
