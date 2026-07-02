# S21 (`s21-multiple-user-edits`) reconstruction plan

**Type: CHARACTERIZATION / REGRESSION LOCK. NO production-code (`src/`) change.**
The engine ALREADY reconstructs S21 byte-for-byte correctly (verified live against the
current S19+S20 engine). Implementing this plan = add 1 fixture line + 9 tests
(4 engine + 5 CLI) + 3 doc edits. Expected **242 → 251 green**, `npx tsc --noEmit` clean,
`git diff src/` stays EMPTY. Every test is GREEN on arrival (no RED phase), exactly like
S10/S11/S16/S17/S18/S20.

> If any test fails, the TEST is wrong (a changeId / line number / whitespace / revision
> count / enum member), NOT the engine. Fix the test to match live CLI/engine output —
> do **not** edit `src/`.

---

## What S21 is

`s21-multiple-user-edits` builds `scenario21.py` LINEARLY with NO rewind, alternating THREE
out-of-band USER edits with TWO Claude edits on a single surviving branch:

| Op | Kind | File | What it does | Result |
|----|------|------|--------------|--------|
| A | prompt | — | root user prompt `#e683be33` | — |
| B | write | scenario21.py | `class Counter` + `__init__` + `self.count = 0` | 3 lines |
| C | write | tests/test_scenario21.py | the test file | 5 lines |
| D | **user-edit** | scenario21.py | user inserts `    def increment(self): self.count += 1` | 4 lines |
| E | edit | scenario21.py | Claude adds `    def decrement(self): self.count -= 1` (anchored on D's line) | 5 lines |
| F | **user-edit** | scenario21.py | user inserts `    def reset(self): self.count = 0` | 6 lines |
| G | edit | scenario21.py | Claude adds `    def get_count(self): return self.count` (anchored on F's line) | 7 lines |
| H | **user-edit** | scenario21.py | user prepends `# Counter class` | 8 lines |

Then a Read + "Thanks" + Exit (conversation-only tail; no file ops). The surviving conversation
tip is `#49e4f32d`.

## Why S21 matters (the signature)

S21 is the **multi-user-edit extension of S18** (`s18-user-edit-no-rewind`). S18 had ONE user
edit on a linear no-rewind branch; S21 has THREE, INTERLEAVED with Claude edits. It is the FIRST
scenario where:

1. **Multiple `user-edit` changes coexist on one surviving lineage** (D, F, H) — the S15
   content-aware guard (`userEditChangesContent`) records each because each changes content.
2. **Each Claude edit is anchored on content a USER edit produced** — E's `old_string` is the
   `increment` line D inserted; G's `old_string` is the `reset` line F inserted. The engine threads
   each user-edit's content into the base that Claude's next edit splices onto.
3. **A user-edit PREPENDS** (H), shifting every line below it down by one — `def get_count` moves
   from line 7 to line 8 in the final render.

The **regression property** this locks: with NO rewind, every edit base is ALIGNED, so the S19
reseed (`seedStaleEditBases` / `editBaseIsStale`) stays **INERT** across all the interleaved
edits — no synthetic `overwrite`/seed revision is ever spliced. This is the same dormancy S20's
test 3 guards, but proven across MULTIPLE aligned user/Claude edits rather than one.

---

## Verified ground truth (captured live this session)

### changeIds and uuids (for the engine + CLI assertions)

| Op | CLI changeId | source | full id |
|----|-------------|--------|---------|
| A (prompt) | `#e683be33` | record uuid | `e683be33-…` |
| B (write) | `#01MAX6e1` | tool_use id | `toolu_01MAX6e1muSFx6phAmN6Y3Yo` |
| C (write test) | `#012CK8yY` | tool_use id | `toolu_012CK8yYoWKndPvGMnVEEfaE` |
| D (user-edit) | `#a4588e3c` | attachment uuid | `a4588e3c-4592-4a04-8ad1-ba8cd70361da` |
| E (edit) | `#012pCfid` | tool_use id | `toolu_012pCfid9K6JCGErtPLnAVVu` |
| F (user-edit) | `#ce4ae4a5` | attachment uuid | `ce4ae4a5-3d01-41f2-b241-95751465b58d` |
| G (edit) | `#015ayHM2` | tool_use id | `toolu_015ayHM2NLge8FpYEA3JBthP` |
| H (user-edit) | `#6fe6b088` | attachment uuid | `6fe6b088-9a28-4959-82d1-1c4b39740d70` |
| surviving tip | `#49e4f32d` | conversation leaf | — |

> The user-edit changeId IS the `edited_text_file` attachment record's uuid (D=`a4588e3c`,
> F=`ce4ae4a5`, H=`6fe6b088`). The write/edit changeId is the tool_use id with `toolu_` stripped
> (first 8 chars rendered). Claude edits in this transcript use `old_string`/`new_string`; their
> hunks are derived by the engine from the tool-RESULT `structuredPatch` — already handled, do not
> assert hunks directly.

### Branch enumeration

```
surviving  tip #49e4f32d    scenario21.py, test_scenario21.py
```

ONE branch, surviving, NO rewound branch, NO rewind point. (Confirmed: the transcript has no
`isRewind` / `isSidechain` / checkpoint-restore records — every `parentUuid` chains linearly.)

### Revision ladder for scenario21.py (6 revisions, all surviving)

| rev | op | kind | lines | new content |
|-----|----|------|-------|-------------|
| 0 | B | `write` | 3 | `class Counter:` … `self.count = 0` |
| 1 | D | `userEdit` | 4 | + `    def increment(self): self.count += 1` |
| 2 | E | `edit` | 5 | + `    def decrement(self): self.count -= 1` |
| 3 | F | `userEdit` | 6 | + `    def reset(self): self.count = 0` |
| 4 | G | `edit` | 7 | + `    def get_count(self): return self.count` |
| 5 | H | `userEdit` | 8 | prepend `# Counter class` |

`tests/test_scenario21.py`: 1 revision (write C), 5 lines.

### Final surviving `scenario21.py` (8 lines, BYTE-IDENTICAL to on-disk ground truth)

```
# Counter class
class Counter:
    def __init__(self):
        self.count = 0
    def increment(self): self.count += 1
    def decrement(self): self.count -= 1
    def reset(self): self.count = 0
    def get_count(self): return self.count
```

(`diff` against `scenarios/executed/s21-multiple-user-edits/scenario21.py` is clean.)

### Default CLI output (`reconstruction_cli <jsonl>`) — exact

```
══ conversationDAG ══
A  prompt  #e683be33
  B  write      scenario21.py       #01MAX6e1
  C  write      test_scenario21.py  #012CK8yY
  D  user-edit  scenario21.py       #a4588e3c
  E  edit       scenario21.py       #012pCfid
  F  user-edit  scenario21.py       #ce4ae4a5
  G  edit       scenario21.py       #015ayHM2
  H  user-edit  scenario21.py       #6fe6b088

══ fileDAG ══
scenario21.py
  B  write      #01MAX6e1
  D  user-edit  #a4588e3c
  E  edit       #012pCfid
  F  user-edit  #ce4ae4a5
  G  edit       #015ayHM2
  H  user-edit  #6fe6b088
test_scenario21.py
  C  write      #012CK8yY
```

### `--surviving --verbose` line positions (the prepend shifts everything down by 1)

```
revision 5  @ 2026-06-18T16:15:16.439Z  (8 lines)
     1 | # Counter class
     …
     8 |     def get_count(self): return self.count
```

---

## Load-bearing source paths (READ-ONLY orientation — do NOT edit)

- `src/reconstruction_branch.ts` — `findConversationBranches` / `findSurvivingHead` /
  `collectAbandonedHeads`: a no-rewind transcript yields exactly ONE surviving head, ZERO abandoned.
- `src/reconstruction_branches.ts` — `seedStaleEditBases` / `staleEditSeedFor` / `editBaseIsStale`:
  the S19 reseed. `editBaseIsStale` returns `firstHunk.oldStart - 1 > reconstructedLineCount`; for
  S21's E and G the oldStart is within the reconstructed range, so it is FALSE and the reseed never
  splices. This is the dormancy the regression tests lock.
- `src/reconstruction_replay.ts` — `userEditChangesContent`: records a `userEdit` revision iff the
  edited content differs from current. D, F, H each differ, so all three are recorded.
- `src/reconstruction_user_edit.ts` — `userEditEventFrom`: builds the `UserEditEvent` from the JSONL
  `edited_text_file` attachment `snippet` (via `stripLineNumberPrefixes`). **No BackupReader needed**
  for S21 — user-edit content is self-contained in the JSONL. (S21 engine tests therefore call
  `reconstructAll(loadRecords(S21_JSONL))` with NO reader arg, like S18 — NOT like S20.)
- `src/structures/vocabulary.ts` — `EventKind` members: `write`, `edit`, `userEdit` (`= "user-edit"`).

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
npm test            # MUST be 242 pass / 0 fail. If not, STOP — S19/S20 work may be missing.
npx tsc --noEmit    # clean
```

Confirm the end-to-end ground truth still matches (the engine is unchanged, so it must):

```
P="scenarios/executed/s21-multiple-user-edits/7a7ce498-01f6-469d-ba3f-a8ba0ee748cb.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null      # surviving tip #49e4f32d only
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null # 6 revisions, final 8 lines
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null \
  | sed -n '/revision 5/,/^### /p' | grep -E "^ +[0-9]+ \| " | sed -E 's/^ +[0-9]+ \| //') \
  scenarios/executed/s21-multiple-user-edits/scenario21.py && echo BYTE-IDENTICAL
```

If `--surviving --verbose` does NOT show 6 revisions ending at the 8-line file, STOP and re-diagnose
(the plan assumes the current 242-green S19+S20 engine).

---

## Task 1 — Fixture + engine characterization tests

### Task 1a — add the fixture constant

In `tests/fixtures.ts`, AFTER the `S20_JSONL` definition (currently the last constant, ~line 63),
append:

```typescript
export const S21_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s21-multiple-user-edits/7a7ce498-01f6-469d-ba3f-a8ba0ee748cb.jsonl";
```

> The canonical path points at the Desktop projects mirror (NOT the worktree), matching every other
> `S*_JSONL` constant. This exact path was confirmed to exist this session
> (`…/Desktop/claude code src/RevEng/plans/scenarios/executed/s21-multiple-user-edits/7a7ce498-….jsonl`).

### Task 1b — create `tests/reconstruction_engine_s21.test.ts`

Transcribe verbatim. Imports and helpers copied from `reconstruction_engine_s18.test.ts` (the
no-reader template); NO `BackupReader` is constructed because S21 user-edits are self-contained in
the JSONL.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S21_JSONL } from "./fixtures.ts";

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

// S21 is strictly linear — three user edits interleaved with two Claude edits, NO rewind. Branch
// enumeration must yield exactly one branch, the surviving one (tip 49e4f32d), with NO rewound
// branch and NO rewind point. (Same structural shape as S18; the multi-edit extension of it.)
test("test_S21_findConversationBranches_yields_only_the_surviving_branch", () => {
    // Load the real S21 transcript and enumerate its branches.
    const branches = findConversationBranches(loadRecords(S21_JSONL));
    // Exactly one branch, and it is the surviving branch with tip 49e4f32d.
    assert.equal(branches.length, 1);
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.ok(surviving !== undefined);
    assert.equal(surviving.tip.toString().slice(0, 8), "49e4f32d");
    // No branch was rewound: none is non-surviving, and the surviving branch has no rewind point.
    assert.equal(branches.filter((branch) => !branch.isSurviving).length, 0);
    assert.equal(surviving.rewindPoint, undefined);
});

// With no rewind, branch-aware reconstruction yields zero rewound branches — the whole history
// (all three user edits + both Claude edits) lives on the surviving lineage.
test("test_S21_reconstructBranches_yields_no_rewound_branch", () => {
    // Reconstruct the branch-aware history.
    const branched = reconstructBranches(loadRecords(S21_JSONL));
    // There are no rewound branches at all.
    assert.equal(branched.rewound.length, 0);
});

// REGRESSION LOCK — the surviving scenario21.py is exactly SIX revisions whose kinds alternate
// write -> userEdit -> edit -> userEdit -> edit -> userEdit. The S19 reseed must NOT splice any
// synthetic overwrite/seed revision (every edit base is aligned because there is no rewind), and
// the final text is the exact 8-line on-disk ground truth (the prepend on top of all four methods).
test("test_S21_surviving_scenario_has_six_revisions_with_alternating_kinds_and_no_seed", () => {
    // Reconstruct the surviving files and take scenario21.py (not the test file).
    const branched = reconstructBranches(loadRecords(S21_JSONL));
    const scenario = historyEndingWith(branched.surviving, "scenario21.py", true);
    // Exactly six revisions — a fired reseed would add a seventh (overwrite) revision.
    assert.equal(scenario.revisions.length, 6);
    // The kinds alternate write, userEdit, edit, userEdit, edit, userEdit.
    assert.deepEqual(
        scenario.revisions.map((revision) => revision.kind),
        [
            EventKind.write,
            EventKind.userEdit,
            EventKind.edit,
            EventKind.userEdit,
            EventKind.edit,
            EventKind.userEdit,
        ],
    );
    // The final text is the exact 8-line ground truth.
    assert.equal(
        historyFinalText(scenario),
        "# Counter class\nclass Counter:\n    def __init__(self):\n        self.count = 0\n    def increment(self): self.count += 1\n    def decrement(self): self.count -= 1\n    def reset(self): self.count = 0\n    def get_count(self): return self.count",
    );
});

// Extraction surfaces exactly THREE user-edit events (D #a4588e3c, F #ce4ae4a5, H #6fe6b088),
// each interleaved after a write/edit. This locks that all three external edits are RECORDED as
// user-edit changes (the content-aware guard kept each because each differs from current), and
// that two Claude edits (E, G) and two writes (B, C) sit among them.
test("test_S21_extractFileEvents_records_three_user_edits_among_two_edits_and_two_writes", () => {
    // Extract every file event from the S21 transcript.
    const events = extractFileEvents(loadRecords(S21_JSONL));
    // Exactly three user-edit events, in order, with the expected attachment-uuid changeIds.
    const userEdits = events.filter((event) => event.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 3);
    assert.deepEqual(
        userEdits.map((event) => event.changeId.toString().slice(0, 8)),
        ["a4588e3c", "ce4ae4a5", "6fe6b088"],
    );
    // Exactly two Claude edits and two writes (scenario21.py B + test_scenario21.py C).
    assert.equal(events.filter((event) => event.kind === EventKind.edit).length, 2);
    assert.equal(events.filter((event) => event.kind === EventKind.write).length, 2);
});
```

Run `npm test` → expect **246 green** (242 + 4). Confirm GREEN.

---

## Task 2 — CLI characterization tests

Create `tests/reconstruction_cli_s21.test.ts`. Transcribe verbatim. Style copied from
`reconstruction_cli_s18.test.ts` / `reconstruction_cli_s20.test.ts`.

> CLI column whitespace is load-bearing and fragile. The strings below were captured live this
> session. Before finalizing, RE-RUN each CLI invocation and paste the exact lines; for the verbose
> test, lock by LINE POSITION (`8 |     def get_count…`) — never by multi-line substrings (the
> `--verbose` render is line-numbered).

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S21_JSONL } from "./fixtures.ts";

// S21's conversationDAG is LINEAR: A prompt, B/C writes, then the three user edits (D, F, H)
// interleaved with the two Claude edits (E, G) — no rewind point, no branch headers.
test("test_S21_default_conversationDAG_is_linear_with_three_user_edit_turns", () => {
    const out = runCli([S21_JSONL]);
    // The root prompt and each trunk turn including all three user edits.
    assert.ok(out.includes("A  prompt  #e683be33"));
    assert.ok(out.includes("B  write      scenario21.py"));
    assert.ok(out.includes("D  user-edit  scenario21.py"));
    assert.ok(out.includes("E  edit       scenario21.py"));
    assert.ok(out.includes("F  user-edit  scenario21.py"));
    assert.ok(out.includes("G  edit       scenario21.py"));
    assert.ok(out.includes("H  user-edit  scenario21.py"));
    // It is linear: no rewind point and no branch headers are rendered.
    assert.ok(!out.includes("(rewind point)"));
    assert.ok(!out.includes("branch rewound"));
    assert.ok(!out.includes("branch surviving"));
});

// The fileDAG lists scenario21.py as write -> user-edit -> edit -> user-edit -> edit -> user-edit
// (all six turns with their changeIds), plus the test file's lone write.
test("test_S21_default_fileDAG_lists_all_six_turns_and_the_test_write", () => {
    const out = runCli([S21_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write      #01MAX6e1"));
    assert.ok(out.includes("D  user-edit  #a4588e3c"));
    assert.ok(out.includes("E  edit       #012pCfid"));
    assert.ok(out.includes("F  user-edit  #ce4ae4a5"));
    assert.ok(out.includes("G  edit       #015ayHM2"));
    assert.ok(out.includes("H  user-edit  #6fe6b088"));
    assert.ok(out.includes("C  write      #012CK8yY"));
});

// --list-branches lists only the surviving branch (tip #49e4f32d) — there is no rewound branch.
test("test_S21_list_branches_shows_only_the_surviving_branch", () => {
    const out = runCli([S21_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("49e4f32d"));
    // No rewound branch, no rewind marker.
    assert.ok(!out.includes("rewound"));
    assert.ok(!out.includes("rewind @"));
});

// The surviving view KEEPS all three user edits and both Claude edits — the prepended comment,
// every method (increment from D, decrement from E, reset from F, get_count from G) is present.
test("test_S21_surviving_keeps_all_methods_and_the_prepended_comment", () => {
    const out = runCli([S21_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("# Counter class"));
    assert.ok(out.includes("    def increment(self): self.count += 1"));
    assert.ok(out.includes("    def decrement(self): self.count -= 1"));
    assert.ok(out.includes("    def reset(self): self.count = 0"));
    assert.ok(out.includes("    def get_count(self): return self.count"));
});

// POSITION LOCK — scenario21.py renders as six revisions; the final is 8 lines with the prepended
// comment on line 1, which pushes def get_count down to line 8 (proving H's prepend shifted every
// line below it and nothing was dropped).
test("test_S21_surviving_verbose_shows_six_revisions_and_locks_final_positions", () => {
    const out = runCli([S21_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 5"));
    assert.ok(out.includes("(8 lines)"));
    assert.ok(out.includes("1 | # Counter class"));
    assert.ok(out.includes("8 |     def get_count(self): return self.count"));
});
```

Run `npm test` → expect **251 green** (246 + 5). Confirm GREEN.

---

## Task 3 — Docs

### 3a — `plans/roadmap.md` (flip line 22 `[ ] S21 ->` to `[x]`)

Replace the bare `[ ] S21 ->` line with (mirror the density/tone of the S18–S20 entries):

```
[x] S21 -> [x] MULTIPLE out-of-band USER edits interleaved with Claude edits on a single LINEAR no-rewind branch (the multi-edit extension of S18). B writes `Counter`+`__init__`; the user inserts `increment` (D); Claude adds `decrement` anchored on D's line (E); the user inserts `reset` (F); Claude adds `get_count` anchored on F's line (G); the user PREPENDS `# Counter class` (H). All three user edits change content, so the S15 content-aware guard records each as a `user-edit` revision; the surviving scenario21.py is six revisions whose kinds alternate write→userEdit→edit→userEdit→edit→userEdit, ending at the real 8-line on-disk file. FIRST scenario with THREE `user-edit` changes coexisting on one surviving lineage, the FIRST where each Claude edit is anchored on content a USER edit produced, and the FIRST with a PREPENDING user edit (H shifts `get_count` to line 8). Because there is no rewind every edit base is aligned, so the S19 `seedStaleEditBases` reseed stays INERT (no synthetic seed revision) — the regression lock proving dormancy across many interleaved edits. NO engine change — locked by characterization tests (GREEN on arrival, like S10/S11/S16/S17/S18/S20). 9 new tests (4 engine + 5 CLI); 251 green; S1–S20 byte-for-byte unchanged.
```

### 3b — `plans/implementation-notes-api-from-scenarios.md` (PREPEND a new entry at the top)

Use the standard header + seven subsections. Fill the chat title / JSONL path from the implementing
session. Template:

```markdown
## <ISO-8601 timestamp> — S21 reconstruction (multiple interleaved user edits, no rewind) — COMPLETE; characterization/regression LOCK, no production-code change; 251 tests green
Chat title: <implementing session chat title>
Path to JSONL log: <implementing session JSONL path>

### References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s21/s21-reconstruction-plan.md (THE authoritative plan executed)
- plans/s18/… and plans/s20/… (the no-rewind user-edit + reseed-dormancy twins)

### Design decisions
- NO `src/` change. The S19+S20 engine already reconstructs S21 byte-identically: S15's `userEditChangesContent` records all three user edits (D/F/H), and S19's `editBaseIsStale` is false for the aligned edits E/G so `seedStaleEditBases` never fires.
- Added `S21_JSONL` fixture + `tests/reconstruction_engine_s21.test.ts` (4) + `tests/reconstruction_cli_s21.test.ts` (5).
- Key lock: the 6-revision alternating-kind test + the "three user-edits among two edits and two writes" extraction test prove the multi-user-edit interleaving and the reseed dormancy.

### Deviations
- <record any plan-vs-actual gaps, e.g. CLI whitespace re-captured; if none: "None.">

### Tradeoffs
- Engine tests use NO BackupReader (user-edit content is self-contained in the JSONL attachment), unlike S20 which supplied an in-memory reader to keep the reseed path active.

### Open questions
- None blocking.
```

### 3c — `plans/reconstruction-engine-design.md` (add one design note)

Append a concise (3–5 sentence) note near the user-edit / reseed module descriptions:

```
- S21 (`s21-multiple-user-edits`) locks the multi-user-edit linear case: three out-of-band
  `edited_text_file` user edits interleaved with two Claude edits on one no-rewind branch.
  `userEditChangesContent` records each (all three change content); because no rewind advances the
  disk off-branch, every edit base is aligned and `editBaseIsStale` is false, so `seedStaleEditBases`
  stays inert. Confirms a Claude edit may anchor on content a prior user edit produced, and that a
  prepending user edit re-numbers later lines without loss. No code change; characterization only.
```

---

## Task 4 — Verify gates

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 251 pass / 0 fail
npx tsc --noEmit         # no errors
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
git diff src/            # MUST be empty — S21 touches no source
```

If `git diff src/` is non-empty, you edited source by mistake — revert it; S21 is a no-op lock.

---

## Commit (ONLY on user approval)

One scenario commit, message `Implemented S21 handling`. S19+S20 are already committed
(`4b25f21 implemented S19/20 handling` = HEAD), so the tree is clean apart from `plans/s21/`. Stage
EXACTLY these S21 files anyway (per-scenario commit hygiene) — never `git add -A`:

```
git add tests/fixtures.ts \
        tests/reconstruction_engine_s21.test.ts \
        tests/reconstruction_cli_s21.test.ts \
        plans/roadmap.md \
        plans/implementation-notes-api-from-scenarios.md \
        plans/reconstruction-engine-design.md \
        plans/s21/s21-reconstruction-plan.md
git commit -m "Implemented S21 handling"
```

No `src/` files in the commit.

---

## Task 5 — create handoff

After Task 4 is green, create a handoff with `/jot:handoff-prompt`. The title MUST contain `S21`
and `IMPLEMENTED`; state 251 green, no engine change, nothing committed. (Required so any downstream
S22 planning monitor recognizes completion.)

---

## Task list for the implementing agent

1. Task 0 — confirm `npm test` = 242 green, `tsc` clean, end-to-end probes match ground truth.
2. Task 1a — add `S21_JSONL` to `tests/fixtures.ts`.
3. Task 1b — create `tests/reconstruction_engine_s21.test.ts` (4 tests); `npm test` → 246 green.
4. Task 2 — create `tests/reconstruction_cli_s21.test.ts` (5 tests); re-capture CLI whitespace; `npm test` → 251 green.
5. Task 3 — docs: roadmap line 22 `[x]`, prepend impl-notes entry, add design-doc note.
6. Task 4 — verify gates: 251 green, `tsc` clean, filesize sweep, `git diff src/` EMPTY.
7. **create handoff** — `/jot:handoff-prompt`, title contains `S21` + `IMPLEMENTED`.
8. Commit ONLY on user approval, staging exactly the 7 S21 files (message `Implemented S21 handling`).
