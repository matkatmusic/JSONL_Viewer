# S23 reconstruction plan — `s23-user-edits-code-rewind`

**This is the FIRST scenario since S19 that requires a PRODUCTION-CODE change.** S20/S21/S22 were
characterization locks (engine already correct). S23 exposes a real reconstruction bug: the
`--surviving` view of `scenario23.py` drops the user's `size` method and emits a DUPLICATE `push`
line. The fix has been **prototyped and verified live this session**: with it applied the full suite
goes 260 → 269 pass / 0 fail, `tsc` clean, `src/reconstruction_branches.ts` lands at exactly 250
lines, and the surviving file reconstructs byte-for-byte to the on-disk ground truth (8 lines). This
plan reproduces that verified fix under strict red → green TDD.

Implement with the `/jot:implement` skill so an implementation-notes entry is logged.

---

## 1. Scenario shape (the "what")

Scenario file: `scenarios/s23-user-edits-code-rewind.txt`. Executed output:
`scenarios/executed/s23-user-edits-code-rewind/`. JSONL session id
`2bb895d4-b58b-483e-bc3a-d6a4505cbf08`.

S23 is the **CODE-rewind twin of S22** (`s22-user-edits-conv-rewind`), exactly as S20 is the
code-rewind twin of S19. Turn-by-turn (verified from the JSONL):

1. **B** writes `scenario23.py` = `class Stack:` + `__init__` setting `self.items = []` (3 lines);
   **C** writes `tests/test_scenario23.py`.
2. **D** (user, out-of-band) edits `scenario23.py`, inserting `def push…` after `self.items = []`
   (lands as an `edited_text_file` attachment, changeId `#9565e2ac`, on the abandoned branch).
3. **E** (Claude) edits `scenario23.py` to add `def pop…` (changeId `#017pMPEo`, abandoned branch).
4. User: `Good.`
5. **Rewind: 2, code** — a CODE rewind. The conversation rewinds to the root prompt
   (`#bbf6cd91`) AND the file on disk is reverted to the checkpoint. **Unlike S19/S22's
   conversation-only rewind, the code rewind reverts disk**, so `pop` is removed from disk but the
   user's `push` survives (the checkpoint kept it): disk after rewind = `init + push` (4 lines).
6. User: `Read scenario23.py and show me the contents.` Claude re-reads the file.
7. **(user, out-of-band)** edits `scenario23.py`, inserting `def size…` after `self.items = []`:
   disk becomes `init + size + push` (5 lines). **CRITICAL: this edit leaves NO file-change event in
   the JSONL** — it is NOT captured as an `edited_text_file` attachment. It surfaces only in (a) the
   later Read result and (b) the file-history backup `…@v5`.
8. **G** (Claude) edits `scenario23.py` to add `def is_empty…` (changeId `#01Gbp8oE`), computed
   against the real `init + size + push` disk.
9. User: `Thanks.` → exit.

The only surviving `edited_text_file` attachment is the **code-rewind restore echo** (changeId
`#a68b543d`, content `init + push`, the post-rewind disk) — labelled **F** in the views. The user's
`size` edit (step 7) is **absent from every event stream**.

**Branch topology** (verified — engine already correct, no change needed):
- **surviving** branch: tip `#f224cf19`, no rewind point. Carries the restore echo **F**
  (`#a68b543d`, user-edit) and **G** (`#01Gbp8oE`, edit `is_empty`).
- **rewound** branch: tip `#e62d73ad`, rewind point `#bbf6cd91`. Carries **D** (`#9565e2ac`,
  user-edit `push`) and **E** (`#017pMPEo`, edit `pop`).

**Relation to prior scenarios.** S20 (code-rewind twin of S19) was inert because its single
surviving Claude edit anchored on content the restore-echo user-edit already produced. S23 differs:
a SECOND user edit (`size`) advanced the disk between the restore echo and the Claude edit, but left
no event — so the surviving Claude edit (`is_empty`) was computed against a disk the on-branch events
do not reconstruct. That divergence is the entire bug. It is the S19 disease in a new dress: S19's
base was too SHORT (off-branch edits past a conv-only rewind); S23's base is the SAME length but a
WRONG line (an uncaptured user edit past a code rewind).

---

## 2. Ground truth — the authoritative final disk state

`scenarios/executed/s23-user-edits-code-rewind/scenario23.py` (the real on-disk file after the run)
is **8 lines** — identical to the file-history backup `11be2855feaa5668@v6`:

```
class Stack:
    def __init__(self):
        self.items = []
    def size(self): return len(self.items)
    def push(self, item): self.items.append(item)

    def is_empty(self):
        return len(self.items) == 0
```

The `--surviving --verbose` reconstruction of `scenario23.py` **must end at exactly this content** —
`size` on line 4, `push` on line 5 (NOT a duplicated `push`).

### Verified changeIds / tips (use these literally in test assertions)

| Node | kind | file | changeId (8-char) | branch |
|------|------|------|-------------------|--------|
| B | write | scenario23.py | `0131iJBP` | (pre-fork) |
| C | write | test_scenario23.py | `01SEvVm1` | (pre-fork) |
| D | user-edit | scenario23.py | `9565e2ac` | rewound |
| E | edit | scenario23.py | `017pMPEo` | rewound |
| F | user-edit | scenario23.py | `a68b543d` | surviving (restore echo) |
| G | edit | scenario23.py | `01Gbp8oE` | surviving (`is_empty`) |

| branch | tip | rewind point |
|--------|-----|--------------|
| surviving | `#f224cf19` | (none) |
| rewound | `#e62d73ad` | `#bbf6cd91` |

### File-history backups (present on disk at `~/.claude/file-history/2bb895d4-…/`)

| blob name | content | backupTime |
|-----------|---------|------------|
| `11be2855feaa5668@v2` | `init + push` (4 lines) | 16:15:51.918Z |
| `11be2855feaa5668@v3` | `init + push + pop` (5 lines, abandoned) | 16:16:09.934Z |
| `11be2855feaa5668@v4` | `init + push` (4 lines, restore echo) | 16:16:28.826Z |
| `11be2855feaa5668@v5` | `init + size + push` (5 lines — **the seed G needs**) | 16:16:38.093Z |
| `11be2855feaa5668@v6` | the 8-line final | 16:16:54.827Z |

The seed for G (`is_empty`, timestamp 16:16:49.316Z) is the at-or-before backup = **`…@v5`**
(16:16:38), the real `init + size + push` disk the edit was computed against.

---

## 3. The bug (precise mechanism — the "why")

`--surviving` selects the surviving branch's records and calls `reconstructFileOver`. On that branch
the `scenario23.py` events are **B (write `init`)**, **F (user-edit, restore echo = `init + push`)**,
and **G (edit `is_empty`)**. The user's `size` edit produced no event, so it is absent.

The engine reconstructs the base before G as:
- B write → `init` (3 lines)
- F user-edit → wholesale replace with the restore-echo snapshot `init + push` (4 lines)

So the believed base before G = `[class Stack:, __init__, self.items = [], def push…]` (4 lines).

G's edit hunk (from its `toolUseResult.structuredPatch`) is:

```
HUNK oldStart=3 oldLines=3 newStart=3 newLines=6
        self.items = []                              (context, real line 3)
    def size(self): return len(self.items)           (context, real line 4)
    def push(self, item): self.items.append(item)    (context, real line 5)
  +
  +    def is_empty(self):
  +        return len(self.items) == 0
```

`oldStart=3` and the context lines `self.items` / `size` / `push` were computed by Claude Code
against the **real v5 disk (`init + size + push`, 5 lines)**. Replayed against the engine's 4-line
base in `insertHunkAdditions` (`src/reconstruction_replay_edit.ts:113`):

- `slice(0, oldStart-1)` = `slice(0, 2)` carries `class Stack:` + `__init__`. `workingIndex = 2`.
- context `self.items` → `base[2]` = `self.items` → carried. `workingIndex = 3`.
- context `def size…` → `base[3]` = **`def push…`** (mismatch — but `resolveContextLine` carries by
  INDEX without checking text) → carries `push`, mislabelled. `workingIndex = 4`.
- context `def push…` → `base[4]` = `undefined` → `resolveContextLine` takes the **born path**,
  materialising a SECOND `def push…` genesis line (the DUPLICATE). `workingIndex = 5`.
- `+` blank, `+ is_empty`, `+ return…` → born.

Result: `class Stack: / __init__ / self.items / push / push / (blank) / is_empty / return` — 8 lines
with a duplicated `push` and NO `size`. That is the observed buggy output.

**Why the existing S19 reseed does not catch it.** `editBaseIsStale`
(`src/reconstruction_branches.ts:64`) currently tests only `firstHunk.oldStart - 1 >
baseLength` — a base-too-SHORT (length-overflow) check. Here `oldStart-1 = 2` and `baseLength = 4`,
so the check is false and `seedStaleEditBases` stays inert. The staleness in S23 is a **content
mismatch within bounds** (the base is the right length but the wrong lines), which the
length-only check cannot see.

---

## 4. The fix (verified — produces 269 green + correct 8-line output)

**ONE source file changes:** `src/reconstruction_branches.ts` (232 → exactly 250 lines — at the cap;
keep the comment EXACTLY as below, do not expand it). Generalise `editBaseIsStale` from a
length-overflow check to a **context-mismatch walk**, and add one small helper. The existing
`staleEditSeedFor` / `seedStaleEditBases` / `backupSeedWriteFor` pipeline is unchanged — once
`editBaseIsStale` returns true for G, it already seeds the v5 backup as a synthetic `overwrite`
before G.

**Replace** the current `editBaseIsStale` (the comment block on lines 60–63 plus the function on
lines 64–70) with this helper + generalised function:

```ts
// The reconstructed base text (each line's latest value) the events before an edit produce.
function reconstructedBaseText(priorEvents: FileEvent[]): string[] {
    return lastLinesOf(replayEvents(priorEvents)).map(
        (entry) => entry.values[entry.values.length - 1]!.line,
    );
}

// Whether an edit's first hunk references base content the events before it did NOT reconstruct: each
// context/removed line must equal the base line at its position; a mismatch — or a position past the
// base — means the hunk splices onto wrong lines, so the base is reseeded from the backup. Generalises
// s19 (base too SHORT) to s23 (a user edit absorbed only into the post-code-rewind backup; same length).
function editBaseIsStale(event: EditEvent, priorEvents: FileEvent[]): boolean {
    const firstHunk = event.hunks[0];
    if (firstHunk === undefined) {
        return false;
    }
    const base = reconstructedBaseText(priorEvents);
    let index = firstHunk.oldStart - 1;
    for (const line of firstHunk.lines) {
        if (line.startsWith("+")) {
            continue;
        }
        if (index >= base.length || base[index] !== line.slice(1)) {
            return true;
        }
        index += 1;
    }
    return false;
}
```

**No import changes.** `lastLinesOf`, `replayEvents`, `EditEvent`, `FileEvent` are already imported.

**Why this is safe (no regression — verified 260 baseline held).** For an ALIGNED edit, every
context/removed line of the hunk equals the corresponding base line (that is what "aligned" means),
so the loop never returns true and the lineage is returned unchanged — every pre-S23 scenario is
byte-for-byte unaffected. The check is strictly MORE conservative than before only where the base
genuinely diverges:
- S19 (base too short): the first context line indexes past the base → `index >= base.length` →
  true. The length-overflow case is now a special case of the mismatch walk, so S19 still seeds.
- S23 (base wrong line, same length): the `size` context line ≠ the base's `push` at that index →
  `base[index] !== line.slice(1)` → true. Now detected.

**Resulting surviving reconstruction of `scenario23.py` (4 revisions):**
- revision 0 `write` `#0131iJBP` — `init` (3 lines) — B's real write.
- revision 1 `user-edit` `#a68b543d` — `init + push` (4 lines) — F, the code-rewind restore echo.
- revision 2 `overwrite` `#11be2855` — `init + size + push` (5 lines) — the synthetic v5 backup seed
  (changeId = backup blob name; absent from the graphs, spec 40).
- revision 3 `edit` `#01Gbp8oE` — the 8-line final — G's `is_empty` edit, now spliced onto v5.

---

## 5. TDD task order (strict red → green)

Baseline before starting: **260 pass / 0 fail** (S22 is uncommitted in this worktree — do NOT touch
its files; do NOT `git checkout`/`git restore` any shared file, see §7).

### Task 1 — register the S23 fixture
In `tests/fixtures.ts`, immediately after the `S22_JSONL` constant (currently the last constant in
the file), add:

```ts

export const S23_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s23-user-edits-code-rewind/2bb895d4-b58b-483e-bc3a-d6a4505cbf08.jsonl";
```
(The Desktop path is verified to exist, 186 KB. Fixtures use the canonical Desktop path; the
file-history reader keys off the session id, not the JSONL location — the blobs live at
`~/.claude/file-history/2bb895d4-b58b-483e-bc3a-d6a4505cbf08/`.)

### Task 2 — engine RED test for the duplicate-push regression
Create `tests/reconstruction_engine_s23.test.ts`. Copy the **S19** engine test
(`tests/reconstruction_engine_s19.test.ts`) verbatim as scaffolding — it is the closest precedent
(real fix + in-memory `BackupReader`). Keep its `finalTextOf` and `historyEndingWith` helpers
unchanged. Replace the reader and tests. The in-memory reader needs only the v5 blob (the seed G
reads); v4 is included for completeness:

```ts
const S23_BACKUPS: Record<string, string> = {
    "11be2855feaa5668@v4": "class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item): self.items.append(item)\n",
    "11be2855feaa5668@v5":
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def size(self): return len(self.items)\n    def push(self, item): self.items.append(item)\n",
};
const s23Reader: BackupReader = (name) => S23_BACKUPS[name.toString()] ?? "";
```

Write **this test first and run it — it MUST fail (RED)**, because the unfixed engine produces the
duplicated-`push` / dropped-`size` 8 lines:

```ts
test("test_S23_surviving_scenario_file_absorbs_uncaptured_user_size_edit", () => {
    // The surviving scenario23.py must reconstruct to the on-disk ground truth: G's is_empty edit
    // applied to the v5 disk base (init + size + push), with size on line 4 and a single push on line 5.
    const histories = reconstructAll(loadRecords(S23_JSONL), s23Reader);
    const scenario = historyEndingWith(histories, "scenario23.py", true);
    assert.equal(
        finalTextOf(scenario.revisions[scenario.revisions.length - 1]!),
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def size(self): return len(self.items)\n    def push(self, item): self.items.append(item)\n\n    def is_empty(self):\n        return len(self.items) == 0",
    );
});
```

### Task 3 — apply the fix (GREEN)
Apply §4. Run the engine test → it passes. Run `npm test` → **260 + new** green; run
`npx tsc --noEmit` → clean. Confirm `src/reconstruction_branches.ts` is **≤ 250 lines** (it lands at
exactly 250 with the comment as written — do not expand the comment).

### Task 4 — remaining engine locks (3 more, total 4 engine tests)
Add to `tests/reconstruction_engine_s23.test.ts`:

```ts
test("test_S23_findConversationBranches_yields_surviving_and_rewound", () => {
    const branches = findConversationBranches(loadRecords(S23_JSONL));
    assert.equal(branches.length, 2);
    const surviving = branches.find((b) => b.isSurviving)!;
    const rewound = branches.find((b) => !b.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "f224cf19");
    assert.equal(surviving.rewindPoint, undefined);
    assert.equal(rewound.tip.toString().slice(0, 8), "e62d73ad");
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "bbf6cd91");
});

test("test_S23_surviving_scenario_file_has_seeded_v5_base_revision", () => {
    // Four revisions: B's write, F's restore-echo user-edit, the synthetic v5 seed (overwrite), G's edit.
    const branched = reconstructBranches(loadRecords(S23_JSONL), s23Reader);
    const scenario = historyEndingWith(branched.surviving, "scenario23.py", true);
    assert.equal(scenario.revisions.length, 4);
    assert.equal(scenario.revisions[0]!.kind, EventKind.write);
    assert.equal(scenario.revisions[1]!.kind, EventKind.userEdit);
    assert.equal(scenario.revisions[2]!.kind, EventKind.overwrite);
    assert.equal(scenario.revisions[3]!.kind, EventKind.edit);
    // The seeded revision is exactly the v5 on-disk content (init + size + push).
    assert.equal(
        finalTextOf(scenario.revisions[2]!),
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def size(self): return len(self.items)\n    def push(self, item): self.items.append(item)",
    );
});

test("test_S23_rewound_scenario_file_is_init_push_pop_three_revisions", () => {
    // The rewound branch is unaffected by the fix: D (push) then E (pop), ending at 5 lines.
    const branched = reconstructBranches(loadRecords(S23_JSONL), s23Reader);
    const scenario = historyEndingWith(branched.rewound, "scenario23.py", true);
    assert.equal(scenario.revisions.length, 3);
    assert.equal(
        finalTextOf(scenario.revisions[scenario.revisions.length - 1]!),
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item): self.items.append(item)\n    def pop(self): return self.items.pop()",
    );
});
```
(If `reconstructBranches`'s `branched.rewound` shape differs from the S19 test's `branched.surviving`
access, follow the same `FileHistory[]` access pattern — both are `FileHistory[]`.)

### Task 5 — CLI byte-lock tests (5 tests)
Create `tests/reconstruction_cli_s23.test.ts`. Mirror `tests/reconstruction_cli_s22.test.ts`
(imports: `test`, `assert/strict`, `runCli` from `../src/reconstruction_cli.ts`, `S23_JSONL`). These
use the **real on-disk file-history reader** (built inside `runCli` from the session id), so no
in-memory backups are needed — the v5 blob is present on disk.

```ts
test("test_S23_default_conversationDAG_shows_both_user_edits_and_edits", () => {
    const out = runCli([S23_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #bbf6cd91   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #e62d73ad; rewind @ #bbf6cd91)"));
    assert.ok(out.includes("D  user-edit  scenario23.py  #9565e2ac"));
    assert.ok(out.includes("E  edit       scenario23.py  #017pMPEo"));
    assert.ok(out.includes("branch surviving (surviving; tip #f224cf19)"));
    assert.ok(out.includes("F  user-edit  scenario23.py  #a68b543d"));
    assert.ok(out.includes("G  edit       scenario23.py  #01Gbp8oE"));
});

test("test_S23_default_fileDAG_lists_all_scenario_turns_and_the_test_write", () => {
    const out = runCli([S23_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write      #0131iJBP"));
    assert.ok(out.includes("D  user-edit  #9565e2ac"));
    assert.ok(out.includes("E  edit       #017pMPEo"));
    assert.ok(out.includes("F  user-edit  #a68b543d"));
    assert.ok(out.includes("G  edit       #01Gbp8oE"));
    assert.ok(out.includes("C  write      #01SEvVm1"));
});

test("test_S23_list_branches_shows_surviving_and_rewound_tips", () => {
    const out = runCli([S23_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #f224cf19"));
    assert.ok(out.includes("rewound    tip #e62d73ad  rewind @ #bbf6cd91"));
});

test("test_S23_surviving_verbose_reconstructs_eight_line_file_with_size_then_push", () => {
    // The regression byte-lock: size on line 4, a SINGLE push on line 5 (no duplicate), is_empty after.
    const out = runCli([S23_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("    def size(self): return len(self.items)\n     5 |     def push(self, item): self.items.append(item)"));
    assert.ok(out.includes("    def push(self, item): self.items.append(item)\n     6 | \n     7 |     def is_empty(self):"));
    assert.ok(!out.includes("self.items.append(item)\n     5 |     def push(self, item): self.items.append(item)"));
});

test("test_S23_surviving_verbose_shows_four_revisions_with_seeded_base", () => {
    const out = runCli([S23_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 1"));
    assert.ok(out.includes("revision 2"));
    assert.ok(out.includes("revision 3"));
    // revision 2 is the 5-line v5 seed; revision 3 is the 8-line final.
    assert.ok(out.includes("(5 lines)"));
    assert.ok(out.includes("(8 lines)"));
});
```
Run each new file; with the fix applied all 5 pass. (Test 4 is the CLI counterpart of the RED
regression — it fails on the unfixed engine, which renders a duplicated `push` on lines 4–5.) Before
committing the exact line-numbered substrings in test 4, **re-capture the live `--surviving
--verbose` output** and paste the exact bytes (the leading-space width of the `N | ` gutter must
match verbatim).

### Task 6 — docs
1. `plans/roadmap.md` line 24: change `[ ] S23 ->` to `[x] S23 -> [x] …` with a one-paragraph
   summary in the S22 style. State: code-rewind twin of S22; a user `size` edit advanced the disk
   between the code-rewind restore echo and the surviving Claude `is_empty` edit but left NO event,
   so the surviving edit was computed against a disk the on-branch events don't reconstruct.
   **Engine change required** (generalises `editBaseIsStale` from a length-overflow check to a
   context-mismatch walk, so the existing `seedStaleEditBases` reseeds the v5 backup); 9 new tests
   (4 engine + 5 CLI); 269 green; S1–S22 byte-for-byte unchanged.
2. `plans/implementation-notes-api-from-scenarios.md`: prepend a dated S23 entry (header with green
   count, chat title, JSONL path; References to this plan + the S22 IMPLEMENTED handoff
   `plans/handoff-api-from-scenarios-20260623-2232.md` + `plans/s19/` as the reseed precedent; Design
   decisions / Deviations / Tradeoffs / Open questions). `/jot:implement` maintains this file
   automatically.
3. `plans/reconstruction-engine-design.md`: after the S22 note (ends ~line 208), add one sentence:
   S23 (`s23-user-edits-code-rewind`) is the code-rewind twin of S22, but the user's second edit
   (`size`) left no event (only the file-history backup), so `editBaseIsStale` was generalised from
   `oldStart-1 > baseLength` to a per-line context-match against the reconstructed base — the same
   `seedStaleEditBases` reseed then splices the at-or-before `…@v5` backup before the surviving
   `is_empty` edit. (Update the spec-39 description around line 180 if it states the staleness check
   is length-only.)

### Task 7 — verify gates (all must pass)
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 269 pass / 0 fail (260 baseline + 9 new)
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
# (src/reconstruction_branches.ts must report 250 — at the cap, not over)
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s23-user-edits-code-rewind/2bb895d4-b58b-483e-bc3a-d6a4505cbf08.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null   # scenario23.py ends 8 lines, size@4 push@5
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null         # surviving #f224cf19 / rewound #e62d73ad
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null \
  | sed -n '/scenario23.py/,/test_scenario23/p' | grep -E "^ +[0-9]+ \| " | tail -8 | sed -E 's/^ +[0-9]+ \| //') \
  scenarios/executed/s23-user-edits-code-rewind/scenario23.py && echo BYTE-IDENTICAL
```

### Task 8 — create handoff
Write a completion handoff with `/jot:handoff-prompt` (title must contain `S23` and `IMPLEMENTED`).
State: 269 green, engine change made (generalised `editBaseIsStale`), nothing committed; commit
guidance below.

---

## 6. Expected final CLI output (reference — verified this session, fix applied)

`--surviving --verbose` for `scenario23.py` (4 revisions):
```
revision 0  @ 2026-06-18T16:15:41.001Z  (3 lines)   # init
revision 1  @ 2026-06-18T16:16:27.452Z  (4 lines)   # F restore echo: init + push
revision 2  @ 2026-06-18T16:16:38.093Z  (5 lines)   # v5 seed: init + size + push
revision 3  @ 2026-06-18T16:16:49.316Z  (8 lines)   # + is_empty (the on-disk ground truth)
```
`test_scenario23.py`: 1 revision (5 lines). `--branch e62d73ad --verbose` (rewound): 3 revisions
(3 → 4 `+push` → 5 `+pop`). The conversationDAG, fileDAG, and `--list-branches` outputs are
**unchanged by the fix** (the synthetic seed carries the backup blob name as its changeId and never
enters the graphs — spec 40).

---

## 7. Hazards & commit guidance

- **Do NOT `git checkout` / `git restore` any shared file** (`tests/fixtures.ts`, `plans/roadmap.md`,
  `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`). S22 is
  uncommitted in this worktree; restoring a whole shared file discards its work. To revert a temp
  edit, edit the specific lines back.
- **`src/reconstruction_branches.ts` lands at EXACTLY 250 lines** (the cap). The `jot` post-tool hook
  blocks a Stop at 251. Keep the `editBaseIsStale` doc comment to the four lines shown in §4 — do not
  expand it. (The design doc's "split, never condense" rule still holds; if a future change needs more
  room, split a helper into a new module rather than condensing.)
- **Commit only on user approval, one commit per scenario.** Stage EXACTLY: `tests/fixtures.ts`,
  `tests/reconstruction_engine_s23.test.ts`, `tests/reconstruction_cli_s23.test.ts`,
  `src/reconstruction_branches.ts`, `plans/roadmap.md`,
  `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`,
  `plans/s23/s23-reconstruction-plan.md`. Suggested message: `Implemented S23 handling`. Do NOT
  `git add -A` (S22 shares the same fixtures/roadmap/impl-notes/design files).

## 8. Coding-standards reminders (from `plans/coding-requirements.md`)
- Compare discriminants via enum members (`line.startsWith("+")` is string-prefix parsing of a diff
  line, which is fine; but `event.kind !== EventKind.edit` stays enum-compared in `staleEditSeedFor`).
- Function names contain a verb (`reconstructedBaseText` returns a value — acceptable as a noun-phrase
  accessor, consistent with the existing `linesTextOf`/`currentText`; keep it).
- Keep nesting ≤ 3 indent units (the `editBaseIsStale` loop is exactly 3).
- Files stay ≤ 250 lines (`reconstruction_branches.ts` lands at the 250 cap — verified).
```
