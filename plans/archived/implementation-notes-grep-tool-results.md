## 2026-06-16:17:49:00 — Roadmap Item 5: Native Grep tool results (`grepMatches`)
Chat title: RevEng — implement roadmap item 5 (native Grep tool results)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/53c02791-f079-4ed1-9e1a-47e878847f23.jsonl

### References
- Authoritative spec: /Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-peaceful-floyd.md
- Item-5 handoff: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260616-1741.md
- Item-4 handoff (modules to mirror, verify commands): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260616-1613.md
- Roadmap: /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/roadmap-100-percent-reconstruction.md
- Item-4 implementation notes (precedent): /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-item4-bash-reads.md

### Design decisions
- **Notes filename.** Used the spec §D-mandated name `implementation-notes-grep-tool-results.md` rather than the skill-default `implementation-notes-<convo_name>.md`; the spec and the item-5 handoff both reference this exact path, so honoring it keeps the roadmap's "On item-5 completion: write `plans/implementation-notes-grep-tool-results.md`" pointer accurate.
- **Code style.** Followed the RevEng house style (CommonJS `var`, 2-space indent, one-condition-per-`if`, no `&&`/`||`, the non-null sub-object IS the kind) per the spec's explicit instruction and the global "match existing style / surgical changes" rule — NOT the global 4-space imperative default.
- **`parseGrepRows` regex `^(.+?):(\d+)[:-]`.** Non-greedy path capture up to the first `:<digits>:` (match) or `:<digits>-` (context) boundary, exactly mirroring `grepEntries` (`bash-read-evidence.js`) but with a leading relpath group. Non-greedy is correct: grep emits `path:line:text`, paths don't contain `:<digits>:`, and text after the prefix (including colons) is preserved by `slice(match[0].length)`. Spans index into the content string; the prefix is excluded.
- **One event per distinct resolved file.** `grepMatchEventsForFile` collapses repeated rows for the same file into a single event (`distinctResolvedPaths`), so a file matched on 10 lines yields one grepMatches event, not ten — materialize re-expands all of that file's rows from the result record. Mirrors how cat/originalFile emit one event and materialize derives the lines.
- **Apply tier = bashGrep, verbatim.** grep witnesses lines as FULL observations (`applyOverlayLines`: overwrite belief + record conflicts) but NEVER the extent — no `finishWholeOverlay`/`finishChunk`. Identical to the `bashGrep` branch; `kindRank`/`isBeaconEvent` left untouched (default rank 2; not a beacon), per the spec.

### Deviations
- **Step 10 pulled early.** The spec lists the shared Grep fixture builders (`makeGrepToolUse`/`makeGrepToolResult`, step 10) last, but the tests for steps 2, 4, 5 and 8 all depend on them. Step 1 (`parseGrepRows`) is a pure parser that needs no fixtures. So the execution order ran: Step 0 → Step 1 → **Step 10 (fixtures)** → Steps 2–9 → Step 11. No behavior change; purely a test-infrastructure ordering fix.
- **`collectGrepTouches` lives in `grep-tool-results.js`, not `appendGrepTouches` in `file-historical-lineage.js`.** The spec's primary plan put the touch builder inline in `file-historical-lineage.js`, with a contingency to "move the body into `grep-tool-results.js`" if the 250-line cap was hit. It was: that file was at 238 lines and an inline builder pushed it to ~252. So I took the contingency — `collectGrepTouches(parsed, cwd)` now lives in `grep-tool-results.js` (which the module comment already anticipated as the discovery caller), and `collectTouches` calls it (file stays at 240). To avoid a require cycle (`file-historical-lineage` load-time-requires `grep-tool-results` for this function), `collectGrepTouches` fetches `resolveAgainstCwd` from `file-historical-lineage` at CALL time via a `resolver()` getter — the same `lse()` cycle-break idiom used in `bash-read-evidence.js`/`grep-tool-evidence.js`. Behavior is identical to the spec's `appendGrepTouches`.
- **Forced reformat of pre-existing `test-helpers.js` builders.** The repo's post-write hook re-checks the WHOLE edited file for deep nesting (>3 indent units). Adding the grep builders made the hook flag five PRE-EXISTING multi-line `message:{content:[{…}]}` literals (`makeBashCatToolUse/Result`, `makeBashPipedCatToolUse`, `makeReadToolUse/Result`) that predate the hook. To get my edit accepted I collapsed all five (and my two new builders) to the single-line `message:{ content:[{…}] }` form already used by `makeBashCommandLine` — a behavior-identical reformat (same JSON output; all 5 affected suites stay green). Not strictly in scope, but the blocking hook required it.

### Tradeoffs
- **Per-step test file vs. reusing `makeBashCatToolResult` for materialize.** `test-grep-tool-evidence` could have reused `makeBashCatToolResult` (materialize only reads the tool_result string), but I used the realistic `makeGrepToolResult` (carrying `toolUseResult:{content,filenames,mode,numFiles,numLines}`) so the same fixture serves the step-8 integration path, which DOES need a real `Grep` tool_use + result pair. One fixture, both callers — matches the spec's "Reused by Steps 5,8."
- **Defensive `typeof item.content !== 'string'` guard in `buildGrepResult`.** Ground truth says Grep's tool_result content is always a string, so this guard is untested-by-spec, but it prevents a crash if an array-content result ever appears (it would otherwise reach `parseGrepRows(...).split`). Kept as cheap production hardening.

### Verification results (gates from spec §E)
- **Full suite:** 55 suites / 575 passed / 0 failed (was 52 / 556 / 0 → +3 suites, +19 tests — exactly the predicted ≈+3). ✓
- **detect-rewinds:** 15 passed / 0 failed. ✓
- **Sidecar e2e (`plate_summary.py`):** `perLineStats {matchedObserved:247, matchedPresumed:0, mismatched:0, neverObserved:0}`, conflicts 233 — byte-identical to the item-4 verdict. **No regression.** (5 transcripts used; no grep-only transcript touched this file, so its presumed residual is unchanged — payoff for this specific file is 0, consistent with item-3's note that some files see marginal gains.) ✓
- **Line cap (≤250):** every new/edited source + test file complies (max: `line-state-evidence.js` 249, `test-line-state-evidence.js` 241). The 7 files >250 are all pre-existing and untouched (already flagged in the roadmap's 250–300 band). ✓
- **Probe A/B:** **byte-identical** vs `develop-baseline` on `probe-fixture-20260615` (generatedAt stripped). The roadmap anticipated an INTENTIONAL shift (grep-inclusive discovery), but it did NOT materialize on this fixture — see "Probe re-baseline" below. **No regression, no re-baseline.** ✓

### Probe re-baseline — characterization (resolved, no re-baseline needed)
The roadmap "Probe gate (Item 5 onward)" expected item 5 to break byte-identity (grep-touched transcripts entering discovery) and require freezing a new baseline. On `probe-fixture-20260615` it stayed **byte-identical**. Verified WHY, so nothing is unexplained:
- The grep code IS live on real fixture data: running `collectTouches` (now incl. `collectGrepTouches`) over the fixture produced **80 grep touches across 2 transcripts**, covering 12 distinct grepped paths (all under `~/Programming/jot-ultraplan/{tests,scripts}/*.sh`).
- The probe reconstructs **750 target files** (315 `filesInProject` + 435 `filesNotInProject`). **Zero** of the 12 grepped paths — indeed zero `jot-ultraplan` files at all — are probe targets.
- Therefore the grep touches only make grepped-ONLY files discoverable, and none of those are reconstructed targets here → no target's `transcriptsUsed`/reconstruction changed → byte-identical.
- **Conclusion:** no new fixture frozen; `probe-fixture-20260615` remains the valid `develop-baseline` for item 6+. A re-baseline is required only when a future fixture greps a file that is also a reconstructed target. Recorded as "OUTCOME (Item 5)" under the roadmap's Probe-gate bullet.

### Open questions
- None blocking. The one anticipated decision (freeze a new grep-inclusive probe baseline) turned out unnecessary — the gate held byte-identical, so there is no new canonical artifact to introduce and no sign-off required. If a later item's fixture greps a reconstructed target, the roadmap's re-baseline protocol kicks in then.
