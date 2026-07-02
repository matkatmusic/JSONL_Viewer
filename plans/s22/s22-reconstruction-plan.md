# S22 (`s22-user-edits-conv-rewind`) reconstruction plan

**Type: CHARACTERIZATION / REGRESSION LOCK. NO production-code (`src/`) change.**
The engine ALREADY reconstructs S22 byte-for-byte correctly (verified live against the
current S19+S20+S21 engine, both WITH the CLI's auto-built sidecar reader AND with NO
reader). Implementing this plan = add 1 fixture line + 9 tests (4 engine + 5 CLI) + 3 doc
edits. Expected **251 → 260 green**, `npx tsc --noEmit` clean, `git diff src/` stays EMPTY.
Every test is GREEN on arrival (no RED phase), exactly like S10/S11/S16/S17/S18/S20/S21.

> If any test fails, the TEST is wrong (a changeId / line number / whitespace / revision
> count / enum member), NOT the engine. Fix the test to match live CLI/engine output —
> do **not** edit `src/`.

---

## What S22 is

`s22-user-edits-conv-rewind` builds `scenario22.py` (a `Stack` class) across a
**conversation-only rewind**, with ONE out-of-band USER edit on EACH side of the rewind,
each followed by a Claude edit:

| Op | Kind | File | Branch | What it does | Branch result |
|----|------|------|--------|--------------|---------------|
| A | prompt | — | root | root user prompt `#f3ad1ed6` (the rewind point) | — |
| B | write | scenario22.py | trunk | `class Stack` + `__init__` + `self.items = []` | 3 lines |
| C | write | tests/test_scenario22.py | trunk | the test file | 5 lines |
| D | **user-edit** | scenario22.py | **rewound** | user inserts `    def push(self, item): self.items.append(item)` | 4 lines |
| E | edit | scenario22.py | **rewound** | Claude adds `    def pop(self): return self.items.pop()` | 5 lines |
| F | **user-edit** | scenario22.py | **surviving** | user inserts `    def peek(self): return self.items[-1] if self.items else None` | 6 lines |
| G | edit | scenario22.py | **surviving** | Claude adds `    def is_empty(self): return len(self.items) == 0` | 7 lines |

The scenario flow (from `scenarios/s22-user-edits-conv-rewind.txt`): B/C write → D user-edit
(`push`) → E Claude edit (`pop`) → "Good." → **Rewind: 2** (conversation-only) → F user-edit
(`peek`) → G Claude edit (`is_empty`) → "Thanks." → Exit. The rewind reverts the CONVERSATION
to just after the root prompt A, abandoning the D/E turns — but it does NOT revert the file on
disk, so `push` and `pop` (D, E) are still on disk when the surviving user-edit F happens.

The surviving conversation tip is `#adb42316`; the abandoned (rewound) tip is `#549149a1`.

## Why S22 matters (the signature)

S22 is the **two-user-edit, conversation-rewind** scenario — the structural meeting point of
S18/S21 (linear user edits) and S19 (conv-rewind). It is the FIRST scenario where:

1. **A user-edit lands on EACH branch of a conversation rewind** — D (`push`) on the abandoned
   branch, F (`peek`) on the surviving branch. (S19 had the off-branch edit be a *Claude* edit;
   S20's user-edit was a code-rewind restore. S22 puts a genuine out-of-band user edit on both
   the abandoned AND the surviving lineage.)
2. **The surviving user-edit ABSORBS the off-branch edits that survived the conv-only rewind.**
   Because the rewind keeps `push`+`pop` (D, E) on disk, F's `edited_text_file` snapshot echo
   already contains them, so the surviving reconstruction jumps from 3 lines (rev0, the write)
   straight to **6 lines** in a single `user-edit` revision (rev1 = init+push+pop+peek). The
   off-branch `push`+`pop` are materialised by the SURVIVING user-edit, not by any Claude edit.
3. **The same `user-edit` kind produces different deltas per branch** — D adds ONE line (`push`,
   because the abandoned-branch disk then held only init+push), while F adds THREE lines
   (push+pop+peek, because the surviving-branch disk held init+push+pop). This is driven purely
   by the per-branch disk state the engine threads, not by the edit kind.

The **regression property** this locks: the S19 reseed (`seedStaleEditBases` /
`editBaseIsStale`) stays **INERT** for S22, even though a conversation rewind left off-branch
edits on disk. Two facts make it dormant:

- `staleEditSeedFor` only fires for `EventKind.edit` (Claude edits), never for `user-edit`. So F
  (a user-edit) is never a reseed candidate; its full-content snapshot is set wholesale.
- The only surviving Claude edit, G (`is_empty`), runs AFTER F has already re-established the full
  6-line disk content, so G's hunk base is aligned and `editBaseIsStale(G)` is false.

This was proven empirically this session: `reconstructBranches(loadRecords(S22_JSONL))` with
**NO reader** produces the byte-identical 7-line surviving file. If the reseed mattered, the
no-reader run would be wrong — it is not. So S22's engine tests are **reader-free** (like
S18/S21, NOT like S20). This complements S19 (where the reseed is ACTIVE because a Claude edit,
not a user-edit, follows the rewind): S22 proves the reseed correctly stays dormant when the
surviving branch's leading edit is a user-edit that absorbs the off-branch drift.

---

## Verified ground truth (captured live this session)

### changeIds and uuids (for the engine + CLI assertions)

| Op | CLI changeId | source | full id |
|----|-------------|--------|---------|
| A (prompt / rewind point) | `#f3ad1ed6` | record uuid | `f3ad1ed6-…` |
| B (write scenario22.py) | `#01DQ5FKj` | tool_use id | `toolu_01DQ5FKj…` |
| C (write test) | `#018QRZd1` | tool_use id | `toolu_018QRZd1…` |
| D (user-edit `push`, **rewound**) | `#eea066db` | attachment uuid | `eea066db-5253-4cb1-8ca7-40846d9ad348` |
| E (edit `pop`, **rewound**) | `#01UWTUSU` | tool_use id | `toolu_01UWTUSU…` |
| F (user-edit `peek`, **surviving**) | `#5df7ac59` | attachment uuid | `5df7ac59-9256-43c7-9591-4e6449d8a0a4` |
| G (edit `is_empty`, **surviving**) | `#01Chd9Wv` | tool_use id | `toolu_01Chd9Wv…` |
| surviving tip | `#adb42316` | conversation leaf | — |
| rewound tip | `#549149a1` | conversation leaf | — |

> The user-edit changeId IS the `edited_text_file` attachment record's uuid (D=`eea066db`,
> F=`5df7ac59`). The write/edit changeId is the tool_use id with `toolu_` stripped (first 8
> chars rendered). Claude edits use `old_string`/`new_string`; their hunks are derived by the
> engine from the tool-RESULT `structuredPatch` — already handled, do not assert hunks directly.

### Branch enumeration (`findConversationBranches`) — exactly TWO branches

```
isSurviving=true   tip=adb42316   rewindPoint=undefined
isSurviving=false  tip=549149a1   rewindPoint=f3ad1ed6
```

The rewindPoint (`#f3ad1ed6`, the root prompt A) sits on the **rewound** (non-surviving) branch,
NOT on the surviving branch. `reconstructBranches(...).rewound` has length 1; its sole entry has
`tip=549149a1`, `rewindPoint=f3ad1ed6`, and `histories` covering only `scenario22.py`.

### Revision ladder for `scenario22.py`

**Surviving branch (3 revisions):**

| rev | op | kind | lines | new content |
|-----|----|------|-------|-------------|
| 0 | B | `write` | 3 | `class Stack:` … `self.items = []` |
| 1 | F | `userEdit` | 6 | + `push` + `pop` + `peek` (absorbs off-branch D,E plus own `peek`) |
| 2 | G | `edit` | 7 | + `    def is_empty(self): return len(self.items) == 0` |

**Rewound branch (3 revisions):**

| rev | op | kind | lines | new content |
|-----|----|------|-------|-------------|
| 0 | B | `write` | 3 | `class Stack:` … `self.items = []` |
| 1 | D | `userEdit` | 4 | + `    def push(self, item): self.items.append(item)` |
| 2 | E | `edit` | 5 | + `    def pop(self): return self.items.pop()` |

`tests/test_scenario22.py`: 1 revision (write C), 5 lines, surviving branch only.

### Final SURVIVING `scenario22.py` (7 lines, BYTE-IDENTICAL to on-disk ground truth)

```
class Stack:
    def __init__(self):
        self.items = []
    def push(self, item): self.items.append(item)
    def pop(self): return self.items.pop()
    def peek(self): return self.items[-1] if self.items else None
    def is_empty(self): return len(self.items) == 0
```

(`diff` against `scenarios/executed/s22-user-edits-conv-rewind/scenario22.py` is clean.)

### Final REWOUND `scenario22.py` (5 lines)

```
class Stack:
    def __init__(self):
        self.items = []
    def push(self, item): self.items.append(item)
    def pop(self): return self.items.pop()
```

### Default CLI output (`reconstruction_cli <jsonl>`) — exact

```
══ conversationDAG ══
A  prompt  #f3ad1ed6   (rewind point)
│
├─ branch rewound (rewound; tip #549149a1; rewind @ #f3ad1ed6)
│  D  user-edit  scenario22.py  #eea066db
│  E  edit       scenario22.py  #01UWTUSU
│
└─ branch surviving (surviving; tip #adb42316)
   F  user-edit  scenario22.py  #5df7ac59
   G  edit       scenario22.py  #01Chd9Wv

══ fileDAG ══
scenario22.py
  B  write      #01DQ5FKj
  D  user-edit  #eea066db
  E  edit       #01UWTUSU
  F  user-edit  #5df7ac59
  G  edit       #01Chd9Wv
test_scenario22.py
  C  write      #018QRZd1
```

### `--list-branches` — exact

```
surviving  tip #adb42316    scenario22.py, test_scenario22.py
rewound    tip #549149a1  rewind @ #f3ad1ed6    scenario22.py
```

### `--surviving --verbose` — revision headers + line positions

```
revision 0  @ …  (3 lines)
revision 1  @ …  (6 lines)
revision 2  @ …  (7 lines)
     1 | class Stack:
     …
     4 |     def push(self, item): self.items.append(item)
     …
     7 |     def is_empty(self): return len(self.items) == 0
```

> The rewound branch can be inspected with `--branch 549149a1 --verbose` (the `--branch` flag
> takes the BARE 8-char hex, NO leading `#`). It renders 3 revisions ending at the 5-line file.

---

## Load-bearing source paths (READ-ONLY orientation — do NOT edit)

- `src/reconstruction_branch.ts` — `findConversationBranches` / `findSurvivingHead` /
  `collectAbandonedHeads`: a conversation rewind yields TWO branches — one surviving (tip
  `adb42316`) and one rewound (tip `549149a1`, rewindPoint `f3ad1ed6`).
- `src/reconstruction_branches.ts` — `seedStaleEditBases` / `staleEditSeedFor` / `editBaseIsStale`:
  the S19 reseed. `staleEditSeedFor` returns `undefined` unless `event.kind === EventKind.edit`
  AND `editBaseIsStale` is true (`firstHunk.oldStart - 1 > reconstructedLineCount`). For S22 the
  only surviving Claude edit (G) anchors on content F already produced, so its base is aligned and
  the reseed never splices. (F is a user-edit, so it is not even a reseed candidate.) This
  dormancy is what engine test 2 locks.
- `src/reconstruction_replay.ts` — `userEditChangesContent`: records a `userEdit` revision iff the
  edited content differs from current. D and F each differ, so both are recorded.
- `src/reconstruction_user_edit.ts` — `userEditEventFrom`: builds the `UserEditEvent` from the
  JSONL `edited_text_file` attachment `snippet`. **No BackupReader needed** for S22 — the user-edit
  content (including the absorbed off-branch `push`/`pop` in F's snapshot) is self-contained in the
  JSONL. (S22 engine tests therefore call `reconstructBranches(loadRecords(S22_JSONL))` with NO
  reader arg, like S18/S21 — NOT like S20. Verified: the no-reader reconstruction is byte-identical.)
- `src/structures/vocabulary.ts` — `EventKind` members: `write` (`= "write"`), `edit` (`= "edit"`),
  `userEdit` (`= "user-edit"`).

---

## TDD note

Every test below locks CURRENT, VERIFIED-CORRECT behavior. The workflow per test: transcribe it,
run the suite, confirm it is GREEN. There is no RED phase. If a test is RED, the asserted literal
(changeId / line number / whitespace / count / enum member) is wrong — correct the literal against
live output; never touch `src/`. Each test asserts ONE behavior (one-behavior-per-test rule).

---

## Task 0 — Confirm baseline

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # MUST be 251 pass / 0 fail. If not, STOP — S21 work may be uncommitted/missing.
npx tsc --noEmit    # clean
```

Confirm the end-to-end ground truth still matches (the engine is unchanged, so it must):

```
P="scenarios/executed/s22-user-edits-conv-rewind/64ab0dde-e737-4ba6-9d31-64ead32f6ff4.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null      # surviving #adb42316 + rewound #549149a1
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null # 3 revisions, final 7 lines
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null \
  | sed -n '/revision 2/,/^### /p' | grep -E "^ +[0-9]+ \| " | sed -E 's/^ +[0-9]+ \| //') \
  scenarios/executed/s22-user-edits-conv-rewind/scenario22.py && echo BYTE-IDENTICAL
```

If `--surviving --verbose` does NOT show 3 revisions ending at the 7-line file, STOP and
re-diagnose (the plan assumes the current 251-green S19+S20+S21 engine).

---

## Task 1 — Fixture + engine characterization tests

### Task 1a — add the fixture constant

In `tests/fixtures.ts`, AFTER the `S21_JSONL` definition (currently the last constant, ~line 66),
append:

```typescript
export const S22_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s22-user-edits-conv-rewind/64ab0dde-e737-4ba6-9d31-64ead32f6ff4.jsonl";
```

> The canonical path points at the Desktop projects mirror (NOT the worktree), matching every other
> `S*_JSONL` constant. This exact path was confirmed to exist this session
> (`…/Desktop/claude code src/RevEng/plans/scenarios/executed/s22-user-edits-conv-rewind/64ab0dde-….jsonl`).

### Task 1b — create `tests/reconstruction_engine_s22.test.ts`

Transcribe verbatim. Imports and helpers copied from `reconstruction_engine_s21.test.ts` (the
no-reader template); NO `BackupReader` is constructed because S22 user-edits are self-contained in
the JSONL.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S22_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}

// The history whose target path ends with `suffix` (and, when excludeTest, is not the test file).
function historyEndingWith(histories: FileHistory[], suffix: string, excludeTest: boolean): FileHistory {
    return histories.find((history) => {
        const path = history.target.toString();
        const matches = path.endsWith(suffix);
        return excludeTest ? matches && !path.includes("test_") : matches;
    })!;
}

// A conversation-only rewind forks the history into TWO branches: the surviving branch (tip
// adb42316, no rewind point of its own) and the rewound branch (tip 549149a1) whose rewindPoint
// is the root prompt A (f3ad1ed6). This is the structural shape S22 introduces — a user edit on
// each side of a conv rewind.
test("test_S22_findConversationBranches_yields_surviving_and_rewound_forked_at_the_rewind_point", () => {
    // Load the real S22 transcript and enumerate its branches.
    const branches = findConversationBranches(loadRecords(S22_JSONL));
    // Exactly two branches.
    assert.equal(branches.length, 2);
    // The surviving branch has tip adb42316 and carries no rewind point.
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "adb42316");
    assert.equal(surviving.rewindPoint, undefined);
    // The rewound branch has tip 549149a1 and its rewindPoint is the root prompt f3ad1ed6.
    const rewound = branches.find((branch) => !branch.isSurviving)!;
    assert.equal(rewound.tip.toString().slice(0, 8), "549149a1");
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "f3ad1ed6");
});

// REGRESSION LOCK — the surviving scenario22.py is exactly THREE revisions (write, userEdit, edit).
// Because the conversation-only rewind left the off-branch push+pop on disk, the surviving
// user-edit F's snapshot ABSORBS them: rev1 jumps from 3 lines to 6 (init+push+pop+peek) in a
// single userEdit. The S19 reseed must NOT splice a synthetic revision (it stays inert: F is a
// user-edit, and G's base is aligned), and the final text is the exact 7-line on-disk ground truth.
test("test_S22_surviving_scenario_absorbs_the_offbranch_edits_in_three_revisions_with_no_seed", () => {
    // Reconstruct the surviving files (NO reader) and take scenario22.py (not the test file).
    const branched = reconstructBranches(loadRecords(S22_JSONL));
    const scenario = historyEndingWith(branched.surviving, "scenario22.py", true);
    // Exactly three revisions — a fired reseed would add a fourth (overwrite) revision.
    assert.equal(scenario.revisions.length, 3);
    // The kinds are write, userEdit, edit.
    assert.deepEqual(
        scenario.revisions.map((revision) => revision.kind),
        [EventKind.write, EventKind.userEdit, EventKind.edit],
    );
    // The surviving user-edit (rev1) absorbs the off-branch push+pop: it is six lines.
    assert.equal(scenario.revisions[1]!.lines.length, 6);
    // The final text is the exact 7-line ground truth.
    assert.equal(
        historyFinalText(scenario),
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item): self.items.append(item)\n    def pop(self): return self.items.pop()\n    def peek(self): return self.items[-1] if self.items else None\n    def is_empty(self): return len(self.items) == 0",
    );
});

// The rewound (abandoned) branch is reconstructed and scoped to scenario22.py. On THIS branch the
// user-edit D adds only ONE line (push), because the abandoned-branch disk then held just
// init+push — the same user-edit kind that adds three lines on the surviving branch. It ends at the
// 5-line init+push+pop file (D's push, then E's pop), never seeing peek or is_empty.
test("test_S22_rewound_branch_reconstructs_to_init_push_pop", () => {
    // Reconstruct the branch-aware history (NO reader).
    const branched = reconstructBranches(loadRecords(S22_JSONL));
    // There is exactly one rewound branch, with tip 549149a1 and rewindPoint f3ad1ed6.
    assert.equal(branched.rewound.length, 1);
    const rewound = branched.rewound[0]!;
    assert.equal(rewound.tip.toString().slice(0, 8), "549149a1");
    assert.equal(rewound.rewindPoint.toString().slice(0, 8), "f3ad1ed6");
    // Its scenario22.py is three revisions: write, userEdit (push), edit (pop).
    const scenario = historyEndingWith(rewound.histories, "scenario22.py", true);
    assert.equal(scenario.revisions.length, 3);
    assert.deepEqual(
        scenario.revisions.map((revision) => revision.kind),
        [EventKind.write, EventKind.userEdit, EventKind.edit],
    );
    // It ends at the 5-line init+push+pop file — no peek, no is_empty.
    assert.equal(
        historyFinalText(scenario),
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item): self.items.append(item)\n    def pop(self): return self.items.pop()",
    );
});

// Extraction surfaces exactly TWO user-edit events (D #eea066db on the abandoned branch, F
// #5df7ac59 on the surviving branch), each recorded because its content differs from current
// (the S15 content-aware guard). Two Claude edits (E, G) and two writes (B scenario22.py, C
// test_scenario22.py) sit among them.
test("test_S22_extractFileEvents_records_two_user_edits_among_two_edits_and_two_writes", () => {
    // Extract every file event from the S22 transcript.
    const events = extractFileEvents(loadRecords(S22_JSONL));
    // Exactly two user-edit events, in order, with the expected attachment-uuid changeIds.
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 2);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)),
        ["eea066db", "5df7ac59"],
    );
    // Exactly two Claude edits and two writes.
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 2);
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 2);
});
```

Run `npm test` → expect **255 green** (251 + 4). Confirm GREEN.

---

## Task 2 — CLI characterization tests

Create `tests/reconstruction_cli_s22.test.ts`. Transcribe verbatim. Style copied from
`reconstruction_cli_s21.test.ts`.

> CLI column whitespace is load-bearing and fragile. The strings below were captured live this
> session. Before finalizing, RE-RUN each CLI invocation and paste the exact lines; for the verbose
> test, lock by LINE POSITION (`7 |     def is_empty…`) — never by multi-line substrings (the
> `--verbose` render is line-numbered).

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S22_JSONL } from "./fixtures.ts";

// S22's conversationDAG FORKS at the rewind point: the root prompt A is the rewind point, the
// rewound branch holds D (user-edit push) + E (edit pop), and the surviving branch holds F
// (user-edit peek) + G (edit is_empty).
test("test_S22_default_conversationDAG_forks_into_rewound_and_surviving_at_the_rewind_point", () => {
    const out = runCli([S22_JSONL]);
    // The root prompt is marked as the rewind point.
    assert.ok(out.includes("A  prompt  #f3ad1ed6   (rewind point)"));
    // The rewound branch header and its two turns.
    assert.ok(out.includes("branch rewound (rewound; tip #549149a1; rewind @ #f3ad1ed6)"));
    assert.ok(out.includes("D  user-edit  scenario22.py  #eea066db"));
    assert.ok(out.includes("E  edit       scenario22.py  #01UWTUSU"));
    // The surviving branch header and its two turns.
    assert.ok(out.includes("branch surviving (surviving; tip #adb42316)"));
    assert.ok(out.includes("F  user-edit  scenario22.py  #5df7ac59"));
    assert.ok(out.includes("G  edit       scenario22.py  #01Chd9Wv"));
});

// The fileDAG lists scenario22.py's five change events across both branches (write, both
// user-edits, both Claude edits) with their changeIds, plus the test file's lone write.
test("test_S22_default_fileDAG_lists_both_branches_edits_and_the_test_write", () => {
    const out = runCli([S22_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write      #01DQ5FKj"));
    assert.ok(out.includes("D  user-edit  #eea066db"));
    assert.ok(out.includes("E  edit       #01UWTUSU"));
    assert.ok(out.includes("F  user-edit  #5df7ac59"));
    assert.ok(out.includes("G  edit       #01Chd9Wv"));
    assert.ok(out.includes("C  write      #018QRZd1"));
});

// --list-branches lists BOTH branches: the surviving branch (tip #adb42316, owning both files)
// and the rewound branch (tip #549149a1) with its rewind marker.
test("test_S22_list_branches_shows_surviving_and_rewound", () => {
    const out = runCli([S22_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("adb42316"));
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("549149a1"));
    assert.ok(out.includes("rewind @ #f3ad1ed6"));
});

// The surviving view KEEPS the off-branch push+pop (absorbed by F's snapshot) plus the surviving
// peek (F) and is_empty (G) — all four methods are present in the final surviving file.
test("test_S22_surviving_keeps_offbranch_push_pop_and_the_surviving_peek_and_is_empty", () => {
    const out = runCli([S22_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("    def push(self, item): self.items.append(item)"));
    assert.ok(out.includes("    def pop(self): return self.items.pop()"));
    assert.ok(out.includes("    def peek(self): return self.items[-1] if self.items else None"));
    assert.ok(out.includes("    def is_empty(self): return len(self.items) == 0"));
});

// POSITION LOCK — the surviving scenario22.py renders as three revisions; the user-edit (rev1)
// absorbs the off-branch edits to six lines, and the final (rev2) is seven lines with push on line
// 4 and is_empty on line 7 (proving nothing was dropped when F absorbed the off-branch push+pop).
test("test_S22_surviving_verbose_shows_three_revisions_and_locks_final_positions", () => {
    const out = runCli([S22_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 2"));
    assert.ok(out.includes("(6 lines)"));
    assert.ok(out.includes("(7 lines)"));
    assert.ok(out.includes("4 |     def push(self, item): self.items.append(item)"));
    assert.ok(out.includes("7 |     def is_empty(self): return len(self.items) == 0"));
});
```

Run `npm test` → expect **260 green** (255 + 5). Confirm GREEN.

---

## Task 3 — Docs

### 3a — `plans/roadmap.md` (flip line 23 `[ ] S22 ->` to `[x]`)

Replace the bare `[ ] S22 ->` line with (mirror the density/tone of the S18–S21 entries):

```
[x] S22 -> [x] TWO out-of-band USER edits across a CONVERSATION-only rewind, one on each branch. B writes `Stack`+`__init__`+`self.items = []`; on the abandoned branch the user inserts `push` (D) and Claude adds `pop` (E); a conversation-only Rewind:2 reverts the chat to the root prompt but leaves push+pop on disk; on the surviving branch the user inserts `peek` (F) and Claude adds `is_empty` (G). Because the rewind is conversation-only, the surviving user-edit F's `edited_text_file` snapshot ABSORBS the off-branch push+pop, so the surviving scenario22.py is three revisions (write→userEdit→edit) where rev1 jumps 3→6 lines, ending at the real 7-line on-disk file; the rewound branch reconstructs separately to the 5-line init+push+pop. FIRST scenario with a USER edit on EACH side of a conversation rewind, and the FIRST where a surviving user-edit materialises off-branch edits that survived the rewind. The same user-edit kind adds ONE line on the abandoned branch (push) but THREE on the surviving branch (push+pop+peek), driven by per-branch disk state. The S19 `seedStaleEditBases` reseed stays INERT (F is a user-edit, not a reseed candidate; G's base is aligned) — verified because the NO-reader reconstruction is byte-identical. NO engine change — locked by characterization tests (GREEN on arrival, like S10/S11/S16/S17/S18/S20/S21). 9 new tests (4 engine + 5 CLI); 260 green; S1–S21 byte-for-byte unchanged.
```

### 3b — `plans/implementation-notes-api-from-scenarios.md` (PREPEND a new entry at the top)

Use the standard header + seven subsections. Fill the chat title / JSONL path from the implementing
session. Template:

```markdown
## <ISO-8601 timestamp> — S22 reconstruction (two user edits across a conversation rewind) — COMPLETE; characterization/regression LOCK, no production-code change; 260 tests green
Chat title: <implementing session chat title>
Path to JSONL log: <implementing session JSONL path>

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s22/s22-reconstruction-plan.md (THE authoritative plan executed)
- plans/s19/… (the conv-rewind twin where the reseed is ACTIVE) and plans/s18/…, plans/s21/… (the linear user-edit twins)

### Design decisions
- NO `src/` change. The S19+S20+S21 engine already reconstructs S22 byte-identically WITH and WITHOUT a reader: S15's `userEditChangesContent` records both user edits (D/F), and the conv-only rewind leaves push+pop on disk so F's snapshot absorbs them; the S19 reseed stays inert (F is a user-edit; G's base is aligned).
- Added `S22_JSONL` fixture + `tests/reconstruction_engine_s22.test.ts` (4) + `tests/reconstruction_cli_s22.test.ts` (5).
- Key locks: the surviving 3-revision absorption test (rev1 = 6 lines, no seed), the rewound-branch reconstruction test (5-line init+push+pop), and the two-user-edits extraction test.

### Deviations
- <record any plan-vs-actual gaps, e.g. CLI whitespace re-captured; if none: "None.">

### Tradeoffs
- Engine tests use NO BackupReader (user-edit content, including the absorbed off-branch push/pop in F's snapshot, is self-contained in the JSONL attachment), unlike S20 which supplied an in-memory reader. Verified that the no-reader reconstruction is byte-identical, so the reseed is provably inert.

### Open questions
- None blocking.
```

### 3c — `plans/reconstruction-engine-design.md` (add one design note)

Append a concise note immediately AFTER the S21 note (the most recent scenario note, ends ~line 199):

```
- S22 (`s22-user-edits-conv-rewind`) locks the two-user-edit conversation-rewind case: a user edit
  lands on each side of a conv-only rewind (push on the abandoned branch, peek on the surviving one),
  each followed by a Claude edit. Because the rewind is conversation-only, the off-branch push+pop
  stay on disk, so the surviving user-edit's `edited_text_file` snapshot ABSORBS them — the surviving
  scenario22.py is three revisions where the userEdit jumps 3→6 lines. `seedStaleEditBases` stays
  inert (a user-edit is never a reseed candidate, and the lone surviving Claude edit anchors on the
  content the user edit already produced), the complement of S19 where the reseed is active because a
  Claude edit follows the rewind. The same user-edit kind adds one line on the abandoned branch but
  three on the surviving branch, driven by per-branch disk state. No code change; characterization only.
```

---

## Task 4 — Verify gates

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 260 pass / 0 fail
npx tsc --noEmit         # no errors
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
git diff src/            # MUST be empty — S22 touches no source
```

If `git diff src/` is non-empty, you edited source by mistake — revert it; S22 is a no-op lock.

---

## Commit (ONLY on user approval)

One scenario commit, message `Implemented S22 handling`. Stage EXACTLY these S22 files —
never `git add -A`:

```
git add tests/fixtures.ts \
        tests/reconstruction_engine_s22.test.ts \
        tests/reconstruction_cli_s22.test.ts \
        plans/roadmap.md \
        plans/implementation-notes-api-from-scenarios.md \
        plans/reconstruction-engine-design.md \
        plans/s22/s22-reconstruction-plan.md
git commit -m "Implemented S22 handling"
```

No `src/` files in the commit. (If S21 is still uncommitted in the working tree, commit it
first as its own `Implemented S21 handling` commit per per-scenario hygiene — do not co-mingle.)

---

## Task 5 — create handoff

After Task 4 is green, create a handoff with `/jot:handoff-prompt`. The title MUST contain `S22`
and `IMPLEMENTED`; state 260 green, no engine change, nothing committed. (Required so any downstream
S23 planning monitor recognizes completion.)

---

## Task list for the implementing agent

1. Task 0 — confirm `npm test` = 251 green, `tsc` clean, end-to-end probes match ground truth.
2. Task 1a — add `S22_JSONL` to `tests/fixtures.ts`.
3. Task 1b — create `tests/reconstruction_engine_s22.test.ts` (4 tests); `npm test` → 255 green.
4. Task 2 — create `tests/reconstruction_cli_s22.test.ts` (5 tests); re-capture CLI whitespace; `npm test` → 260 green.
5. Task 3 — docs: roadmap line 23 `[x]`, prepend impl-notes entry, add design-doc note after the S21 note.
6. Task 4 — verify gates: 260 green, `tsc` clean, filesize sweep, `git diff src/` EMPTY.
7. **create handoff** — `/jot:handoff-prompt`, title contains `S22` + `IMPLEMENTED`.
8. Commit ONLY on user approval, staging exactly the 7 S22 files (message `Implemented S22 handling`).
