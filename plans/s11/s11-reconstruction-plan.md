# Plan: S11 slice — code restore followed by a post-rewind rewrite of the same files (the surviving working tree is the *rewritten* code; the abandoned pre-restore code is preserved as a rewound branch)

> Scope: make `reconstruction_cli` correctly reconstruct the file-change history of
> `s11-write-code-restore-rewrite`, and LOCK that result with tests + a spec.
> **There is no engine source change in this slice.** The current engine already produces the correct
> output for S11 (verified end-to-end against the real transcript and by direct engine drive — see
> "The current engine is ALREADY correct" below). S11 is the **complement of S9**: where S9 proved a
> `code`-restore *refresh* (a bumped `version` with a `null` `backupFileName`) must NOT move the
> working-tree owner, S11 proves a real *rewrite* AFTER the restore (a NEW non-null `backupFileName` at
> a NEW `version`) MUST move it. Together they fully characterize `findWorkingTreeOwner` across a
> `code` restore. S11 is also the first rewind-family scenario in which two branches write the SAME
> filenames with DIFFERENT content. This slice adds the real-transcript regression lock (a new
> `tests/reconstruction_engine_s11.test.ts`), one synthetic branch test for the owner-advance, four CLI
> regression tests (a new `tests/reconstruction_cli_s11.test.ts`), and a new design-doc **spec 38**,
> plus the implementation-notes and roadmap updates.

JSONL: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s11-write-code-restore-rewrite/a26b3dcb-cf00-4b17-a595-86dd57d4df83.jsonl`
Predecessor: S10 (`s10-conv-only-no-post-edit`) — IMPLEMENTED, **122 tests green** at `HEAD = 7805122 Implemented S10 handling`. Working tree clean.

---

## Background — why this slice exists, and what was verified

`s11-write-code-restore-rewrite` is the **fifth** scenario in the rewind / code-restore family (S7–S23).
Its recorded steps (from the scenario run file) were:

1. Write `scenario11.py` (`add(a, b)` returns `a + b`) **and** `tests/test_scenario11.py` (tests
   `add(1, 2) == 3`) — the **add** version.
2. `That looks correct.` (acceptance; no file change).
3. **Rewind: 2, `code`** — a **`code` restore back to the root checkpoint**. The on-disk files are
   restored to the root state (empty — root had no files), i.e. the `add` files leave disk.
4. Write `scenario11.py` (`multiply(a, b)` returns `a * b`) **and** `tests/test_scenario11.py` (tests
   `multiply(2, 3) == 6`) — the **multiply** version, the SAME two filenames with DIFFERENT content.
5. `Thanks.` (acceptance; no file change). Then exit.

Both write turns **fork from the same root checkpoint** (`742f44f2`). The `add` turn is abandoned by the
`code` rewind; the `multiply` turn continues to session end (`/exit`). So the surviving on-disk working
tree is the **multiply** version of both files, and the **add** version is an abandoned branch that DID
write files — so, unlike S9/S10's file-less read tangents, it is preserved as a **rewound branch** (the
S7/S8 behavior).

### The distinction S11 adds (the complement of S9; the spec-38 crux)

> **Spec 36 (S9)** established: a `code` restore with NO post-edit emits trailing "refresh"
> `file-history-snapshot` records that bump each file's `version` while the on-disk content is
> unchanged (their `backupFileName` is `null`). `findWorkingTreeOwner` must therefore detect change by
> a **content signature** — the carried-forward last-known non-null `backupFileName` per path — NOT the
> `version` counter, so those refreshes do not falsely move the owner. S9 exercises the direction
> *"a refresh must NOT move the owner."*
>
> **S11 is the opposite direction of the SAME mechanism:** after the `code` restore's refresh, the
> session **rewrites** both files with new content. That rewrite produces a NEW non-null
> `backupFileName` at a NEW `version`, so the content signature genuinely changes and the working-tree
> owner MUST ADVANCE to the rewrite's head. The two scenarios together pin both halves of the content
> signature's contract: refresh ⇒ no move (S9); real rewrite ⇒ move (S11).
>
> **Why the `@v<version>` suffix in `backupFileName` is load-bearing for S11 (verified):** the harness
> names each backup `<path-hash>@v<version>`, and the `<path-hash>` is derived from the file PATH, not
> its content. In this transcript the `add` and `multiply` versions of `scenario11.py` carry the
> **identical** path-hash `ef7eb2c33a0c873b`, differing ONLY in the version suffix (`@v2` for `add`,
> `@v4` for `multiply`). `resolveContentId` (`src/reconstruction_worktree.ts`) returns the FULL
> `backupFileName` string (`backup.backupFileName.toString()`), version suffix included, so
> `ef7eb2c33a0c873b@v4 ≠ ef7eb2c33a0c873b@v2` and the signature changes. A hypothetical refactor that
> compared only the hash component (mistaking it for a content hash) would regress S11 — the owner
> would stay at the `add` head and the surviving tree would WRONGLY be the `add` code — while S9 and
> S10 would still pass. The S11 regression tests guard exactly that failure mode.

### The current engine is ALREADY correct on this transcript

Like S10 (and unlike S7/S8/S9, each of which found the engine *wrong* before its fix), the current
engine produces the **correct** S11 output today. Verified end-to-end (run before this plan,
`2>/dev/null` to strip the tsx debugger banner):

`npx tsx src/reconstruction_cli.ts "$P"` (default = all branches):
```
## surviving  tip #d03f0078
<cwd>/scenario11.py
  0  create  2 lines   16:09:52Z  #01U5g9RL
<cwd>/tests/test_scenario11.py
  0  create  5 lines   16:09:53Z  #01B97eyh

## rewound  tip #a7ceb7ae  (rewind @ #742f44f2)
<cwd>/scenario11.py
  0  create  2 lines   16:09:03Z  #01CMuVT4
<cwd>/tests/test_scenario11.py
  0  create  5 lines   16:09:04Z  #01EW4ztd
```

`npx tsx src/reconstruction_cli.ts "$P" --list-branches`:
```
surviving  tip #d03f0078    scenario11.py, test_scenario11.py
rewound    tip #a7ceb7ae  rewind @ #742f44f2    scenario11.py, test_scenario11.py
```

`npx tsx src/reconstruction_cli.ts "$P" --diff` (surviving = multiply, rewound = add):
```
## surviving  tip #d03f0078
### <cwd>/scenario11.py
@@ created ... @@
+ def multiply(a, b):
+     return a * b
...
## rewound  tip #a7ceb7ae  (rewind @ #742f44f2)
### <cwd>/scenario11.py
@@ created ... @@
+ def add(a, b):
+     return a + b
```

This is correct: the `code` restore wiped the `add` files (back to empty root), the `multiply` turn
re-created both files, and the `add` turn — which DID write files — is preserved as a rewound branch
forked at the root checkpoint. Both files on both branches are `create`s (each was written to an absent
path; see "Write events" below — every Write reports `type: "create"`, `originalFile: null`).

### Why it is already correct (located, in source terms — confirms a no-op, not a fix)

- `findWorkingTreeOwner` (`src/reconstruction_worktree.ts`) scans the `file-history-snapshot` records
  and returns the `messageId` of the last snapshot whose **content signature** changed. On S11 the
  signature is `add@v2` at the `add` head, is carried **unchanged** through the `code`-restore refresh
  (`v3`, `null` bfn → carries `@v2` forward), then **changes** to `@v4` at the `multiply` head. Owner =
  the `multiply`-head snapshot (`ccc4a78e`), NOT the `add` head and NOT the refresh.
- `findSurvivingHead` (`src/reconstruction_branch.ts`) maps that owner to the surviving conversation
  branch tip `d03f0078` (the `multiply` write turn). This is the spec-35 working-tree-survival
  mechanism, refined by spec 36 — both unchanged.
- `findConversationBranches` / `reconstructBranches` enumerate the abandoned `add` turn as a **rewound
  branch** (it wrote files and forks at the root checkpoint `742f44f2`) — the S7/S8 rewound-branch
  path. `reconstructAll` over the surviving (`multiply`) branch recovers both files from the Write
  events on that branch; `selectLiveBranch` keeps only the `multiply` chain (the `add` prompt is a
  sibling of, not an ancestor of, the surviving head), so the surviving `scenario11.py` has exactly one
  revision — the `multiply` create.

### Verified ground truth (throwaway analysis + direct engine drive, not committed)

**Snapshots (in file order), `{path: version@backupFileName}`:**

| # | snapshot `messageId` | tracked set | branch |
|---|----------------------|-------------|--------|
| 1 | `f471df89` | `[]` (empty) | root |
| 2 | `3acfcf08` | `scenario11.py` v1 bfn=`null` | add turn (in progress) |
| 3 | `53778a01` | `scenario11.py` v1, `tests/test_scenario11.py` v1 — both bfn=`null` | add turn (in progress) |
| 4 | `dd3f8f64` | `scenario11.py` v2 bfn=`ef7eb2c33a0c873b@v2`, `tests/test_scenario11.py` v2 bfn=`9097f830055aa89c@v2` | **add head** (real backups) |
| 5 | `7e1208b2` | `scenario11.py` v3 bfn=`null`, `tests/test_scenario11.py` v3 bfn=`null` | **`code`-restore refresh** (version bumped, content wiped) |
| 6 | `ccc4a78e` | `scenario11.py` v4 bfn=`ef7eb2c33a0c873b@v4`, `tests/test_scenario11.py` v4 bfn=`9097f830055aa89c@v4` | **multiply head (working-tree owner)** |
| 7 | `4fc4c32d` | both v4, SAME bfns as #6 | multiply branch (final "Thanks") |

> The crux distinguishing S11 from S9: snapshot #5 is the `code`-restore refresh (`v3`, `null` bfn —
> the S9 pattern, ignored by carry-forward), but snapshot #6 then bumps to `v4` with a NEW non-null
> backup. The path-hash component (`ef7eb2c33a0c873b`, `9097f830055aa89c`) is IDENTICAL at #4 and #6 —
> only the `@v2`→`@v4` suffix differs — so the move depends on the version suffix being part of the
> content signature (it is; `resolveContentId` returns the full string).

**Conversation topology (`uuid ← parentUuid`, verified):**
- Rewind / fork point = `742f44f2-0be4-42bf-b729-73f9ed3879c6` — the root checkpoint, shared parent of
  BOTH write prompts: the `add` prompt (`f471df89`, "Write … add …") and the `multiply` prompt
  (`7e1208b2`, "Write … multiply …").
- **Add-turn head (the rewound tip)** = `a7ceb7ae-629d-4c91-97d8-9e5aae89a7d9` (parent of "That looks
  correct.").
- **Multiply-turn head (the surviving tip)** = `d03f0078-0b07-412e-bd37-f180a317c4c1` (parent of the
  post-multiply caveat → `/exit`); the session ends on this branch.

**Write events (become `changeId`s; every one is `type: "create"`, `originalFile: null`):**

| branch | path | tool_use id (changeId) | short | lines | content |
|--------|------|------------------------|-------|-------|---------|
| rewound (add) | `scenario11.py` | `toolu_01CMuVT4wAkHq5BeAQZn8ozC` | `#01CMuVT4` | 2 | `def add(a, b): / return a + b` |
| rewound (add) | `tests/test_scenario11.py` | `toolu_01EW4ztdf5ckvHcXcpmVPXEQ` | `#01EW4ztd` | 5 | `from scenario11 import add … def test_add(): assert add(1, 2) == 3` |
| surviving (multiply) | `scenario11.py` | `toolu_01U5g9RL95QevSrcB3QhXy75` | `#01U5g9RL` | 2 | `def multiply(a, b): / return a * b` |
| surviving (multiply) | `tests/test_scenario11.py` | `toolu_01B97eyhHopDmhrabCRkEDqC` | `#01B97eyh` | 5 | `from scenario11 import multiply … def test_multiply(): assert multiply(2, 3) == 6` |

**Direct engine drive (the values the new tests assert), confirmed against the real transcript:**
- `reconstructAll(S11)` → surviving `scenario11.py` (1 revision, kind `write`, changeId
  `toolu_01U5g9RL95QevSrcB3QhXy75`) and `tests/test_scenario11.py` (1 revision, changeId
  `toolu_01B97eyhHopDmhrabCRkEDqC`); the surviving test file's body contains `multiply`, NOT `add`.
- `reconstructBranches(S11)` → `survivingTip === "d03f0078-0b07-412e-bd37-f180a317c4c1"`; surviving
  files are the `multiply` versions; **`rewound.length === 1`**; the single rewound branch has
  `rewindPoint === "742f44f2-0be4-42bf-b729-73f9ed3879c6"`, `tip === "a7ceb7ae-629d-4c91-97d8-9e5aae89a7d9"`,
  and its `scenario11.py` changeId is the `add` create `toolu_01CMuVT4wAkHq5BeAQZn8ozC`.

---

## What S11 adds

**No engine source change.** S11 adds only test coverage and documentation that LOCK the
already-correct behavior for the code-restore-then-rewrite case:

1. A real-transcript engine test file `tests/reconstruction_engine_s11.test.ts` (new) — the
   authoritative lock on `reconstructAll(S11)` / `reconstructBranches(S11)`.
2. One synthetic branch test covering S11's distinct owner-ADVANCE variant (a `code`-restore refresh
   followed by a real rewrite that produces a NEW non-null `backupFileName` at a NEW version) — the
   complement of S9's `buildCodeRestoreNoPostEditRecords` test.
3. Four CLI regression tests for S11 in a NEW file `tests/reconstruction_cli_s11.test.ts` (see the
   file-size note below — `reconstruction_cli.test.ts` is at 246/250 and cannot take more).
4. A new design-doc **spec 38** (refers to specs 35 and 36; states it is the complement of S9).
5. Implementation-notes and roadmap updates.

## Per-line model impact

**None.** No `EventKind`, no `FileRevision`/`LineEntry`/`LineValue` change, no new event/container type,
no new module, no file split in `src/`. S11 changes no production code at all.

## Module / import-graph plan

**No source file changes.** Test files only:
- a new `tests/reconstruction_engine_s11.test.ts` (mirrors `tests/reconstruction_engine_s8.test.ts` —
  the closest model, because S8 is the existing engine test that asserts BOTH a surviving branch and
  rewound branches);
- one added builder + test in `tests/reconstruction_branch.test.ts`;
- a new `tests/reconstruction_cli_s11.test.ts` (mirrors `tests/reconstruction_cli_s10.test.ts`'s
  per-scenario split and reuses its `runCli` import);
- a new `S11_JSONL` constant in `tests/fixtures.ts`.

The import graph of `src/` is untouched.

> **Why a NEW CLI test file (not additions to `tests/reconstruction_cli.test.ts`):** that file is at
> **246/250 lines**; four more tests would breach the hard 250-line cap (a PostToolUse hook blocks the
> save and the verify-gate filesize check fails). S10 hit the same wall and created
> `tests/reconstruction_cli_s10.test.ts`; S11 follows that established split.

---

## On the absence of a RED phase (read before Task 1)

Strict red-green TDD writes a failing test first, then the minimum code to pass it. **S11 has no
failing engine behavior to fix** — the engine is already correct (verified end-to-end and by direct
engine drive above). So the new tests are **characterization / regression locks**: they are expected to
pass **GREEN on arrival**, exactly as S10's tests did. This is the project's established pattern for
confirming a no-op slice.

Discipline this imposes on the implementer:
- **Run each new test and confirm it is GREEN on the current `src/`.** Passing immediately is the
  desired result — it is the evidence that spec 35 + spec 36 already cover S11 (both directions of the
  content signature).
- **If any new test is unexpectedly RED, STOP and diagnose.** A red means either the assertion was
  transcribed wrong (fix the assertion against the verified ground truth above) or the engine has
  genuinely regressed (a real bug — escalate; do not "adjust" the test to hide it).
- Do **not** invent a production-code change to manufacture a RED→GREEN cycle. There is nothing to fix;
  fabricating a change would risk regressing S1–S10.

---

## Locked decisions (drive output shape; the implementer must confirm with the user — these mirror S7–S10's locked decisions and may be adjusted before coding if the user objects)

1. **No production-code change.** S11 is implemented as tests + docs only. (Rationale: the engine
   already reconstructs S11 correctly; the work is to LOCK that and document it as a distinct spec.
   Verified by end-to-end CLI runs and a direct `reconstructAll`/`reconstructBranches` drive on the
   real transcript.)
2. **The surviving working tree is the two `multiply` files, reported via the existing
   working-tree-survival machinery.** `findWorkingTreeOwner` advances to the `multiply` head
   (`ccc4a78e`) because the post-restore rewrite's `backupFileName` (`@v4`) differs from the
   carried-forward `add` signature (`@v2`); `findSurvivingHead` switches the surviving head to the
   conversation tip `d03f0078`; `reconstructAll(S11)` recovers both `multiply` files from the Write
   events on that branch. (Rationale: the kept bytes ARE those Write events — the rewrite created them
   on the surviving branch — so reconstructing from the events preserves the real `changeId`s and line
   history; identical in spirit to S7/S8 decision shapes.)
3. **The abandoned `add` turn is preserved as ONE rewound branch (rewind @ the root checkpoint).**
   Unlike S9/S10 (whose post-rewind heads only READ and so were dropped as file-less tangents), the
   `add` turn WROTE files, so it is a rewound branch with `tip #a7ceb7ae` and `rewindPoint #742f44f2`,
   exactly as S7's single rewound branch and each of S8's two. The CLI default view therefore shows
   `## surviving` and `## rewound` headers (NOT a plain list).
4. **Surviving tip is labelled `#d03f0078` (the `multiply` write-turn head); the rewound tip is
   `#a7ceb7ae`.** Same convention as S7/S8. `--list-branches` shows two lines (`surviving …` then
   `rewound … rewind @ #742f44f2 …`); `--branch a7ceb7ae` retrieves the rewound `add` branch;
   `--surviving` shows only the two `multiply` files.
5. **S11 is the complement of S9 for the spec-36 content signature, and a no-op for S1–S10.** S9 proved
   a refresh (null bfn, bumped version) does not move the owner; S11 proves a real rewrite (new non-null
   bfn, new version) does. No prior scenario's owner changes, because no prior scenario both restores
   and then rewrites. (Rationale: this is the property that makes S11 the *isolated* code-restore-then-
   rewrite case — it adds the "owner advances" half of the contract that S9 left implicit.)

---

## Task 1 — Real-transcript + synthetic regression lock (no production code)

LOCK the already-correct engine behavior for S11. All tests are characterization locks expected GREEN
on arrival (see "On the absence of a RED phase").

### 1a. Add `S11_JSONL` to `tests/fixtures.ts`

After `S10_JSONL`, same absolute-Desktop convention:
```ts
export const S11_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s11-write-code-restore-rewrite/a26b3dcb-cf00-4b17-a595-86dd57d4df83.jsonl";
```
> Why: DRY fixture rule (coding-requirements §3) — every scenario's JSONL path lives in
> `tests/fixtures.ts`, never inline in a test.

### 1b. Add ONE synthetic branch test to `tests/reconstruction_branch.test.ts`

Add a builder + test AFTER the existing `buildConversationOnlyRewindRealBackupRecords` block (the last
builder in the file). This is the **complement of S9's `buildCodeRestoreNoPostEditRecords`**: where that
builder's post-restore turn only READS (refresh `v3`, null bfn → owner must NOT move), this builder's
post-restore turn REWRITES (a new real backup `@v4` → owner MUST move). Reuse the existing `rec`,
`lastPrompt`, and `snapshotRec(messageId, tracked, backups?)` helpers (defined at the top of the file;
`snapshotRec`'s third arg supplies a non-null `backupFileName` per path).

```ts
// R  = root checkpoint.
// Wa = the FIRST (abandoned) write turn — the "add"; its snapshot gives file.py a REAL backup
//      (v2, "backup-A@v2").
// Wb = a CODE rewind back to R, then a post-restore REWRITE — the "multiply". The code restore first
//      emits a refresh snapshot (v3, NULL backupFileName: content wiped back toward root); the rewrite
//      then writes new content, producing a NEW real backup at a NEW version ("backup-A@v4"). The
//      path-hash component ("backup-A") is identical to Wa's backup — only the @v4 suffix differs from
//      the carried-forward @v2 — so the content signature CHANGES and the working-tree owner must
//      ADVANCE from Wa to Wb. (Contrast buildCodeRestoreNoPostEditRecords, whose refresh leaves the
//      signature unchanged so the owner stays put.)
function buildCodeRestoreThenRewriteRecords(): TranscriptRecord[] {
    return [
        rec(RecordType.user, "R", null),
        rec(RecordType.assistant, "Wa", "R"),                              // first write turn (add)
        lastPrompt("Wa"),                                                  // head: the abandoned write branch
        snapshotRec("Wa", { "file.py": 2 }, { "file.py": "backup-A@v2" }), // add head: real backup @v2
        rec(RecordType.user, "Wb", "R"),                                   // code rewind to root, then rewrite
        lastPrompt("Wb"),                                                  // head: the surviving (rewrite) branch
        snapshotRec("Wb", { "file.py": 3 }),                               // code-restore refresh: v3, null bfn
        snapshotRec("Wb", { "file.py": 4 }, { "file.py": "backup-A@v4" }), // rewrite: NEW real backup @v4
    ];
}

// Scenario: a code restore followed by a post-rewind rewrite ADVANCES the surviving branch from the
// abandoned first write (Wa) to the rewrite (Wb) — the complement of the no-post-edit case, where the
// owner must NOT move.
// Steps:
//   - Build the records: an abandoned write turn Wa (file.py@2, real backup @v2), then a code rewind to
//     root whose refresh re-versions file.py@3 with a NULL backup, then a rewrite Wb re-backing file.py
//     up at @v4 with a NEW real backup.
//   - Enumerate the conversation branches.
//   - The surviving branch's tip must be Wb (the rewrite), because the new real backup @v4 differs from
//     the carried-forward @v2 and so moves the working-tree owner forward.
//   - No surviving branch may be tipped at Wa (it is the abandoned pre-restore write).
test("test_find_conversation_branches_advances_owner_to_post_restore_rewrite", () => {
    const branches = findConversationBranches(buildCodeRestoreThenRewriteRecords());
    const surviving = branches.find((b) => b.isSurviving)!;
    assert.equal(surviving.tip.toString(), "Wb");
    assert.ok(!branches.some((b) => b.isSurviving && b.tip.toString() === "Wa"));
});
```
> Why GREEN on arrival: `resolveContentId` updates the carried id to `backup-A@v4` at Wb's second
> snapshot; the signature `file.py@backup-A@v4` differs from the carried `file.py@backup-A@v2`, so
> `findWorkingTreeOwner` returns Wb and `findSurvivingHead` selects it. (If this were ever RED, the
> owner would have stayed at Wa — the exact spec-36 regression this test guards: the `@v` suffix must
> remain part of the content signature.)
> Note on `messageId`s: the rewrite snapshot's `messageId` is `Wb` (the surviving head) so the owner
> resolves to `Wb`; the refresh snapshot's `messageId` is immaterial to the owner (its signature is
> unchanged, so it is never selected) — `Wb` keeps it on the surviving chain. If the helper requires the
> owner snapshot's `messageId` to match a `lastPrompt` leaf exactly, it already does (`Wb`); leave the
> assertion as written and confirm GREEN. Do NOT duplicate S9's no-move case
> (`test_find_conversation_branches_survives_restored_code_not_final_refresh` already locks it).

### 1c. Add the real-transcript engine test file `tests/reconstruction_engine_s11.test.ts`

Mirror `tests/reconstruction_engine_s8.test.ts` exactly (same imports, same typed `FileHistory[]`
helpers to satisfy `noImplicitAny`/`noUnusedLocals` — `tsx` does NOT type-check, `npx tsc --noEmit`
does). Two tests, one behavior each (TDD granularity).

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
import { S11_JSONL } from "./fixtures.ts";

function scriptOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("scenario11.py"))!;
}
function testFileOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("tests/test_scenario11.py"))!;
}

// The surviving working tree is the post-restore REWRITE (multiply), recovered from the Write events on
// the rewrite branch — even though an earlier, abandoned turn wrote the same two filenames with `add`.
// Steps:
//   - Load the real S11 transcript and run the default (surviving-branch) reconstruction.
//   - scenario11.py has exactly one revision, of kind `write`, whose changeId is the multiply Write
//     tool_use id (proving the surviving file is the rewrite, not the abandoned add).
//   - tests/test_scenario11.py likewise has the multiply Write tool_use id, and its body contains
//     `multiply`, NOT `add` (the content disambiguator).
test("test_default_reconstruction_is_the_post_restore_rewrite", () => {
    const surviving = reconstructAll(loadRecords(S11_JSONL));
    const script = scriptOf(surviving);
    assert.equal(script.revisions.length, 1);
    assert.equal(script.revisions[0]!.kind, EventKind.write);
    assert.equal(script.revisions[0]!.changeId.toString(), "toolu_01U5g9RL95QevSrcB3QhXy75");
    assert.equal(
        testFileOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_01B97eyhHopDmhrabCRkEDqC",
    );
    // The multiply rewrite is the disambiguator: the surviving test imports/asserts multiply, not add.
    const lines = testFileOf(surviving).revisions[0]!.lines.map(
        (e) => e.values[e.values.length - 1]!.line,
    );
    assert.ok(lines.some((l) => l.includes("multiply")));
    assert.ok(!lines.some((l) => l.includes("add")));
});

// The abandoned pre-restore `add` turn is preserved as ONE rewound branch (it wrote files, so unlike
// S9/S10's read tangents it is NOT dropped); it forks at the root checkpoint.
// Steps:
//   - Load the real S11 transcript and enumerate its branches.
//   - The surviving tip is the multiply write-turn head d03f0078 (NOT the add head a7ceb7ae).
//   - The surviving reconstruction's scenario11.py carries the multiply Write changeId.
//   - There is exactly one rewound branch; it forks at the root checkpoint 742f44f2, is tipped at the
//     add head a7ceb7ae, and its scenario11.py is the add create (#01CMuVT4) — distinct from the
//     surviving multiply create.
test("test_reconstruct_branches_retains_the_code_rewound_add_branch", () => {
    const { survivingTip, surviving, rewound } = reconstructBranches(loadRecords(S11_JSONL));
    assert.equal(survivingTip!.toString(), "d03f0078-0b07-412e-bd37-f180a317c4c1");
    assert.equal(
        scriptOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_01U5g9RL95QevSrcB3QhXy75",
    );
    assert.equal(rewound.length, 1);
    assert.equal(rewound[0]!.rewindPoint.toString(), "742f44f2-0be4-42bf-b729-73f9ed3879c6");
    assert.equal(rewound[0]!.tip.toString(), "a7ceb7ae-629d-4c91-97d8-9e5aae89a7d9");
    assert.equal(
        scriptOf(rewound[0]!.histories).revisions[0]!.changeId.toString(),
        "toolu_01CMuVT4wAkHq5BeAQZn8ozC",
    );
});
```
> Note: confirm the rewound-branch field names against the existing S8 engine test
> (`tests/reconstruction_engine_s8.test.ts` uses `rewound[i].tip`, `rewound[i].rewindPoint`, and
> `rewound[i].histories`). If a field name differs in the current `reconstructBranches` return type,
> match the S8 test's accessors exactly — do NOT invent names.

### Verify gate (run; all must pass before Task 2)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect 125 pass, 0 fail (122 baseline + 1 synthetic + 2 engine)
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
> Confirm the exact count against the suite; the point is zero failures, the three new tests GREEN, and
> no file over 250 lines.

---

## Task 2 — CLI regression lock + docs (no engine code)

### 2a. CLI regression lock in a NEW file `tests/reconstruction_cli_s11.test.ts`

Create the file (do NOT add to `tests/reconstruction_cli.test.ts` — it is at 246/250). Mirror
`tests/reconstruction_cli_s10.test.ts`'s header comment and `runCli` import, but model the assertions on
the **S7 CLI tests** in `tests/reconstruction_cli.test.ts` (`test_default_view_shows_all_branches`,
`test_surviving_flag_shows_only_surviving_branch`, `test_list_branches_summarizes_surviving_and_rewound`,
`test_branch_id_retrieves_one_specific_branch`) — S7 is the existing single-surviving-plus-single-rewound
CLI shape, identical in structure to S11. One behavior per test.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S11_JSONL } from "./fixtures.ts";

// S11's CLI regression locks live in their own file because the 250-line cap on
// reconstruction_cli.test.ts is already reached; this mirrors the per-scenario split for S10
// (reconstruction_cli_s10.test.ts). All four pass on the unchanged CLI — they LOCK the output so a
// future change cannot silently regress S11.

// Default (no flag): S11 has one surviving branch (the multiply rewrite) AND one rewound branch (the
// abandoned add turn that wrote files), so the default view shows BOTH branch headers and both creates
// on each branch — unlike S9/S10's plain lists.
test("test_s11_default_view_shows_surviving_multiply_and_rewound_add", () => {
    const out = runCli([S11_JSONL]);
    assert.ok(out.includes("## surviving"));
    assert.ok(out.includes("## rewound"));
    assert.ok(out.includes("#01U5g9RL"));            // surviving multiply scenario11.py
    assert.ok(out.includes("#01B97eyh"));            // surviving multiply test
    assert.ok(out.includes("#01CMuVT4"));            // rewound add scenario11.py
    assert.ok(out.includes("#01EW4ztd"));            // rewound add test
});

// --surviving: only the multiply rewrite (the on-disk files); no rewound add ids, no branch headers.
test("test_s11_surviving_flag_shows_only_the_multiply_rewrite", () => {
    const out = runCli([S11_JSONL, "--surviving"]);
    assert.ok(out.includes("#01U5g9RL"));            // multiply scenario11.py shown
    assert.ok(!out.includes("#01CMuVT4"));           // add scenario11.py NOT shown
    assert.ok(!out.includes("## rewound"));
});

// --list-branches: one surviving line (tip #d03f0078) and one rewound summary line naming the rewound
// tip #a7ceb7ae and the rewind point #742f44f2.
test("test_s11_list_branches_summarizes_surviving_and_rewound", () => {
    const out = runCli([S11_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("#d03f0078"));            // surviving (multiply) tip
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("#a7ceb7ae"));            // rewound (add) tip
    assert.ok(out.includes("#742f44f2"));            // rewind point
});

// --branch <rewound tip>: render exactly the rewound add branch, selected by its short tip id.
test("test_s11_branch_id_retrieves_the_rewound_add_branch", () => {
    const out = runCli([S11_JSONL, "--branch", "a7ceb7ae"]);
    assert.ok(out.includes("#01CMuVT4"));            // the rewound add scenario11.py create is shown
    assert.ok(out.includes("#01EW4ztd"));            // the rewound add test create is shown
    assert.ok(!out.includes("#01U5g9RL"));           // the surviving multiply create is NOT shown
});
```
> Match the exact `runCli` call style and string-matcher conventions of the existing S7 CLI tests (use
> `.includes(...)` substring checks against short ids and header literals; do not hand-roll a new
> runner or assert exact whitespace beyond what S7 asserts). These pass immediately (the CLI is
> unchanged); they exist to LOCK the output.

### 2b. Docs (no engine code)

1. **`plans/reconstruction-engine-design.md`** — add a `### S11 — implemented now` subsection (after the
   `### S10 — implemented now` block at the end of the implemented-specs list, before
   `### Deferred to later scenarios`) with a new spec **38 (code-restore-then-rewrite)**: a `code`
   restore to root followed by a post-rewind rewrite of the same files makes the surviving working tree
   the REWRITTEN code; the abandoned pre-restore turn (which wrote files) is preserved as ONE rewound
   branch forked at the root checkpoint; the CLI shows `## surviving` + `## rewound` headers (like
   S7/S8, NOT a plain list). State explicitly that this is the **complement of spec 36 (S9)**: S9 proved
   a `code`-restore refresh (bumped `version`, `null` `backupFileName`) must NOT move the working-tree
   owner; S11 proves a real rewrite after the restore (a NEW non-null `backupFileName` at a NEW
   `version`) MUST move it — together they pin both directions of the content signature. Note the
   verified detail that the backup path-hash is identical across the two versions
   (`ef7eb2c33a0c873b@v2` vs `@v4`), so the `@v<version>` suffix being part of `resolveContentId`'s
   returned id is load-bearing. State **no production-code change was needed** — spec 35 + spec 36
   already cover S11. List the proving tests:
   `test_find_conversation_branches_advances_owner_to_post_restore_rewrite`,
   `test_default_reconstruction_is_the_post_restore_rewrite`,
   `test_reconstruct_branches_retains_the_code_rewound_add_branch`,
   `test_s11_default_view_shows_surviving_multiply_and_rewound_add`,
   `test_s11_surviving_flag_shows_only_the_multiply_rewrite`,
   `test_s11_list_branches_summarizes_surviving_and_rewound`,
   `test_s11_branch_id_retrieves_the_rewound_add_branch`.
2. **`plans/implementation-notes-api-from-scenarios.md`** — add an S11 entry at the top: the finding
   (the engine was already correct — no production change), why (S11 is the complement of S9 — the
   "owner advances on a real rewrite" half of spec 36; the `@v` suffix is what distinguishes the
   identical-path-hash backups), the decision to lock with characterization tests rather than fabricate
   a fix, the CLI-test-file split (250-line cap), and the open questions in Risks.
3. **`plans/roadmap.md`** — change the `[ ] S11 ->` line (line 12) to `[x] S11 -> [x]` with a one-line
   summary in the S7–S10 style, noting "code restore then post-rewind rewrite; surviving = rewritten
   code, abandoned pre-restore write preserved as a rewound branch; no engine change; locked by tests +
   spec 38; the complement of S9 (real rewrite advances the working-tree owner)."

### Verify gate, then the End-to-end check, then stop and report. Commit only after the user approves.

---

## Verify gate (run after every task; all must pass before the next)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 125 after Task 1 (122 + 3); 129 after Task 2 (+4 CLI) — confirm exact count, zero failures
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
(Expected final count: **129** = 122 baseline + 1 synthetic + 2 engine + 4 CLI. Confirm against the
suite; the point is zero failures and no file over 250 lines. `tsx` does NOT type-check — `npx tsc
--noEmit` is the real type gate; the new engine-test helpers must be typed `FileHistory[]`.)

## End-to-end check (after Task 2; proves S11 is correct and S10/S9/S8/S1 are unchanged)

```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s11-write-code-restore-rewrite/a26b3dcb-cf00-4b17-a595-86dd57d4df83.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null
# DEFAULT = both branches with ## headers:
#   ## surviving  tip #d03f0078   -> scenario11.py #01U5g9RL (2 lines), tests/test_scenario11.py #01B97eyh (5 lines)
#   ## rewound    tip #a7ceb7ae  (rewind @ #742f44f2)  -> scenario11.py #01CMuVT4 (2 lines), tests/test_scenario11.py #01EW4ztd (5 lines)

npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
# Two lines: "surviving  tip #d03f0078 …" and "rewound  tip #a7ceb7ae  rewind @ #742f44f2 …"

npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null
# Only the two multiply files (no headers, no add ids).

npx tsx src/reconstruction_cli.ts "$P" --diff 2>/dev/null
# surviving scenario11.py = "def multiply…"; rewound scenario11.py = "def add…".

# Sanity (unchanged): S10 --list-branches surviving #bfd9d428 (no rewound); S9 --list-branches surviving
# #f1b8dede; S8 default surviving #2988ac8f + 2 rewound (#546718c1, #84d669da); S1 default = plain list,
# 0 "## " headers.
```

## Risks / out-of-scope (flag to the user; not part of S11's tasks)

- **Same-filename collision across branches is benign here, but unverified for line-level merges.** S11
  is the first scenario where the surviving and rewound branches write the SAME paths. The branch-aware
  reconstruction keeps them fully separate (each branch reconstructs its own create), so there is no
  cross-branch line bleed. A scenario where a rewrite *edits* (rather than fully overwrites) a restored
  file — producing a multi-revision surviving history — is not in scope; note it for a future slice.
- **The `@v<version>` suffix is load-bearing and only lightly guarded.** The synthetic test and the real
  transcript both rely on the rewrite's `backupFileName` differing from the carried one only by its
  version. If a future transcript ever rewrote a file to the SAME content it had before the restore
  (same path-hash AND same version), the owner would not advance — an edge case not present in S11.
  Track it if such a transcript appears.
- **No production code changed, so S1–S10 are unaffected by construction.** The verify gate's full-suite
  run plus the sanity end-to-end on S10/S9/S8/S1 are the proof.
- **Carried-forward `parseRedirect` regression (`2>&1` / `>/dev/null`)** noted in the S8/S9/S10 handoffs
  is still open and unrelated to S11 — track it as its own `parseRedirect` hardening slice.
