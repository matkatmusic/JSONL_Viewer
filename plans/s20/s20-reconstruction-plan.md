# S20 reconstruction plan — `s20-user-edit-code-rewind`

## Context (why this work exists)

S20 is the **code-rewind twin of S19**. The reconstruction engine **already reconstructs S20 byte-for-byte correctly** on the current (S19-fixed) `master`-based tree — verified live this session (surviving `scenario20.py` is byte-identical to the on-disk ground truth). Therefore **S20 needs NO production-code change**: this is a **characterization + regression lock** (the same shape as S16/S17/S18), not a bug fix (S12/S19 were fixes).

The reason S20 is already correct, stated once so the implementer understands what the tests guard:

- In **S19** (conversation-only rewind) the user-edit lived on the **rewound** branch, so the surviving edit's reconstructed base was **too short** → `editBaseIsStale` was TRUE → `seedStaleEditBases` **fired** (a real fix was needed).
- In **S20** (code rewind) the rewind **reverts the file on disk**, and Claude Code re-writing the checkpoint surfaces as a **synthetic `edited_text_file` (user-edit F) on the SURVIVING branch**. The S15 content-aware guard (`userEditChangesContent`) records F as a revision, which **advances the surviving base to the full 3-line disk state** (`add` + `# user tweak`). The next edit (G = `multiply`) was computed by Claude Code against exactly that 3-line disk, so its hunk is **aligned** → `editBaseIsStale` is FALSE → the S19 reseed is **INERT**.

So S20's job is to **lock** two invariants for the future: (1) the engine reconstructs S20 correctly, and (2) the S19 `seedStaleEditBases` reseed stays **dormant** when a user-edit already seeds the surviving base. S20 is also the **first scenario with a user-edit on BOTH branches** (D on rewound = the real human edit; F on surviving = the code-rewind restore echo).

**Intended outcome:** 233 → **242** tests green (4 engine + 5 CLI), `tsc` clean, no file > 250 lines, no `src/` change.

---

## Ground-truth reference (verified live this session — use these exact values)

**Scenario script:** `scenarios/s20-user-edit-code-rewind.txt`
**JSONL (worktree):** `scenarios/executed/s20-user-edit-code-rewind/cff07216-e002-4839-9e95-42547049332e.jsonl`
**JSONL (canonical Desktop path for the fixture):** `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s20-user-edit-code-rewind/cff07216-e002-4839-9e95-42547049332e.jsonl`

**conversationDAG / fileDAG events** (changeIds are the short forms the CLI prints):

| Label | Event | Branch | changeId |
|---|---|---|---|
| A | prompt (rewind point) | fork | `#e76a23d3` |
| B | write `scenario20.py` | (pre-fork) | `#01LCjSdM` |
| C | write `tests/test_scenario20.py` | (pre-fork) | `#01VMPUqx` |
| D | user-edit `scenario20.py` (REAL human edit) | rewound | `#1f34678f` |
| E | edit `scenario20.py` (adds `subtract`) | rewound | `#01SnupgK` |
| F | user-edit `scenario20.py` (code-rewind restore echo) | surviving | `#ce4c11d8` |
| G | edit `scenario20.py` (adds `multiply`) | surviving | `#01WTdWiM` |

**Branch tips:** surviving `#cacc87c7` (no rewind point); rewound `#51227411`, rewind @ `#e76a23d3`.

**Surviving `scenario20.py` final (7 lines, byte-identical to on-disk):**
```
def add(a, b):
    return a + b
# user tweak


def multiply(a, b):
    return a * b
```
Note the `# user tweak` is on **line 3** (directly after `return a + b`, NO blank between — this is the inversion that distinguishes S20 from S19, where `subtract` sat on line 5). The two blank lines are lines 4–5, before `def multiply`.

**Surviving revision ladder (3 revisions, NO synthetic seed):**
- rev0 = B write — `add` (2 lines)
- rev1 = F user-edit — `add` + `# user tweak` (3 lines)
- rev2 = G edit — 7 lines above

**Backup blob ladder** (file id `29ba685652bbe1e0`): v1 add → v2 human tweak (→D) → v3 subtract (→E) → v4 code-rewind restore (→F) → v5 multiply (→G). The engine **never reads these for S20** (reseed inert), but the in-memory reader still supplies v2/v4 so the reseed code path is active and provably dormant.

**G's hunk** (on the tool-RESULT record): `oldStart=1, oldLines=3`, `originalFile="def add(a, b):\n    return a + b\n# user tweak\n"` — aligned, not stale.

---

## Load-bearing source paths these tests exercise (no edits — for the implementer's orientation)

- `reconstructAll` / `reconstructBranches` — `src/reconstruction_engine.ts` (engine entry; `reader` arg optional).
- `reconstructFileOver` — `src/reconstruction_branches.ts:41` (pipeline; `seedStaleEditBases` runs only when `reader` is defined — line ~56).
- `editBaseIsStale` / `staleEditSeedFor` / `seedStaleEditBases` — `src/reconstruction_branches.ts:64-104` (the S19 reseed; **must stay INERT** for S20).
- `userEditChangesContent` + the user-edit dispatch — `src/reconstruction_replay.ts:124-134` and `:168-173` (the S15 guard that records F).
- `runCli` — `src/reconstruction_cli.ts:147` (CLI test entry; builds the real on-disk `BackupReader` internally).

---

## TDD note for a characterization lock

S20 changes **no production code**, so strict red→green against a fix does not apply. Instead each test **locks current correct behavior**: write the test, run it, confirm it is **GREEN** against the current engine. The regression value is real — the engine test in Task 1 asserts the surviving file has exactly **3 revisions with kinds `[write, userEdit, edit]`**; if a future change made the S19 reseed mis-fire, a 4th `overwrite` revision would appear and that test would go RED. Each test body carries plain-English step comments per `~/.claude/guides/tdd.md`. Test names use `test_<behavior>`.

---

## Tasks (execute in order; STRICT one-behavior-per-test)

### Task 0 — Confirm baseline
Run `npm test` → must be **233 pass / 0 fail** before starting. Run the end-to-end probes in **How to Verify** to confirm the engine already produces the ground truth above. (If baseline ≠ 233, STOP — the S19 work may not be present.)

### Task 1 — Fixture + engine tests (4)
1a. **`tests/fixtures.ts`**: after the `S19_JSONL` block (ends line 60), add:
```ts
export const S20_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s20-user-edit-code-rewind/cff07216-e002-4839-9e95-42547049332e.jsonl";
```
1b. **Create `tests/reconstruction_engine_s20.test.ts`.** Copy the imports and the `finalTextOf` / `historyEndingWith` helpers **verbatim** from `tests/reconstruction_engine_s19.test.ts` (that file is the canonical template — do not re-derive import paths). Then use this S20 reader and these 4 tests:

```ts
// The pre-edit backup blobs keyed by the names the snapshots use. S20's surviving edit (G) is
// aligned with the 3-line user-tweak base, so the S19 reseed never reads these — they are supplied
// only to keep the reseed code path active so Task-1 test 3 can prove it stays dormant.
const S20_BACKUPS: Record<string, string> = {
    "29ba685652bbe1e0@v2": "def add(a, b):\n    return a + b\n# user tweak\n",
    "29ba685652bbe1e0@v4": "def add(a, b):\n    return a + b\n# user tweak\n",
};
const s20Reader: BackupReader = (name) => S20_BACKUPS[name.toString()] ?? "";

test("test_S20_surviving_file_keeps_user_tweak_and_ends_with_multiply", () => {
    // Behavior: the surviving scenario20.py reconstructs to the 7-line on-disk ground truth —
    // the code-rewind restore kept `# user tweak` on line 3 and G's multiply was applied after
    // the two blank lines. Steps:
    // reconstruct every file history for S20.
    const histories = reconstructAll(loadRecords(S20_JSONL), s20Reader);
    // find the scenario file (not the test file).
    const scenario = historyEndingWith(histories, "scenario20.py", true);
    // assert its final text is the exact 7-line ground truth.
    assert.equal(
        finalTextOf(scenario.revisions[scenario.revisions.length - 1]!),
        "def add(a, b):\n    return a + b\n# user tweak\n\n\ndef multiply(a, b):\n    return a * b",
    );
});

test("test_S20_findConversationBranches_yields_surviving_and_rewound", () => {
    // Behavior: the code rewind forks the conversation into a surviving and a rewound branch at A.
    // Steps:
    // enumerate the branches.
    const branches = findConversationBranches(loadRecords(S20_JSONL));
    // assert there are exactly two.
    assert.equal(branches.length, 2);
    const surviving = branches.find((b) => b.isSurviving)!;
    const rewound = branches.find((b) => !b.isSurviving)!;
    // the surviving branch's tip is #cacc87c7 and it has no rewind point.
    assert.equal(surviving.tip.toString().slice(0, 8), "cacc87c7");
    assert.equal(surviving.rewindPoint, undefined);
    // the rewound branch's tip is #51227411 and it was rewound at A (#e76a23d3).
    assert.equal(rewound.tip.toString().slice(0, 8), "51227411");
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "e76a23d3");
});

test("test_S20_surviving_file_has_three_revisions_and_no_synthetic_seed", () => {
    // Behavior: REGRESSION LOCK — the surviving scenario20.py is exactly three revisions
    // (B write, F user-edit, G edit). The S19 reseed must NOT splice a synthetic overwrite,
    // because F already advances the base to the 3-line disk state that G aligns with.
    // Steps:
    // reconstruct the branches with the reader present (reseed path active).
    const branched = reconstructBranches(loadRecords(S20_JSONL), s20Reader);
    const scenario = historyEndingWith(branched.surviving, "scenario20.py", true);
    // assert exactly three revisions.
    assert.equal(scenario.revisions.length, 3);
    // assert the kinds are write -> userEdit -> edit (NOT write -> overwrite -> edit, which is
    // what a fired reseed would produce).
    assert.equal(scenario.revisions[0]!.kind, EventKind.write);
    assert.equal(scenario.revisions[1]!.kind, EventKind.userEdit);
    assert.equal(scenario.revisions[2]!.kind, EventKind.edit);
    // assert the middle (user-edit) revision is the 3-line code-rewind restore state.
    assert.equal(
        finalTextOf(scenario.revisions[1]!),
        "def add(a, b):\n    return a + b\n# user tweak",
    );
});

test("test_S20_surviving_test_file_is_a_single_write_revision", () => {
    // Behavior: tests/test_scenario20.py is untouched after its initial write, so it has one revision.
    // Steps:
    // reconstruct the branches and find the test file on the surviving branch.
    const branched = reconstructBranches(loadRecords(S20_JSONL), s20Reader);
    const testFile = branched.surviving.find((h) => h.target.toString().endsWith("test_scenario20.py"))!;
    // assert exactly one revision, of kind write.
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
});
```
**Verify `EventKind.userEdit` is the correct enum member** by checking `src/structures/vocabulary.ts` (S19's middle revision used `EventKind.overwrite`; S20's is a user-edit). If the member is named differently, use the actual name.

**Gate:** run the engine test file → all 4 GREEN; `npx tsc --noEmit` clean.

### Task 2 — CLI tests (5)
Create **`tests/reconstruction_cli_s20.test.ts`**. Copy imports verbatim from `tests/reconstruction_cli_s19.test.ts` (swap `S19_JSONL`→`S20_JSONL`). The DAG/branch assertion strings below were captured from live CLI output this session — **re-run the CLI during implementation and paste the exact lines** (whitespace between columns is significant; the S19 CLI test #4 had to be rewritten for exactly this reason).

```ts
test("test_S20_default_conversationDAG_shows_user_edit_on_both_branches", () => {
    // Behavior: S20 is the first scenario with a user-edit on BOTH branches — D (real human edit)
    // on the rewound branch, F (code-rewind restore) on the surviving branch.
    const out = runCli([S20_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #e76a23d3   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #51227411; rewind @ #e76a23d3)"));
    assert.ok(out.includes("D  user-edit  scenario20.py  #1f34678f"));
    assert.ok(out.includes("E  edit       scenario20.py  #01SnupgK"));
    assert.ok(out.includes("branch surviving (surviving; tip #cacc87c7)"));
    assert.ok(out.includes("F  user-edit  scenario20.py  #ce4c11d8"));
    assert.ok(out.includes("G  edit       scenario20.py  #01WTdWiM"));
});

test("test_S20_default_fileDAG_lists_both_user_edits_and_the_test_write", () => {
    // Behavior: the fileDAG for scenario20.py lists B,D,E,F,G in order; test_scenario20.py lists C.
    const out = runCli([S20_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write      #01LCjSdM"));
    assert.ok(out.includes("D  user-edit  #1f34678f"));
    assert.ok(out.includes("E  edit       #01SnupgK"));
    assert.ok(out.includes("F  user-edit  #ce4c11d8"));
    assert.ok(out.includes("G  edit       #01WTdWiM"));
    assert.ok(out.includes("C  write      #01VMPUqx"));
});

test("test_S20_list_branches_shows_surviving_and_rewound_tips", () => {
    // Behavior: --list-branches names both tips and the rewound branch's rewind point.
    const out = runCli([S20_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #cacc87c7"));
    assert.ok(out.includes("rewound    tip #51227411  rewind @ #e76a23d3"));
});

test("test_S20_surviving_verbose_locks_user_tweak_on_line_three_and_multiply_after_blanks", () => {
    // Behavior: BYTE/POSITION LOCK — `# user tweak` is on line 3 (no blank before it, the S20-vs-S19
    // inversion), and `def multiply` is on line 6 (proving lines 4,5 are the two blank lines).
    // The render is line-numbered, so a dropped tweak or dropped blanks would shift these numbers.
    const out = runCli([S20_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("3 | # user tweak"));
    assert.ok(out.includes("6 | def multiply(a, b):"));
    assert.ok(out.includes("7 |     return a * b"));
});

test("test_S20_surviving_verbose_shows_three_revisions_for_scenario_file", () => {
    // Behavior: scenario20.py renders as exactly three revisions; the final is 7 lines.
    const out = runCli([S20_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 1"));
    assert.ok(out.includes("revision 2"));
    assert.ok(out.includes("(7 lines)"));
});
```
**Gate:** run the CLI test file → all 5 GREEN; full `npm test` → **242 pass / 0 fail**; `tsc` clean.

### Task 3 — Docs
- **`plans/roadmap.md` line 21:** flip `[ ] S20 ->` to `[x] S20 -> [x] …`. Describe: user-edit then **CODE** rewind then post-rewind re-edit; the code-rewind file-restore surfaces as a user-edit (F) on the **surviving** branch (first scenario with a user-edit on both branches); this keeps the surviving edit base aligned so the S19 `seedStaleEditBases` reseed stays **inert** (no production-code change); characterization/regression lock; 9 new tests; 242 green; S1–S19 byte-for-byte unchanged. Mirror the prose density of the existing S19 line.
- **`plans/implementation-notes-api-from-scenarios.md`:** prepend a new top entry following the S19 entry's structure (`## <timestamp> — S20 …`, Chat title, Path to JSONL log, `### References`, `### Design decisions`, `### Deviations`, `### Tradeoffs`, `### Open questions`). Reference this plan and the S19 plan (the conv-rewind twin).
- **`plans/reconstruction-engine-design.md`:** add ONE brief note (near the spec-39 / user-edit material) recording the new fact: a **code-rewind's file-restore is recorded as a user-edit on the surviving branch**, which advances the surviving base so post-rewind edits remain aligned (contrast: a conversation-only rewind leaves the user-edit off the surviving branch, requiring the S19 backup reseed). No new spec rule, just this observation.

### Task 4 — Verify gates
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 242 pass / 0 fail
npx tsc --noEmit    # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
Confirm `git diff src/` is **empty** (S20 must touch no source). The new test files should land well under 250 lines.

### Task 5 — create handoff
Write a handoff with **`/jot:handoff-prompt`**. Title must contain **`S20`** and **`IMPLEMENTED`** (so the downstream S21 planning monitor recognizes it). State: 242 green, **no engine change** (characterization/regression lock), nothing committed. Note that the S19 reseed was verified inert and S1–S19 are byte-for-byte unchanged.

---

## Commit (only on user approval)
One scenario commit, message `Implemented S20 handling`. Stage EXACTLY: `tests/fixtures.ts`, `tests/reconstruction_engine_s20.test.ts`, `tests/reconstruction_cli_s20.test.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/s20/s20-reconstruction-plan.md`. Do **not** `git add -A` (keep untracked handoff docs out). No `src/` files are staged.

## How to Verify (end-to-end, run before and after)
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
P="scenarios/executed/s20-user-edit-code-rewind/cff07216-e002-4839-9e95-42547049332e.jsonl"
# surviving = 7 lines, `# user tweak` on line 3, three revisions, final (7 lines):
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
# branches: surviving #cacc87c7 / rewound #51227411 rewind @ #e76a23d3:
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
# rewound branch (for sanity; not asserted): add + 2 blanks + subtract + # user tweak:
npx tsx src/reconstruction_cli.ts "$P" --branch 51227411 --verbose 2>/dev/null
# byte-identical to on-disk ground truth:
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null \
  | sed -n '/revision 2/,/^### /p' | grep -E "^ +[0-9]+ \| " | sed -E 's/^ +[0-9]+ \| //') \
  scenarios/executed/s20-user-edit-code-rewind/scenario20.py && echo BYTE-IDENTICAL
```
