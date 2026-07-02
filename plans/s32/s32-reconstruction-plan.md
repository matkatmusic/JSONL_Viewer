# S32 Reconstruction Plan — `s32-script-rename-mcp-exec`

AUTHORITATIVE. Every literal below was verified LIVE against the engine at HEAD during this
planning session (parser fix prototyped → 436/0 → reverted byte-clean).

## TL;DR
S32 is a script rename where the rename script runs through the **context-mode MCP sandbox**
(`mcp__plugin_context-mode_context-mode__ctx_execute`), not the Bash tool. There is **exactly one
engine gap**: the transcript parser CRASHES because assistant records carry two novel top-level
keys (`attributionMcpServer`, `attributionMcpTool`). **Fix = one line** in
`src/parse/loadTranscript.ts` adding those keys to the assistant allow-set. After the fix, the
engine reconstructs every file **byte-perfectly with no further change** — both renamed files are
HAS-BEACON (harness `edited_text_file` echoes after the MCP run) and reader-INDEPENDENT.

This is a REAL src change (the FIRST `loadTranscript`/parser change in the s25–s31 script-rename
series), but a tiny one. The bulk of the work is the characterization lock that proves the fix is
necessary (RED at HEAD) and sufficient (GREEN + byte-perfect after).

## Scenario facts (ground truth)
- Inputs on disk: scenario `scenarios/s32-script-rename-mcp-exec.txt`; executed run + JSONL at the
  **sibling RevEng project** path used by fixtures:
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s32-script-rename-mcp-exec/f4ff047f-3cef-4303-8da0-d34cfe2e0f7f.jsonl`
  (the worktree copy is byte-identical but tests use the Desktop path, per every prior scenario).
- The rename: whole-word `get_val`→`get_value`, `set_val`→`set_value`, `del_val`→`delete_value`
  across `config_utils.py` and `tests/test_config_utils.py`. `has_val` and `merge_val` are NOT
  renamed.
- The user steps: (1) Write `config_utils.py` + `tests/test_config_utils.py`; (2) Edit
  `config_utils.py` add `get_or_default` (calls `has_val`/`get_val`); (3) Write `rename_config.py`
  and **run it through the MCP sandbox** (`ctx_execute`, shell `python3 rename_config.py`) — NOT
  Bash, NOT Edit/Write; (4) Edit `config_utils.py` add `apply_overrides` (calls the RENAMED
  `get_value`/`set_value`); (5) thanks/exit.
- Record count: **206** non-empty JSONL lines.

## The gap (verified RED at HEAD)
Running the JSONL through `reconstruction_cli` at HEAD throws:
```
UnmodeledFieldError: Unmodeled top-level key "attributionMcpServer" on assistant record
  at assertOnlyKnownTopLevelKeys (src/parse/loadTranscript.ts:66)
```
Cause: assistant records that issued an MCP tool call carry two extra top-level keys absent from
`ALLOWED_TOP_LEVEL_KEYS[RecordType.assistant]`:
- `attributionMcpServer` — value `"plugin:context-mode:context-mode"`
- `attributionMcpTool`   — value `"ctx_execute"`

Both appear on **all 19** MCP-invoking assistant turns. `entrypoint` (which also appears on
several record types in this transcript) is ALREADY in `ENVELOPE_KEYS`, so it is NOT novel and
needs no change — `attributionMcpServer`/`attributionMcpTool` are the only two unmodeled keys in
the whole file.

The crash is at parse time, so it gates EVERYTHING: with the parser broken, no file reconstructs
at all. Fix the parser and the entire scenario reconstructs correctly with zero other changes.

## The fix (verified GREEN: 436/0, tsc clean)
`src/parse/loadTranscript.ts`, the assistant entry of `ALLOWED_TOP_LEVEL_KEYS`:
```ts
// BEFORE
[RecordType.assistant]: keys(ENVELOPE_KEYS, "message", "requestId"),
// AFTER
[RecordType.assistant]: keys(ENVELOPE_KEYS, "message", "requestId", "attributionMcpServer", "attributionMcpTool"),
```
Why this and nothing else: `assertOnlyKnownTopLevelKeys` is purely permissive — widening the
allow-set lets the two keys through; no downstream code reads them, and the engine already handles
the rest of the scenario via the existing HAS-BEACON path. Adding the keys is the minimal,
single-source change (they are assistant-only attribution fields; do NOT add them to
`ENVELOPE_KEYS` — they are not envelope-universal, only assistant records that call MCP tools
carry them).

> Coding-requirements note for the implementer: keep these as bare assistant allow-set entries
> (matching the existing `"message"`, `"requestId"` style). Do NOT introduce a new constant or
> indirection — `keys(...)` already varargs the extras. One canonical home, no forwarding layer.

## Post-fix reconstruction (all verified byte-exact)
After the one-line fix, `reconstruction_cli <jsonl> --verbose` produces, with NO FLAG/MISMATCH:
- `config_utils.py`: **11 revisions** (rev0 write 191L → rev10 **260L**). Final revision is
  **byte-exact** vs the rendered `config_utils.py` (260 lines). Contains the renamed
  `get_value`/`set_value`/`delete_value`, `get_or_default`, and `apply_overrides`.
- `tests/test_config_utils.py`: **2 revisions** (rev0 write 87L → rev1 **87L**). Final revision is
  **byte-exact** vs rendered. Uses renamed `get_value`/`set_value`; `from config_utils import
  get_value, set_value`.
- `rename_config.py`: 1 revision (write 62L).

Why HAS-BEACON / reader-INDEPENDENT (no BackupReader needed): the harness injects **2
`edited_text_file`** disk-snapshot echoes right after the MCP run (one per renamed file) — the same
mechanism as s24/s26/s31. The engine adopts each as the post-script revision; no script-replay, no
file-history backup recovery. All rescue stages (`completeTruncatedBeacon` S27,
`completeElidedBeacons` S28, `seedStaleEditBases` S19) stay INERT. `plans/script-handling.txt`
line 4-6 already anticipates the MCP sandbox as an invisible-mutation source governed by the same
HAS-BEACON rule.

## Whole-word hazard (carry the s31 lesson)
The test file keeps function NAMES `test_get_val_flat_key`, `test_set_val_overwrites_existing`,
etc. These are CORRECT: `get_val`/`set_val` inside a longer `_`-bounded identifier are not
whole-word matches, so the rename script leaves them. Every absence assertion in the tests MUST use
a `\bget_val\b` / `\bset_val\b` / `\bdel_val\b` word-boundary regex, NEVER a bare
`text.includes("get_val")` (which would false-positive on the kept function names).

---

# Implementation tasks (TDD order)

Baseline before starting: `npm test` = **436/0**, `npx tsc --noEmit` clean. Final target after S32:
**436 + N** (N = the s32 tests you add below), 0 fail.

## Task 1 — fixture
Add to `tests/fixtures.ts` (same absolute-path-constant style as `S31_JSONL`):
```ts
export const S32_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s32-script-rename-mcp-exec/f4ff047f-3cef-4303-8da0-d34cfe2e0f7f.jsonl";
```

## Task 2 — RED: parser-gate test (the crux)
Extend `tests/loadTranscript.test.ts` (the existing vocabulary/field-gate suite). Add ONE test
mirroring the existing `test_sX_jsonl_parses_into_known_typed_records` shape, but also asserting the
two attribution keys are actually present and accepted:
```ts
test("test_s32_jsonl_parses_with_mcp_attribution_keys", () => {
    // Scenario: the s32 transcript's MCP-invoking assistant records carry two novel top-level
    // keys (attributionMcpServer / attributionMcpTool). The field-gate must model them, not throw.
    const records = loadTranscript(S32_JSONL);            // throws UnmodeledFieldError at HEAD
    assert.equal(records.length, 206);                    // s32 has exactly 206 records
    const withAttribution = records.filter(
        (r) => "attributionMcpServer" in r || "attributionMcpTool" in r,
    );
    assert.equal(withAttribution.length, 19);             // all 19 MCP turns carry both keys
    for (const r of withAttribution) {
        assert.equal((r as { attributionMcpServer?: string }).attributionMcpServer,
            "plugin:context-mode:context-mode");
        assert.equal((r as { attributionMcpTool?: string }).attributionMcpTool, "ctx_execute");
    }
});
```
Import `S32_JSONL` (add to the existing `from "./fixtures.ts"` import). Confirm this test is **RED
at HEAD** with `UnmodeledFieldError` BEFORE applying the fix — that is the proof the fix is
necessary. (Mirrors the original `queueOperation` vocabulary-gate addition.)

## Task 3 — GREEN: apply the one-line fix
Apply the `loadTranscript.ts` edit from "The fix" above. Re-run Task 2 → green. Run
`npx tsc --noEmit` → clean.

## Task 4 — engine characterization lock
Create `tests/reconstruction_engine_s32.test.ts`, structured like
`tests/reconstruction_engine_s31.test.ts` (reuse its `finalTextOf` / `historyFinalText` /
`historyEndingWith` / `stripTrailingNewline` / `defBlock` helpers; copy them in). Build the
reconstruction from `S32_JSONL` via `reconstructBranches(loadRecords(S32_JSONL))` with **NO
BackupReader** (reader-INDEPENDENT — this is itself an assertion: passing no reader must still
reconstruct byte-perfectly). Assertions:
- **T1 (config byte-lock):** `historyEndingWith(histories, "/config_utils.py")` final text, after
  `stripTrailingNewline`, equals the rendered `config_utils.py` read from the executed dir. (Read
  the rendered file from the Desktop sibling executed dir; do not inline 260 lines.)
- **T2 (test byte-lock):** same for `/tests/test_config_utils.py` (87L) vs its rendered file.
- **T3 (revision counts):** config history has **11** revisions; test history has **2**;
  `rename_config.py` has **1**.
- **T4 (rename applied, whole-word):** in config final text, `/\bget_val\b/`, `/\bset_val\b/`,
  `/\bdel_val\b/` are ABSENT and `get_value`/`set_value`/`delete_value` PRESENT. In the test final
  text, assert the IMPORT line `from config_utils import get_value, set_value` is present and
  `/\bget_val\b/`/`/\bset_val\b/` are absent. Use word-boundary regexes only (see hazard above).
- **T5 (kept-name control):** assert the test final text still CONTAINS the literal function names
  `def test_get_val_flat_key(` and `def test_set_val_overwrites_existing(` — proving the rename was
  whole-word, not a blanket substring replace.
- **T6 (edit-ordering crux):** scope to config's `apply_overrides` def block (use `defBlock`) and
  assert it references `get_value`/`set_value` (the post-rename Edit replayed on the renamed
  beacon); scope to `get_or_default` and assert it references `get_value` (its pre-rename body,
  which called `get_val`, was rewritten by the script). This proves the beacon-then-edit ordering.
- **T7 (HAS-BEACON / extract multiset):** assert `extractFileEvents(loadRecords(S32_JSONL))`
  yields a user-edit event for BOTH renamed files (the `edited_text_file` echoes). The implementer
  must read the live multiset first (per the S28/S31 lesson: probe the engine at HEAD before
  trusting a plan's event-count claim) and assert the observed numbers — do NOT hardcode from this
  plan without re-verifying.

## Task 5 — CLI characterization lock
Create `tests/reconstruction_cli_s32.test.ts`, structured like
`tests/reconstruction_cli_s31.test.ts`. Byte-lock the `--verbose` (and a `--diff` spot-check if the
s31 CLI test does) output for `--target config_utils.py` and `--target tests/test_config_utils.py`.
NOTE: `--target` matches the absolute reconstructed path; the s31 CLI test shows the exact
helper/flag pattern to reuse (the reconstructed paths live under
`/private/var/folders/.../run-scenario.dhujr06t/…`). Capture the live ground-truth output during
implementation and lock it; assert the final-revision line counts (config 260, test 87) and the
presence of the renamed names / absence of terse names with word-boundary checks.

## Task 6 — mutation proof (RED→GREEN, the regression guarantee)
After all tests are green, temporarily revert ONLY the `loadTranscript.ts` fix (`git checkout --
src/parse/loadTranscript.ts` — SAFE: loadTranscript.ts is NOT among the uncommitted S28/S29/S30
files, so this discards nothing else) and confirm: Task 2 + Tasks 4–5 all go RED with
`UnmodeledFieldError` (everything depends on the transcript loading). Re-apply the fix → all green.
Log the result in implementation-notes. This proves the one-line fix is both necessary and
sufficient.

## Task 7 — docs
- `plans/roadmap.md`: add the S32 line; bump the suite count 436→(new total).
- `plans/implementation-notes-api-from-scenarios.md`: prepend an S32 entry (the parser gap, the
  one-line fix, HAS-BEACON/reader-independent reconstruction, the mutation proof result).
- `plans/reconstruction-engine-design.md`: add an S32 note AFTER the S31 block (the
  `attributionMcpServer`/`attributionMcpTool` modeling + that the MCP sandbox is an invisible-
  mutation source handled by the existing HAS-BEACON path, per script-handling.txt).

## Commit hygiene (USER APPROVAL ONLY — do not commit unprompted)
The tree carries uncommitted S28/S29/S30 engine + doc work and template edits from other agents.
S32 adds ONE `src/` change (`src/parse/loadTranscript.ts`) plus tests + docs. When the user
approves, stage EXACTLY the S32 paths: `src/parse/loadTranscript.ts`, `tests/fixtures.ts`,
`tests/loadTranscript.test.ts`, `tests/reconstruction_engine_s32.test.ts`,
`tests/reconstruction_cli_s32.test.ts`, `plans/roadmap.md`,
`plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`,
`plans/s32/`. Never `git add -A`. The same COORDINATION HAZARD as S28–S31 applies (the three doc
files and `src/` carry prior-scenario uncommitted work) — confirm the commit-split with the user;
do not assume.

## Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 436 + N / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s32.test.ts
node --import tsx --test tests/reconstruction_cli_s32.test.ts
node --import tsx --test tests/loadTranscript.test.ts
git diff --stat -- src/   # exactly ONE S32 hunk: src/parse/loadTranscript.ts (+ pre-existing S28/29/30)
```
