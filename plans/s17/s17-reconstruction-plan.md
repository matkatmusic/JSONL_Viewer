# Plan: S17 slice — multi-edit, conversation-only rewind, then a post-rewind RE-EDIT (the conv-only twin of S16: the disk KEEPS the abandoned `farewell`, so the surviving working tree is greet + farewell + shout)

> Scope: make `reconstruction_cli` correctly reconstruct the file-change history of
> `s17-multi-edit-conv-only-re-edit`, and LOCK that result with tests.
> **There is no engine source change in this slice.** The current engine already produces the correct
> output for S17 — verified end-to-end against the real transcript, against the scripted scenario input,
> and confirmed in source terms by four independent code-path audits (see "The current engine is ALREADY
> correct" below). S17 is the **conv-only twin of S16**: where S16 (`multi-edit-code-restore-re-edit`)
> used a **`code` restore** that rolled `scenario16.py` back to greet-only before the re-edit, S17 uses a
> **conversation-only** rewind that abandons the `farewell` edit *conversationally* but **leaves it on
> disk**. So when the surviving branch re-edits (`shout`), it edits a file that **still contains
> `farewell`** — and the surviving working tree is **greet + farewell + shout**, not S16's greet + shout.
> That single difference (the kept `farewell`) is the whole point of the slice and the one assertion that
> inverts versus S16. This is exactly the S13 → S14 relationship (code-restore → conv-only twin), one
> family up. This slice adds a real-transcript engine test file, a CLI byte-lock test file, a fixture
> constant, and the implementation-notes + roadmap updates. No new spec number (S13–S16 added none; the
> design doc is current as of spec 40 / S12).

JSONL: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s17-multi-edit-conv-only-re-edit/4c41e3a3-a213-40f4-8df7-169bf61a8e40.jsonl`
Predecessor: S16 (`s16-multi-edit-code-restore-re-edit`) — IMPLEMENTED as a characterization lock, **206 tests green**. At the time of this plan S16 is in the working tree **uncommitted** (awaiting the user's `Implemented S16 handling` commit); the unrelated `src/Plan_Impl_template.md` working-tree edit is NOT part of S16 or S17 and must never be swept into either commit.

---

## Background — the scenario, the topology, and what was verified

`s17-multi-edit-conv-only-re-edit` is the **eleventh** scenario in the rewind family (S7–S23) and the
**conv-only twin of S16**. The scripted steps (from
`scenarios/executed/s17-multi-edit-conv-only-re-edit-run-20260618-091149.txt`) are:

1. Write `scenario17.py` (`greet(name)` returns `"Hello, " + name`) **and** `tests/test_scenario17.py`
   (tests `greet("world")`).
2. Edit `scenario17.py`: add `farewell(name)` returning `"Goodbye, " + name`.
3. `Good work.` (acceptance; no file change).
4. **Rewind: 2** — a **conversation-only** rewind (note: **no `, code` suffix**, unlike S16's
   `Rewind: 2, code`). It abandons steps 2–3 **conversationally** but **does NOT touch the disk**:
   `scenario17.py` on disk still holds **greet + farewell**.
5. Edit `scenario17.py`: add `shout(name)` returning `name.upper()` — applied to the **still-farewell**
   file on disk, so the edit's anchor is the `farewell` function and the result is **greet + farewell +
   shout**.
6. `Thanks.` (acceptance; no file change). Then exit.

So step 2's `farewell` edit is **abandoned conversationally** by the step-4 conv-only rewind, but it
**survives on disk**; the step-5 `shout` edit continues to session end (`/exit`). The surviving on-disk
working tree is **greet + farewell + shout** (this is the byte that distinguishes S17 from S16, whose
code restore made it greet + shout). The **farewell** edit is also preserved as a rewound branch. The two
edits diverge from the **same** conv-only-rewind fork point.

### Verified ground truth (real transcript; confirms the output the new tests assert)

**Turns (shared turn letters across both DAGs; `A` = the fork/rewind point):**

| letter | op | path | tool_use id (changeId) | short | content |
|--------|----|------|------------------------|-------|---------|
| B | Write | `scenario17.py` | `toolu_017KvucuEWpHGQZVNkwn2ifQ` | `#017Kvucu` | `def greet(name): / return "Hello, " + name` |
| C | Write | `tests/test_scenario17.py` | `toolu_01S2jTCayeevDGCDNjrPkiVp` | `#01S2jTCa` | imports/asserts `greet` |
| D | Edit | `scenario17.py` | `toolu_01EbvwePzuU9prWtKRUQCZvM` | `#01EbvweP` | adds `def farewell(name):` — **abandoned (rewound)** |
| E | Edit | `scenario17.py` | `toolu_01RvpwRxgDWGE6JNyzgaQBs9` | `#01RvpwRx` | adds `def shout(name):` anchored on `farewell` — **surviving** |

**The two real Edit payloads (verified from the transcript — these drive the replay result):**
- **D** (`#01EbvweP`): `old_string` = the greet-only file; `new_string` = greet **+ farewell**.
- **E** (`#01RvpwRx`): `old_string` = `def farewell(name):\n    return "Goodbye, " + name`; `new_string`
  = the same farewell block **+ `def shout(name): / return name.upper()`**. E's `originalFile` in its
  `toolUseResult` is **greet + farewell** (record 96) — the on-disk state the conv-only rewind preserved.
  E's anchor on `farewell` is the structural reason the surviving reconstruction KEEPS farewell.

**Conversation topology (verified):**
- **Conv-only-rewind fork / rewind point** = `4a69b697-d438-4c93-9cde-5c02d1e83768` — a **`system`**
  record (`subtype: turn_duration`, the turn boundary after the greet creation), the shared parent of the
  two genuine post-fork prompts (the abandoned `farewell` prompt at record 57 and the surviving `shout`
  prompt at record 83; both carry `parentUuid = 4a69b697`). It is itself a last-prompt head (the
  conversation re-prompted from it).
- **Rewound tip** (abandoned `farewell` edit's branch) = `07038b43-3ad2-43a9-a59a-6d5ffad6c9da`. It is
  **NOT** a `last-prompt` head — the conv-only rewind re-prompted from the fork, so no head ever named it;
  it is found **structurally** (the S13 mechanism — verified by probe: `findStructuralRewoundBranches`
  returns exactly `{ tip 07038b43, rewindPoint 4a69b697 }`, and the rewound tip is confirmed to be no
  last-prompt head).
- **Surviving tip** (the `shout` re-edit's branch) = `e53225b5-6513-42c6-b867-29eb0140545d`; the session
  ends on this branch.
- **Working-tree owner** = `60cee518` (on the surviving chain), so `findSurvivingHead` keeps the final
  head `e53225b5` via its **on-branch short-circuit** without redirecting (exactly as S16).

**No `edited_text_file` attachment at all.** Unlike S16 (which carried a lone greet-only echo at record
80), the S17 transcript contains **zero** `edited_text_file` attachments — verified by a full-transcript
scan. So there is nothing for the S15 content-aware guard to drop; no `user-edit` turn can appear in
either DAG, and the fileDAG kind column is width 5 (`write`/`edit`) by construction. (S17's name has no
"user-edit"; contrast the S18–S23 user-edit scenarios.)

### The distinction S17 adds (why this is a distinct slice, even with no code change)

S16 and S17 share the same write → edit → rewind → re-edit shape and the same two changeIds for B/C/D.
They diverge on exactly one axis — **the rewind kind**, which determines the disk state the surviving
re-edit sees, which in turn determines the surviving content:

| | rewind kind | disk before the re-edit | E's edit anchor | surviving working tree |
|---|---|---|---|---|
| **S16** | `code` restore | greet-only (rolled back) | `greet` | **greet + shout** |
| **S17** | conversation-only | **greet + farewell** (kept) | **`farewell`** | **greet + farewell + shout** |

S17 is therefore the first scenario where the surviving branch's re-edit **anchors on content that is NOT
on its own reconstructed base** (the `farewell` block was authored by D, which is on the abandoned
branch). The engine reconstructs the surviving branch over its own records only (D excluded), so E's
`farewell` context lines are **absent from the greet-only base** and are **materialised as genesis lines**
by the spec-39 / S12 `resolveContextLine` born-path — yielding greet + farewell + shout, with the
farewell+shout content attributed to E's single edit revision. (Per the project directive "reconstruct
the change history 100%, attribution second": the surviving content is byte-correct; that farewell's
authorship lands on E's revision is the faithful surviving-branch view, since E's edit is the only
surviving-branch event that produces non-greet content.) Locking this conv-only-kept-farewell result —
and proving it differs from S16 by exactly the presence of `farewell` in the surviving tree — is the
whole point of the slice.

### The current engine is ALREADY correct on this transcript

Like S10, S11, and S16 (and unlike S7/S8/S9/S12/S13/S14, each of which found the engine wrong before its
fix), the current engine produces the **correct** S17 output today. This was confirmed four independent
ways — one audit per engine mechanism S17 exercises (all read-only; file:line refs are against the current
tree, where S16 is the only uncommitted source-free change):

1. **Structural rewound-branch discovery** (`src/reconstruction_fork.ts`, `src/reconstruction_tree.ts`,
   caller in `src/reconstruction_branch.ts`). Probe-verified: `findStructuralRewoundBranches` returns
   exactly one rewound branch `{ tip 07038b43, rewindPoint 4a69b697 }`, and `findConversationBranches`
   yields a **clean two branches** — surviving `e53225b5` plus the structural rewound `07038b43`. The
   rewound tip is **not** a last-prompt head (the conv-only rewind re-prompted from the fork), so it is
   found from the parentUuid fork, exactly as S13/S16. The S13/S14 dedup guards do not misfire (the tip
   was never a head, so it is not pre-claimed).
2. **Surviving-head selection** (`findSurvivingHead` / `survivingBranchRecordsFileChange` in
   `src/reconstruction_branch.ts:37-71`; `findWorkingTreeOwner` in `src/reconstruction_worktree.ts`).
   `findWorkingTreeOwner` returns `60cee518`, which is on the final chain, so `findSurvivingHead` returns
   the final head `e53225b5` via its **on-branch short-circuit** (`reconstruction_branch.ts:47-49`) — it
   never reaches the S14 `survivingBranchRecordsFileChange` guard. That guard would independently also
   return `e53225b5` (the surviving branch records the `shout` edit), so the result is **doubly robust, by
   design** — identical to S16. The S14 mis-redirect-to-abandoned-branch bug cannot recur here because the
   owner is on-branch.
3. **Branch-aware Edit replay + the spec-39 born-path** (`src/reconstruction_replay.ts`,
   `src/reconstruction_replay_edit.ts`, `src/reconstruction_branches.ts`). The surviving branch is
   reconstructed over `selectBranchRecords(records, e53225b5)`, so its `shout` Edit replays against the
   **greet-only** base B (the abandoned `farewell` edit D is on the rewound branch and excluded). E's hunk
   anchors on the `farewell` block, whose context lines are **absent from the greet-only base**;
   `resolveContextLine` (`reconstruction_replay_edit.ts:96-107`) finds `workingLines[workingIndex]`
   undefined for those lines and materialises them as **genesis** lines (`born: true`), and
   `insertHunkAdditions` (`:113-139`) appends the `+ shout` lines as genesis — so the surviving
   `scenario17.py` reconstructs as **two revisions** (the greet Write, then one Edit revision holding
   greet + farewell + shout). No empty-base crash (the S12 `insertHunkAdditions` class): B precedes E on
   the same branch, so the base is the greet lines, never empty. **This born-path firing on a
   partially-present base — greet present, farewell absent — is the engine behavior S17 uniquely
   exercises and locks.**
4. **Two-DAG rendering** (`src/reconstruction_graph.ts`, `src/reconstruction_graph_render.ts`). The CLI
   wires its sidecar reader into `renderGraphs`. `buildSurvivingConvoBranch` takes the **non-empty** path
   (the surviving branch has the `shout` turn), so it renders the `E edit` line rather than the `(no file
   changes)` marker that S13/S14/S15's file-less surviving branches showed (same as S16).
   `buildFileDag` groups the true cross-branch disk lineage `B write → D edit → E edit` (the `farewell`
   edit WAS — and remains — on disk, so its inclusion in the disk lineage is correct). The conv-only
   rewind receives no turn letter. The fileDAG kind column is width 5 (`write`/`edit`), never width 9
   (`user-edit`) — and there is no echo to leak in (none exists).

**The default view (whitespace-accurate; the bytes Task 2 locks):**
```
══ conversationDAG ══
A  prompt  #4a69b697   (rewind point)
│
├─ branch rewound (rewound; tip #07038b43; rewind @ #4a69b697)
│  D  edit  scenario17.py  #01EbvweP
│
└─ branch surviving (surviving; tip #e53225b5)
   E  edit  scenario17.py  #01RvpwRx

══ fileDAG ══
scenario17.py
  B  write  #017Kvucu
  D  edit   #01EbvweP
  E  edit   #01RvpwRx
test_scenario17.py
  C  write  #01S2jTCa
```
> Padding to lock exactly (verified via `cat -e`; identical column rules to S16): conversationDAG kind
> column is width 4 (`edit`), so `edit` carries no trailing pad → `D  edit  scenario17.py`. fileDAG kind
> column is width 5 (`write` is longest), so `write` is unpadded (`write  #`) and `edit` carries one
> trailing pad space (`edit   #`). No trailing spaces on any line; the two DAG blocks are separated by a
> single blank line.

---

## What S17 adds

**No engine source change.** S17 adds only test coverage and documentation that LOCK the already-correct
behavior for the conv-only-rewind-then-RE-EDIT case:

1. A new `S17_JSONL` constant in `tests/fixtures.ts`.
2. A real-transcript engine test file `tests/reconstruction_engine_s17.test.ts` (new) — the authoritative
   lock on `findConversationBranches` / `reconstructBranches` / `reconstructAll` for S17, **including the
   one assertion that inverts vs S16: the surviving tree KEEPS `farewell`**.
3. A CLI byte-lock test file `tests/reconstruction_cli_s17.test.ts` (new) — locks the default
   conversationDAG + fileDAG, `--list-branches`, `--branch`, and `--surviving` views.
4. Implementation-notes and roadmap updates (no design-doc spec — see "Per-line / spec impact").

## Per-line / spec impact

**None.** No `EventKind`, `FileRevision`, `LineEntry`, or `LineValue` change; no new event/container type;
no new module; no `src/` file change at all. **No new numbered spec** — S13, S14, S15, and S16 each added
none (the design doc's numbered specs end at spec 40 / S12, and S17 introduces no new engine rule; it
exercises the existing spec-39 born-path on a partially-present base). The implementation-notes entry is
the design record, consistent with the S13–S16 docs-light precedent.

## Module / import-graph plan

**No source file changes.** New/edited test artifacts only:
- a new `S17_JSONL` constant in `tests/fixtures.ts`;
- a new `tests/reconstruction_engine_s17.test.ts` (mirrors `tests/reconstruction_engine_s16.test.ts` —
  same imports and `FileHistory`/`FileRevision` helper shape, so `npx tsc --noEmit` stays clean);
- a new `tests/reconstruction_cli_s17.test.ts` (mirrors `tests/reconstruction_cli_s16.test.ts`'s
  per-scenario split and reuses its `runCli` import).

> **Why a NEW CLI test file (not additions to `tests/reconstruction_cli.test.ts`):** that file is at
> **243/250 lines**; five more tests would breach the hard 250-line cap (a PostToolUse hook blocks the
> save and the verify-gate filesize check fails). S10–S16 each created their own
> `tests/reconstruction_cli_s<N>.test.ts`; S17 follows that established split.

The import graph of `src/` is untouched.

---

## On the absence of a RED phase (read before Task 1)

Strict red-green TDD writes a failing test first, then the minimum code to pass it. **S17 has no failing
engine behavior to fix** — the engine is already correct (verified end-to-end, against the scenario
script, and by the four source audits above). So the new tests are **characterization / regression
locks**: they are expected to pass **GREEN on arrival**, exactly as S10's, S11's, and S16's did.

Discipline this imposes on the implementer:
- **Run each new test and confirm it is GREEN on the current `src/`.** Passing immediately is the desired
  result — it is the evidence that the shipped S13 (structural discovery) + S14 (surviving-head guard) +
  S12 (born-path) machinery already covers S17.
- **If any new test is unexpectedly RED, STOP and diagnose.** A red means either the assertion was
  transcribed wrong (fix it against the verified ground truth above) or the engine genuinely regressed (a
  real bug — escalate; do not "adjust" the test to hide it).
- Do **not** invent a production-code change to manufacture a RED→GREEN cycle. There is nothing to fix;
  fabricating a change would risk regressing S1–S16.
- **Do NOT copy S16's surviving assertions verbatim.** S16 asserts the surviving tree contains `shout` and
  **NOT** `farewell`. S17 inverts this: the surviving tree contains `farewell` **AND** `shout`. Getting
  this one inversion right is the entire purpose of the slice — see the bolded callouts in Tasks 1b/2a.

---

## Locked decisions (drive output shape; confirm with the user before coding — these mirror S10–S16's locked decisions and may be adjusted if the user objects)

1. **No production-code change.** S17 is implemented as tests + docs only. (Rationale: the engine already
   reconstructs S17 correctly; the work is to LOCK that and document the conv-only-twin distinction.
   Verified four independent ways.)
2. **The surviving working tree is greet + farewell + shout, reported via the existing surviving-branch
   machinery.** `findWorkingTreeOwner` is `60cee518` (on the final chain); `findSurvivingHead` keeps the
   final head `e53225b5` via its on-branch short-circuit; `reconstructAll(S17)` recovers `scenario17.py`
   as **two revisions** — the greet Write B, then one Edit revision E holding greet + farewell + shout
   (the spec-39 born-path materialises the off-branch `farewell` context). (Rationale: the kept bytes are
   greet + farewell + shout; the conv-only rewind preserved `farewell` on disk and E re-edited it.)
3. **The abandoned `farewell` edit is preserved as ONE structurally-discovered rewound branch (rewind @
   the fork `4a69b697`), tip `#07038b43`.** Its tip is named by no head, so it is found structurally (the
   S13 path — probe-verified). (Rationale: same as S13/S16 — an edited abandoned branch with no last-prompt
   head must be discovered from the parentUuid fork.)
4. **The conversationDAG fork shows the rewound `D edit` above the surviving `E edit` (oldest-first); the
   surviving branch is NOT marked `(no file changes)`.** `--list-branches` shows two lines;
   `--branch 07038b43` retrieves the rewound `farewell` branch (greet + farewell); `--surviving` shows
   greet + farewell + shout.
5. **No `edited_text_file` echo exists, so no `user-edit` turn appears in either DAG and the fileDAG kind
   column stays width 5.** (Rationale: the S17 transcript carries zero `edited_text_file` attachments —
   nothing for the S15 guard to evaluate or drop.)
6. **S17 is a no-op for S1–S16.** No production code changes, so every prior scenario's output is
   byte-for-byte unchanged. (Verified by the full-suite run plus the end-to-end sanity below.)

---

## Task 1 — Real-transcript regression lock (no production code)

LOCK the already-correct engine behavior for S17. All tests are characterization locks expected GREEN on
arrival (see "On the absence of a RED phase").

### 1a. Add `S17_JSONL` to `tests/fixtures.ts`

After `S16_JSONL`, same absolute-Desktop convention (path verified to exist via the `scenarios/`
symlink):
```ts
export const S17_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s17-multi-edit-conv-only-re-edit/4c41e3a3-a213-40f4-8df7-169bf61a8e40.jsonl";
```
> Why: DRY fixture rule (coding-requirements §3) — every scenario's JSONL path lives in
> `tests/fixtures.ts`, never inline in a test.

### 1b. Add the real-transcript engine test file `tests/reconstruction_engine_s17.test.ts`

Mirror `tests/reconstruction_engine_s16.test.ts` exactly (same imports and helper functions, so
`npx tsc --noEmit` stays clean — `tsx` does NOT type-check). Four tests, one behavior each (TDD
granularity). Short-id `.slice(0, 8)` comparisons match the S16 test's style and avoid hard-coding full
uuids.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S17_JSONL } from "./fixtures.ts";

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

// The abandoned `farewell` edit is a rewound branch discovered STRUCTURALLY: its tip 07038b43 is named
// by no last-prompt head (the conv-only rewind re-prompted from the fork), so branch enumeration must
// find it from the parentUuid fork at the system record 4a69b697. The surviving branch keeps the final
// head e53225b5.
// Steps:
//   - Load the real S17 transcript and enumerate its branches.
//   - The surviving branch's tip is the final head e53225b5.
//   - A non-surviving branch has tip 07038b43, forked at the rewind point 4a69b697.
test("test_S17_findConversationBranches_includes_the_structural_rewound_branch", () => {
    const branches = findConversationBranches(loadRecords(S17_JSONL));
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "e53225b5");
    const rewound = branches.find((branch) => branch.tip.toString().slice(0, 8) === "07038b43")!;
    assert.ok(rewound !== undefined);
    assert.equal(rewound.isSurviving, false);
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "4a69b697");
});

// Exactly one rewound branch, and it touches scenario17.py only (the test file was never edited
// off-trunk). Enumeration is clean — no degenerate head-based branch to filter.
// Steps:
//   - Reconstruct the branch-aware history.
//   - There is exactly one rewound branch.
//   - Its histories cover only scenario17.py.
test("test_S17_reconstructBranches_yields_one_rewound_branch_touching_only_scenario17", () => {
    const branched = reconstructBranches(loadRecords(S17_JSONL));
    assert.equal(branched.rewound.length, 1);
    const targets = branched.rewound[0]!.histories.map((history) => history.target.toString());
    assert.equal(targets.length, 1);
    assert.ok(targets[0]!.endsWith("scenario17.py"));
});

// Reconstructing the rewound branch replays the trunk greet Write then the abandoned `farewell` Edit, so
// its scenario17.py final text holds farewell and NOT shout. (Same as S16's rewound branch — D's edit is
// identical across the twins.)
// Steps:
//   - Reconstruct the branch-aware history and take the rewound branch's scenario17.py.
//   - Its final text contains `def farewell(name):` and not `def shout(name):`.
test("test_S17_rewound_branch_content_is_the_abandoned_farewell_edit", () => {
    const branched = reconstructBranches(loadRecords(S17_JSONL));
    const scenario = historyEndingWith(branched.rewound[0]!.histories, "scenario17.py");
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def farewell(name):"));
    assert.ok(!finalText.includes("def shout(name):"));
});

// THE S17 vs S16 INVERSION. The conv-only rewind KEEPS farewell on disk, so the surviving `shout` re-edit
// anchors on farewell; the spec-39 born-path materialises that off-branch farewell context, so the
// surviving scenario17.py is greet + farewell + shout: two revisions (the greet Write, then one Edit
// revision) whose final text contains BOTH `def farewell(name):` AND `def shout(name):`.
// (Contrast S16, whose code restore dropped farewell — there the surviving tree had shout but NOT
// farewell. Do NOT copy S16's `!includes("farewell")` assertion here.)
// Steps:
//   - Run the default (surviving-branch) reconstruction and take scenario17.py.
//   - It has exactly two revisions.
//   - Its final text contains BOTH `def farewell(name):` and `def shout(name):`.
test("test_S17_surviving_branch_keeps_farewell_and_adds_shout", () => {
    const surviving = reconstructAll(loadRecords(S17_JSONL));
    const scenario = historyEndingWith(surviving, "scenario17.py");
    assert.equal(scenario.revisions.length, 2);
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def farewell(name):"));
    assert.ok(finalText.includes("def shout(name):"));
});
```
> Note: confirm the `reconstructBranches` return-field names (`surviving`, `rewound`,
> `rewound[i].histories`, `rewound[i].tip`, `rewound[i].rewindPoint`) against
> `tests/reconstruction_engine_s16.test.ts` and the current `reconstruction_engine.ts` types — match the
> existing test's accessors exactly; do NOT invent names. If `scenario.revisions.length` is not 2 on the
> real transcript, or if `def farewell(name):` is absent from the surviving final text, **STOP and
> diagnose** against the verified ground truth (greet Write B + one Edit revision holding greet + farewell
> + shout) — do not loosen the assertion to hide a discrepancy.

### Verify gate (run; all must pass before Task 2)
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect 210 pass, 0 fail (206 baseline + 4 engine)
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
> Confirm the exact count against the suite; the point is zero failures, the four new tests GREEN, and no
> file over 250 lines.

---

## Task 2 — CLI byte-lock + docs (no engine code)

### 2a. CLI byte-lock in a NEW file `tests/reconstruction_cli_s17.test.ts`

Create the file (do NOT add to `tests/reconstruction_cli.test.ts` — it is at 243/250). Mirror
`tests/reconstruction_cli_s16.test.ts`'s header comment and `runCli` import. Five tests, one behavior
each. The literal strings below are the verified, whitespace-accurate output bytes (confirmed via
`cat -e`); if a substring ever mismatches, the LIVE CLI output is authoritative — re-run and match it
exactly (do not loosen a matcher to force a pass).

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S17_JSONL } from "./fixtures.ts";

// S17's CLI locks (mirroring the per-scenario split for S10–S16). S17 is the conv-only twin of S16: a
// conversation-only rewind abandons the `farewell` edit CONVERSATIONALLY but LEAVES IT ON DISK, then the
// surviving branch RE-EDITS (`shout`) the still-farewell file. So the surviving working tree KEEPS
// farewell (greet + farewell + shout) — the one byte that inverts versus S16's greet + shout. No engine
// change — these lock the branch-aware views verbatim against the real CLI bytes. The views use the real
// on-disk file-history reader (like the other CLI tests).

// The bare default's conversationDAG FORKS at the conv-only-rewind system record 4a69b697: the rewound
// `farewell` edit above the surviving `shout` edit (oldest-first). The surviving branch is NOT file-less,
// so it shows its E edit rather than a `(no file changes)` marker.
test("test_S17_default_conversationDAG_shows_rewound_and_surviving_edits", () => {
    const out = runCli([S17_JSONL]);
    assert.ok(out.includes("A  prompt  #4a69b697   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #07038b43; rewind @ #4a69b697)"));
    assert.ok(out.includes("D  edit  scenario17.py  #01EbvweP"));
    assert.ok(out.includes("branch surviving (surviving; tip #e53225b5)"));
    assert.ok(out.includes("E  edit  scenario17.py  #01RvpwRx"));
    // Oldest-first: the rewound branch renders above the surviving branch.
    assert.ok(out.indexOf("branch rewound") < out.indexOf("branch surviving"));
});

// The fileDAG is the branch-agnostic disk lineage: scenario17.py shows B write, D edit (the farewell,
// which is on disk and stays there), then E edit (shout); test_scenario17.py shows C write. The kind
// column is width 5 (`write`/`edit `) — there is NO `edited_text_file` echo in S17, so no width-9
// `user-edit` turn can appear.
test("test_S17_default_fileDAG_shows_write_edit_edit_and_no_user_edit", () => {
    const out = runCli([S17_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write  #017Kvucu"));
    assert.ok(out.includes("D  edit   #01EbvweP"));
    assert.ok(out.includes("E  edit   #01RvpwRx"));
    assert.ok(out.includes("C  write  #01S2jTCa"));
    // No echo exists, so no user-edit turn.
    assert.ok(!out.includes("user-edit"));
});

// --list-branches lists both branches: the surviving branch (both files) and the structurally-discovered
// rewound branch (scenario17.py only), naming its tip and the rewind point.
test("test_S17_list_branches_includes_both_branches", () => {
    const out = runCli([S17_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("e53225b5"));
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("07038b43"));
    assert.ok(out.includes("rewind @ #4a69b697"));
});

// Selecting the abandoned branch by its tip reconstructs its content: scenario17.py = greet + farewell,
// never the surviving shout.
test("test_S17_branch_selects_the_abandoned_farewell", () => {
    const out = runCli([S17_JSONL, "--branch", "07038b43", "--verbose"]);
    assert.ok(out.includes("def farewell(name):"));
    assert.ok(!out.includes("def shout(name):"));
});

// THE S17 vs S16 INVERSION at the CLI. --surviving shows the on-disk working tree the conv-only rewind
// preserved: greet + farewell + shout — BOTH farewell AND shout are present. (Contrast S16's --surviving,
// which had shout but NOT farewell. Do NOT copy S16's `!includes("farewell")` assertion here.)
test("test_S17_surviving_keeps_farewell_and_shout", () => {
    const out = runCli([S17_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("def farewell(name):"));
    assert.ok(out.includes("def shout(name):"));
});
```
> Match the exact `runCli` call style and `.includes(...)` substring conventions of the existing S16 CLI
> tests. These pass immediately (the CLI is unchanged); they exist to LOCK the output.

### 2b. Docs (no engine code)

1. **`plans/implementation-notes-api-from-scenarios.md`** — prepend an S17 entry (above the current S16
   top entry), following the S16 entry's shape: the finding (the engine was already correct — no
   production change), why (S17 = the conv-only twin of S16; the conv-only rewind keeps `farewell` on
   disk, so the surviving re-edit anchors on `farewell` and the spec-39 born-path materialises that
   off-branch context — surviving tree is greet + farewell + shout, inverting S16's greet + shout; the
   rewound branch is the same structurally-discovered abandoned `farewell` as S16; the on-branch
   working-tree-owner short-circuit keeps the final head, S14 guard a second line of defense; no
   `edited_text_file` echo exists so no user-edit turn), the decision to lock with characterization tests
   rather than fabricate a fix, the new-CLI-test-file split (250-line cap), and any open questions in
   Risks. List the proving tests:
   `test_S17_findConversationBranches_includes_the_structural_rewound_branch`,
   `test_S17_reconstructBranches_yields_one_rewound_branch_touching_only_scenario17`,
   `test_S17_rewound_branch_content_is_the_abandoned_farewell_edit`,
   `test_S17_surviving_branch_keeps_farewell_and_adds_shout`,
   `test_S17_default_conversationDAG_shows_rewound_and_surviving_edits`,
   `test_S17_default_fileDAG_shows_write_edit_edit_and_no_user_edit`,
   `test_S17_list_branches_includes_both_branches`,
   `test_S17_branch_selects_the_abandoned_farewell`,
   `test_S17_surviving_keeps_farewell_and_shout`.
2. **`plans/roadmap.md`** — change the `[ ] S17 ->` line (line 18) to `[x] S17 -> [x]` with a one-line
   summary in the S13–S16 style, e.g.: "multi-edit conversation-only rewind then post-rewind RE-EDIT (the
   conv-only twin of S16). The conv-only rewind (`Rewind: 2`, no `code`) abandons the `farewell` edit
   CONVERSATIONALLY but leaves it on disk, so the surviving branch re-edits the still-farewell file to add
   `shout` — surviving working tree is greet + farewell + shout (KEEPS farewell, inverting S16's greet +
   shout). The abandoned `farewell` edit is the same structurally-discovered rewound branch as S16 (tip
   #07038b43, rewind @ #4a69b697); the working-tree owner #60cee518 is on the surviving chain so
   findSurvivingHead keeps the final head #e53225b5 via its on-branch short-circuit. The surviving
   `shout` edit anchors on farewell, which is off the surviving branch's greet-only base, so the spec-39
   resolveContextLine born-path materialises it. No `edited_text_file` echo exists (no user-edit turn).
   NO engine change — locked by characterization/regression tests (GREEN on arrival). 9 new tests (4
   engine + 5 CLI); 215 green; S1–S16 byte-for-byte unchanged."
3. **No `plans/reconstruction-engine-design.md` change and no new numbered spec** — S13/S14/S15/S16 added
   none, and S17 introduces no new engine rule (it exercises the existing spec-39 born-path). (Flag to the
   user: if they want the design doc to carry a short S17 prose note for completeness, that is a small
   optional addition; the default here follows the S13–S16 precedent.)

### Verify gate (below), then the End-to-end check, then write the handoff (Task 3), then stop and report. Commit only after the user approves.

---

## Task 3 — Create handoff

After Tasks 1–2 are GREEN and verified, **create a handoff document with the `/jot:handoff-prompt`
skill** so the next session can review/commit. The handoff must state: S17 is implemented as a
characterization/regression lock (no production-code change); the new test files and fixture; the final
test count (215); that nothing is committed (per project rule — commit only on user approval, precedent
one commit per scenario → message `Implemented S17 handling`); and that the unrelated
`src/Plan_Impl_template.md` working-tree edit must not be swept into the S17 commit. If S16 is still
uncommitted when S17 is implemented, note that S16's commit should land first (or the two be staged as
distinct commits) — do NOT fold S17's artifacts into the S16 commit.

---

## Verify gate (run after every task; all must pass before the next)
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 210 after Task 1 (206 + 4 engine); 215 after Task 2 (+5 CLI) — confirm exact count, zero failures
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
(Expected final count: **215** = 206 baseline + 4 engine + 5 CLI. Confirm against the suite; the point is
zero failures and no file over 250 lines. `tsx` does NOT type-check — `npx tsc --noEmit` is the real type
gate; the new engine-test helpers must be typed `FileHistory`/`FileRevision` as in the S16 test.)

## End-to-end check (after Task 2; proves S17 is correct and S16/S15/S1 are unchanged)
```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s17-multi-edit-conv-only-re-edit/4c41e3a3-a213-40f4-8df7-169bf61a8e40.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null
# DEFAULT: conversationDAG forks at #4a69b697 — rewound `D edit scenario17.py #01EbvweP` above surviving
#   `E edit scenario17.py #01RvpwRx`; fileDAG scenario17.py = B write / D edit / E edit, test = C write.
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null   # surviving #e53225b5 + rewound #07038b43 (rewind @ #4a69b697)
npx tsx src/reconstruction_cli.ts "$P" --branch 07038b43 --verbose 2>/dev/null   # greet + farewell
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null         # greet + farewell + shout  (KEEPS farewell — the S17 signature)
# Sanity (unchanged): S16 default --surviving still greet + shout (NO farewell); S16 default + --list-branches
# byte-for-byte unchanged; S1 default = plain single-file output.
```

## Risks / out-of-scope (flag to the user; not part of S17's tasks)
- **No production code changed, so S1–S16 are unaffected by construction.** The full-suite run plus the
  end-to-end sanity on S16/S15/S1 are the proof. In particular, confirm S16's `--surviving` STILL shows
  greet + shout with NO farewell — that the twins differ by exactly the kept `farewell` is the headline
  result.
- **The attribution artifact is intentional, not a bug.** On the surviving branch, `farewell`'s content
  is attributed to E's edit revision (its real author D is off-branch). Per the project directive
  ("reconstruct the change history 100%, attribution second") the surviving *content* is byte-correct;
  do not "fix" the attribution by special-casing — that would be scope creep and risks S1–S16.
- **S18–S23 are the user-edit family** (`edited_text_file` attachments that DO differ from current
  content). They are their own planned slices and are out of scope here; S17 has no `edited_text_file`
  attachment at all.
- **The `@v<version>` content-signature and the carried-forward `parseRedirect` items** noted in earlier
  handoffs remain open and unrelated to S17 — track them as their own slices.
