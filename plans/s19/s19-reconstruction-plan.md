# S19 reconstruction plan — `s19-user-edit-conv-rewind`

**This is the FIRST scenario since S12 that requires a PRODUCTION-CODE change.** S16/S17/S18
were characterization locks (engine already correct). S19 exposes a real reconstruction bug:
the `--surviving` view of `scenario19.py` drops two blank lines. The fix has been
**prototyped and verified live this session**: with it applied the full suite stays at 224
pass / 0 fail, `tsc` clean, and the surviving file reconstructs byte-for-byte to the on-disk
ground truth. This plan reproduces that verified fix under strict red→green TDD.

Implement with the `/jot:implement` skill so an implementation-notes entry is logged.

---

## 1. Scenario shape (the "what")

Scenario file: `scenarios/s19-user-edit-conv-rewind.txt`. Executed output:
`scenarios/executed/s19-user-edit-conv-rewind/`. JSONL session id
`6fc31802-b970-4698-9814-cc04c0fef14f` (118 records, strictly two-branch via one rewind).

Turn-by-turn (verified from the JSONL):

1. **B** writes `scenario19.py` = `def add(a, b):\n    return a + b\n`; **C** writes
   `tests/test_scenario19.py`.
2. **D** (user, out-of-band) edits `scenario19.py`, inserting `# user tweak` after
   `return a + b`. This lands as an `edited_text_file` attachment on the *next* prompt.
3. **E** (Claude) edits `scenario19.py` to add `subtract`, anchored on the user-edited content
   (its hunk OLD is `    return a + b\n# user tweak`; NEW inserts two blank lines + `subtract`,
   keeping `# user tweak` after).
4. User: `Looks good.`
5. **Rewind: 2** — the conversation rewinds to the original prompt. The system rewind marker is
   record `b1368b53`; it has **two children**: the "Add subtract" prompt (rewound branch) and the
   "Add multiply" prompt (surviving branch).
6. **F** (Claude, surviving branch) edits `scenario19.py` to add `multiply`, anchored on
   `# user tweak`. **The rewind did NOT revert the python file on disk**, so F edits a disk file
   that already carries D's and E's changes.
7. User: `Thanks.` → exit.

**Branch topology** (verified): one rewind, two branches.
- **rewound** branch: tip `#7087c57e`, rewind point `#b1368b53`; carries **D** `user-edit` and
  **E** `edit` (subtract).
- **surviving** branch: tip `#66840964`, no rewind point of its own; carries only **F** `edit`
  (multiply). **D and E are NOT on the surviving branch** (they are ancestors of the rewound tip
  only).

**Relation to prior scenarios.** S19 is the **conversation-rewind twin of S18**. S18 was linear
(no rewind) with the user edit KEPT on the surviving lineage. S19 strands the user edit AND the
intervening Claude edit (subtract) on a *rewound* branch — yet their disk effect persists because
the rewind is conversation-only (spec 37) and leaves the file on disk. It is the **first scenario
where a surviving-branch edit (F) was computed by Claude Code against a disk state produced by
OFF-branch edits (D, E)**. That divergence is the entire bug.

---

## 2. Ground truth — the authoritative final disk state

`scenarios/executed/s19-user-edit-conv-rewind/scenario19.py` (the real on-disk file after the run)
and the file-history backup `928642d7d0c1c258@v4` are identical, 11 lines:

```
def add(a, b):
    return a + b


def subtract(a, b):
    return a - b
# user tweak


def multiply(a, b):
    return a * b
```

The `--surviving --verbose` reconstruction of `scenario19.py` **must end at exactly this content**.
Note the **two blank lines between `return a + b` and `def subtract`** — that is what the engine
currently drops.

### Verified changeIds / tips (use these literally in test assertions)

| Node | kind | file | changeId (8-char) |
|------|------|------|-------------------|
| B | write | scenario19.py | `01HfSPZ5` |
| C | write | test_scenario19.py | `01HcWkVj` |
| D | user-edit | scenario19.py | `5f254565` |
| E | edit | scenario19.py | `01BBacF7` |
| F | edit | scenario19.py | `01GD3fen` |

| branch | tip | rewind point |
|--------|-----|--------------|
| surviving | `#66840964` | (none) |
| rewound | `#7087c57e` | `#b1368b53` |

### File-history backups (already present on disk at `~/.claude/file-history/6fc31802-…/`)

| blob name | content (the engine reads this) |
|-----------|---------------------------------|
| `928642d7d0c1c258@v2` | `def add(a, b):\n    return a + b\n# user tweak\n` (after D) |
| `928642d7d0c1c258@v3` | `def add(a, b):\n    return a + b\n\n\ndef subtract(a, b):\n    return a - b\n# user tweak\n` (after E — the seed F needs) |
| `928642d7d0c1c258@v4` | the 11-line final above (after F) |

---

## 3. The bug (precise mechanism — the "why")

`--surviving` selects the surviving branch's records (`selectLiveBranch` →
`reconstructFileOver`). On that branch the `scenario19.py` events are only **B (write `add`)** and
**F (edit)** — D and E are excluded (they are on the rewound branch).

F's edit hunk (read from its `toolUseResult.structuredPatch` on the tool-result record) is:

```
HUNK oldStart=5 oldLines=3 newStart=5 newLines=7
   def subtract(a, b):     (context)
       return a - b         (context)
   # user tweak             (context)
  +
  +
  +def multiply(a, b):
  +    return a * b
```

`oldStart=5` and the leading context `def subtract` / `return a - b` / `# user tweak` were computed
by Claude Code against the **real v3 disk file (7 lines)** F actually edited. But the surviving
branch reconstructs F's base from **B's write alone = 2 lines** (`add`), because E's `subtract` and
the two blank lines live on the rewound branch.

In `insertHunkAdditions` (`src/reconstruction_replay_edit.ts:113`):

```ts
const result = workingLines.slice(0, hunk.oldStart - 1).map(carryAt); // slice(0, 4)
let workingIndex = hunk.oldStart - 1;                                  // 4
```

On a 2-line base, `slice(0, 4)` silently yields only 2 lines. Base indices **2 and 3 (the two blank
lines that exist in v3 but not in B's 2-line write)** fall in this leading-carry gap and are
**dropped** — there is no born-path for the leading slice, only for the explicit context lines. The
context lines `def subtract` / `return a - b` / `# user tweak` ARE materialised (via
`resolveContextLine`'s `born` path, since they index past the base), which is why `subtract` still
appears — but the two blanks before it cannot be recovered from the hunk. Result: 9 lines instead of
11.

This is a generalisation of the **spec 39** case (`seedEditBaseFromBackup`): spec 39 seeds the base
from the file-history backup when the file's FIRST event on a branch is an edit (its creating Write is
off-branch). S19 is the same disease one step later — the creating Write (B) IS on-branch, but
**intervening off-branch edits (D, E) advanced the disk past the on-branch base**. The cure is the
same: seed the edit's base from the file-history backup, but now for a MID-stream edit, not just the
first event.

---

## 4. The fix (verified — produces 224 green + correct 11-line output)

Two source files change. Both stay well under the 250-line cap (branches.ts 178 → ~215;
sidecar.ts 165 → ~177).

### 4a. `src/reconstruction_sidecar.ts` — extract a reusable backup-seed builder

Refactor `seedEditBaseFromBackup` to delegate to a new exported `backupSeedWriteFor`, so the new
mid-stream pass can reuse the exact same backup lookup. **Replace** the current body of
`seedEditBaseFromBackup` (the block from `const cwd = findCwd(records);` down to
`return [seed, ...events];`) with:

```ts
    const seed = backupSeedWriteFor(records, first.target, first.timestamp, reader);
    return seed ? [seed, ...events] : events;
}

// A synthetic Write that seeds `target`'s pre-edit on-disk content from the file-history backup taken
// at or before `when` — the source of truth for content an off-branch edit left on disk. Returns
// undefined when no backup blob precedes `when` (version 1 holds no blob). The changeId is the backup
// blob name, so the synthetic seed stays out of the graphs (spec 40 attributes a file's base to the
// REAL Write turn).
export function backupSeedWriteFor(
    records: TranscriptRecord[],
    target: Path,
    when: Date,
    reader: BackupReader,
): WriteEvent | undefined {
    const cwd = findCwd(records);
    const timeline = buildBackupTimeline(records, cwd);
    const base = findBackupAtOrBefore(timeline, cwd, target, when);
    if (base === undefined || base.backupFileName === null) {
        return undefined;
    }
    return {
        kind: EventKind.write,
        changeId: new Uuid(base.backupFileName.toString()),
        target,
        content: reader(base.backupFileName),
        timestamp: base.backupTime,
    };
}
```

This is behaviour-preserving for spec 39 (the only change is the indirection). `Path` and
`WriteEvent` are already imported in this file; no new imports needed.

### 4b. `src/reconstruction_branches.ts` — seed stale mid-stream edit bases

**Imports.** Add `lastLinesOf` from `./reconstruction_replay_edit.ts`; add `backupSeedWriteFor` to
the existing `./reconstruction_sidecar.ts` import; add `EditEvent` and `WriteEvent` to the existing
type import from `./reconstruction_engine.ts`:

```ts
import { lastLinesOf } from "./reconstruction_replay_edit.ts";
import {
    backupSeedWriteFor,
    fillRedirectContent,
    seedEditBaseFromBackup,
} from "./reconstruction_sidecar.ts";
```
```ts
import type {
    CopyEvent,
    EditEvent,
    FileEvent,
    FileHistory,
    FileRevision,
    WriteEvent,
} from "./reconstruction_engine.ts";
```

**`reconstructFileOver`.** Insert one staging pass between `based` and the replay. Replace:

```ts
    const based = reader ? seedEditBaseFromBackup(records, filled, reader) : filled;
    return replayEvents(based);
```
with:
```ts
    const based = reader ? seedEditBaseFromBackup(records, filled, reader) : filled;
    const restaged = reader ? seedStaleEditBases(records, based, reader) : based;
    return replayEvents(restaged);
```

**New helpers** (add immediately after `reconstructFileOver`, before `seedCopyEvents`). They are
split into three small functions to keep nesting ≤ 3 levels (a `jot` post-tool hook flags deeper
nesting):

```ts
// Whether an edit's first hunk references lines past the base reconstructed from the events before it
// — the mark of an edit Claude Code computed against a disk state that carried OFF-branch changes
// across a conversation-only rewind (s19). The on-branch base is shorter than the hunk's first context
// line expects, so replaying the hunk would drop the lines that precede that context line.
function editBaseIsStale(event: EditEvent, priorEvents: FileEvent[]): boolean {
    const firstHunk = event.hunks[0];
    if (firstHunk === undefined) {
        return false;
    }
    return firstHunk.oldStart - 1 > lastLinesOf(replayEvents(priorEvents)).length;
}

// The synthetic backup-seed Write to splice before `event`, or undefined when its base is intact (the
// common case — every edit whose reconstructed base already matches the disk it was computed against).
function staleEditSeedFor(
    records: TranscriptRecord[],
    event: FileEvent,
    priorEvents: FileEvent[],
    reader: BackupReader,
): WriteEvent | undefined {
    if (event.kind !== EventKind.edit || !editBaseIsStale(event, priorEvents)) {
        return undefined;
    }
    return backupSeedWriteFor(records, event.target, event.timestamp, reader);
}

// Generalises spec 39's edit-base seeding to MID-stream edits: walk the lineage and, before each edit
// whose base is stale (off-branch changes persisted across a rewind — s19), splice the synthetic
// backup-seed Write so the hunk's context lands on the real pre-edit disk content. Edits whose base is
// intact pass through unchanged, so every pre-s19 scenario is byte-for-byte unaffected.
function seedStaleEditBases(
    records: TranscriptRecord[],
    lineage: FileEvent[],
    reader: BackupReader,
): FileEvent[] {
    const result: FileEvent[] = [];
    for (const event of lineage) {
        const seed = staleEditSeedFor(records, event, result, reader);
        if (seed) {
            result.push(seed);
        }
        result.push(event);
    }
    return result;
}
```

**Why this is safe (no regression).** `editBaseIsStale` is true only when an edit's first hunk
`oldStart - 1` exceeds the reconstructed base length — i.e. exactly when off-branch edits advanced the
disk past the on-branch base. For every normal edit the hunk aligns with its base, so the guard is
false and the lineage is returned unchanged. The pass runs **after** `seedEditBaseFromBackup`, so a
spec-39 first-event-edit already has its seed and is no longer stale (no double-seed). Verified live:
with this exact code the full suite is **224 pass / 0 fail**, `tsc` clean.

**Resulting surviving reconstruction of `scenario19.py` (3 revisions):**
- revision 0 `write` `#01HfSPZ5` — `add` (2 lines) — B's real write.
- revision 1 `overwrite` `#928642d7…` — the v3 backup base (7 lines) — the synthetic seed
  (changeId = backup blob name; absent from the graphs).
- revision 2 `edit` `#01GD3fen` — the 11-line final — F's multiply edit.

---

## 5. TDD task order (strict red → green)

Baseline before starting: **224 pass / 0 fail** (S16/S17/S18 are uncommitted in this worktree —
do NOT touch their files; do NOT `git checkout`/`git restore` any shared file, see §7).

### Task 1 — register the S19 fixture
In `tests/fixtures.ts`, immediately after the `S18_JSONL` constant (currently lines 56–57), add:

```ts

export const S19_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s19-user-edit-conv-rewind/6fc31802-b970-4698-9814-cc04c0fef14f.jsonl";
```
(The Desktop path is verified to exist, 118 lines. Fixtures use the canonical Desktop path, not the
worktree path — the file-history reader keys off the session id, not the JSONL location.)

### Task 2 — engine RED test for the blank-line regression
Create `tests/reconstruction_engine_s19.test.ts`. Mirror the **S12** engine test's scaffolding
(`tests/reconstruction_engine_s12.test.ts`) — it is the closest precedent because it also exercises
the backup seed with an **in-memory `BackupReader`**. Include:

- imports: `test`, `assert/strict`, `reconstructAll`, `reconstructBranches` from
  `../src/reconstruction_engine.ts`, `findConversationBranches` from
  `../src/reconstruction_branch.ts`, `EventKind` from `../src/structures/vocabulary.ts`, types
  `FileHistory`/`FileRevision` and `BackupReader`, `loadRecords` from `./utilities.ts`, `S19_JSONL`
  from `./fixtures.ts`.
- the in-memory reader (the seed reads only the v3 blob; include v2 for completeness):

```ts
const S19_BACKUPS: Record<string, string> = {
    "928642d7d0c1c258@v2": "def add(a, b):\n    return a + b\n# user tweak\n",
    "928642d7d0c1c258@v3":
        "def add(a, b):\n    return a + b\n\n\ndef subtract(a, b):\n    return a - b\n# user tweak\n",
};
const s19Reader: BackupReader = (name) => S19_BACKUPS[name.toString()] ?? "";
```
- the same `finalTextOf` / `historyEndingWith` helpers used by the S12 test (copy them verbatim).

Write **this test first and run it — it MUST fail (RED)**, because the unfixed engine produces 9
lines / 2 revisions:

```ts
test("test_S19_surviving_scenario_file_keeps_off_branch_subtract_with_blank_lines", () => {
    // The surviving scenario19.py must reconstruct to the on-disk ground truth: F's multiply edit
    // applied to the v3 disk base, INCLUDING the two blank lines between `add` and `subtract`.
    const histories = reconstructAll(loadRecords(S19_JSONL), s19Reader);
    const scenario = historyEndingWith(histories, "scenario19.py", true);
    assert.equal(
        finalTextOf(scenario.revisions[scenario.revisions.length - 1]!),
        "def add(a, b):\n    return a + b\n\n\ndef subtract(a, b):\n    return a - b\n# user tweak\n\n\ndef multiply(a, b):\n    return a * b",
    );
});
```

### Task 3 — apply the fix (GREEN)
Apply §4a then §4b. Run the engine test → it passes. Run `npm test` → **224 + new** green; run
`npx tsc --noEmit` → clean. (The Task-2 test alone proves the fix; the suite proves no regression.)

### Task 4 — remaining engine locks (3 more, total 4 engine tests)
Add to `tests/reconstruction_engine_s19.test.ts`:

```ts
test("test_S19_findConversationBranches_yields_surviving_and_rewound", () => {
    const branches = findConversationBranches(loadRecords(S19_JSONL));
    assert.equal(branches.length, 2);
    const surviving = branches.find((b) => b.isSurviving)!;
    const rewound = branches.find((b) => !b.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "66840964");
    assert.equal(surviving.rewindPoint, undefined);
    assert.equal(rewound.tip.toString().slice(0, 8), "7087c57e");
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "b1368b53");
});

test("test_S19_surviving_scenario_file_has_seeded_backup_base_revision", () => {
    // Three revisions: B's `add` write, the synthetic v3 backup seed (overwrite), then F's edit.
    const branched = reconstructBranches(loadRecords(S19_JSONL), s19Reader);
    const scenario = historyEndingWith(branched.surviving, "scenario19.py", true);
    assert.equal(scenario.revisions.length, 3);
    assert.equal(scenario.revisions[0]!.kind, EventKind.write);
    assert.equal(scenario.revisions[1]!.kind, EventKind.overwrite);
    assert.equal(scenario.revisions[2]!.kind, EventKind.edit);
    // The seeded middle revision is exactly the v3 on-disk content (7 lines incl. the two blanks).
    assert.equal(
        finalTextOf(scenario.revisions[1]!),
        "def add(a, b):\n    return a + b\n\n\ndef subtract(a, b):\n    return a - b\n# user tweak",
    );
});

test("test_S19_surviving_test_file_is_a_single_write_revision", () => {
    const branched = reconstructBranches(loadRecords(S19_JSONL), s19Reader);
    const testFile = branched.surviving.find((h) => h.target.toString().endsWith("test_scenario19.py"))!;
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
});
```
(If `reconstructBranches`'s surviving histories type differs from the S12 usage, follow the S12 test's
exact access pattern — `branched.surviving` is the `FileHistory[]` for the surviving branch.)

### Task 5 — CLI byte-lock tests (5 tests)
Create `tests/reconstruction_cli_s19.test.ts`. Mirror `tests/reconstruction_cli_s18.test.ts`
(imports: `test`, `assert/strict`, `runCli` from `../src/reconstruction_cli.ts`, `S19_JSONL`). These
use the **real on-disk file-history reader** (built inside `runCli` from the session id), so no
in-memory backups are needed — the v3 blob is present on disk.

```ts
test("test_S19_default_conversationDAG_shows_rewound_user_edit_and_surviving_edit", () => {
    const out = runCli([S19_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #b1368b53   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #7087c57e; rewind @ #b1368b53)"));
    assert.ok(out.includes("D  user-edit  scenario19.py  #5f254565"));
    assert.ok(out.includes("E  edit       scenario19.py  #01BBacF7"));
    assert.ok(out.includes("branch surviving (surviving; tip #66840964)"));
    assert.ok(out.includes("F  edit       scenario19.py  #01GD3fen"));
});

test("test_S19_default_fileDAG_lists_all_scenario_turns_and_the_test_write", () => {
    const out = runCli([S19_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("B  write      #01HfSPZ5"));
    assert.ok(out.includes("D  user-edit  #5f254565"));
    assert.ok(out.includes("E  edit       #01BBacF7"));
    assert.ok(out.includes("F  edit       #01GD3fen"));
    assert.ok(out.includes("C  write      #01HcWkVj"));
});

test("test_S19_list_branches_shows_surviving_and_rewound_tips", () => {
    const out = runCli([S19_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #66840964"));
    assert.ok(out.includes("rewound    tip #7087c57e  rewind @ #b1368b53"));
});

test("test_S19_surviving_verbose_reconstructs_eleven_line_file_with_blank_lines", () => {
    // The regression byte-lock: the two blank lines between `return a + b` and `def subtract` survive.
    const out = runCli([S19_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("    return a + b\n\n\ndef subtract(a, b):"));
    assert.ok(out.includes("# user tweak\n\n\ndef multiply(a, b):"));
    assert.ok(out.includes("    return a * b"));
});

test("test_S19_surviving_verbose_shows_three_revisions_for_scenario_file", () => {
    const out = runCli([S19_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 1"));
    assert.ok(out.includes("revision 2"));
    // revision 2 is the 11-line final.
    assert.ok(out.includes("(11 lines)"));
});
```
Run each new file; with the fix applied all 5 pass. (Test 4 is the CLI counterpart of the RED
regression — it would also fail on the unfixed engine.)

### Task 6 — docs
1. `plans/roadmap.md` line 20: change `[ ] S19 ->` to `[x] S19 -> [x] …` with a one-paragraph
   summary in the S18 style. State: conversation-rewind twin of S18; user edit + a Claude edit
   (subtract) stranded on a rewound branch, but their disk effect persists across the
   conversation-only rewind; the surviving `multiply` edit (F) was computed against that advanced
   disk, so its base is reseeded from the file-history backup. **Engine change required** (generalises
   spec 39's edit-base seeding to mid-stream stale edits); 9 new tests (4 engine + 5 CLI); 233 green;
   S1–S18 byte-for-byte unchanged.
2. `plans/implementation-notes-api-from-scenarios.md`: prepend a dated S19 entry (header with green
   count, chat title, JSONL path; References to this plan + the S18 IMPLEMENTED handoff
   `plans/handoff-api-from-scenarios-20260623-2055.md` + `plans/s12/` as the spec-39 precedent; Design
   decisions / Deviations / Tradeoffs / Open questions). `/jot:implement` maintains this file
   automatically.
3. `plans/reconstruction-engine-design.md`: in the spec-39 description (around line 179), add one
   sentence noting the seed now also fires for a **mid-stream** edit whose hunk references lines past
   its reconstructed base (off-branch edits that persisted across a conversation-only rewind — s19),
   via `seedStaleEditBases`/`backupSeedWriteFor`.

### Task 7 — verify gates (all must pass)
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 233 pass / 0 fail (224 baseline + 9 new)
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s19-user-edit-conv-rewind/6fc31802-b970-4698-9814-cc04c0fef14f.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null   # scenario19.py ends 11 lines w/ blanks
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null         # surviving #66840964 / rewound #7087c57e
```

### Task 8 — create handoff
Write a completion handoff with `/jot:handoff-prompt` (title must contain `S19` and `IMPLEMENTED`).
State: 233 green, engine change made (spec-39 generalisation), nothing committed; commit guidance
below.

---

## 6. Expected final CLI output (reference — verified this session)

`--surviving --verbose` for `scenario19.py`:
```
revision 0  @ 2026-06-18T16:13:08.034Z  (2 lines)   # add
revision 1  @ 2026-06-18T16:13:33.928Z  (7 lines)   # v3 seed: add + 2 blanks + subtract + # user tweak
revision 2  @ 2026-06-18T16:14:02.874Z  (11 lines)  # + multiply (the on-disk ground truth)
```
`test_scenario19.py`: 1 revision (5 lines). The conversationDAG, fileDAG, and `--list-branches`
outputs are **unchanged by the fix** (the synthetic seed carries the backup blob name as its changeId
and never enters the graphs).

---

## 7. Hazards & commit guidance

- **Do NOT `git checkout` / `git restore` any shared file** (`tests/fixtures.ts`, `plans/roadmap.md`,
  `plans/implementation-notes-api-from-scenarios.md`). S16/S17/S18 are uncommitted in this worktree;
  restoring a whole shared file discards their work. To revert a temp edit, edit the specific lines
  back.
- **Commit only on user approval, one commit per scenario.** Stage EXACTLY: `tests/fixtures.ts`,
  `tests/reconstruction_engine_s19.test.ts`, `tests/reconstruction_cli_s19.test.ts`,
  `src/reconstruction_sidecar.ts`, `src/reconstruction_branches.ts`, `plans/roadmap.md`,
  `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`,
  `plans/s19/s19-reconstruction-plan.md`. Suggested message: `Implemented S19 handling`. Do NOT
  `git add -A` (S16/S17/S18 share the same fixtures/roadmap/impl-notes files).

## 8. Coding-standards reminders (from `plans/coding-requirements.md`)
- Compare discriminants via enum members (`event.kind !== EventKind.edit`), never bare strings.
- Function names contain a verb (`seedStaleEditBases`, `editBaseIsStale`, `backupSeedWriteFor`).
- Keep nesting ≤ 3 indent units (the helpers are split for exactly this reason).
- Files stay ≤ 250 lines (both edited files land ~177 / ~215).
