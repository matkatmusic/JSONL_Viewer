# Plan: S16 slice — multi-edit, code restore, then a post-restore RE-EDIT (the surviving working tree is the re-edited code; the abandoned pre-restore edit is preserved as a structurally-discovered rewound branch)

> Scope: make `reconstruction_cli` correctly reconstruct the file-change history of
> `s16-multi-edit-code-restore-re-edit`, and LOCK that result with tests.
> **There is no engine source change in this slice.** The current engine already produces the correct
> output for S16 — verified end-to-end against the real transcript, against the scripted scenario input,
> and confirmed in source terms by four independent code-path audits (see "The current engine is ALREADY
> correct" below). S16 is the **re-edit twin of S13**: where S13 (`multi-edit-code-restore-read`) only
> READ after the code restore, S16 EDITS again (`shout`). That single difference makes S16 the **first**
> scenario where a structurally-discovered rewound branch coexists with a surviving branch that **also
> records its own file change** — a combination no prior scenario exercises. This slice adds a
> real-transcript engine test file, a CLI byte-lock test file, a fixture constant, and the
> implementation-notes + roadmap updates. No new spec number (S13–S15 added none; the design doc is
> current as of spec 40 / S12).

JSONL: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s16-multi-edit-code-restore-re-edit/1ae6a672-d55d-41a6-add3-46123a227440.jsonl`
Predecessor: S15 (`s15-user-edit-then-conv-rewind`) — IMPLEMENTED **and committed** at `HEAD = 03dad64 Implemented S15 handling`, **197 tests green**, working tree clean (the only uncommitted change is the unrelated `src/Plan_Impl_template.md`, which this slice must NOT touch or commit).

---

## Background — the scenario, the topology, and what was verified

`s16-multi-edit-code-restore-re-edit` is the **tenth** scenario in the rewind / code-restore family
(S7–S23). The scripted steps (from `scenarios/s16-multi-edit-code-restore-re-edit.txt`) are:

1. Write `scenario16.py` (`greet(name)` returns `"Hello, " + name`) **and** `tests/test_scenario16.py`
   (tests `greet("world")`).
2. Edit `scenario16.py`: add `farewell(name)` returning `"Goodbye, " + name`.
3. `Good work.` (acceptance; no file change).
4. **Rewind: 2, code** — a **`code` restore** that abandons step 2 and rolls `scenario16.py` on disk
   back to the **greet-only** content (the state before the `farewell` edit).
5. Edit `scenario16.py`: add `shout(name)` returning `name.upper()` — applied to the restored
   greet-only file.
6. `Thanks.` (acceptance; no file change). Then exit.

So step 2's `farewell` edit is **abandoned** by the step-4 code restore; the step-5 `shout` edit
continues to session end (`/exit`). The surviving on-disk working tree is **greet + shout** (matches the
real `scenario16.py` on disk); the **farewell** edit is preserved as a rewound branch. The two edits
diverge from the **same** code-restore fork point.

### Verified ground truth (real transcript; confirms the output the new tests assert)

**Turns (shared turn letters across both DAGs; `A` = conversation root):**

| letter | op | path | tool_use id (changeId) | short | content |
|--------|----|------|------------------------|-------|---------|
| B | Write | `scenario16.py` | `toolu_01P7tr8rsTBqtffe4NrQEtWG` | `#01P7tr8r` | `def greet(name): / return "Hello, " + name` |
| C | Write | `tests/test_scenario16.py` | `toolu_01LMvhrmKJT5ZLWUGVGz6Pbm` | `#01LMvhrm` | imports/asserts `greet` |
| D | Edit | `scenario16.py` | `toolu_01V2kMb8otJbxv6e54DLnFzk` | `#01V2kMb8` | adds `def farewell(name):` — **abandoned (rewound)** |
| E | Edit | `scenario16.py` | `toolu_01FE5WkHedBR4bNqADxJB7Fh` | `#01FE5WkH` | adds `def shout(name):` — **surviving** |

**Conversation topology (verified):**
- **Code-restore fork / rewind point** = `9ab7b6e0-7a87-43ea-a380-436c6193e736` — a **`system`** record
  (the code-restore marker), the shared parent of the two genuine post-fork prompts. (Code restores fork
  at a system record, exactly as S13.)
- **Rewound tip** (abandoned `farewell` edit) = `24093c68-917e-435f-9194-8055cac4bb28`. It is **NOT** a
  `last-prompt` head — the code rewind re-prompted from the fork, so no head ever named it; it is found
  **structurally**.
- **Surviving tip** (the `shout` re-edit's branch) = `a4ec5565-56d5-4f8a-81f5-fd3446fbd862`; the session
  ends on this branch.
- **Working-tree owner** = `2de1cd62` (the `shout` re-edit's file-history snapshot), which lies **on the
  surviving chain** — so `findSurvivingHead` keeps the final head without redirecting.

**The lone `edited_text_file` attachment is a no-op echo:** record index 80 (uuid `d3ad9ac0`, changeId
`d3ad9ac0-4187-4aa4-bd66-4748b1781c35`) carries the **greet-only** restored content on a post-restore
Read turn. It is a disk-snapshot ECHO, **not** a user edit (S16's name has no "user-edit"; contrast the
S18–S23 user-edit scenarios). The S15 content-aware guard drops it because it equals the file's current
content on its own branch.

### The distinction S16 adds (why this is a distinct slice, even with no code change)

S13 / S14 / S15 each had a **file-less** surviving branch (the post-rewind turn only READ). S16's
surviving branch **re-edits** (`shout`), so it records a file change of its own. S16 is therefore the
first scenario where **both** of these hold at once:
- the rewound branch is discovered **structurally** (its tip is not a head — the S13 mechanism), **and**
- the surviving branch's own re-edit is the last content change, so the **working-tree owner sits on the
  surviving chain** and `findSurvivingHead` keeps the final head via its on-branch short-circuit.

No prior scenario combines a structurally-discovered rewound branch with a file-recording surviving
branch. Locking this combination is the whole point of the slice.

### The current engine is ALREADY correct on this transcript

Like S10 and S11 (and unlike S7/S8/S9/S12/S13/S14, each of which found the engine wrong before its fix),
the current engine produces the **correct** S16 output today. This was confirmed four independent ways —
one audit per engine mechanism S16 exercises (all read-only; file:line refs are against the committed
`03dad64` tree):

1. **Structural rewound-branch discovery** (`src/reconstruction_fork.ts`, `src/reconstruction_tree.ts`,
   caller in `src/reconstruction_branch.ts`). `findPromptForkPoints` returns exactly one fork — the
   system record `9ab7b6e0` — whose two genuine-prompt children are the abandoned `farewell` prompt and
   the surviving `shout` continuation. `findDeepestPromptOrReply` walks the abandoned subtree to tip
   `24093c68`; `buildRewoundBranchForPrompt` returns `{ tip 24093c68, rewindPoint 9ab7b6e0,
   isSurviving false }`. The S13/S14 dedup guards do not misfire (the tip was never a head, so it is not
   pre-claimed). Enumeration is a **clean two branches** — no degenerate head-based branch to filter
   (cleaner than S14).
2. **Surviving-head selection** (`findSurvivingHead` / `survivingBranchRecordsFileChange` in
   `src/reconstruction_branch.ts`; `findWorkingTreeOwner` in `src/reconstruction_worktree.ts`).
   `findWorkingTreeOwner` returns `2de1cd62` (the `shout` snapshot), which is on the final chain, so
   `findSurvivingHead` returns the final head `a4ec5565` via its **on-branch short-circuit**
   (`reconstruction_branch.ts:48-49`) — it never even reaches the S14 `survivingBranchRecordsFileChange`
   guard. That guard would independently also return `a4ec5565` (the surviving branch records the `shout`
   edit), so the result is **doubly robust, by design**. The S14 mis-redirect-to-abandoned-branch bug
   cannot recur here because the owner is on-branch.
3. **Branch-aware Edit replay + the S15 echo guard** (`src/reconstruction_replay.ts`,
   `src/reconstruction_branches.ts`). `collectAcceptedUserEditIds` reconstructs each branch over
   `selectBranchRecords(records, branch.tip)`, so the surviving branch's `shout` Edit replays its
   `structuredPatch` against the **greet-only** base B (the abandoned `farewell` edit D is on the rewound
   branch and excluded) — yielding greet + shout, no farewell. `userEditChangesContent`
   (`reconstruction_replay.ts:124-134`) compares the record-80 echo against the file's current greet-only
   content, finds them equal, and pushes **no** revision; the accepted-user-edit set is therefore empty
   and `extractRenderableEvents` filters the echo out of every view. No empty-base crash (the S12
   `insertHunkAdditions` class): B precedes E on the same branch, so the base is populated.
4. **Two-DAG rendering** (`src/reconstruction_graph.ts`, `src/reconstruction_graph_render.ts`). The CLI
   wires its sidecar reader into `renderGraphs`. `buildSurvivingConvoBranch` takes the **non-empty**
   path (the surviving branch has the `shout` turn), so it renders the `E edit` line rather than the
   `(no file changes)` marker that S13/S14/S15's file-less surviving branches showed. `buildFileDag`
   groups the true cross-branch disk lineage `B write → D edit → E edit` (the abandoned `farewell` WAS on
   disk before the restore, so its inclusion in the disk lineage is correct). The code restore and the
   echo Read receive no turn letter. The fileDAG kind column is width 5 (`write`/`edit`), never width 9
   (`user-edit`) — proof the echo did not leak in.

**The default view (whitespace-accurate; the bytes Task 2 locks):**
```
══ conversationDAG ══
A  prompt  #9ab7b6e0   (rewind point)
│
├─ branch rewound (rewound; tip #24093c68; rewind @ #9ab7b6e0)
│  D  edit  scenario16.py  #01V2kMb8
│
└─ branch surviving (surviving; tip #a4ec5565)
   E  edit  scenario16.py  #01FE5WkH

══ fileDAG ══
scenario16.py
  B  write  #01P7tr8r
  D  edit   #01V2kMb8
  E  edit   #01FE5WkH
test_scenario16.py
  C  write  #01LMvhrm
```
> Padding to lock exactly: conversationDAG kind column is width 4 (`edit`), so `edit` carries no trailing
> pad → `D  edit  scenario16.py`. fileDAG kind column is width 5 (`write` is longest), so `write` is
> unpadded (`write  #`) and `edit` carries one trailing pad space (`edit   #`). No trailing spaces on any
> line; the two DAG blocks are separated by a single blank line.

---

## What S16 adds

**No engine source change.** S16 adds only test coverage and documentation that LOCK the already-correct
behavior for the code-restore-then-RE-EDIT case:

1. A new `S16_JSONL` constant in `tests/fixtures.ts`.
2. A real-transcript engine test file `tests/reconstruction_engine_s16.test.ts` (new) — the authoritative
   lock on `findConversationBranches` / `reconstructBranches` / `reconstructAll` for S16.
3. A CLI byte-lock test file `tests/reconstruction_cli_s16.test.ts` (new) — locks the default
   conversationDAG + fileDAG, `--list-branches`, `--branch`, and `--surviving` views.
4. Implementation-notes and roadmap updates (no design-doc spec — see "Per-line / spec impact").

## Per-line / spec impact

**None.** No `EventKind`, `FileRevision`, `LineEntry`, or `LineValue` change; no new event/container type;
no new module; no `src/` file change at all. **No new numbered spec** — S13, S14, and S15 each added none
(the design doc's numbered specs end at spec 40 / S12, and S16 introduces no new engine rule). The
implementation-notes entry is the design record, consistent with the S13–S15 docs-light precedent.

## Module / import-graph plan

**No source file changes.** New/edited test artifacts only:
- a new `S16_JSONL` constant in `tests/fixtures.ts`;
- a new `tests/reconstruction_engine_s16.test.ts` (mirrors `tests/reconstruction_engine_s15.test.ts` —
  same imports and `FileHistory`/`FileRevision` helper shape, so `npx tsc --noEmit` stays clean);
- a new `tests/reconstruction_cli_s16.test.ts` (mirrors `tests/reconstruction_cli_s15.test.ts`'s
  per-scenario split and reuses its `runCli` import).

> **Why a NEW CLI test file (not additions to `tests/reconstruction_cli.test.ts`):** that file is at
> **243/250 lines**; five more tests would breach the hard 250-line cap (a PostToolUse hook blocks the
> save and the verify-gate filesize check fails). S10–S15 each created their own
> `tests/reconstruction_cli_s<N>.test.ts`; S16 follows that established split.

The import graph of `src/` is untouched.

---

## On the absence of a RED phase (read before Task 1)

Strict red-green TDD writes a failing test first, then the minimum code to pass it. **S16 has no failing
engine behavior to fix** — the engine is already correct (verified end-to-end, against the scenario
script, and by the four source audits above). So the new tests are **characterization / regression
locks**: they are expected to pass **GREEN on arrival**, exactly as S10's and S11's did.

Discipline this imposes on the implementer:
- **Run each new test and confirm it is GREEN on the current `src/`.** Passing immediately is the desired
  result — it is the evidence that the shipped S13 (structural discovery) + S14 (surviving-head guard) +
  S15 (echo guard) machinery already covers S16.
- **If any new test is unexpectedly RED, STOP and diagnose.** A red means either the assertion was
  transcribed wrong (fix it against the verified ground truth above) or the engine genuinely regressed (a
  real bug — escalate; do not "adjust" the test to hide it).
- Do **not** invent a production-code change to manufacture a RED→GREEN cycle. There is nothing to fix;
  fabricating a change would risk regressing S1–S15.

---

## Locked decisions (drive output shape; confirm with the user before coding — these mirror S10–S15's locked decisions and may be adjusted if the user objects)

1. **No production-code change.** S16 is implemented as tests + docs only. (Rationale: the engine already
   reconstructs S16 correctly; the work is to LOCK that and document the new combination. Verified four
   independent ways.)
2. **The surviving working tree is greet + shout (the re-edit), reported via the existing
   surviving-branch machinery.** `findWorkingTreeOwner` is the `shout` snapshot `2de1cd62` (on the final
   chain); `findSurvivingHead` keeps the final head `a4ec5565` via its on-branch short-circuit;
   `reconstructAll(S16)` recovers `scenario16.py` as two revisions — the greet Write B then the shout
   Edit E. (Rationale: the kept bytes ARE those events on the surviving branch.)
3. **The abandoned `farewell` edit is preserved as ONE structurally-discovered rewound branch (rewind @
   the system-record fork `9ab7b6e0`), tip `#24093c68`.** It wrote/edited a file off-trunk and its tip is
   named by no head, so it is found structurally (the S13 path). (Rationale: same as S13 — an edited
   abandoned branch with no last-prompt head must be discovered from the parentUuid fork.)
4. **The conversationDAG fork shows the rewound `D edit` above the surviving `E edit` (oldest-first); the
   surviving branch is NOT marked `(no file changes)`.** This is S16's visible distinction from S13/S14/S15
   (whose surviving branches were file-less). `--list-branches` shows two lines; `--branch 24093c68`
   retrieves the rewound `farewell` branch; `--surviving` shows greet + shout only.
5. **The lone `edited_text_file` echo records NO change** (it equals the restored greet-only content), so
   no `user-edit` turn appears in either DAG and the fileDAG kind column stays width 5. (Rationale: the
   S15 content-aware, branch-aware guard — "record a user-edit change iff content differs from current".)
6. **S16 is a no-op for S1–S15.** No production code changes, so every prior scenario's output is
   byte-for-byte unchanged. (Verified by the full-suite run plus the end-to-end sanity below.)

---

## Task 1 — Real-transcript regression lock (no production code)

LOCK the already-correct engine behavior for S16. All tests are characterization locks expected GREEN on
arrival (see "On the absence of a RED phase").

### 1a. Add `S16_JSONL` to `tests/fixtures.ts`

After `S15_JSONL`, same absolute-Desktop convention:
```ts
export const S16_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s16-multi-edit-code-restore-re-edit/1ae6a672-d55d-41a6-add3-46123a227440.jsonl";
```
> Why: DRY fixture rule (coding-requirements §3) — every scenario's JSONL path lives in
> `tests/fixtures.ts`, never inline in a test.

### 1b. Add the real-transcript engine test file `tests/reconstruction_engine_s16.test.ts`

Mirror `tests/reconstruction_engine_s15.test.ts` exactly (same imports and helper functions, so
`npx tsc --noEmit` stays clean — `tsx` does NOT type-check). Four tests, one behavior each (TDD
granularity). Short-id `.slice(0, 8)` comparisons match the S15 test's style and avoid hard-coding full
uuids.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S16_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The final text of a history (its last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
// The history whose target path ends with `suffix`.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// The abandoned `farewell` edit is a rewound branch discovered STRUCTURALLY: its tip 24093c68 is named
// by no last-prompt head (the code rewind re-prompted from the fork), so branch enumeration must find it
// from the parentUuid fork at the system record 9ab7b6e0. The surviving branch keeps the final head.
// Steps:
//   - Load the real S16 transcript and enumerate its branches.
//   - The surviving branch's tip is the final head a4ec5565.
//   - A non-surviving branch has tip 24093c68, forked at the rewind point 9ab7b6e0.
test("test_S16_findConversationBranches_includes_the_structural_rewound_branch", () => {
    const branches = findConversationBranches(loadRecords(S16_JSONL));
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "a4ec5565");
    const rewound = branches.find((branch) => branch.tip.toString().slice(0, 8) === "24093c68")!;
    assert.ok(rewound !== undefined);
    assert.equal(rewound.isSurviving, false);
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "9ab7b6e0");
});

// Exactly one rewound branch, and it touches scenario16.py only (the test file was never edited
// off-trunk). Enumeration is clean — no degenerate head-based branch to filter (unlike S14).
// Steps:
//   - Reconstruct the branch-aware history.
//   - There is exactly one rewound branch.
//   - Its histories cover only scenario16.py.
test("test_S16_reconstructBranches_yields_one_rewound_branch_touching_only_scenario16", () => {
    const branched = reconstructBranches(loadRecords(S16_JSONL));
    assert.equal(branched.rewound.length, 1);
    const targets = branched.rewound[0]!.histories.map((history) => history.target.toString());
    assert.equal(targets.length, 1);
    assert.ok(targets[0]!.endsWith("scenario16.py"));
});

// Reconstructing the rewound branch replays the trunk greet Write then the abandoned `farewell` Edit, so
// its scenario16.py final text holds farewell and NOT shout.
// Steps:
//   - Reconstruct the branch-aware history and take the rewound branch's scenario16.py.
//   - Its final text contains `def farewell(name):` and not `def shout(name):`.
test("test_S16_rewound_branch_content_is_the_abandoned_farewell_edit", () => {
    const branched = reconstructBranches(loadRecords(S16_JSONL));
    const scenario = historyEndingWith(branched.rewound[0]!.histories, "scenario16.py");
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def farewell(name):"));
    assert.ok(!finalText.includes("def shout(name):"));
});

// The surviving working tree is greet + shout: the shout re-edit replays against the restored greet-only
// base (NOT greet+farewell), so scenario16.py has two revisions (the greet Write, then the shout Edit)
// and its final text holds shout and NOT farewell.
// Steps:
//   - Run the default (surviving-branch) reconstruction and take scenario16.py.
//   - It has exactly two revisions.
//   - Its final text contains `def shout(name):` and not `def farewell(name):`.
test("test_S16_surviving_branch_content_is_the_shout_re_edit", () => {
    const surviving = reconstructAll(loadRecords(S16_JSONL));
    const scenario = historyEndingWith(surviving, "scenario16.py");
    assert.equal(scenario.revisions.length, 2);
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def shout(name):"));
    assert.ok(!finalText.includes("def farewell(name):"));
});
```
> Note: confirm the `reconstructBranches` return-field names (`survivingTip`, `surviving`, `rewound`,
> `rewound[i].histories`, `rewound[i].tip`, `rewound[i].rewindPoint`) against
> `tests/reconstruction_engine_s15.test.ts` and the current `reconstruction_engine.ts` types — match the
> existing test's accessors exactly; do NOT invent names. If `scenario.revisions.length` is not 2 on the
> real transcript, STOP and diagnose against the verified ground truth (greet Write B + shout Edit E) —
> do not loosen the assertion to hide a discrepancy.

### Verify gate (run; all must pass before Task 2)
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect 201 pass, 0 fail (197 baseline + 4 engine)
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
> Confirm the exact count against the suite; the point is zero failures, the four new tests GREEN, and no
> file over 250 lines.

---

## Task 2 — CLI byte-lock + docs (no engine code)

### 2a. CLI byte-lock in a NEW file `tests/reconstruction_cli_s16.test.ts`

Create the file (do NOT add to `tests/reconstruction_cli.test.ts` — it is at 243/250). Mirror
`tests/reconstruction_cli_s15.test.ts`'s header comment and `runCli` import. Five tests, one behavior
each. The literal strings below are the verified, whitespace-accurate output bytes; if a substring ever
mismatches, the LIVE CLI output is authoritative — re-run and match it exactly (do not loosen a matcher
to force a pass).

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S16_JSONL } from "./fixtures.ts";

// S16's CLI locks (mirroring the per-scenario split for S10–S15). S16 is the re-edit twin of S13: a code
// restore abandons the `farewell` edit, then the surviving branch RE-EDITS (`shout`). It is the first
// scenario where a structurally-discovered rewound branch coexists with a surviving branch that records
// its own file change. No engine change — these lock the branch-aware views verbatim against the real
// CLI bytes. The views use the real on-disk file-history reader (like the other CLI tests).

// The bare default's conversationDAG FORKS at the code-restore system record 9ab7b6e0: the rewound
// `farewell` edit above the surviving `shout` edit (oldest-first). The surviving branch is NOT file-less,
// so it shows its E edit rather than a `(no file changes)` marker.
test("test_S16_default_conversationDAG_shows_rewound_and_surviving_edits", () => {
    const out = runCli([S16_JSONL]);
    assert.ok(out.includes("A  prompt  #9ab7b6e0   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #24093c68; rewind @ #9ab7b6e0)"));
    assert.ok(out.includes("D  edit  scenario16.py  #01V2kMb8"));
    assert.ok(out.includes("branch surviving (surviving; tip #a4ec5565)"));
    assert.ok(out.includes("E  edit  scenario16.py  #01FE5WkH"));
    // Oldest-first: the rewound branch renders above the surviving branch.
    assert.ok(out.indexOf("branch rewound") < out.indexOf("branch surviving"));
});

// The fileDAG is the branch-agnostic disk lineage: scenario16.py shows B write, D edit (the abandoned
// farewell, which WAS on disk before the restore), then E edit (shout); test_scenario16.py shows C write.
// The kind column is width 5 (`write`/`edit `) — the `edited_text_file` echo is DROPPED, so no width-9
// `user-edit` turn leaks in.
test("test_S16_default_fileDAG_shows_write_edit_edit_and_no_user_edit", () => {
    const out = runCli([S16_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write  #01P7tr8r"));
    assert.ok(out.includes("D  edit   #01V2kMb8"));
    assert.ok(out.includes("E  edit   #01FE5WkH"));
    assert.ok(out.includes("C  write  #01LMvhrm"));
    // The echo never becomes a turn.
    assert.ok(!out.includes("user-edit"));
});

// --list-branches lists both branches: the surviving branch (both files) and the structurally-discovered
// rewound branch (scenario16.py only), naming its tip and the rewind point.
test("test_S16_list_branches_includes_both_branches", () => {
    const out = runCli([S16_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("a4ec5565"));
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("24093c68"));
    assert.ok(out.includes("rewind @ #9ab7b6e0"));
});

// Selecting the abandoned branch by its tip reconstructs its content: scenario16.py = greet + farewell,
// never the surviving shout.
test("test_S16_branch_selects_the_abandoned_farewell", () => {
    const out = runCli([S16_JSONL, "--branch", "24093c68", "--verbose"]);
    assert.ok(out.includes("def farewell(name):"));
    assert.ok(!out.includes("def shout(name):"));
});

// --surviving shows the on-disk working tree: greet + shout, never the abandoned farewell.
test("test_S16_surviving_shows_the_shout_re_edit", () => {
    const out = runCli([S16_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("def shout(name):"));
    assert.ok(!out.includes("def farewell(name):"));
});
```
> Match the exact `runCli` call style and `.includes(...)` substring conventions of the existing S15 CLI
> tests. These pass immediately (the CLI is unchanged); they exist to LOCK the output.

### 2b. Docs (no engine code)

1. **`plans/implementation-notes-api-from-scenarios.md`** — prepend an S16 entry (above the current S15
   top entry), following the S15 entry's shape: the finding (the engine was already correct — no
   production change), why (S16 = the re-edit twin of S13; the first coexistence of a
   structurally-discovered rewound branch with a surviving branch that records its own file change; the
   on-branch working-tree-owner short-circuit keeps the final head, with the S14 guard as a second line of
   defense; the `edited_text_file` echo is dropped by the S15 content-aware guard), the decision to lock
   with characterization tests rather than fabricate a fix, the new-CLI-test-file split (250-line cap),
   and any open questions in Risks. List the proving tests:
   `test_S16_findConversationBranches_includes_the_structural_rewound_branch`,
   `test_S16_reconstructBranches_yields_one_rewound_branch_touching_only_scenario16`,
   `test_S16_rewound_branch_content_is_the_abandoned_farewell_edit`,
   `test_S16_surviving_branch_content_is_the_shout_re_edit`,
   `test_S16_default_conversationDAG_shows_rewound_and_surviving_edits`,
   `test_S16_default_fileDAG_shows_write_edit_edit_and_no_user_edit`,
   `test_S16_list_branches_includes_both_branches`,
   `test_S16_branch_selects_the_abandoned_farewell`,
   `test_S16_surviving_shows_the_shout_re_edit`.
2. **`plans/roadmap.md`** — change the `[ ] S16 ->` line (line 17) to `[x] S16 -> [x]` with a one-line
   summary in the S13–S15 style, e.g.: "multi-edit code-restore then post-restore RE-EDIT (the re-edit
   twin of S13). The code restore abandons the `farewell` edit and rolls scenario16.py back to greet-only;
   the surviving branch then re-edits to add `shout`. First scenario where a structurally-discovered
   rewound branch (S13) coexists with a surviving branch that records its OWN file change — the
   working-tree owner is the shout snapshot on the surviving chain, so findSurvivingHead keeps the final
   head via its on-branch short-circuit (S14 guard a second line of defense); the lone `edited_text_file`
   echo is dropped by the S15 content-aware guard (no user-edit turn). No engine change; locked by tests.
   9 new tests (4 engine + 5 CLI); 206 green; S1–S15 byte-for-byte unchanged."
3. **No `plans/reconstruction-engine-design.md` change and no new numbered spec** — S13/S14/S15 added
   none, and S16 introduces no new engine rule. (Flag to the user: if they want the design doc to carry a
   short S16 prose note for completeness, that is a small optional addition; the default here follows the
   S13–S15 precedent.)

### Verify gate (below), then the End-to-end check, then write the handoff (Task 3), then stop and report. Commit only after the user approves.

---

## Task 3 — Create handoff

After Tasks 1–2 are GREEN and verified, **create a handoff document with the `/jot:handoff-prompt`
skill** so the next session can review/commit. The handoff must state: S16 is implemented as a
characterization/regression lock (no production-code change); the new test files and fixture; the final
test count; that nothing is committed (per project rule — commit only on user approval, precedent one
commit per scenario → message `Implemented S16 handling`); and that the unrelated
`src/Plan_Impl_template.md` working-tree edit must not be swept into the S16 commit.

---

## Verify gate (run after every task; all must pass before the next)
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 201 after Task 1 (197 + 4 engine); 206 after Task 2 (+5 CLI) — confirm exact count, zero failures
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
(Expected final count: **206** = 197 baseline + 4 engine + 5 CLI. Confirm against the suite; the point is
zero failures and no file over 250 lines. `tsx` does NOT type-check — `npx tsc --noEmit` is the real type
gate; the new engine-test helpers must be typed `FileHistory`/`FileRevision` as in the S15 test.)

## End-to-end check (after Task 2; proves S16 is correct and S15/S13/S1 are unchanged)
```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s16-multi-edit-code-restore-re-edit/1ae6a672-d55d-41a6-add3-46123a227440.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null
# DEFAULT: conversationDAG forks at #9ab7b6e0 — rewound `D edit scenario16.py #01V2kMb8` above surviving
#   `E edit scenario16.py #01FE5WkH`; fileDAG scenario16.py = B write / D edit / E edit, test = C write.
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null   # surviving #a4ec5565 + rewound #24093c68 (rewind @ #9ab7b6e0)
npx tsx src/reconstruction_cli.ts "$P" --branch 24093c68 --verbose 2>/dev/null   # greet + farewell
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null         # greet + shout
# Sanity (unchanged): S15 default fileDAG still shows its user-edit turn; S13 default + --list-branches
# byte-for-byte unchanged; S1 default = plain single-file output.
```

## Risks / out-of-scope (flag to the user; not part of S16's tasks)
- **No production code changed, so S1–S15 are unaffected by construction.** The full-suite run plus the
  end-to-end sanity on S15/S13/S1 are the proof.
- **S17 (`s17-multi-edit-conv-only-re-edit`) is the conv-only twin of S16** — same write→edit→rewind→
  re-edit shape but a conversation-only rewind (disk KEEPS the farewell), exactly as S14 was the conv-only
  twin of S13. It is its own planned slice; do NOT fold it in here. The S16 tests should make the S17
  difference easy to characterize.
- **The `@v<version>` content-signature and the carried-forward `parseRedirect` items** noted in earlier
  handoffs remain open and unrelated to S16 — track them as their own slices.
