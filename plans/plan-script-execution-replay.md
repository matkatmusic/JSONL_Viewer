# Plan: Script-Execution-as-Authored-Event

Status: APPROVED — Phase 2 complete; Tasks at `tasks-script-execution-replay.md`
Derives from: `spec-script-execution-replay.md` (APPROVED)
Date: 2026-06-20 · Branch `develop` · CWD `/Users/matkatmusicllc/Desktop/claude code src/RevEng`

---

## The key planning insight — split the 110 *before* writing any feature code

The script-replay mechanism is **only needed for files with no post-script observation anywhere.** Some of the 110 almost certainly already have a beacon the *probe* missed but the *real Engine* would see (the documented probe-vs-engine divergence: probe = main-only cache; Engine = combined main+subagent via `loadCombinedCache`).

Concrete evidence: `api/bash-op-events.js` is in the 110, yet the post-rename token `extractEventsFromBashFileOp` **does** appear in a real read in session `540a4546` (and its subagent). If the Engine's combined cache includes that read, `bash-op-events.js` reconstructs correctly **from the beacon alone — no script-replay required.**

So **Phase 0 measures, with zero new feature code**, three buckets among the 110:

| Bucket | Meaning | Action |
|---|---|---|
| **CLEARS-VIA-ENGINE** | Reconstructs correctly under the real Engine (combined cache) | Nothing — probe artifact, not an engine gap |
| **HAS-BEACON** | A post-script observation exists but isn't enough on its own | **Golden validation files** — ground truth to test the transform logic |
| **NO-BEACON** | No post-script observation anywhere | **True script-replay targets** |

This is the "only build for what we know" discipline applied to ordering: we don't build the transform machinery until we know exactly which files need it and which files can *prove it correct*.

---

## Components & dependency graph

```
A  file-event-kinds.js            add 'scriptExecution' to KIND_NAMES        (foundational)
B  apply-one-event.js             apply transform to live belief at replay   (needs A)
C  script-transforms/             derive forward subs + scope + expected     (standalone, pure)
     rename-functions.js, index.js   counts from the CSV; matcher for invocation
D  script-recovery.js             get script + data inputs AS OF T_exec       (needs Engine)
     (on-disk read │ recreate-from-JSONL via reconstructFileWithSeed, time-bounded)
E  script-execution-events.js     detect the one Bash run → emit event        (needs C, D, A)
     carrying the transform spec
F  script-replay-validation.js    forward test: build expected state          (needs B + Engine)
     (first beacon after T, rewound by observed edits) vs forward(pre)
G  engine wiring                  call extractScriptExecutionEvents in the    (needs E, B)
     per-file event-gathering aggregation site
H  acceptance over the 110        engine coverage report; classify buckets    (needs G, F)
I  (optional) probe consolidation retire probe main-only gathering            (independent cleanup)
```

```
A ──┬─→ B ──────────────┐
    └─→ E ←── C          ├─→ F ─┐
            ↑            │       ├─→ H
            D ←─Engine   G ←─────┘
                         ↑
                    (E + B)
```

**Critical path:** A → B → (C, D) → E → G → H. **F** can be built in parallel once B exists. **C** is pure and can start immediately (no deps). **I** is independent and optional (see Risk R6).

---

## Build order (TDD tracer-bullet — thin vertical slice first, then widen)

### Phase 0 — Measure (no feature code)
- **0.1** Find the single per-file **event-gathering aggregation site** (where `extractAuthoredEvents` / `extractBashOpEvents` outputs are merged for one file before `trackLineStates`). This is where `G` will wire in. Record file:line.
- **0.2** Run the **real Engine** (`reconstruct-file.js` / `reconstruction-coverage.js`, combined cache) over the 110 and bucket them: CLEARS-VIA-ENGINE / HAS-BEACON / NO-BEACON. Log the lists.
- **0.3** Confirm the **rename script's actual data input** (which CSV the Bash command/script source references — `function-names.csv` vs `function-names-enriched.csv`) and the **scope columns** it uses (`isExported`, `numReferences`).
- **✔ Checkpoint 0:** we have the three buckets, the wiring site, and the confirmed CSV/scope. If CLEARS-VIA-ENGINE is large, the "engine gap" was mostly the probe — note it; the remaining feature work targets NO-BEACON only.

### Phase 1 — Transform-event semantics on one file (walking skeleton)
- **1.1** Read `apply-one-event.js` to confirm the per-line belief structure and how an event mutates it.
- **1.2** `A`: add `'scriptExecution'` to `KIND_NAMES`; confirm `createKindEvent` carries an arbitrary spec object.
- **1.3** `C` (minimal): derive forward whole-token subs for the subs affecting **one** chosen file; expose `{old, new, scope, expectedCount}`.
- **1.4** `B`: handle `scriptExecution` in `applyOneEvent` — iterate the alias's current belief lines, apply `\bold\b→new`, enforce the count-assertion (skip/flag file on `count != expected`).
- **TDD:** unit test hand-constructs a `scriptExecution` event over a synthetic pre-state belief → asserts renamed lines, and asserts a deliberate count-mismatch flags rather than writes.
- **✔ Checkpoint 1:** the transform-event applies correctly in isolation; full `tests/test-*.js` sweep green.

### Phase 2 — Detection + recovery (as of T_exec)
- **2.1** `E`: detect the one `rename-functions.py` Bash invocation (`extractBashCommand` + script-path match), capture `T_exec` and session cwd.
- **2.2** `D`: recover the script **and** its CSV as of `T_exec` — on-disk read when present; else `reconstructFileWithSeed` time-bounded to `ts ≤ T_exec` (handles "edited multiple times before the single run").
- **2.3** Wire `E` → `D` → `C` so the emitted event carries the full derived spec.
- **TDD:** test detection finds exactly one run in `2cfe77ab`; test recovery reproduces the script+CSV with the on-disk copy hidden (proves recreate-from-JSONL); test recovery picks the `T_exec` version, not an earlier edit.
- **✔ Checkpoint 2:** from real transcripts we get one event with a correct, time-correct transform spec.

### Phase 3 — Forward validation harness
- **3.1** `F`: for a target file, locate the **first beacon after `T`** (first observation establishing full content: read/cat/snapshot/write), collect observed **Edits** in `(T, beacon]`, rewind them newest-first onto the beacon → expected-post-script state.
- **3.2** Compute `forward(engine_pre_state @ T)` and compare to expected; emit match / flag-with-reason.
- **TDD — the golden test:** run `F` on a **HAS-BEACON** file from bucket 0.2 (e.g. `bash-op-events.js`). Because the Engine independently reconstructs it from the beacon, we have ground truth: assert `forward(pre) == expected == engine_reconstruction`. This proves the transform logic before we trust it on NO-BEACON files.
- **✔ Checkpoint 3:** forward-validation is proven correct against ground-truth files.

### Phase 4 — Engine wiring + acceptance
- **4.1** `G`: register `extractScriptExecutionEvents` at the aggregation site from 0.1 (event sorts into the timeline by `unixMs`; later observations override).
- **4.2** `H`: re-run the Engine coverage over the 110. Report **cleared** (byte-perfect + forward-validated) vs **flagged** (with reason). No silent truncation.
- **✔ Checkpoint 4 (definition of done):** NO-BEACON rename targets reconstruct byte-perfect and forward-validate; every remaining file is explicitly classified, not fabricated; full sweep green.

### Phase 5 — (optional) Probe consolidation — see R6
- Retire `probe-engine-b.js`'s main-only gathering in favor of the Engine path. Independent cleanup; only if you want the probe and Engine to agree. Not required for the goal.

---

## Risks & mitigations

- **R1 — New event semantics (transform vs content).** `applyOneEvent` currently mutates per-line content; a whole-file transform is new. *Mitigate:* checkpoint 1.1 confirms the belief model before coding `B`; tracer-bullet proves it on one file first.
- **R2 — Count-assertion on an imperfect pre-state.** Replay applies subs to the *reconstructed* pre-state; if that's slightly off, `count != expected` flags the file. *Mitigate:* this is the desired flag-don't-fabricate behavior; the forward-validation report surfaces it with the actual vs expected counts.
- **R3 — Which CSV / scope semantics.** Global (`isExported=Y`) vs local subs change which files each sub touches. *Mitigate:* 0.3 confirms the real data input and scope columns from the script source itself, not assumption.
- **R4 — Recreate-from-JSONL bootstrap.** Reconstructing the script via the Engine to feed the Engine. *Mitigate:* it's an ordinary time-bounded `reconstructFileWithSeed` on the script path; covered by the hide-on-disk test (2.2).
- **R5 — Beacon rewind with non-edit ops between T and beacon.** A full Write/snapshot in that window *is itself* a beacon (it establishes content), so the rewind window contains only invertible Edits by construction. *Mitigate:* define beacon = first content-establishing observation; if the window contains something non-invertible, validation flags the file.
- **R6 — Probe refactor scope creep.** The goal is the *Engine* reconstructing correctly; the probe is a diagnostic. *Mitigate:* measure and accept via the Engine's own `reconstruction-coverage.js`, not the probe. Probe consolidation (Phase 5) is optional and isolated.
- **R7 — Phase 0 reveals most of the 110 are CLEARS-VIA-ENGINE.** Then the "engine bug" was largely the probe and little feature code is needed. *Mitigate:* that's a *good* outcome — report it; build the transform only for the true NO-BEACON residue.

---

## Out of scope (explicitly)
- Recursing `enumerateJsonlFiles` for subagents (tried + reverted; use `loadCombinedCache`).
- Any non-rename script type beyond the plugin seam (the registry `index.js` leaves room; we implement only the rename plugin now).
- Forcing NO-BEACON-and-not-script-explained files to pass — they get flagged, per the spec's Never boundary.

---

## What I need from you
Approve this plan, or adjust order/scope. On approval I'll move to **Phase 3 (Tasks)** — break each phase into discrete tasks with explicit acceptance + verify steps + touched files. No code until tasks are approved.
