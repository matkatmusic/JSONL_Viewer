# Spec: Script-Execution-as-Authored-Event (Engine B → 100% reconstruction)

Status: APPROVED — Phase 1 complete; Plan at `plan-script-execution-replay.md`
Date: 2026-06-20
Branch: `develop` (CWD: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`)

---

## Objective

**What.** Teach the reconstruction Engine to model *a script run that rewrote tracked files* — executed via **Bash OR the context-mode MCP sandbox (`ctx_execute`/`ctx_batch_execute`)** — as a first-class **authored event** in the per-line replay timeline. When the transcript shows such a script ran at time `T`, the Engine recovers the script, derives its transformation, validates it, and replays that transform forward as a synthetic event at `T`.

> **Verified instance (T0 measurement):** the rename ran **once**, `T_exec = 2026-06-19T08:10:43.539Z`, session `540a4546`, via `mcp__…ctx_batch_execute` "Run rename engine" → `cd RevEng && python3 plans/naming/rename-functions.py 2>&1`. Result `285 OK, 7 MISMATCH, 0 SKIP`. NOT a `Bash` tool_use — detection must cover MCP execute calls.

**Why.** Engine B currently leaves **110 residual MISMATCH "failures."** These were root-caused (prior session) as a **transcript coverage gap**, NOT engine logic bugs: a Python script (`plans/naming/rename-functions.py` + `function-names.csv`) rewrote ~247 function names via `open()/write()`. A script write produces **no Edit/Write tool_use records**, so the post-rename content never entered the Engine's belief — the Engine faithfully reconstructs the last *observed* (pre-rename) state and mismatches on renamed tokens.

The fix is not to fabricate state. The **script execution is a real recorded event** (the JSONL captures the `Write` that created the script and the execution call that ran it — here an `mcp__…ctx_batch_execute`). The Engine simply doesn't yet model "a script ran and transformed files" the way it models an `Edit`. Closing that gap makes the 110 reconstructable from genuine transcript evidence.

**User.** The RevEng engine maintainer, who runs Engine B to reconstruct file history from Claude Code transcripts and wants reconstruction to be correct wherever the data allows.

**Success looks like.** Every file in the 110 either (a) reconstructs byte-perfect once the script-execution event is replayed AND passes forward-validation (running the pre-script state through the script reproduces the known post-script truth), or (b) is honestly flagged as not-explained-by-the-script ("back to the drawing board"). Target: zero genuine engine bugs; zero silent fabrication.

---

## The Algorithm (user-specified)

```
JSONL shows a script-execution call (Bash OR ctx_execute/ctx_batch_execute) touched many tracked files at time T
        │
        ▼
Does the script (and its data inputs) still exist on disk?
   ├─ No  → recreate from the JSONL: reconstruct the script's own source
   │        (and data inputs, e.g. the CSV) from their Write/Edit records
   │        — i.e. run the Engine on the script file itself.
   └─ Yes → read it
        │
        ▼
Derive the transformation strategy from the script (per script-type plugin)
   (rename-functions.py + function-names.csv ⇒ whole-token old→new subs, scoped)
        │
        ▼
VALIDATE — the forward test:
   Build the "expected state" = the immediate post-script state at T:
     1. anchor = first captured BEACON after T (a read/cat/snapshot, ts > T),
        else the on-disk state (fallback — no later observation was captured).
     2. reverse every OBSERVED edit in (T, anchor] back onto the anchor,
        newest-first, landing on the state as it was just after the script ran.
        (Edit/Write records carry both before+after, so they invert cleanly —
         unlike the script transform itself.)
   Then run the Engine's pre-script state THROUGH the script (forward) and
   compare the result to that expected state:
   ├─ Match → forward(pre) == expected post-script state is proven.
   │           Inject the transform FORWARD as a synthetic authored event at T.
   └─ No   → not (fully) explained by this script → flag, drawing board.
```

**Why forward, not reverse.** Validate by running `forward(pre)` and comparing to the known post-state — NOT by inverting the script. Forward validation needs no invertible transform, so it generalizes to any script (deletions, token collapses, non-bijective rewrites), not just clean renames.

**The comparison anchor.** The target is the *immediate* post-script state at T. The nearest captured truth is the first **beacon** after T (or on-disk if none), but the beacon may sit ahead of the script by some recorded edits. Those intervening edits are observed (Edit/Write records, which carry both before and after, so they invert cleanly), so we rewind them off the anchor — newest-first — to recover the state as it was the instant the script finished. Comparing against *that*, rather than the raw beacon/on-disk, isolates the script's effect from later drift.

**Central design point.** A script-execution event is a **transform event, not a content event.** Its effect depends on the live per-line belief at `T`, which is unknown until replay. So the synthetic event must carry the *transform spec* and be applied at replay time against the current belief — it cannot be pre-materialized into per-line `write` events at extraction time.

---

## Tech Stack

- Node.js (CommonJS, `require`), no build step. Python 3 only for the legacy rename script being modeled.
- No new third-party dependencies (Ask-first if any are proposed).
- Tests: plain `node` + `assert` + `tests/test-helpers.js` (`run`, `printTestSummary`).

---

## Commands

```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"

# Run a single test
node tests/test-script-execution-events.js

# Full JS regression sweep (excludes test-output-data.js)
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; \
  node "$f" >/dev/null 2>&1 || echo "FAIL: $f"; done; echo "sweep done"

# Reconstruction measurement over the 110 (engine path, combined cache, with per-line mismatch detail)
node --max-old-space-size=8192 tools/probe-engine-b.js \
  --projects-dir /Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects \
  --only "Desktop/claude code src/RevEng/"

# Mechanically prove probe-vs-engine convergence after consolidation
node probes/gen-callgraph.js 3
```

---

## Project Structure

```
api/
  reconstruct-file.js          → THE ENGINE. reconstructFileWithSeed + loadCombinedCache
  track-line-states.js         → compareEvents / groupEventsByMs / trackLineStates (replay loop)
  apply-one-event.js           → applyOneEvent — per-kind belief mutation (NEW: handle scriptExecution)
  file-event-kinds.js          → createKindEvent + KIND_NAMES (NEW: add 'scriptExecution')
  file-events-extractors.js    → buildAuthoredEvent / extractAuthoredEvents (extractor pattern to mirror)
  bash-op-events.js            → extractBashOpEvents (closest sibling extractor)
  extract-bash-file-ops.js     → extractBashCommand (Bash tool_use → command string)
  transcript-parsers.js        → extractSessionMetadata (session cwd)

  # NEW MODULES
  script-execution-events.js   → extractScriptExecutionEvents(jsonlPath, parsed, aliasSet)
  script-recovery.js           → resolve script+inputs on disk OR recreate from JSONL via the Engine
  script-transforms/
    index.js                   → registry: match script → transform-deriver plugin
    rename-functions.js        → derive whole-token rename subs from rename-functions.py + CSV
  script-replay-validation.js  → forward test: forward(pre) vs expected-post-script state
                                 (first beacon after T rewound by observed edits, else on-disk)

tools/
  probe-engine-b.js            → batch harness; to be consolidated onto the engine path
plans/naming/
  rename-functions.py          → the script being modeled (whole-token \bold\b→new, count-asserted)
  function-names.csv           → forward map (oldName,newName,...); enriched variant has scope cols
tests/
  test-script-execution-events.js, test-script-recovery.js,
  test-script-transforms-rename-functions.js, test-script-replay-validation.js
```

---

## Code Style

New files use **4-space indent** (global standard); edits to existing 2-space files **use 4-space indentation**. Functions are **verb phrases** (`extractScriptExecutionEvents`, `deriveRenameTransform`, `validateTransformByReverse`), never noun phrases. Mirror the existing extractor shape:

```javascript
// api/script-execution-events.js  (mirrors api/bash-op-events.js)
var kinds = require('./file-event-kinds');
var bashOps = require('./extract-bash-file-ops');
var transforms = require('./script-transforms');

// Behavior: emit one scriptExecution event per detected script-run that
// targets a path in aliasSet, carrying the derived transform spec (applied at replay).
function extractScriptExecutionEvents(jsonlPath, parsed, aliasSet) {
    var events = [];
    for (var i = 0; i < parsed.length; i++) {
        var run = detectScriptInvocation(parsed[i]);          // {scriptPath, args, cwd} | null
        if (!run || !parsed[i].timestamp) { continue; }
        var transform = transforms.deriveTransform(run);      // plugin-dispatched | null
        if (!transform || !transform.targetsAlias(aliasSet)) { continue; }
        events.push(kinds.createKindEvent(
            jsonlPath, i, parsed[i].timestamp, 'scriptExecution',
            { scriptPath: run.scriptPath, transform: transform.spec }
        ));
    }
    return events;
}
```

---

## Testing Strategy

TDD, red-green-refactor. Tests live in `tests/test-<basename>.js`, run with `node tests/test-<basename>.js`, use `assert.strictEqual`/`assert.deepStrictEqual` and `h.run(...)` / `h.printTestSummary()`. Each test is commented with a `Behavior:` line.

Coverage levels:
- **Unit** — each new module: detection, recovery (both branches), transform derivation (forward; inverse only for the edit-rewind, not the script), validation (forward match; beacon-rewind off the anchor; mismatch-flag), `applyOneEvent` for the new kind.
- **Integration** — `reconstructFileWithSeed` over a synthetic transcript where a script-run sits between a pre-state read and the on-disk post-state → asserts byte-perfect reconstruction and timeline ordering (later observation overrides the transform).
- **Acceptance** — the probe/coverage report over the real 110: count cleared vs flagged. No silent truncation — log every file that the script does NOT explain.

> ⚠️ The Stop hook auto-runs `tests/test-<basename>.js` after each edit and trips on intentional RED phases — expected during TDD.

---

## Boundaries

**Always:**
- Replay only transforms whose execution is actually recorded in the transcript (a real `Bash` tool_use running the script).
- Mirror the script's own safety semantics: `rename-functions.py` aborts a file when `count != expected` (MISMATCH). Replay must do the same — if a sub's whole-token count on the live belief ≠ expected, skip/flag that file rather than write a partial transform.
- Validate every transform with the forward test (forward(pre) == expected-post-script state) before trusting it; flag (don't fabricate) anything that fails.
- Run the regression sweep before committing.

**Ask first:**
- Adding any third-party dependency.
- Changing the on-disk event schema / `KIND_NAMES` ordering semantics (affects all reconstructions).
- Committing (branch off `develop` first; nothing is currently committed).

**Never:**
- Force a file to "pass" by seeding from current on-disk content or applying a transform whose execution isn't in the transcript — that is fabrication, not reconstruction.
- "Fix the engine" to mask a file that is genuinely unexplained — flag it instead.
- Recurse `enumerateJsonlFiles` for subagent transcripts (tried + reverted; breaks adjacency test). Subagent coverage comes from `loadCombinedCache` via `subagent-transcript-discovery.js`.

---

## Success Criteria

1. New `scriptExecution` event kind exists, is ordered by `compareEvents`, and is applied by `applyOneEvent` as a **transform** over the live per-line belief at `T`; later observations correctly override it.
2. `extractScriptExecutionEvents` detects the single `rename-functions.py` run from the real transcripts and targets the correct alias paths.
3. Script recovery works both ways: reads the script + CSV from disk when present; **and** recreates them from their transcript Write/Edit records (via the Engine) when absent — proven by a test that hides the on-disk copy.
4. `rename-functions.js` transform plugin derives forward (old→new) and inverse (new→old) whole-token subs from the CSV, honoring `isExported` scope (global vs single-file).
5. Forward-validation: for each of the 110, `forward(engine_pre_state_at_T)` reproduces the expected post-script state — the first beacon after T rewound by the observed edits in (T, beacon], or on-disk (likewise rewound) when no beacon exists. Files where forward(pre) ≠ expected are flagged (not silently transformed).
6. **Quantified result over the real 110:** report `cleared` (byte-perfect after replay + validated) vs `flagged` (not explained). Every flagged file is logged with a reason. (Target: the rename-script residue clears; any remainder is explicitly classified, not silently dropped.)
7. Full `tests/test-*.js` sweep is green; touched-file tests pass.

---

## Implementation Order (preview for Phase 2 — Plan)

1. `file-event-kinds.js`: add `'scriptExecution'` to `KIND_NAMES`. Ordering is by `unixMs` then `jsonl`/`jsonlLine`, unchanged — event timestamps are unique, so there is no same-ms tiebreak to design.
2. `apply-one-event.js`: handle `scriptExecution` — iterate live belief lines for the alias, apply the transform spec with the count-assertion guard.
3. `script-transforms/rename-functions.js` + `index.js`: transform derivation (forward/inverse) from the CSV; the matcher that recognizes the script invocation.
4. `script-recovery.js`: on-disk read + recreate-from-JSONL (recursively reconstruct the script & CSV via `reconstructFileWithSeed`).
5. `script-execution-events.js`: detection + event emission.
6. `script-replay-validation.js`: locate first beacon after T; rewind observed edits off the anchor (newest-first) to build the expected-post-script state; forward test `forward(pre) == expected`.
7. Wire extraction into the engine's event-gathering; consolidate `probe-engine-b.js` onto the engine path (retires the main-only divergence as a side effect).
8. Acceptance run over the 110; classify residue.

---

## Resolved (no open questions blocking the Plan)

- **Run count: one.** The script was *executed once*, at a single timestamp `T`, producing one `scriptExecution` event. It was *edited multiple times before* that single run, so recovery must reconstruct the script **as of `T_exec`** (not an earlier edit). The earlier "~25×" was an unverified inherited observation (it counted a proxy — script-name mentions / per-file status lines — not executions) and is discarded.
- **Residue scope: decided by the mechanism, not up front.** We do not pre-classify any function/comment/`.gitignore` split (those figures are inherited and unverified). The one recorded run does whole-token `\bword\b` substitution, which is content-agnostic and rewrites comment occurrences automatically. Forward-validation (`forward(pre) == expected-post-script state`) measures empirically what that run explains; whatever it does not reproduce is flagged — not pre-scoped, not fabricated.
- **Spec location:** stays at `RevEng/plans/spec-script-execution-replay.md`, alongside the handoff workflow. Revisit only when committing.
