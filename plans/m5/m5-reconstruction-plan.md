# Reconstruction Plan — Scenario **m5** (`m5-full-interleave`)

> **Type: characterization / regression LOCK. NO `src/` change.**
>
> The engine already reconstructs `m5-full-interleave` byte-for-byte correct against the real
> file-history sidecar (verified live: see §2). This plan LOCKS that behavior with **10 tests
> (5 engine + 5 CLI) + 3 doc edits**, exactly mirroring the m1/m2/m3/m4/S20/S21/S22 char-locks.
> **If any test here needs a `src/` change to go green, STOP and escalate** — the no-fix premise
> has been violated and the scenario is a real-fix, not a lock.
>
> Implementing agent: read `~/.claude/guides/tdd.md` and `plans/coding-requirements.md` before
> writing tests. The test code below already conforms (enum-member comparisons via `EventKind`,
> `.toString()` on wrapped `Uuid`/`Path` domain types, verb-named helpers carried from the m3
> tests). m5 follows the **m3 reader pattern**, NOT the m2/m4 reader-free pattern — see §2.1.

---

## 1. Goal

Lock — with tests only — that `reconstruction_cli` correctly reconstructs `m5-full-interleave`:
ONE source file `m5_interleave.py` mutated by an interleaved sequence of USER edits and AGENT
edits straddling a **code-rewind**, plus a sibling `tests/test_m5_interleave.py` (write only).

The event ladder (verified live):
1. **B** — Claude writes `m5_interleave.py` (`def base(): return "base"`) and **C** writes the test file.
2. **D** — the user out-of-band appends `def user_add_1(): return "user1"` (a `user-edit`).
3. **E** — Claude edits, adding `agent_add_1()` returning `"agent1"`.
4. "Looks good." (prompt; the conversation checkpoint).
5. **Rewind: 2, code** — a CODE rewind reverts BOTH the chat AND the disk back toward the root
   prompt **A** (`#b3aed408`, the rewind point). `agent_add_1` (E) is discarded; the checkpoint
   keeps the user's `user_add_1`.
6. "Read m5_interleave.py …" (prompt).
7. **F** — the user out-of-band appends `def user_add_2(): return "user2"` (a `user-edit`).
8. **G** — Claude edits, adding `agent_add_2()` returning `"agent2"`.
9. "Thanks." → Exit.

Reconstruction yields TWO branches:
- **surviving** (tip `#93e7f94c`): `m5_interleave.py` = base + user_add_1 + user_add_2 + agent_add_2
  (5 lines); `test_m5_interleave.py` = the base test (1 revision). `user_add_1` is **KEPT** here.
- **rewound** (tip `#fcd9c268`, rewind @ `#b3aed408`): `m5_interleave.py` = base + user_add_1 +
  agent_add_1 (6 lines); tracks only `m5_interleave.py`.

### Why m5 is distinct from every prior scenario

m5 is the **"full interleave"** — the first scenario that combines, on ONE file, ALL of:
1. a USER edit that **straddles** a rewind and is kept on the surviving lineage (the S18/S20/S22
   "user edit kept on surviving" behavior);
2. an AGENT edit **abandoned** by the rewind onto the rewound branch (`agent_add_1`);
3. a SECOND user edit **after** the rewind (`user_add_2`) whose disk state is **NOT** in the JSONL —
   it lives ONLY in the file-history backup `17bbea89afb745a4@v5`;
4. a SECOND agent edit after the rewind (`agent_add_2`) whose recorded base **includes** that
   backup-only `user_add_2` line.

Consequence (4) is the **crux**: the surviving `agent_add_2` Edit (G) was computed against a disk
(`base+user_add_1+user_add_2`, 4 lines) that the surviving on-branch events (B + F) reconstruct as
only 3 lines — so G's hunk base is **stale (too SHORT)**, and `seedStaleEditBases` recovers `@v5`
from the backup as a synthetic `overwrite` revision **before** replaying G. This is the **S19
"base too short" reseed, FIRING** — the active complement of m3, where the same reseed stays
dormant. m5 is therefore a **live regression lock for the S19 fix** (the first real engine change
since S12), proving it still fires for a backup-only USER edit absorbed across a code rewind.

m5 is the FIRST m-series scenario with a rewind, so its `conversationDAG` is **branched** (m1–m4
were linear). Engine is already correct, so this is a characterization/regression LOCK with **no
production-code change**.

---

## 2. Ground truth (VERIFIED live against the engine at HEAD `91ac563` + uncommitted m2 + m3 + m4)

### 2.1 Scenario source & inputs

- Scenario script: `scenarios/m5-full-interleave.txt`
- Executed transcript (worktree copy):
  `scenarios/executed/m5-full-interleave/d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl`
- On-disk ground-truth files (final state):
  `scenarios/executed/m5-full-interleave/m5_interleave.py` (131 bytes) and
  `scenarios/executed/m5-full-interleave/tests/test_m5_interleave.py` (91 bytes)
- **The fixture path `tests/fixtures.ts` must point at (Desktop tree, the suite's root):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m5-full-interleave/d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl`

**m5 is READER-DEPENDENT (the m3 pattern, NOT the m2/m4 reader-free pattern).** The `user_add_2`
out-of-band edit (F) carries NO content in the JSONL — only the `user_add_1` snapshot appears as an
`edited_text_file` echo. The `user_add_2` disk state lives ONLY in the file-history backup
`17bbea89afb745a4@v5`. Therefore:
- **Engine tests** that lock the full surviving ladder MUST pass a `BackupReader`. To stay
  independent of the live `~/.claude/file-history` tree, the engine tests use an **in-memory**
  reader seeded with the one backup blob (mirrors `tests/reconstruction_engine_m3.test.ts` /
  `_s5`). See §5.
- **CLI tests** drive `runCli`, which builds the **real on-disk** sidecar reader from
  `~/.claude/file-history`. The surviving-verbose CLI tests (§6 tests 4–5) therefore depend on the
  live backup `17bbea89afb745a4@v5` being present on the machine running the suite — exactly the
  same hazard m3's CLI tests already accept (they pass on this machine; the probe confirmed the
  backup resolves). The branched-DAG / list-branches CLI tests (§6 tests 1–3) are reader-neutral.
- **Reader-independence of the FINAL text** is itself a locked property (§5 test 3): WITHOUT a
  reader the `@v5` overwrite revision is dropped, but the surviving final text is byte-identical
  (the `agent_add_2` Edit then births `user_add_2` as a genesis line). The lock pins that the
  reader changes only the intermediate ladder, never the endpoint.

### 2.2 Event ladder

| Turn | Kind | File | changeId (short) | Effect |
|------|------|------|------------------|--------|
| A | prompt | — | `#b3aed408` | root prompt = the **rewind point** |
| B | write | m5_interleave.py | `#01Mbgcvf` | `def base(): return "base"` (2 lines) |
| C | write | test_m5_interleave.py | `#01C4Qun2` | the base test (5 lines) |
| D | user-edit | m5_interleave.py | `#5f68c3e1` | user appends `user_add_1` (rewound-branch copy) |
| E | edit | m5_interleave.py | `#01YM4bk4` | Claude adds `agent_add_1` (abandoned by rewind) |
| F | user-edit | m5_interleave.py | `#84166ae7` | user appends `user_add_1` (surviving-branch copy) |
| G | edit | m5_interleave.py | `#0144beFx` | Claude adds `agent_add_2` (surviving) |

Note the user's `user_add_1` append surfaces on BOTH branches with DISTINCT changeIds — D
(`#5f68c3e1`, rewound) and F (`#84166ae7`, surviving). The `user_add_2` state has no own event; it
enters the surviving branch only as the seeded `@v5` overwrite (see §2.3). Surviving tip
`#93e7f94c`; rewound tip `#fcd9c268`, rewind @ `#b3aed408`. Two files.

### 2.3 Reconstructed revisions (VERIFIED live via `reconstructBranches`)

**Surviving `m5_interleave.py` — 4 revisions, kinds `[write, user-edit, overwrite, edit]`** (the
`overwrite` is the backup-seeded `@v5`; present ONLY with a reader):
- rev 0 `write` `#01Mbgcvf` (2 lines): `def base():` / `    return "base"`
- rev 1 `user-edit` `84166ae7-…` (3 lines): + `def user_add_1(): return "user1"`
- rev 2 `overwrite` **`17bbea89afb745a4@v5`** (4 lines): + `def user_add_2(): return "user2"` — **the
  backup-recovered seed (THE CRUX)**
- rev 3 `edit` `#0144beFx` (5 lines): + `def agent_add_2(): return "agent2"`

**Surviving `test_m5_interleave.py` — 1 revision, kind `[write]`:**
- rev 0 `write` `#01C4Qun2` (5 lines): the base test.

**Rewound `m5_interleave.py` — 3 revisions, kinds `[write, user-edit, edit]`** (reader-INDEPENDENT;
seedStaleEditBases stays INERT on this branch because `agent_add_1`'s base is aligned):
- rev 0 `write` `#01Mbgcvf` (2 lines): base
- rev 1 `user-edit` `5f68c3e1-…` (3 lines): + `def user_add_1(): return "user1"`
- rev 2 `edit` `#01YM4bk4` (6 lines): + blank + `def agent_add_1():` / `    return "agent1"`

**WITHOUT a reader**, surviving `m5_interleave.py` has only **3 revisions** `[write, user-edit, edit]`
(the `@v5` overwrite is absent; rev 2 is the `agent_add_2` Edit, which then carries `user_add_2` as a
born line) — final text unchanged.

### 2.4 Final reconstructed content (byte-identical to on-disk ground truth)

Surviving `m5_interleave.py` (newline-joined, the `finalTextOf` value — no trailing newline):
```
def base():
    return "base"
def user_add_1(): return "user1"
def user_add_2(): return "user2"
def agent_add_2(): return "agent2"
```
Surviving `test_m5_interleave.py`:
```
from m5_interleave import base


def test_base_returns_base():
    assert base() == "base"
```
Rewound `m5_interleave.py`:
```
def base():
    return "base"
def user_add_1(): return "user1"

def agent_add_1():
    return "agent1"
```

In-memory backup blob the reader is queried for (key → content, trailing newline included):
```
"17bbea89afb745a4@v5" => "def base():\n    return \"base\"\ndef user_add_1(): return \"user1\"\ndef user_add_2(): return \"user2\"\n"
```

### 2.5 Exact CLI output (captured live — the byte source-of-truth for the §6 CLI tests)

Column padding in the DAGs: the event kind is left-padded to the width of the longest kind
(`user-edit` = 9 chars) then 2 spaces; `#id` columns are short uuids. **Re-capture these blocks live
before pasting** (see the re-capture command in §6) if any multi-line `includes` fails on whitespace.

`runCli([M5_JSONL])` (default — branched conversationDAG + fileDAG):
```
══ conversationDAG ══
A  prompt  #b3aed408   (rewind point)
│
├─ branch rewound (rewound; tip #fcd9c268; rewind @ #b3aed408)
│  D  user-edit  m5_interleave.py  #5f68c3e1
│  E  edit       m5_interleave.py  #01YM4bk4
│
└─ branch surviving (surviving; tip #93e7f94c)
   F  user-edit  m5_interleave.py  #84166ae7
   G  edit       m5_interleave.py  #0144beFx

══ fileDAG ══
m5_interleave.py
  B  write      #01Mbgcvf
  D  user-edit  #5f68c3e1
  E  edit       #01YM4bk4
  F  user-edit  #84166ae7
  G  edit       #0144beFx
test_m5_interleave.py
  C  write      #01C4Qun2
```

`runCli([M5_JSONL, "--list-branches"])`:
```
surviving  tip #93e7f94c    m5_interleave.py, test_m5_interleave.py
rewound    tip #fcd9c268  rewind @ #b3aed408    m5_interleave.py
```

`runCli([M5_JSONL, "--surviving", "--verbose"])` — `m5_interleave.py` section (the 4-revision
ladder; rev 2 is the backup-recovered `@v5`):
```
revision 0  @ 2026-06-18T16:06:28.878Z  (2 lines)
     1 | def base():
     2 |     return "base"

revision 1  @ 2026-06-18T16:07:17.480Z  (3 lines)
     1 | def base():
     2 |     return "base"
     3 | def user_add_1(): return "user1"

revision 2  @ 2026-06-18T16:07:33.195Z  (4 lines)
     1 | def base():
     2 |     return "base"
     3 | def user_add_1(): return "user1"
     4 | def user_add_2(): return "user2"

revision 3  @ 2026-06-18T16:07:41.117Z  (5 lines)
     1 | def base():
     2 |     return "base"
     3 | def user_add_1(): return "user1"
     4 | def user_add_2(): return "user2"
     5 | def agent_add_2(): return "agent2"
```
(The `test_m5_interleave.py` section follows with its single 5-line revision 0.)

---

## 3. Why NO engine change is needed (reference map — cite these in impl-notes)

Every mechanism below already exists; the implementing agent modifies **none** of it. Paths are in
`src/`.

- **Vocabulary** — `EventKind.userEdit` / `EventKind.overwrite` / `EventKind.write` /
  `EventKind.edit` (`structures/vocabulary.ts:102-110`). A user-edit replays as a full-content
  revision like overwrite (the s15 mechanism).
- **Branch enumeration** — `reconstructBranches` (`reconstruction_engine.ts:206-218`) →
  `findConversationBranches` (`reconstruction_branch.ts:150-168`) finds the surviving + rewound
  tips. `findSurvivingHead` (`reconstruction_branch.ts:37-59`) takes the SIMPLE path: the
  code-rewind restored disk onto the surviving lineage, so the working-tree owner is in the
  final-head chain and it returns `finalHead` (line 48) — no conv-only override.
- **Rewound branch** — `buildRewoundBranchHistory` (`reconstruction_engine.ts:222-242`) scopes the
  rewound branch to events AFTER the rewind point via the `divergingIds` filter (lines 229-237) —
  this is where `agent_add_1` (E) is assigned to the rewound branch only; `findRewindPoint`
  (`reconstruction_branch.ts:75-102`) supplies the `rewind @ #b3aed408` marker.
- **user_add_1 kept on surviving** — `selectBranchRecords` (`reconstruction_branch.ts:172-183`):
  the surviving tip's ancestor chain includes F's `user_add_1` snapshot; it falls out of
  ancestor-chain selection (the S18/S20/S22 behavior), no special code. `userEditChangesContent`
  (`reconstruction_replay.ts:124-134`) records it as a real revision (content differs from disk).
- **THE CRUX — `user_add_2` reseed (S19, ACTIVE)** — `reconstructFileOver`
  (`reconstruction_branches.ts:41-57`) runs `seedStaleEditBases` (line 56, reader-gated). For the
  surviving `agent_add_2` Edit (G), `editBaseIsStale` (`reconstruction_branches.ts:71-88`) walks
  G's hunk context against `reconstructedBaseText` (line 61-65) = `[base, return, user_add_1]` (3
  lines); G's context references `user_add_2` at index 3 ≥ base length → returns **true** (the S19
  "base too short" case). `staleEditSeedFor` (`reconstruction_branches.ts:92-102`) →
  `backupSeedWriteFor` (`reconstruction_sidecar.ts:115`) recovers `@v5` and splices a synthetic
  `overwrite` Write before G. On the **rewound** branch, `agent_add_1`'s base is aligned →
  `editBaseIsStale` false → reseed INERT (so the rewound branch is reader-independent).
- **Edit replay** — `replayEvents` (`reconstruction_replay.ts:179`) → `applyEdit`
  (`reconstruction_replay_edit.ts:174-187`): a `+`-only append hunk skips the removal revision and
  emits one addition revision via `insertHunkAdditions` (`reconstruction_replay_edit.ts:113-139`).
- **CLI rendering** — branched conversationDAG, fileDAG, `--list-branches`, and `--surviving
  --verbose` are produced by the existing renderers; `buildSidecarReader`
  (`reconstruction_cli.ts:116-122`) supplies the real on-disk reader.
- **Precedent**: m3 (backup recovery + reseed DORMANT), S19 (reseed FIRES, base too short), S20/S22
  (user edit kept on surviving across a rewind), S23 (the per-line `editBaseIsStale` walk). m5 is
  the first to combine backup recovery + reseed-FIRES + user-edit-kept + code-rewind on one file.

The implementing agent does **not** modify any of this.

---

## 4. Task 1 — Baseline & fixture (do first)

### 4.1 Confirm baseline GREEN
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # expect: tests 305 / pass 305 / fail 0
npx tsc --noEmit    # expect: clean
git diff --stat src/  # expect: EMPTY
```
If the count is not **305** or `src/` is non-empty, STOP and reconcile (the baseline already
includes S1–S23 + m1 + m2 + m3 + m4; do not proceed against a drifted tree).

### 4.2 Add the fixture
Append AFTER the `M4_JSONL` entry at the end of `tests/fixtures.ts` (Desktop path style, matching
every `S*/M*_JSONL`):
```typescript
export const M5_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m5-full-interleave/d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl";
```

---

## 5. Task 2 — Engine lock (`tests/reconstruction_engine_m5.test.ts`, 5 tests)

Reader-backed (m3 pattern): an in-memory `m5Reader` seeded with the one backup blob, so the engine
tests don't depend on the live `~/.claude/file-history` tree. `finalTextOf` and `historyEndingWith`
are carried verbatim from the m3/m4 engine tests (the leading-slash suffix disambiguates the two
files — `test_m5_interleave.py` also ends with `m5_interleave.py`). Write the file EXACTLY:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import type { FileRevision, FileHistory } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { M5_JSONL } from "./fixtures.ts";

// m5's user_add_2 out-of-band edit (F) leaves NO content in the JSONL — its disk state
// (base+user_add_1+user_add_2) lives ONLY in the file-history backup 17bbea89afb745a4@v5.
// The surviving agent_add_2 Edit (G) was computed against that disk, so its hunk base is stale
// (the reconstructed on-branch base is only 3 lines) and seedStaleEditBases recovers @v5 as a
// synthetic overwrite revision before replaying G — the S19 "base too short" reseed, ACTIVE here
// (the firing complement of m3, where it stays dormant). In-memory reader so the engine tests
// don't depend on the live ~/.claude/file-history tree (mirrors engine_m3 / engine_s5).
const M5_BACKUPS: Record<string, string> = {
    "17bbea89afb745a4@v5":
        'def base():\n    return "base"\ndef user_add_1(): return "user1"\ndef user_add_2(): return "user2"\n',
};
const m5Reader: BackupReader = (name) => M5_BACKUPS[name.toString()] ?? "";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// Pick the history whose target ends with the given (leading-slash) suffix.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    const match = histories.find((history) => history.target.toString().endsWith(suffix));
    assert.ok(match, `no history ending with ${suffix}`);
    return match;
}

// The surviving source is FOUR revisions [write, user-edit, overwrite, edit]; the overwrite is the
// backup-seeded @v5, and the final text is the 5-line ground truth.
test("test_m5_surviving_source_is_write_useredit_overwrite_edit_four_revisions", () => {
    const branches = reconstructBranches(loadRecords(M5_JSONL), m5Reader);
    const source = historyEndingWith(branches.surviving, "/m5_interleave.py");
    assert.equal(source.revisions.length, 4);
    assert.deepEqual(
        source.revisions.map((revision) => revision.kind),
        [EventKind.write, EventKind.userEdit, EventKind.overwrite, EventKind.edit],
    );
    assert.equal(
        finalTextOf(source.revisions[3]!),
        'def base():\n    return "base"\ndef user_add_1(): return "user1"\ndef user_add_2(): return "user2"\ndef agent_add_2(): return "agent2"',
    );
});

// THE CRUX (S19 reseed FIRES): the user_add_2 disk state is recovered from the backup and spliced
// as a synthetic overwrite revision (changeId = the backup filename) before the agent_add_2 Edit.
test("test_m5_user_add_2_recovered_from_backup_as_seeded_overwrite", () => {
    const branches = reconstructBranches(loadRecords(M5_JSONL), m5Reader);
    const source = historyEndingWith(branches.surviving, "/m5_interleave.py");
    const seeded = source.revisions[2]!;
    assert.equal(seeded.kind, EventKind.overwrite);
    assert.equal(seeded.changeId.toString(), "17bbea89afb745a4@v5");
    assert.equal(
        finalTextOf(seeded),
        'def base():\n    return "base"\ndef user_add_1(): return "user1"\ndef user_add_2(): return "user2"',
    );
});

// Reader-independence of the ENDPOINT: WITHOUT a reader the @v5 overwrite is dropped (3 revisions,
// no overwrite), but the surviving final text is byte-identical — the reader changes only the
// intermediate ladder, never the endpoint.
test("test_m5_without_reader_drops_seeded_overwrite_final_text_unchanged", () => {
    const branches = reconstructBranches(loadRecords(M5_JSONL));
    const source = historyEndingWith(branches.surviving, "/m5_interleave.py");
    assert.equal(source.revisions.length, 3);
    assert.ok(!source.revisions.some((revision) => revision.kind === EventKind.overwrite));
    assert.equal(
        finalTextOf(source.revisions[source.revisions.length - 1]!),
        'def base():\n    return "base"\ndef user_add_1(): return "user1"\ndef user_add_2(): return "user2"\ndef agent_add_2(): return "agent2"',
    );
});

// user_add_1 is KEPT on the surviving branch across the code rewind (S18/S20/S22 behavior); the
// surviving copy (F) has a DISTINCT changeId from the rewound copy (D). Surviving keeps two files;
// the sibling test file is a single write revision.
test("test_m5_user_add_1_kept_on_surviving_branch_across_code_rewind", () => {
    const branches = reconstructBranches(loadRecords(M5_JSONL), m5Reader);
    const source = historyEndingWith(branches.surviving, "/m5_interleave.py");
    const userEdit = source.revisions[1]!;
    assert.equal(userEdit.kind, EventKind.userEdit);
    assert.equal(userEdit.changeId.toString(), "84166ae7-b7ba-42af-ae9f-74a4d070867e");
    assert.equal(
        finalTextOf(userEdit),
        'def base():\n    return "base"\ndef user_add_1(): return "user1"',
    );
    assert.equal(branches.surviving.length, 2);
    const testFile = historyEndingWith(branches.surviving, "/test_m5_interleave.py");
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
});

// The rewound branch is base + user_add_1 + agent_add_1 (3 revisions [write, user-edit, edit]),
// and is READER-INDEPENDENT: agent_add_1's base is aligned, so seedStaleEditBases stays INERT here.
test("test_m5_rewound_branch_is_base_useredit_agentedit_reader_independent", () => {
    for (const branches of [
        reconstructBranches(loadRecords(M5_JSONL), m5Reader),
        reconstructBranches(loadRecords(M5_JSONL)),
    ]) {
        assert.equal(branches.rewound.length, 1);
        const rewound = branches.rewound[0]!;
        assert.equal(rewound.tip.toString(), "fcd9c268-cf98-4522-973d-c3356a58400f");
        const source = historyEndingWith(rewound.histories, "/m5_interleave.py");
        assert.equal(source.revisions.length, 3);
        assert.deepEqual(
            source.revisions.map((revision) => revision.kind),
            [EventKind.write, EventKind.userEdit, EventKind.edit],
        );
        assert.equal(
            finalTextOf(source.revisions[2]!),
            'def base():\n    return "base"\ndef user_add_1(): return "user1"\n\ndef agent_add_1():\n    return "agent1"',
        );
    }
});
```

**TDD for a char-lock** (record each RED→GREEN in impl-notes):
1. Run the file once. All 5 MUST be GREEN on the first run. **If any is RED, STOP** — the no-fix
   premise is violated; do not edit `src/` to make it pass without escalating.
2. Prove the crux (test 2) bites: change `EventKind.overwrite` → `EventKind.write`, re-run, confirm
   RED (`actual='write', expected='overwrite'`), restore.
3. Prove reader-dependence (test 3) bites: change the expected length `3` → `4`, re-run, confirm RED
   (`actual=3, expected=4`), restore — this pins that the reader is what injects the 4th revision.

> Signature note: `reconstructBranches(records, reader?)` returns `{ survivingTip, surviving:
> FileHistory[], rewound: RewoundBranchHistory[] }`; each `RewoundBranchHistory` has `.tip` (Uuid),
> `.rewindPoint`, `.histories` (FileHistory[]). `FileHistory` is `{ target: Path; revisions:
> FileRevision[] }`. Do NOT invent accessors — match these exactly.

---

## 6. Task 3 — CLI lock (`tests/reconstruction_cli_m5.test.ts`, 5 tests)

`runCli([M5_JSONL, ...flags])` builds the REAL on-disk sidecar reader. Tests 1–3 are reader-neutral
(branch topology). Tests 4–5 lock the surviving-verbose ladder and depend on the live backup
`17bbea89afb745a4@v5` resolving (same hazard m3's CLI tests accept; verified present on this
machine). Use `assert.ok(out.includes(...))`. Write the file EXACTLY:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M5_JSONL } from "./fixtures.ts";

// m5 is the first m-series scenario with a rewind, so its conversationDAG is BRANCHED: the root
// prompt A is the rewind point, with a rewound branch (D user-edit, E edit) and a surviving branch
// (F user-edit, G edit) beneath it.
test("test_m5_default_conversationDAG_shows_rewind_with_two_branches", () => {
    const out = runCli([M5_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #b3aed408   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #fcd9c268; rewind @ #b3aed408)"));
    assert.ok(out.includes("D  user-edit  m5_interleave.py  #5f68c3e1"));
    assert.ok(out.includes("E  edit       m5_interleave.py  #01YM4bk4"));
    assert.ok(out.includes("branch surviving (surviving; tip #93e7f94c)"));
    assert.ok(out.includes("F  user-edit  m5_interleave.py  #84166ae7"));
    assert.ok(out.includes("G  edit       m5_interleave.py  #0144beFx"));
});

// The fileDAG groups all five m5_interleave.py events in order, plus the single test-file write.
test("test_m5_default_fileDAG_groups_two_files_in_event_order", () => {
    const out = runCli([M5_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "m5_interleave.py\n  B  write      #01Mbgcvf\n  D  user-edit  #5f68c3e1\n  E  edit       #01YM4bk4\n  F  user-edit  #84166ae7\n  G  edit       #0144beFx",
    ));
    assert.ok(out.includes("test_m5_interleave.py\n  C  write      #01C4Qun2"));
});

// Two branches: surviving (two files), rewound (one file), with the rewind-point marker.
test("test_m5_list_branches_surviving_two_files_and_rewound_one_file", () => {
    const out = runCli([M5_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #93e7f94c    m5_interleave.py, test_m5_interleave.py"));
    assert.ok(out.includes("rewound    tip #fcd9c268  rewind @ #b3aed408    m5_interleave.py"));
});

// THE BACKUP-RECOVERY BYTE-LOCK (end-to-end through the real on-disk reader): the surviving verbose
// shows revision 2 = the @v5 overwrite recovered from the file-history backup (the 4-line block
// including user_add_2), and exactly four revisions (0..3), no fifth.
test("test_m5_surviving_verbose_recovers_user_add_2_from_backup", () => {
    const out = runCli([M5_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes(
        '(4 lines)\n     1 | def base():\n     2 |     return "base"\n     3 | def user_add_1(): return "user1"\n     4 | def user_add_2(): return "user2"',
    ));
    assert.ok(out.includes("revision 3"));
    assert.ok(!out.includes("revision 4"));
});

// THE FINAL GROUND-TRUTH BYTE-LOCK: the surviving final revision is the 5-line interleaved file.
test("test_m5_surviving_verbose_final_revision_is_five_line_ground_truth", () => {
    const out = runCli([M5_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes(
        '(5 lines)\n     1 | def base():\n     2 |     return "base"\n     3 | def user_add_1(): return "user1"\n     4 | def user_add_2(): return "user2"\n     5 | def agent_add_2(): return "agent2"',
    ));
});
```

**TDD:** run once — all 5 GREEN. If a multi-line `includes` (tests 2, 4, 5) fails, re-capture the
exact bytes and reconcile whitespace, do NOT hand-edit spaces:
```
npx tsx src/reconstruction_cli.ts "scenarios/executed/m5-full-interleave/d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl" --surviving --verbose 2>/dev/null
npx tsx src/reconstruction_cli.ts "scenarios/executed/m5-full-interleave/d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl" 2>/dev/null
```
Prove the locks bite (use a sentinel appearing NOWHERE else — do NOT reuse `(4 lines)`/`(5 lines)`):
in test 4 append `SENTINEL` inside `… return "user2"`, confirm RED, restore; in test 5 change
`agent_add_2` → `agent_add_2_SENTINEL`, confirm RED, restore. If test 4 or 5 is RED on the FIRST
run, the live backup `17bbea89afb745a4@v5` is not resolving on this machine — STOP and report
(do not weaken the assertion); tests 1–3 should still be green.

---

## 7. Task 4 — Docs (3 edits)

### 7.1 `plans/roadmap.md`
Flip line 29 from `[ ] M5 ->` to `[x] M5 -> [x] …`, mirroring the dense one-line M1–M4 entries.
Suggested content (one line): describe the full-interleave ladder; the two branches; that
`user_add_2` is backup-only and surfaces as the seeded `@v5` overwrite via the **S19 "base too
short" `seedStaleEditBases` reseed FIRING** (the active complement of m3's dormant reseed); that the
rewound branch is reader-independent; FIRST m-series scenario with a rewind (branched
conversationDAG); engine ALREADY correct (characterization LOCK, NO src change); cite
`seedStaleEditBases`/`editBaseIsStale`/`backupSeedWriteFor`; **10 new tests (5 engine + 5 CLI); 315
green; S1–S23 + m1 + m2 + m3 + m4 byte-for-byte unchanged.**

### 7.2 `plans/implementation-notes-api-from-scenarios.md`
PREPEND a newest-first entry above the m4 entry. Heading:
```
## <YYYY-MM-DD:HH:MM:SS> — m5 reconstruction (full interleave: user+agent edits across a code rewind, backup-recovered user_add_2) — COMPLETE; characterization/regression LOCK, NO src change; 315 tests green
```
Then `Chat title:` / `Path to JSONL log:` lines, then `### References` (the §3 file:line map),
`### Design decisions`, `### Deviations`, `### Tradeoffs`, `### Open questions`. Record the §5/§6
prove-the-lock RED→GREEN flips.

### 7.3 `plans/reconstruction-engine-design.md`
Append a scenario note **immediately after the m4 note (which ends at line 266,
`… one surviving branch, two files.`)**, 2-space indented inside the same parent bullet, **NO new
spec number (engine unchanged)**. Suggested content: m5 (`m5-full-interleave`) is the full
interleave — it composes existing guarantees: (a) user-edit-kept-on-surviving across a code rewind
(`selectBranchRecords`, S18/S20/S22); (b) the rewound branch scoped by `divergingIds`
(`buildRewoundBranchHistory`) holding `agent_add_1`; (c) the **S19 reseed FIRING** —
`editBaseIsStale` true (base too short) for the surviving `agent_add_2` Edit, so
`seedStaleEditBases`/`backupSeedWriteFor` recover `@v5` as a synthetic overwrite before G, while the
rewound `agent_add_1`'s aligned base keeps the reseed INERT there (reader-independent). The FIRING
complement of m3's dormant reseed; the first to recover a USER edit's disk state from a backup.

> Do NOT `git checkout`/`git restore` the four shared docs (`tests/fixtures.ts`, `plans/roadmap.md`,
> `plans/implementation-notes-…md`, `plans/reconstruction-engine-design.md`) to undo a temp edit —
> they carry uncommitted m2 + m3 + m4 edits too. Revert specific lines by hand.

---

## 8. Task 5 — Full verification
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test              # expect: tests 315 / pass 315 / fail 0
npx tsc --noEmit      # expect: clean
git diff --stat src/  # expect: EMPTY (m5 is a no-src-change LOCK)
```
`git diff src/` MUST be EMPTY. End-to-end byte-eyeball:
```
P="scenarios/executed/m5-full-interleave/d61d30ab-ced9-402a-ba99-60caf334ca63.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
# expect: surviving #93e7f94c (both files) + rewound #fcd9c268 rewind @ #b3aed408 (m5_interleave.py)
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
# expect: m5_interleave.py 4 revisions ending at the 5-line interleaved file; rev 2 = the
#         user_add_2 @v5 block; test file 1 revision
```

---

## 9. Task 6 — Commit (on user approval ONLY) then HAND OFF

One commit per scenario, only after the user approves. Stage **exactly** these 7 files — do NOT
`git add -A` (the worktree carries uncommitted m2 + m3 + m4 work and the `plans/sN/`/`plans/mN/`
handoff layout, which must NOT be swept in):
1. `tests/fixtures.ts`
2. `tests/reconstruction_engine_m5.test.ts`
3. `tests/reconstruction_cli_m5.test.ts`
4. `plans/roadmap.md`
5. `plans/implementation-notes-api-from-scenarios.md`
6. `plans/reconstruction-engine-design.md`
7. `plans/m5/m5-reconstruction-plan.md` (this plan)

No `src/` file is in the commit. Suggested message: `Implemented m5 handling`. (m2/m3/m4 commits are
separate outstanding decisions — do not bundle.)

> **Then CREATE A HANDOFF** via the `/jot:handoff-prompt` skill documenting the completed m5
> implementation (tests green count = 315, no-src-change confirmation, files staged) and naming the
> **NEXT scenario** (roadmap line 30 — currently `[ ] M6 ->`, undescribed) so an impl agent can plan
> it the same way (ground-truth-first: run the CLI live, verify byte-for-byte, then char-lock or
> real-fix). This handoff is a **required deliverable**, not optional. **Name the next scenario in
> the handoff TITLE only — never in loose body text** (the m4 completion handoff's body literal
> "Next scenario: m5" false-fired the m5 planning monitor; do not repeat that for m6).

---

## 10. Acceptance criteria (Definition of Done)

- [ ] `tests/fixtures.ts` has `M5_JSONL` (Desktop path), appended after `M4_JSONL`.
- [ ] `tests/reconstruction_engine_m5.test.ts` — 5 tests, in-memory `m5Reader`, all GREEN on first
      run; crux test 2 (`overwrite`→`write`) and test 3 (length `3`→`4`) proven to bite, then restored.
- [ ] `tests/reconstruction_cli_m5.test.ts` — 5 tests, all GREEN; branched conversationDAG asserted;
      surviving verbose shows the `@v5` `user_add_2` block (4-line) and the 5-line final; both
      multi-line sentinel flips proven to bite, then restored.
- [ ] `npm test` = **315 pass / 0 fail**; `npx tsc --noEmit` clean.
- [ ] `git diff src/` is **EMPTY**.
- [ ] roadmap M5 line `[x]`; impl-notes entry prepended; design.md note appended after the m4 note
      (**NO new spec number**).
- [ ] Committed (exact 7-file list, message `Implemented m5 handling`) only after user approval.
- [ ] **Completion handoff written via `/jot:handoff-prompt`** (names the next scenario, m6, in the
      TITLE only).
