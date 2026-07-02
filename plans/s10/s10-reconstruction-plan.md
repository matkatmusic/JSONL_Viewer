# Plan: S10 slice — conversation-only rewind with no post-edit (the files written on the abandoned conversation branch stay on disk and ARE the surviving working tree, even though the final conversation head is a later read-only branch that wrote nothing)

> Scope: make `reconstruction_cli` correctly reconstruct the file-change history of
> `s10-conv-only-no-post-edit`, and LOCK that result with tests + a spec.
> **There is no engine source change in this slice.** The current engine already produces the
> correct output for S10 (verified end-to-end against the real transcript, see "The current engine
> is ALREADY correct" below). S10 is the **isolated, minimal** instance of spec 35's
> conversation-only-rewind case — which S8 only exercised *combined* with `code` rewinds — and a
> **strict no-op** for spec 36's content-signature refinement. This slice adds the real-transcript
> regression lock (a new `tests/reconstruction_engine_s10.test.ts`), three CLI regression tests, one
> synthetic branch test for S10's distinct refresh variant, and a new design-doc **spec 37**, plus
> the implementation-notes and roadmap updates.

JSONL: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s10-conv-only-no-post-edit/517dcc05-8809-43cd-86d4-7f6907b9ee76.jsonl`
Predecessor: S9 (`s9-code-restore-no-post-edit`) — IMPLEMENTED, **116 tests green** at `HEAD = 5c16958`. (Note: S9's documented "finishing" remainder — 3 CLI tests + 3 doc edits — is uncommitted in the working tree at the time of writing; that is S9's tail to commit, not S10's. S10 starts from a 116-green baseline regardless.)

---

## Background — why this slice exists, and what was verified

`s10-conv-only-no-post-edit` is the **fourth** scenario in the rewind / code-restore family (S7–S23).
Its recorded steps (from the scenario run file) were:

1. Write `scenario10.py` (`greet(name)` returns `"Hello, " + name`) **and** `tests/test_scenario10.py`
   — the only write version.
2. `Looks good, thanks.`
3. **Rewind: 2** (a **conversation-only** rewind — NOT `code`). The conversation is rewound to the
   root checkpoint; the on-disk files are **left in place** (this is the defining property of a
   conversation-only rewind).
4. `Read scenario10.py and tell me what functions it has.` — a read; no file write.
5. `Thanks, that's all.` — no file write. Then exit.

The two prompts after the rewind (steps 4–5) **fork from the same root checkpoint as the original
write turn** and write nothing. So the conversation ends on a read-only branch, while the on-disk
working tree is the `scenario10.py` + `tests/test_scenario10.py` that the (now conversation-rewound)
write turn produced — the conversation-only rewind never removed them.

### The distinction S10 adds (it is the isolated case of spec 35, and a no-op for spec 36)

> **Spec 35 (S8)** established: *a `code` rewind restores the working tree (the abandoned branch's
> files leave disk); a conversation-only rewind does NOT (the files written on the abandoned
> conversation branch stay on disk), so the surviving files are not always reachable from the final
> `last-prompt` head — `findSurvivingHead` picks the surviving branch from the working-tree owner.*
> S8 exercised this only at the **end of a transcript that also contained two `code` rewinds**, and
> its synthetic coverage used a refresh snapshot with a `null` backup. **S10 is the pure case:** a
> single conversation-only rewind whose post-rewind branch only reads, where the kept files report a
> **real, unchanged `backupFileName` at an unbumped `version`**.
>
> **Spec 36 (S9)** refined working-tree-change detection from `{path → version}` to a carried-forward
> `backupFileName` content signature, because a `code` restore emits trailing refresh snapshots that
> bump `version` while content is unchanged (`backupFileName` `null`). **S10 has no such churn:** its
> post-rewind snapshots repeat the SAME `version` (`v2`) AND the SAME non-null `backupFileName`. So
> S10's working-tree owner is stable under BOTH the old version rule and the spec-36 content
> signature — S10 is a **strict no-op** for the S9 fix, and confirms it in isolation.

### The current engine is ALREADY correct on this transcript

Unlike S7/S8/S9 — each of which found the engine *wrong* before its fix — the current engine produces
the **correct** S10 output today. Verified end-to-end (run before this plan, `2>/dev/null` to strip
the tsx debugger banner):

`npx tsx src/reconstruction_cli.ts "$P"` (default, all-branches):
```
<cwd>/scenario10.py
  0  create  2 lines   16:08:33Z  #01CmDQPd
<cwd>/tests/test_scenario10.py
  0  create  5 lines   16:08:34Z  #0134iGZz
```
(a plain list — **no** `## ` headers, **no** `no files touched`)

`npx tsx src/reconstruction_cli.ts "$P" --list-branches`:
```
surviving  tip #bfd9d428    scenario10.py, test_scenario10.py
```
(one line; **no** `rewound` line)

This is correct: the conversation-only rewind kept both files on disk, so they ARE the surviving
working tree; the read-only post-rewind branch touched no files, so it is a file-less tangent
(dropped, like S7's read tangent / S8's `Hello` / S9's read head). The changeIds, line counts, and
timestamps all match the real Write tool-uses (verified below).

### Why it is already correct (located, in source terms — confirms a no-op, not a fix)

- `findWorkingTreeOwner` (`src/reconstruction_worktree.ts`) scans the `file-history-snapshot`
  records and returns the `messageId` of the last snapshot whose **content signature** changed. On
  S10 the signature settles at snapshot `#bfd9d428` (the write turn) and never changes again — the
  three post-rewind snapshots (`cdd14e17`, `6ee9d4e5`, `a80a31a7`) repeat the identical signature
  (same paths, same non-null `backupFileName`). Owner = `bfd9d428`.
- `findSurvivingHead` (`src/reconstruction_branch.ts`) sees that the owner `bfd9d428` is **off** the
  final read head's ancestor chain (the read branch forked at root), so it returns
  `findHeadAtOrAbove(owner)` = the write-turn head `bfd9d428`. (This is the spec-35 mechanism,
  unchanged.)
- `reconstructAll` over the surviving (write-turn) branch recovers both files from the Write events
  already on that branch — the kept bytes ARE those Write events. The read branch is an abandoned
  maximal tip whose diverging records change no file, so it is dropped (zero rewound branches).

### Verified ground truth (throwaway analysis scripts + direct engine drive, not committed)

**Snapshots (in file order), `{path: version / backupFileName}`:**

| # | snapshot `messageId` | tracked set | branch |
|---|----------------------|-------------|--------|
| 1 | `3a4b4993` | `[]` (empty) | root |
| 2 | `3a4b4993` | `scenario10.py` v1, bfn=`null` | write turn (in progress) |
| 3 | `3a4b4993` | `scenario10.py` v1, `tests/test_scenario10.py` v1 — both bfn=`null` | write turn (in progress) |
| 4 | `bfd9d428` | `scenario10.py` v2 bfn=`c33c8ea0fd43768b@v2`, `tests/test_scenario10.py` v2 bfn=`d9e4bb62959d5af6@v2` | **write turn head (working-tree owner)** |
| 5 | `cdd14e17` | both v2, **same** bfns (`c33c8ea0fd43768b@v2`, `d9e4bb62959d5af6@v2`) | read branch (post conv-only rewind) |
| 6 | `6ee9d4e5` | both v2, same bfns | read branch |
| 7 | `a80a31a7` | both v2, same bfns | read branch |

> The crux distinguishing S10 from S9: snapshots #5–#7 (after the conversation-only rewind) keep the
> SAME `version` (`v2`) AND the SAME non-null `backupFileName`. There is **no** version bump and
> **no** `null`-bfn refresh — the opposite of S9's `code`-restore refreshes (`v3→v4→v5`, bfn `null`).
> So the content signature never changes after #4 under either detection rule.

**Conversation topology (`last-prompt` `leafUuid` heads in file order):**
- Fork / rewind point = `4e1571b4-9437-4dcb-b26c-c92b33ec0b71` — the root checkpoint, shared parent
  of BOTH the write prompt (`3a4b4993-125e-46bf-873b-9a83c75f85af`, "Write a file…") and the read
  prompt (`cdd14e17-fb32-420d-a140-757b5a011c21`, "Read scenario10.py…").
- Write-turn head (the **surviving tip**) = `bfd9d428-86da-4480-b30a-abf27f2c4ff1` ("Looks good,
  thanks.").
- Final conversation head (read-only branch) = `67d05ad4-3393-4ea9-8acb-12eb0d7686b1` ("Thanks,
  that's all.").

**Write events (become `changeId`s):**

| path | tool_use id (changeId) | short | lines |
|------|------------------------|-------|-------|
| `scenario10.py` | `toolu_01CmDQPdzdqgZhMLUQz3fe7t` | `#01CmDQPd` | 2 (`def greet(name): / return "Hello, " + name`) |
| `tests/test_scenario10.py` | `toolu_0134iGZzirN3ZPRTyUUx6Eyb` | `#0134iGZz` | 5 |

**Direct engine drive (the values the new tests assert), confirmed against the real transcript:**
- `reconstructAll(S10)` → `scenario10.py` (1 revision, kind `write`, changeId
  `toolu_01CmDQPdzdqgZhMLUQz3fe7t`) and `tests/test_scenario10.py` (1 revision, kind `write`,
  changeId `toolu_0134iGZzirN3ZPRTyUUx6Eyb`).
- `reconstructBranches(S10)` → `survivingTip === "bfd9d428-86da-4480-b30a-abf27f2c4ff1"`,
  surviving files `scenario10.py` + `test_scenario10.py`, **`rewound.length === 0`**.

---

## What S10 adds

**No engine source change.** S10 adds only test coverage and documentation that LOCK the
already-correct behavior for the isolated conversation-only-rewind-no-post-edit case:

1. A real-transcript engine test file `tests/reconstruction_engine_s10.test.ts` (new) — the
   authoritative lock on `reconstructAll(S10)` / `reconstructBranches(S10)`.
2. One synthetic branch test covering S10's distinct refresh variant (a conversation-only refresh
   that repeats a **real, non-null** `backupFileName` — exercising `resolveContentId`'s
   `carried.set` path, which S8's null-bfn synthetic does not).
3. Three CLI regression tests for S10 in `tests/reconstruction_cli.test.ts`.
4. A new design-doc **spec 37** (refers to spec 35, notes the spec-36 no-op).
5. Implementation-notes and roadmap updates.

## Per-line model impact

**None.** No `EventKind`, no `FileRevision`/`LineEntry`/`LineValue` change, no new event/container
type, no new module, no file split. S10 changes no production code at all.

## Module / import-graph plan

**No source file changes.** Test files only: a new `tests/reconstruction_engine_s10.test.ts` (mirrors
`tests/reconstruction_engine_s9.test.ts`), additions to `tests/reconstruction_branch.test.ts` and
`tests/reconstruction_cli.test.ts`, and a new `S10_JSONL` constant in `tests/fixtures.ts`. The import
graph of `src/` is untouched.

---

## On the absence of a RED phase (read before Task 1)

Strict red-green TDD writes a failing test first, then the minimum code to pass it. **S10 has no
failing engine behavior to fix** — the engine is already correct (verified above and by direct engine
drive). So the new tests are **characterization / regression locks**: they are expected to pass
**GREEN on arrival**, exactly as S9's Task-2 CLI regression tests did ("these should pass immediately
… they exist to LOCK the output"). This is the project's established pattern for confirming a no-op
slice.

Discipline this imposes on the implementer:
- **Run each new test and confirm it is GREEN on the current `src/`.** Passing immediately is the
  desired result — it is the evidence that spec 35 + spec 36 already cover S10.
- **If any new test is unexpectedly RED, STOP and diagnose.** A red here means either the assertion
  was transcribed wrong (fix the assertion against the verified ground truth above) or the engine has
  genuinely regressed (a real bug — escalate; do not "adjust" the test to hide it).
- Do **not** invent a production-code change to manufacture a RED→GREEN cycle. There is nothing to
  fix; fabricating a change would risk regressing S1–S9.

---

## Locked decisions (drive output shape; the implementer must confirm with the user — these mirror S7–S9's locked decisions and may be adjusted before coding if the user objects)

1. **No production-code change.** S10 is implemented as tests + docs only. (Rationale: the engine
   already reconstructs S10 correctly; the work is to LOCK that and document it as a distinct spec.
   Verified by end-to-end CLI runs and a direct `reconstructAll`/`reconstructBranches` drive on the
   real transcript.)
2. **The surviving working tree is the two kept files, reported via the existing
   working-tree-survival machinery.** `findWorkingTreeOwner` points at `bfd9d428`; `findSurvivingHead`
   switches the surviving head there (owner off the final read head's chain); `reconstructAll(S10)`
   recovers both files from the Write events on that branch. (Rationale: the kept bytes ARE those
   Write events — the conversation-only rewind never altered them — so reconstructing from the events
   preserves the real `changeId`s and line history; this is identical in spirit to S9 decision #1.)
3. **The read-only branch is dropped as a file-less tangent (no rewound branch for S10).** After the
   surviving head is `bfd9d428`, the read head `67d05ad4` is an abandoned maximal tip whose diverging
   records change no file, so it is dropped — exactly as S7's read tangent / S8's `Hello` / S9's read
   head. The CLI renders S10 as a plain single-branch list (no `## headers`), like S1–S6 and S9.
   (Accepted consequence — carried from S9 decision #5: the default view does not visually flag that a
   rewind occurred; surfacing rewinds that produced no distinct file history is out of scope — see
   Risks.)
4. **Surviving tip is labelled `#bfd9d428` (the write-turn head), not the final read head.** Same
   convention as S8 (surviving tip is v_c's write head) and S9 (`#f1b8dede`). `--list-branches` shows
   one line: `surviving  tip #bfd9d428`. (Accepted consequence: `--branch bfd9d428` returns nothing,
   because `bfd9d428` is the surviving branch, not a rewound one; `--surviving` shows its files.)
5. **S10 is a strict no-op for the S9 content-signature change and the S8 working-tree machinery.**
   Its post-rewind snapshots repeat the same `version` and the same non-null `backupFileName`, so the
   owner is stable under both the old version rule and the spec-36 signature. (Rationale: this is the
   property that makes S10 the *isolated* conv-only case — it removes S9's refresh-churn variable, so
   the only thing under test is spec-35 branch selection.)

---

## Task 1 — Real-transcript + synthetic regression lock (no production code)

LOCK the already-correct engine behavior for S10. All tests are characterization locks expected GREEN
on arrival (see "On the absence of a RED phase").

### 1a. Add `S10_JSONL` to `tests/fixtures.ts`

After `S9_JSONL`, same absolute-Desktop convention:
```ts
export const S10_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s10-conv-only-no-post-edit/517dcc05-8809-43cd-86d4-7f6907b9ee76.jsonl";
```
> Why: DRY fixture rule (coding-requirements §3) — every scenario's JSONL path lives in
> `tests/fixtures.ts`, never inline in a test.

### 1b. Add ONE synthetic branch test to `tests/reconstruction_branch.test.ts`

Add a builder + test AFTER the existing `buildCodeRestoreNoPostEditRecords` block. This covers S10's
distinct refresh variant: a conversation-only rewind whose post-rewind refresh snapshot repeats a
**real, non-null** `backupFileName` (S8's existing `buildConversationRewindRecords` uses a `null`
bfn, so it does not exercise `resolveContentId`'s carry-forward `set` path). Reuse the existing
`rec`, `lastPrompt`, and the S9-extended `snapshotRec(messageId, tracked, backups?)` helpers.

```ts
// R  = root checkpoint.
// Wa = the write turn's head; its snapshot gives file.py a REAL backup (v2, non-null backupFileName).
// Hc = a CONVERSATION-ONLY rewind back to R that only reads. Because the rewind did NOT restore the
//      working tree, file.py stays on disk and is re-snapshotted with the SAME version (still v2) and
//      the SAME real backupFileName — no churn (this is what distinguishes a conv-only rewind from a
//      code restore, whose refresh would bump the version with a null backupFileName).
function buildConversationOnlyRewindRealBackupRecords(): TranscriptRecord[] {
    return [
        rec(RecordType.user, "R", null),
        rec(RecordType.assistant, "Wa", "R"),                              // the write turn's tail
        lastPrompt("Wa"),                                                  // head: the write branch
        snapshotRec("Wa", { "file.py": 2 }, { "file.py": "backup-A@v2" }), // real content backup
        rec(RecordType.user, "Hc", "R"),                                   // conv-only rewind to root: a read-only turn
        lastPrompt("Hc"),                                                  // final head, but it wrote nothing
        snapshotRec("Hc", { "file.py": 2 }, { "file.py": "backup-A@v2" }), // SAME version, SAME real backup
    ];
}

// Scenario: a conversation-only rewind with no post-edit keeps the surviving branch on the write turn
// (Wa), not the final read head (Hc), even when the post-rewind snapshot repeats a REAL (non-null)
// backupFileName at an unbumped version.
// Steps:
//   - Build the records: a write turn Wa (file.py@2 with a real backup) and a conversation-only
//     rewind Hc to root that only reads and re-snapshots file.py@2 with the SAME real backup.
//   - Enumerate the conversation branches.
//   - The surviving branch's tip must be Wa (the branch that produced the on-disk file), because the
//     repeated identical content signature must NOT move the working-tree owner to Hc.
//   - No surviving branch may be tipped at Hc (it is the file-less final conversation head).
test("test_find_conversation_branches_survives_working_tree_when_conv_only_refresh_repeats_real_backup", () => {
    const branches = findConversationBranches(buildConversationOnlyRewindRealBackupRecords());
    const surviving = branches.find((b) => b.isSurviving)!;
    assert.equal(surviving.tip.toString(), "Wa");
    assert.ok(!branches.some((b) => b.isSurviving && b.tip.toString() === "Hc"));
});
```
> Why GREEN on arrival: `resolveContentId` carries `backup-A@v2` forward; Wa's signature
> `file.py@backup-A@v2` is repeated by Hc unchanged, so the owner stays at Wa and `findSurvivingHead`
> returns Wa. (If this were ever RED, the owner would have moved to Hc — the exact spec-35 regression
> this test guards.)
> Note: the *null-bfn* conv-only variant is already locked by S8's
> `test_find_conversation_branches_survives_working_tree_not_final_head` — do NOT duplicate it.

### 1c. Add the real-transcript engine test file `tests/reconstruction_engine_s10.test.ts`

Mirror `tests/reconstruction_engine_s9.test.ts` exactly (same imports, same typed `FileHistory[]`
helpers to satisfy `noImplicitAny`). Two tests, one behavior each (TDD granularity §87).

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    reconstructAll,
    reconstructBranches,
    type FileHistory,
} from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { S10_JSONL } from "./fixtures.ts";

function scriptOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("scenario10.py"))!;
}
function testFileOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("tests/test_scenario10.py"))!;
}

// Scenario: the default reconstruction of S10 is the two files kept on disk by a conversation-only
// rewind, recovered from the Write events on the write-turn branch — even though the final
// conversation head is a later read-only branch that wrote nothing.
// Steps:
//   - Load the real S10 transcript and run the default (surviving-branch) reconstruction.
//   - scenario10.py has exactly one revision, of kind `write`, whose changeId is the real Write
//     tool_use id (proving it was recovered from the Write event, not synthesised).
//   - tests/test_scenario10.py likewise has the real Write tool_use id.
test("test_default_reconstruction_is_the_files_kept_by_a_conversation_only_rewind", () => {
    const surviving = reconstructAll(loadRecords(S10_JSONL));
    const script = scriptOf(surviving);
    assert.equal(script.revisions.length, 1);
    assert.equal(script.revisions[0]!.kind, EventKind.write);
    assert.equal(script.revisions[0]!.changeId.toString(), "toolu_01CmDQPdzdqgZhMLUQz3fe7t");
    assert.equal(
        testFileOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_0134iGZzirN3ZPRTyUUx6Eyb",
    );
});

// Scenario: a conversation-only rewind with no post-edit leaves no rewound branch — the read-only
// head touched no files, so it is a file-less tangent (dropped), and the write turn IS the surviving
// branch.
// Steps:
//   - Load the real S10 transcript and enumerate its branches.
//   - The surviving tip is the write-turn head bfd9d428 (NOT the final read head 67d05ad4).
//   - The surviving reconstruction still contains scenario10.py with its real Write changeId.
//   - There are zero rewound branches (the read tangent changed no file).
test("test_conversation_only_rewind_with_no_post_edit_has_no_rewound_branches", () => {
    const { survivingTip, surviving, rewound } = reconstructBranches(loadRecords(S10_JSONL));
    assert.equal(survivingTip!.toString(), "bfd9d428-86da-4480-b30a-abf27f2c4ff1");
    assert.equal(
        scriptOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_01CmDQPdzdqgZhMLUQz3fe7t",
    );
    assert.equal(rewound.length, 0);
});
```

### Verify gate (run; all three must pass before Task 2)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect 119 pass, 0 fail (116 baseline + 1 synthetic + 2 engine)
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
> Confirm the exact count against the suite; the point is zero failures, the three new tests GREEN,
> and no file over 250 lines. (If the S9 remainder was committed separately and the baseline differs,
> the delta is still +3.)

---

## Task 2 — CLI regression lock + docs (no engine code)

### 2a. CLI regression lock in `tests/reconstruction_cli.test.ts`

Add `S10_JSONL` to the CLI test imports and add three tests mirroring the S9 CLI tests. **Use the same
CLI-invocation helper the existing S9/S8 CLI tests use** (match its style for capturing stdout and
stripping the tsx debugger banner — do not hand-roll a new runner). One behavior per test.

1. `test_s10_default_view_is_a_plain_list_of_the_kept_files` — the default (all-branches) view
   contains `scenario10.py` and `tests/test_scenario10.py`, and contains **no** `## ` header and
   **no** `no files touched` (S10 has one surviving branch and zero rewound branches, so it renders
   like S1–S6 / S9).
2. `test_s10_list_branches_shows_only_the_surviving_branch` — `--list-branches` output is the single
   line `surviving  tip #bfd9d428   scenario10.py, test_scenario10.py` (no `rewound` line). Assert
   against the exact spacing the existing S9 `--list-branches` test asserts (copy its matcher style).
3. `test_s10_surviving_flag_shows_the_kept_files` — `--surviving` lists the two files (no headers).

> These pass immediately (the CLI is unchanged); they exist to LOCK the output so a future change
> cannot silently regress S10, exactly as the S8/S9 CLI regression tests do.

### 2b. Docs (no engine code)

1. **`plans/reconstruction-engine-design.md`** — add a `### S10 — implemented now` subsection with a
   new spec **37 (conversation-only-rewind-no-post-edit)**: a single conversation-only rewind whose
   post-rewind branch only reads keeps the written files on disk; they are the surviving working tree,
   recovered from the Write events on the write-turn branch; `reconstructBranches(S10)` has zero
   rewound branches (the read head is a file-less tangent); the CLI renders a plain single-branch
   list. State explicitly that this is the **isolated instance of spec 35** (the conversation-only
   case, here with no accompanying `code` rewind) and a **strict no-op for spec 36** (the post-rewind
   snapshots repeat the same `version` AND the same non-null `backupFileName`, so the content
   signature never moves the owner — no production-code change was needed). Cross-reference spec 35
   and spec 36. List the proving tests:
   `test_find_conversation_branches_survives_working_tree_when_conv_only_refresh_repeats_real_backup`,
   `test_default_reconstruction_is_the_files_kept_by_a_conversation_only_rewind`,
   `test_conversation_only_rewind_with_no_post_edit_has_no_rewound_branches`, and the three S10 CLI
   tests.
2. **`plans/implementation-notes-api-from-scenarios.md`** — add an S10 entry at the top: the finding
   (the engine was already correct — no production change), why (S10 is spec 35's isolated case and a
   spec-36 no-op because the conv-only rewind produces no version/bfn churn), the decision to lock
   with characterization tests rather than fabricate a fix, and the open questions in Risks.
3. **`plans/roadmap.md`** — mark S10 (`s10-conv-only-no-post-edit`) done with a one-line summary in
   the S7–S9 style, noting "no engine change; locked by tests + spec 37; the isolated
   conversation-only-rewind case of spec 35, strict no-op for spec 36."

### Verify gate, then the End-to-end check, then stop and report. Commit only after the user approves.

---

## Verify gate (run after every task; all must pass before the next)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 119 after Task 1 (116 + 3); 122 after Task 2 (+3 CLI) — confirm exact count, zero failures
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
(Expected final count: **122** = 116 baseline + 1 synthetic + 2 engine + 3 CLI. Confirm against the
suite; the point is zero failures and no file over 250 lines. `tsx` does NOT type-check — `npx tsc
--noEmit` is the real type gate; the new engine-test helpers are typed `FileHistory[]`.)

## End-to-end check (after Task 2; proves S10 is correct and S9/S8/S1 are unchanged)

```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s10-conv-only-no-post-edit/517dcc05-8809-43cd-86d4-7f6907b9ee76.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null
# DEFAULT = a plain list (NO ## headers, NO "no files touched"):
#   <cwd>/scenario10.py
#     0  create  2 lines  16:08:33Z  #01CmDQPd
#   <cwd>/tests/test_scenario10.py
#     0  create  5 lines  16:08:34Z  #0134iGZz

npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
# One line: "surviving  tip #bfd9d428   scenario10.py, test_scenario10.py"  (no rewound line)

npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null
# The two files, no headers.

# Sanity (unchanged): S9 still default = plain list (scenario9.py #01PZ3yAw + tests/test_scenario9.py
# #012EzSkd), --list-branches = surviving #f1b8dede; S8 still default = surviving #2988ac8f + 2
# rewound (#546718c1, #84d669da); S1 still a plain list with no ## headers.
```

## Risks / out-of-scope (flag to the user; not part of S10's tasks)

- **The default view does not flag that a rewind happened.** Because the read-only branch has no
  distinct file history, S10 renders like a plain S1-style session — identical to S9's accepted
  consequence (decision #3). Surfacing "a conversation-only rewind occurred" in the default output
  would touch the renderer for ALL scenarios — out of scope here.
- **`backupFileName` carry-forward is not stressed by S10** (S10 never reports a `null` bfn after the
  first real backup). The carry-forward path is what S9 needed; S10 only confirms it is a no-op when
  there is no churn. A transcript whose backups go `real → null → real` in a conv-only context is not
  in scope; note it for a future slice if one appears.
- **No production code changed, so S1–S9 are unaffected by construction.** The verify gate's full-suite
  run plus the sanity end-to-end on S9/S8/S1 are the proof.
- **Carried-forward `parseRedirect` regression (`2>&1` / `>/dev/null`)** noted in the S8/S9 handoffs is
  still open and unrelated to S10 — track it as its own `parseRedirect` hardening slice.
