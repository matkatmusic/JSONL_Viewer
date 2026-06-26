## 2026-06-26:13:05:00 — Phase C: script-execution replay (forward-validate-inject) — s37 PASS 13/13

Phase C is **implemented, green, tsc-clean, and NOTHING is committed** (your commit discipline).
`check_scenario_coverage.ts s37` → **PASS 13/13**; the coverage ledger sweep → **1/1**; the full suite
→ **209 pass / 6 fail** (the 6 are the unchanged pre-existing set; the former 7th, `s37 reproduces every
captured step state`, now passes). Zero regressions.

### References
- /Users/matkatmusicllc/.claude/plans/task-implement-script-replay-partitioned-puppy.md (the spec, Phase C)
- /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/ba079f53-7a92-486b-89c4-344621a8bfc5.jsonl (this session)
- s37 fixture: scenarios/executed/s37-script-rename-driver-back-and-forth-mcp/9680fef5-125c-4211-8285-9afb01d8bff0.jsonl

### Algorithm (yours, this session) — implemented
A "run" = a Bash or MCP execution (`ctx_execute`/`ctx_execute_file`/`ctx_batch_execute`) that modifies
tracked files, leaving no per-file Write/Edit. For each post-script user-edit beacon that a run explains:
derive the transform from the script + its data input (the renames CSV), run the **pre-script on-disk
state forward** through it, **validate** the result reproduces the first confirmed post-execution state
(the windowed beacon), and on a match **inject** it as a synthetic authored event at the run time. On
mismatch → leave the beacon for the existing repair stages (no forcing).

### Files
- `src/structures/vocabulary.ts` — `EventKind.scriptExecution`; `ToolName.CtxExecute/CtxExecuteFile/CtxBatchExecute` (full `mcp__…` wire names).
- `src/reconstruction_script_execution.ts` (NEW) — `ScriptExecutionEvent`/`RenameSub` types; transform (`parseRenameSubs`, `parseScriptTargets`, `escapeRegExp`, `applyRenameSubs`); run detection (`isScriptExecutionRun`, `findScriptExecutionRuns`); transform derivation (`deriveRenameSubs`).
- `src/reconstruction_script_stage.ts` (NEW) — the reconstruction stage `injectScriptExecutions` (forward-validate-inject). Split from the above for the 250-line cap.
- `src/reconstruction_engine.ts` — `ScriptExecutionEvent` in the `FileEvent` union.
- `src/reconstruction_replay.ts` — `scriptExecution` branch (emits the event's precomputed `content` as a full-content revision).
- `src/reconstruction_branches.ts` — `injectScriptExecutions` wired into `reconstructFileOver` BEFORE `completeElidedBeacons`.
- Tests: `tests/reconstruction_script_execution.test.ts`, `tests/reconstruction_script_stage.test.ts` (NEW); `tests/vocabulary.test.ts`, `tests/reconstruction_engine.test.ts` (membership/union).

### Plan corrections (validated against the fixture — the plan was wrong on these)
- **2 subs, not 4, in the transcript** — the line-117 `renames.csv` Write holds only `add_entry`,
  `rm_entry`. The file actually ran with **4** rows (`+tot_debits→total_debits`, `+tot_credits→total_credits`),
  added out-of-band; recoverable from the CSV's **file-history backup** (not the Write). Step-8 needs all 4.
- **Two idempotent runs** (line 158 relative-path FAILED with FileNotFoundError; line 162 absolute-path
  SUCCEEDED) — both `mcp__plugin_context-mode_context-mode__ctx_execute`. The latest run ≤ the beacon is used.
- **No clean ledger.py backup exists**: every *renamed* backup carries the out-of-band
  `# names normalized via rename script` comment (the only renamed snapshots are @10:30:03 with the comment);
  every *clean* backup is pre-rename. The renamed-without-comment state (step-8 GT) lives in **no backup** —
  only as the windowed `edited_text_file` beacon @167. This is why `completeElidedBeacons` bled the comment
  and why the state must be **computed**, not fished from a backup.

### Design decisions / deviations from the plan's C-steps
- **Reconstruction stage, not extraction.** The plan put `extractScriptRenameEvents` inside
  `extractFileEvents`. But computing the forward result needs the pre-script reconstructed/on-disk state,
  which extraction doesn't have. So it is a pipeline stage in `reconstructFileOver` (where backups + the
  beacon are available), placed before `completeElidedBeacons`. Consequently the Phase-B `recordVerdict`
  gate is NOT involved (the run stays `ignore` in extraction; the stage finds it from `records`), so **no
  `recordVerdict` change was needed** (C5a reduced to the `ToolName` additions).
- **Event carries precomputed `content`, not `subs`.** First cut had replay re-apply `subs` to
  `currentText`; but at replay time an *earlier* elided beacon may not yet be completed, so `currentText`
  was the truncated window (validation saw 24 lines vs the 96-line beacon). Fix: derive pre-script content
  from the **file-history backup at-or-before the run** (the 124-line pre-rename state), apply the subs in
  the stage, and store the result on the event. Replay just emits it — order-independent.
- **C8 is a no-op.** Replacing the beacon before `completeElidedBeacons` removes the elided beacon it
  would have mis-completed, so the comment bleed never happens — `completeElidedBeacons` is unchanged, and
  s28/s30/s35 (other script-types whose forward transform does NOT reproduce their beacons) fall through
  to it untouched. Validation (`linesMatchBeacon`) is the safety net.
- **CSV recovery = the file-history backup** (`backupSeedWriteFor` at-or-before run time), not full
  re-reconstruction of the CSV (which would yield the stale 2-row Write and recurse). Faithful to "read
  the on-disk data input"; simpler and non-recursive.
- **Edit-reversal step deferred (YAGNI).** Your algorithm reverses observed edits in `(T, anchor]` onto
  the anchor; s37 has none, so the anchor is used directly. Add the reversal when a scenario needs it.

### Open questions
1. **Commit Phase C** when satisfied — nothing is staged. (Phase B is also still uncommitted — confirm
   whether you want B and C as one commit or two.)
2. **Multi-script-type plugins (s28/s30/s31/s33…)** still flow through `completeElidedBeacons`. If you
   later want them modelled as script-execution runs too, the rename-CSV derivation is the first of what
   the plan calls "script-type plugins" — add scoped/conditional/count-checked derivations beside it.
3. **`ScriptRun` carries no cwd.** Targets/CSV are resolved by basename + suffix match, which suffices
   for s37's single `renames.csv`/`ledger.py`. A scenario with same-basename files in different dirs would
   need cwd-aware resolution.

---

## 2026-06-26:12:10:00 — Phase B: make the verdict the single extraction gate (Option A)

Phase B is **implemented, green, tsc-clean, and NOTHING is committed** (your commit discipline). The
engine's reconstruction output is **unchanged** (parity, the whole point of Phase B). s37 still FAILs
step-8 (Phase C's job). Stop here for you to commit.

### References

- /Users/matkatmusicllc/.claude/plans/task-implement-script-replay-partitioned-puppy.md (the spec, Phase B = lines 317-347)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260626-1152.md (the handoff into this phase)
- /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/ba079f53-7a92-486b-89c4-344621a8bfc5.jsonl (this session)

### Headline: the plan's parity premise was FALSE — confirmed empirically

The plan/handoff claimed "kept[] is already a superset of what the engine reads (only drops 158/162,
which produce no events) → parity holds trivially," so B1 should route record-LOAD through
`partition.kept`. I implemented that literally first → **5 branch-reconstruction tests regressed**
(`test_default_view_shows_all_branches`, `test_list_branches_summarizes_surviving_and_rewound`,
`test_default_view_shows_surviving_vc_plus_two_rewound`,
`test_list_branches_lists_surviving_vc_and_two_rewound`,
`test_s9_list_branches_shows_only_the_surviving_restored_branch`).

Root cause (read `reconstruction_branch.ts`): the engine consumes **conversation topology**, not just
file evidence — `findConversationBranches` reads every `last-prompt` record's `leafUuid`
(`collectHeadUuids`) to enumerate heads, and walks the continuous `uuid`→`parentUuid` ancestry
(`collectAncestorUuids`/`indexRecordsByUuid`). The classifier marks all `last-prompt` records and all
non-evidence conversational turns `ignore`, so routing load through kept[] deletes the head markers
and punches gaps in the parent chain → branch enumeration collapses. `evaluateLine` was only ever a
"does this line carry a file change?" decision; it has no notion of DAG connectivity.

### Design decision: Option A — gate EXTRACTION, not LOAD (user-approved)

The faithful reading of "evaluateLine is the sole keep/ignore decision" is that it gates **file
evidence / event emission**, not conversation topology. So:

- **Reverted** the B1 load swaps — `runCli` and `checkScenario` go back to `loadTranscript` (the full
  record list flows to `reconstructBranches`, DAG intact).
- **Gated extraction**: `collectEventsFromRecord` (in `reconstruction_extract.ts`) now early-returns
  when `recordVerdict(record) === Verdict.ignore`. `recordVerdict` is exported from
  `reconstruction_parse_lines.ts` for this — extraction and the diagnostic partition share the one
  decision and cannot drift.
- This gate is a **provable no-op today**: extraction already only emitted from
  Write/Edit/Bash-file-op/user-edit records, which are exactly the non-`ignore` classes. It is the
  hook Phase C flips — C5 makes `recordVerdict` admit the `ctx_execute` rename run (a `scriptExecution`
  verdict) so it passes this gate and reaches `extractScriptRenameEvents`.

### Deviations

- **`loadKeptRecords` was added then removed (YAGNI).** B1's first cut added a `loadKeptRecords`
  helper to hydrate kept[]; Option A doesn't route load through kept[], so it has no consumer (and
  kept[] can't be the engine loader — it loses topology). Removed it and the `parseTranscriptLine`
  import it needed. `partitionLines`/the trace are untouched.
- **B2 reframed for Option A.** The plan's B2 ("reconstruct s37 from kept[], assert byte-identical to
  full") is wrong here — kept[] loses the DAG, so that reconstruction *should* differ. Replaced with
  `test_extraction_ignore_gate_changes_no_s37_events` (in `tests/reconstruction_extract.test.ts`):
  filter s37 records to the non-`ignore` set, assert `extractFileEvents(evidence)` deep-equals
  `extractFileEvents(full)`, plus `evidence.length < full.length` (gate is non-vacuous). Not
  tautological: hunk-indexing runs over the un-gated input, so a misclassified hunk-bearing
  edit-result would make the evidence-only run lose its hunks and diverge.

### Tradeoffs

- **Accepted a function-only ESM import cycle** `reconstruction_extract.ts ↔ reconstruction_parse_lines.ts`
  (`parse_lines` imports the bash parsers from `extract`; `extract` now imports `recordVerdict` from
  `parse_lines`). Both modules only export functions called at runtime, so the cycle is safe — tsc is
  clean and the suite is green. The alternative (relocating the bash parsers + verdict logic into a
  neutral third module) is more churn and would break Phase A's just-committed file layout and several
  test import paths; not worth it for Phase B. Revisit only if a cycle-sensitive tool complains.

### Verification

- `npx tsc --noEmit` → clean.
- `node --import tsx --test tests/*.test.ts` → **198 pass / 7 fail** (was 197/7; +1 = the new B2 test).
  The 7 fails are the unchanged pre-existing set (s19×3 — no `.step_states` in this worktree; S13×2;
  `test_a_file_less_surviving_branch_is_kept_…`; and `s37 reproduces every captured step state` =
  Phase C's step-8 bleed). **Zero regressions.**
- `npx tsx scripts/check_scenario_coverage.ts s37` → `FAIL 12/13`, step-8 unchanged (the
  `completeElidedBeacons` + `seedStaleEditBases` comment bleed). Parity, not correctness.
- `npx tsx scripts/coverage_ledger.ts` → `0/1`, s37 `FAIL 12/13` — substantively identical to the
  pre-Phase-B sweep (only the embedded timestamp differs). No sweep regression. (NB: only s37 has
  `.step_states` in this worktree, so the sweep is a single scenario; the real cross-scenario parity
  gate is the full engine test suite above.)

### Open questions

1. **Commit Phase B** when satisfied — nothing is staged or committed. Files touched:
   `src/reconstruction_extract.ts` (gate + imports), `src/reconstruction_parse_lines.ts` (export
   `recordVerdict`), `tests/reconstruction_extract.test.ts` (B2). `reconstruction_cli.ts` and
   `scripts/check_scenario_coverage.ts` are back to their committed state (load swaps reverted).
2. **Phase C hook is set.** `recordVerdict` is now authoritative for extraction. C5 must give the
   `ctx_execute` run a non-`ignore` verdict (the plan's `scriptExecution`/`scriptRename`), or the new
   gate will swallow it before `extractScriptRenameEvents` runs.
3. **User Asked**: Is there a way to include convo topology in the kept[] items?
Yes, mechanically you can — but "topology" isn't a small subset you can cherry-pick, and that's the catch. Three walker facts decide it:

- collectAncestorUuids (tree.ts:194) walks byUuid.get(parent) and stops the moment a parent is missing — the chain must be contiguous. Drop one interior node and the ancestor set truncates.
- collectDescendantUuids (tree.ts:105-108) BFS's down and the comment is explicit: the abandoned subtree "threads through attachment intermediaries between a prompt and its assistant continuation, so a type-filtered walk would stop short." So even attachment records are load-bearing.
- collectHeadUuids needs every last-prompt record; findPromptForkPoints needs the genuine user prompts.

So to make kept[] DAG-complete you'd have to keep last-prompt plus every uuid/parentUuid-bearing record of every type (assistant, user, attachment, the lot) — i.e. ≈ the entire transcript. There's no compact middle: contiguity forbids keeping "just the skeleton."

What that costs:
- Guts Phase A's whole point — the trace's narrow evidence view (--onlyIgnored would show almost nothing). You already audited the narrow set.
- Re-opens the just-committed classifier (new Verdict members, new logic).
- Buys nothing Phase C needs. Option A already makes the verdict the sole gate for event emission, which is the only property the ctx_execute fix requires.

The only thing topology-in-kept[] buys is architectural purity: "kept[] is literally the engine's sole input."

If you do want that purity, the clean shape is a two-tier kept set: tag topology records with a distinct verdict (e.g. Verdict.topology for last-prompt + any uuid/parentUuid record), have the trace hide them by default (audit view stays clean), and let the engine consume the full kept[]. That makes kept[] self-sufficient without losing the diagnostic signal — but it's a meaningfully bigger classifier and a near-whole-transcript kept set.

My recommendation: don't — stay with Option A. It's done, zero-risk, and the verdict already gates the thing that matters.

---

## 2026-06-26:11:20:00 — Phase A: Step-1 line-partition parser + verdict trace
Chat title: script-replay (partitioned-puppy)
Path to JSONL log: ~/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/ (current session transcript)

Phase A of the three-phase s37 script-replay plan is **implemented, green, tsc-clean, and NOTHING is
committed** (your commit discipline). The engine's input is **unchanged** — Phase A is a parallel diagnostic
only. Phase B (making `kept[]` the engine's sole input) is gated on your human eyeball of the trace, so I
stopped here for you to audit + commit.

### References

- /Users/matkatmusicllc/.claude/plans/task-implement-script-replay-partitioned-puppy.md (the spec)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/coding-requirements.md
- s37 transcript: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s37-script-rename-driver-back-and-forth-mcp/9680fef5-125c-4211-8285-9afb01d8bff0.jsonl

### Files added / changed (all UNCOMMITTED)

- `src/structures/vocabulary.ts` — added `Verdict` enum + `KNOWN_VERDICTS`, and `TraceDetailMode`.
- `src/reconstruction_parse_lines.ts` (new) — `evaluateLine`, `partitionLines`, `KeptLine`/`IgnoredLine`/`LinePartition`.
- `src/reconstruction_trace.ts` (new) — `renderTrace` + `TraceOptions`/`TraceDetailSelector`/`TraceDetailOptions`.
- `src/reconstruction_cli_trace.ts` (new) — `--trace` flag parsing (`parseTraceArgs`) + `runTrace`.
- `src/reconstruction_cli.ts` — `runCli` short-circuits to the trace mode before `parseArgs`.
- `src/reconstruction_extract.ts` — exported the four bash parsers (were private) for reuse.
- `tests/utilities.ts` — added `jsonlPathsForScenario`.
- `tests/{vocabulary,reconstruction_parse_lines,reconstruction_trace,reconstruction_cli_trace}.test.ts` — 28 new tests.

Result: full suite 192/199 pass (was 165/172). The **7 failures are pre-existing** — identical set with my
work stashed (s19 ground truth not captured in this worktree; two S13 fixtures; and `s37 reproduces every
captured step state` = the step-8 bleed that is Phase C's job). **Zero regressions; +27 passing tests.**

### Design decisions

- **1-based line numbers.** `partitionLines` emits the literal 1-based file line number (the plan's sample
  used the 0-based array index). 1-based matches `buildUuidLineIndex` and how the transcript is referenced
  everywhere; tests assert exact 1-based lines.
- **Classify by the tool_use the engine consumes, not the result record.** A `write`/`edit` verdict comes
  from the assistant tool_use block. A Write *result* record (line 118) is therefore `ignore` (extraction
  reads the content from the tool_use input, never the result). Read result (177) → `read-beacon`; Edit
  result (186) → `edit-result`, distinguished by `toolUseResult` shape (`file.content` vs
  `structuredPatch` + `oldString`/`newString`, which excludes a Write result's structuredPatch).
- **Throw → ignore.** `evaluateLine` wraps the whole body in try/catch → `ignore`, matching the plan's Phase B
  rule that a kept line which fails to parse cannot be evidence.
- **`bashFileOp` branch shipped in Phase A** (its parse helpers already exist); only `scriptExecution` is
  deferred to C5. So the two `ctx_execute` runs (158/162) are `ignore` for now — by design.

### Deviations

- **renderTrace split into `src/reconstruction_trace.ts`** instead of living in `reconstruction_parse_lines.ts`
  as the plan specified. Forced by the project's 250-line-per-file cap (combined file was 267). Same
  "split, never condense" pattern the codebase already uses (beacons split from reseed). Trace tests moved to
  `tests/reconstruction_trace.test.ts` accordingly.
- **`--trace` parsing split into `src/reconstruction_cli_trace.ts`** because `reconstruction_cli.ts` was
  already at the 250-line cap. To fit the one-line dispatch I also condensed that file's bottom entrypoint
  guard and the dispatch to brace-less one-liners.
- **Corrected line numbers vs the plan's Context table** (the renames.csv Write tool_use is line **117**, not
  118 — 118 is its result), per the plan's own license to fix the index base in the RED phase.
- **Two tests beyond the plan's enumerated A2 list**: `edit-result` classification (186) and a
  `renderTrace` "rejects both filters at once" guard — cheap coverage of branches the plan describes.

### Post-review tweaks (same session)

- **`--trace --help`** added: documents `--hideIgnored`/`--onlyIgnored`/`--details [<selector>] [<mode>]`,
  listing the selectable verdict classes and both modes (`preview-only`, `full`). Lives entirely in
  `reconstruction_cli_trace.ts` (`TRACE_HELP`) so `reconstruction_cli.ts` stays at its cap.
- **Ignored rows now surface the record `type:`** — a bare dropped row renders `35: ignore type:assistant`
  (kept rows already name their type via the verdict). Makes `--onlyIgnored` audits readable without
  `--details`. New `recordTypeOf` helper in `reconstruction_trace.ts`.
- **`--line N`** added as an explicit single-line detail selector (composes with `--details`). Equivalent to
  the positional `--details 124`. A `byLine` selector **restricts the output to just that line** (detailed),
  rather than enriching it among every other row.
- **`--mode <mode>`** — the render depth (`preview-only` / `full`) is now an explicit flag, not a trusted
  positional after `--details`. An unknown `--mode` value is a usage error (no positional-mode guessing).
  So: `--details ignore --mode full`, `--details --line 124 --mode full`.
- **`--details` previews are now meaningful for every kept class** — `describeRaw` dispatches by record shape:
  an `edited_text_file` attachment → `kind=edited_text_file preview=<file>`; a file-history-snapshot →
  `kind=snapshot preview=<file@vN, …>` (the files it backed up + versions); a Read/Edit/Write tool result →
  `kind=Read|Edit|Write preview=<file>`. File previews use the **basename** (the old full tmp path truncated
  to a useless `/private/var/folders/…` prefix).

### Tradeoffs

- `describeRaw` (the `--details` enricher) reads the plain `JSON.parse` of the line, not the hydrated
  `parseRecord`, so `--details full` can pretty-print the real record and an odd line never throws. The
  alternative (hydrate, then serialize) would render Uuid/Path/Date objects awkwardly.
- Preview truncates to 40 chars with whitespace collapsed — arbitrary, matches the plan's example width.

### Open questions

1. **Phase B gate — your eyeball.** First-pass audit done: the kept set holds every load-bearing
   write/edit/user-edit-beacon/read-beacon/file-history-snapshot. The only intentional drops are the two
   `ctx_execute` runs (158/162, deferred to Phase C) plus non-file-op bash (`ls`/`python`/`pytest`) and Read
   *requests* (their results are kept). Audit it yourself with:
   `npx tsx src/reconstruction_cli.ts <s37.jsonl> --trace --onlyIgnored --details`
   Confirm before I start Phase B.
2. **Commit Phase A** when satisfied — nothing is staged or committed.
3. Line **57** is an early `bash-file-op` kept in the trace — confirm it's a legit setup op (it's kept either
   way; Phase B's parity check will catch it if it ever produced a spurious event, which it does not today).
