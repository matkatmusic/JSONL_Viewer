# S18 reconstruction plan — `s18-user-edit-no-rewind`

**Type: characterization / regression LOCK. NO production-code change.** The engine already
reconstructs S18 byte-for-byte correctly (verified live this session — see *Verified ground truth*).
Implementing this plan = add one fixture constant + 9 characterization tests (4 engine + 5 CLI) +
docs. Every test is expected **GREEN on arrival**. If any test is RED, STOP and diagnose against the
ground truth below — do **not** loosen an assertion, and do **not** edit `src/`.

This is the same shape of slice as S10/S11/S16/S17 (already-correct engine, locked by tests).

---

## What S18 is (the one-paragraph model)

`s18-user-edit-no-rewind` is **strictly linear — no rewind, no fork**. Turn order:
1. **B** writes `scenario18.py` (`greet`) and **C** writes `tests/test_scenario18.py`.
2. The user edits `scenario18.py` **out-of-band** (an `edited_text_file` attachment, NOT a tool call),
   prepending `# user was here`. This content **differs** from what B wrote, so it is a real,
   recorded `user-edit` change (turn **D**).
3. **E** (Claude) edits `scenario18.py` to add `farewell`, anchored on the **user-edited** content.

Surviving (and only) working tree = `# user was here` + `greet` + `farewell`.

### Why S18 matters — it is the inversion of S15, and the first of its kind

S18 exercises the **positive branch** of the S15 content-aware user-edit guard for the first time
end-to-end on a *surviving* lineage:

| | **S15** | **S18 (this plan)** |
|---|---|---|
| Rewind? | Yes (conv-only → file-less Read branch) | **No — strictly linear** |
| User-edit lands on | the abandoned/rewound branch | **the surviving (only) branch** |
| Later Claude edit builds on the user edit? | No | **Yes — `farewell` anchors on `# user was here`** |
| `--surviving` shows the user edit? | **Excludes** it | **Includes** it |
| `--list-branches` | surviving + rewound | **surviving only** |
| fileDAG | `write` + `user-edit` | **`write` + `user-edit` + `edit`** |

S18 is **the first scenario whose fileDAG INCLUDES a `user-edit` kind on the surviving lineage**, and
the first where a Claude edit is reconstructed on top of a recorded external user edit. Every prior
scenario that had an `edited_text_file` either dropped it as an echo (S16) or stranded it on a
rewound branch (S15). **Do NOT copy the S16/S17 assertions** — those assert `!includes("user-edit")`
and reference a rewound branch; S18 inverts both.

---

## Verified ground truth (do not re-derive; assert exactly these)

Captured live via `npx tsx src/reconstruction_cli.ts <S18 JSONL> ...` and a throwaway engine probe,
plus a full JSONL scan. JSONL = 90 records, **zero sidechains, no rewind**.

**conversationDAG + fileDAG (bare `runCli([S18_JSONL])`):**
```
══ conversationDAG ══
A  prompt  #257a17e2
  B  write      scenario18.py       #01Gi9FvK
  C  write      test_scenario18.py  #01XgoZoq
  D  user-edit  scenario18.py       #8902b3f0
  E  edit       scenario18.py       #015Q6Dme
══ fileDAG ══
scenario18.py
  B  write      #01Gi9FvK
  D  user-edit  #8902b3f0
  E  edit       #015Q6Dme
test_scenario18.py
  C  write      #01XgoZoq
```
There is **no** `(rewind point)`, **no** `branch rewound`, **no** `branch surviving` line — the DAG is
linear, so the CLI prints turns directly with no branch headers.

**`--list-branches`:** `surviving  tip #503a45bb    scenario18.py, test_scenario18.py` — one line, no
rewound branch.

**`--surviving --verbose` / `--verbose` — `scenario18.py`, 3 revisions:**
```
revision 0  (2 lines)   def greet(name): / return "Hello, " + name
revision 1  (3 lines)   # user was here / def greet(name): / return "Hello, " + name
revision 2  (7 lines)   # user was here / def greet(name): / return "Hello, " + name / <blank> / <blank> / def farewell(name): / return "Goodbye, " + name
```
`tests/test_scenario18.py` has 1 revision (5 lines, the trunk `test_greet_world`).

**Engine probe (against `findConversationBranches` / `reconstructBranches` / `reconstructAll`):**
- `findConversationBranches` → exactly **one** branch; `isSurviving === true`; tip starts `503a45bb`;
  `rewindPoint === undefined`. **No** branch with `isSurviving === false`.
- `reconstructBranches(...).rewound.length === 0`.
- `reconstructAll(...)` → `scenario18.py` history has **3 revisions**; final text contains
  `# user was here`, `def greet(name):`, AND `def farewell(name):`. Revision index 1's final text
  contains `# user was here` and `def greet(name):` but **not** `def farewell(name):`.
- `extractFileEvents(...)` → exactly **one** `EventKind.userEdit` event, ordered **after** the two
  `write` events; the user-edit event's `changeId` starts `8902b3f0` and its content is
  `# user was here\ndef greet(name):\n    return "Hello, " + name`.

**User-edit attachment record:** uuid `8902b3f0-1d8f-4544-b016-3718febb68f5`; v2 of `scenario18.py`;
content differs from v1 (greet-only) → this is why the guard keeps it.

### Why the engine is already correct (read-only references — do NOT modify)
- **Guard keeps the user edit:** `userEditChangesContent` — `src/reconstruction_replay.ts:118-134`.
  Content differs from current → returns `true` → the `user-edit` revision is recorded. (S16's echo
  matched current → returned `false` → dropped. This is the inverted path.)
- **`farewell` anchors on the user-edited base:** `resolveContextLine` born-path —
  `src/reconstruction_replay_edit.ts:96-107`. E's context lines are in-bounds against the user-edit
  revision → `carryAt` preserves back-pointers; no rewind materialisation needed.
- **Linear head selection:** `findSurvivingHead` — `src/reconstruction_branch.ts:37-59`. One head, on
  the final chain → returns it directly; the rewind-handling lines never execute.
- **Extraction:** `userEditEventFrom` (`src/reconstruction_user_edit.ts`) +
  `extractFileEvents` (`src/reconstruction_extract.ts`) surface the one `user-edit` event;
  `collectAcceptedUserEditIds` (`src/reconstruction_branches.ts`) accepts it (kept by the guard).

---

## Baseline & dependency

S18 stacks on **S17 being fully implemented and present in the suite (215 green)** — confirmed this
session via `plans/implementation-notes-api-from-scenarios.md` top entry ("S17 … 215 tests green").

- **First action of the implementing agent:** run `npm test` and record the actual pre-S18 green
  count as `BASE` (expected **215**). Then:
  - After **Task 1** (4 engine tests): expect `BASE + 4` (= **219**).
  - After **Task 2** (5 CLI tests): expect `BASE + 9` (= **224**).
- If `BASE ≠ 215`, do not panic — the absolute target is `BASE + 9`. Note the discrepancy in the
  completion handoff. (Only reason it would differ: S17 not yet committed/landed in this worktree.)

---

## Files to create / edit

| File | Action |
|---|---|
| `tests/fixtures.ts` | **edit** — add `S18_JSONL` immediately after `S17_JSONL` (currently lines 53-54). |
| `tests/reconstruction_engine_s18.test.ts` | **create** — 4 engine tests (mirror `tests/reconstruction_engine_s15.test.ts` scaffolding; assertions per this plan). |
| `tests/reconstruction_cli_s18.test.ts` | **create** — 5 CLI tests (mirror `tests/reconstruction_cli_s15.test.ts` scaffolding; assertions per this plan). |
| `plans/implementation-notes-api-from-scenarios.md` | **edit** — prepend an S18 entry (top of file). |
| `plans/roadmap.md` | **edit** — flip line 19 `[ ] S18 ->` to `[x] S18 -> [x] ...`. |
| `src/**` | **DO NOT TOUCH.** |

---

## Task 1 — engine characterization tests (RED→GREEN, expected green on arrival)

### Task 1a — add the fixture constant

In `tests/fixtures.ts`, **after** the `S17_JSONL` declaration (lines 53-54), append:

```typescript
export const S18_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s18-user-edit-no-rewind/a2146944-adfe-408d-b9be-0de8cc1d4c72.jsonl";
```
*Why this exact path:* it mirrors the S16/S17 constants verbatim (absolute Desktop canonical path,
not the worktree symlink, not inline JSONL). The file is verified present (144 KB).

### Task 1b — create `tests/reconstruction_engine_s18.test.ts`

Transcribe verbatim. The imports and the three helpers are copied **unchanged** from
`tests/reconstruction_engine_s15.test.ts` (they are identical across all engine test files).

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S18_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}

// The history whose target path ends with `suffix`.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// S18 is strictly linear — no rewind, no fork. Branch enumeration must yield exactly one branch,
// the surviving one (tip 503a45bb), with NO rewound branch and NO rewind point. This is the
// structural inversion of S15 (which forks into a rewound user-edit branch + a surviving Read branch).
test("test_S18_findConversationBranches_yields_only_the_surviving_branch", () => {
    // Load the real S18 transcript and enumerate its branches.
    const branches = findConversationBranches(loadRecords(S18_JSONL));
    // Exactly one branch, and it is the surviving branch with tip 503a45bb.
    assert.equal(branches.length, 1);
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.ok(surviving !== undefined);
    assert.equal(surviving.tip.toString().slice(0, 8), "503a45bb");
    // No branch was rewound: none is non-surviving, and the surviving branch has no rewind point.
    assert.equal(branches.filter((branch) => !branch.isSurviving).length, 0);
    assert.equal(surviving.rewindPoint, undefined);
});

// With no rewind, branch-aware reconstruction yields zero rewound branches — the whole history lives
// on the surviving lineage. (S15's analogue yields exactly one rewound branch; S18 yields none.)
test("test_S18_reconstructBranches_yields_no_rewound_branch", () => {
    // Reconstruct the branch-aware history.
    const branched = reconstructBranches(loadRecords(S18_JSONL));
    // There are no rewound branches at all.
    assert.equal(branched.rewound.length, 0);
});

// The surviving scenario18.py keeps the user's out-of-band edit AND the later farewell edit that was
// anchored on top of it: three revisions (greet → +user comment → +farewell), final text holding all
// three markers. This is the headline: the user edit is recorded on the surviving lineage and the
// subsequent Claude edit builds on it.
test("test_S18_surviving_scenario18_keeps_user_edit_and_adds_farewell", () => {
    // Reconstruct the surviving files and take scenario18.py.
    const surviving = reconstructAll(loadRecords(S18_JSONL));
    const scenario = historyEndingWith(surviving, "scenario18.py");
    // Three revisions: greet write, user edit, farewell edit.
    assert.equal(scenario.revisions.length, 3);
    // The final text holds the user's comment, the original greet, and the added farewell.
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("# user was here"));
    assert.ok(finalText.includes("def greet(name):"));
    assert.ok(finalText.includes("def farewell(name):"));
});

// Extraction surfaces exactly one user-edit event (changeId 8902b3f0), ordered after the two trunk
// write events. This locks the fact that the external edit is RECORDED as a user-edit change (the
// content-aware guard kept it because it differs from what B wrote).
test("test_S18_extractFileEvents_records_one_user_edit_after_the_writes", () => {
    // Extract every file event from the S18 transcript.
    const events = extractFileEvents(loadRecords(S18_JSONL));
    // Exactly one user-edit event, identified by the attachment record's uuid 8902b3f0.
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 1);
    assert.equal(userEdits[0]!.changeId.toString().slice(0, 8), "8902b3f0");
    // It is ordered after both trunk write events (the user edited the file after it was written).
    const writeCount = events.filter((event) => event.kind === EventKind.write).length;
    const userEditIndex = events.findIndex((event) => event.kind === EventKind.userEdit);
    assert.equal(writeCount, 2);
    assert.ok(userEditIndex >= writeCount);
});
```

**Verify gate (Task 1):**
```
npm test                 # expect BASE + 4 (= 219); 0 fail
npx tsc --noEmit         # clean
python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py tests/reconstruction_engine_s18.test.ts   # no flag (<250 lines)
```
If `test_S18_findConversationBranches...` or `..._reconstructBranches...` is RED, the engine is
treating S18 as forked — STOP; that would contradict the verified linear ground truth, so diagnose,
do not adjust the assertion.

---

## Task 2 — CLI characterization tests (lock the rendered bytes)

### Task 2a — create `tests/reconstruction_cli_s18.test.ts`

Transcribe verbatim. Imports mirror `tests/reconstruction_cli_s15.test.ts`. Assertion style matches
the existing CLI tests: `out.includes(...)` substring checks against real CLI bytes (the fileDAG
column widths match S15 exactly because `user-edit` is the widest kind in both).

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S18_JSONL } from "./fixtures.ts";

// S18's conversationDAG is LINEAR: A prompt then B/C writes, the D user-edit, then the E farewell
// edit — no rewind point, no branch headers. The user-edit turn (D) is present on the trunk.
test("test_S18_default_conversationDAG_is_linear_with_a_user_edit_turn", () => {
    const out = runCli([S18_JSONL]);
    // The root prompt, and each trunk turn including the user edit and the later farewell edit.
    assert.ok(out.includes("A  prompt  #257a17e2"));
    assert.ok(out.includes("B  write      scenario18.py"));
    assert.ok(out.includes("D  user-edit  scenario18.py"));
    assert.ok(out.includes("E  edit       scenario18.py"));
    assert.ok(out.includes("#8902b3f0"));
    assert.ok(out.includes("#015Q6Dme"));
    // It is linear: no rewind point and no branch headers are rendered.
    assert.ok(!out.includes("(rewind point)"));
    assert.ok(!out.includes("branch rewound"));
    assert.ok(!out.includes("branch surviving"));
});

// The fileDAG shows scenario18.py as write → user-edit → edit (the persisted out-of-band edit sits
// between the two Claude file ops), and the test file's lone write. Unlike S16/S17, the `user-edit`
// kind IS present here — this is the S18 signature.
test("test_S18_default_fileDAG_shows_write_user_edit_edit", () => {
    const out = runCli([S18_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    // scenario18.py: trunk write B, the user edit D, then the farewell edit E.
    assert.ok(out.includes("B  write      #01Gi9FvK"));
    assert.ok(out.includes("D  user-edit  #8902b3f0"));
    assert.ok(out.includes("E  edit       #015Q6Dme"));
    // test_scenario18.py: the trunk write C.
    assert.ok(out.includes("C  write      #01XgoZoq"));
    // The user-edit kind is present on the surviving lineage (the inversion of S16/S17).
    assert.ok(out.includes("user-edit"));
});

// --list-branches lists only the surviving branch — there is no rewound branch to discover.
test("test_S18_list_branches_shows_only_the_surviving_branch", () => {
    const out = runCli([S18_JSONL, "--list-branches"]);
    // The surviving branch and its tip.
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("503a45bb"));
    // No rewound branch, no rewind marker.
    assert.ok(!out.includes("rewound"));
    assert.ok(!out.includes("rewind @"));
});

// The surviving view KEEPS the user edit and the farewell built on top of it — greet + the user's
// comment + farewell are all present (the inversion of S15, whose surviving view excludes the edit).
test("test_S18_surviving_keeps_user_edit_and_farewell", () => {
    const out = runCli([S18_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("# user was here"));
    assert.ok(out.includes("def greet(name):"));
    assert.ok(out.includes("def farewell(name):"));
});

// --verbose renders scenario18.py as three distinct revisions: the user edit is its own revision
// (greet + comment, no farewell yet) and the final revision adds farewell on top.
test("test_S18_verbose_shows_the_user_edit_as_its_own_revision", () => {
    const out = runCli([S18_JSONL, "--verbose"]);
    // All three revisions are rendered.
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 1"));
    assert.ok(out.includes("revision 2"));
    // The user's comment appears, and the farewell appears (added by the last revision).
    assert.ok(out.includes("# user was here"));
    assert.ok(out.includes("def farewell(name):"));
});
```

**Verify gate (Task 2):**
```
npm test                 # expect BASE + 9 (= 224); 0 fail
npx tsc --noEmit         # clean
python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py tests/reconstruction_cli_s18.test.ts   # no flag (<250 lines)
```
If a CLI assertion is RED on exact spacing, re-run the CLI (command below), copy the **exact** bytes
into the failing `includes(...)`, and confirm via `cat -e`. Do not weaken the assertion to a looser
substring than what is shown rendering.

---

## Task 3 — docs

### Task 3a — `plans/implementation-notes-api-from-scenarios.md`
Prepend (at the very top, above the S17 entry) an S18 entry in the same format as the S17 entry:
- Heading line: `## <timestamp> — S18 reconstruction (linear external user-edit with NO rewind, then a post-edit RE-EDIT on top) — COMPLETE as a characterization/regression lock; NO production-code change; 224 tests green`
- Note the headline: **first scenario whose fileDAG includes a `user-edit` on the surviving
  lineage; the inversion of S15** (user edit kept, not abandoned). Reference the three already-correct
  engine paths (`userEditChangesContent` `reconstruction_replay.ts:118-134`, `resolveContextLine`
  `reconstruction_replay_edit.ts:96-107`, `findSurvivingHead` linear case
  `reconstruction_branch.ts:37-59`).

### Task 3b — `plans/roadmap.md`
Flip line 19 from:
```
[ ] S18 ->
```
to (one line, mirroring the S16/S17 `[x]` style):
```
[x] S18 -> [x] linear external USER-EDIT with NO rewind, then a post-edit RE-EDIT on top (the inversion of S15). The user edits scenario18.py out-of-band (`# user was here`); because the content differs from what was written, the S15 content-aware guard KEEPS it as a recorded `user-edit` change on the SURVIVING lineage (S15 stranded its edit on a rewound branch; S18 has no rewind). Claude's `farewell` edit then anchors on the user-edited base, so the surviving tree is `# user was here` + greet + farewell. FIRST scenario whose fileDAG shows a `user-edit` kind on the surviving lineage and whose `--surviving` view KEEPS the user edit. NO engine change — locked by characterization tests (GREEN on arrival, like S10/S11/S16/S17). 9 new tests (4 engine + 5 CLI); 224 green; S1–S17 byte-for-byte unchanged.
```

---

## End-to-end check (run after Tasks 1–2; proves S18 correct and S15 still inverts)
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
P="scenarios/executed/s18-user-edit-no-rewind/a2146944-adfe-408d-b9be-0de8cc1d4c72.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                       # linear A/B/C/D-user-edit/E-edit; fileDAG write/user-edit/edit
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null       # surviving #503a45bb only (no rewound)
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null # KEEPS: # user was here + greet + farewell
# Regression — S15 must still EXCLUDE its user edit on the surviving branch (the inversion holds both ways):
S15P="scenarios/executed/s15-user-edit-rewind/<the S15 jsonl>"   # use tests/fixtures.ts S15_JSONL path
npx tsx src/reconstruction_cli.ts "$S15P" --surviving --verbose 2>/dev/null  # hello only, NO `# user edit`
```
(The debugger banner on stderr is stripped with `2>/dev/null`.)

---

## Stop conditions / rules
- **NO `src/` change.** If you believe one is needed, you have misread the ground truth — STOP and
  re-read *Why the engine is already correct*.
- **Commit only on user approval** (project rule: one commit per scenario). Stage **exactly** the S18
  artifacts (`tests/fixtures.ts`, the two new test files, the two docs). Do **not** `git add -A` —
  S16/S17 may be uncommitted in the tree; keep S18 a distinct commit. Suggested message on approval:
  `Implemented S18 handling`.
- **Create handoff** (mandatory final step): produce a completion handoff with `/jot:handoff-prompt`
  describing S18 as a characterization lock, no production change, fixture + 9 tests, final count 224,
  nothing committed.

## Task list for the implementing agent
1. Record `BASE` green count (`npm test`; expect 215).
2. Task 1a — add `S18_JSONL` to `tests/fixtures.ts`.
3. Task 1b — create `tests/reconstruction_engine_s18.test.ts` (4 tests); verify `BASE + 4` green, tsc clean, filesize ok.
4. Task 2a — create `tests/reconstruction_cli_s18.test.ts` (5 tests); verify `BASE + 9` green.
5. Task 3 — docs: prepend impl-notes S18 entry; flip roadmap line 19 to `[x]`.
6. Run the End-to-end check.
7. **Create handoff** via `/jot:handoff-prompt`.
8. Stop and report; commit only on user approval (stage exactly the S18 artifacts).
