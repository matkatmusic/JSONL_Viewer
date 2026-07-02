# Plan: S8 slice — repeated code-restore rewinds + a final conversation-only rewind (the surviving working tree is the last code that was written, NOT the final conversation head)

Implement in the listed order. Each task is **RED first** (write the failing `test_<behavior>`
with plain-English step comments) then **GREEN** (minimum code in verb-named functions). After
every task run the three checks under **Verify gate** and do not start the next task until all
three are green.

All work is in the `api-from-scenarios` worktree, built directly on the **uncommitted** S7 slice
(101 tests green, `tsc` clean; see `plans/handoff-api-from-scenarios-20260623-1152.md`). If S7 is
committed by the time this runs, build on that commit; nothing in this plan depends on whether S7 is
committed, only that the S7 working tree is present. Source modules today (S7 state):
`src/reconstruction_engine.ts` (model + public API + `reconstructBranches`),
`src/reconstruction_branches.ts` (branch-agnostic reconstruction core
`reconstructFileOver`/`reconstructFilesOver`), `src/reconstruction_branch.ts` (conversation-branch
model: `findConversationBranches`, `selectBranchRecords`, `selectLiveBranch`, `collectSurvivingUuids`,
`shortUuid`, `findBranchById`, plus the **private** walkers `indexRecordsByUuid`,
`collectAncestorUuids`, `collectHeadUuids`, `findSurvivingHead`), `src/reconstruction_extract.ts`,
`src/reconstruction_replay*.ts`, `src/reconstruction_lineage.ts`, `src/reconstruction_sidecar.ts`
(file-history backup reading), `src/reconstruction_render*.ts`, `src/reconstruction_cli.ts`,
`src/structures/file-history.ts` (`getFileHistorySnapshot` → hydrated `FileHistorySnapshotMessage`
with `snapshot.trackedFileBackups: FileBackupMap`, each backup `{ backupFileName: Path | null;
version: number; backupTime: Date }`), `src/structures/session-meta.ts` (`getLastPromptEntry`),
`src/structures/envelope.ts` (`TranscriptRecord`, `uuid?: Uuid`, `parentUuid?: Uuid | null`),
`src/structures/domain.ts` (`Uuid`, `Path`), `src/structures/vocabulary.ts` (`RecordType`,
`EventKind`). Tests:
`tests/reconstruction_{engine,engine_s4,engine_s5,engine_s6,engine_s7,extract,replay,sidecar,lineage,render,render_list,branch,cli}.test.ts`;
helpers `loadRecords` (`tests/utilities.ts`), `S1_JSONL`…`S7_JSONL` (`tests/fixtures.ts`). Style:
4-space indent, verb-named functions, `Path`/`Uuid` domain types (never bare strings for paths/ids),
compare enums by member (`x === EventKind.write`), one canonical home per helper (no
forwarding/re-export shims — move code, callers import the new home directly), named types over
inline anonymous returns, single-condition branching. Files are capped at **250 lines**.

## Background — why this slice exists, and what was verified

`s8-repeated-code-restore-rewinds` is the **second** scenario in the rewind / code-restore family
(S7–S23) and the first that breaks an assumption S7 baked in. Its recorded steps were:

1. `Hello`
2. Write `scenario8.py` (`celsius_to_fahrenheit`) **and** `tests/test_scenario8.py` — call this **v_a**.
3. `Thanks`
4. **Rewind: 3, code** — rewind the conversation 3 turns AND restore the working tree to that
   checkpoint (back to the root checkpoint, before step 1). v_a's files are reverted off disk.
5. Write `scenario8.py` + `tests/test_scenario8.py` again — **v_b**.
6. `Thanks`
7. **Rewind: 2, code** — rewind 2 turns AND restore the working tree (back to root again). v_b reverted.
8. `Hello`
9. Write `scenario8.py` + `tests/test_scenario8.py` again — **v_c**.
10. `Thanks`
11. **Rewind: 3** — a **conversation-only** rewind (NOTE: no `, code`). The conversation pointer
    moves back 3 turns (to root), but the working tree is **NOT** restored — v_c's files stay on disk.
12. `Hello`
13. Exit.

**The mental model S7 locked: a rewind is a branch point, like an unmerged git branch; rewound
branches are PRESERVED and retrievable.** S8 keeps that. What S8 adds is a distinction S7 never had
to make:

> **A `code` rewind restores the working tree (the abandoned branch's files leave disk). A
> conversation-only rewind does NOT — it moves the conversation pointer but the files written on the
> abandoned conversation branch remain on disk. Therefore the surviving working tree is the last code
> that was actually written, which is NOT necessarily reachable from the final conversation head.**

In S8 all three writes fork from the **same** root checkpoint `#04c69f8b` (every rewind returned to
root). The final conversation head is the step-12 `Hello` (`#d861247c`), which wrote no files — but
the working tree still holds **v_c** (step 9), because step 11 was conversation-only.

**The current engine is wrong on this transcript.** `findSurvivingHead` (in
`reconstruction_branch.ts`) defines the surviving branch as the **final `last-prompt` head in file
order** — which is the step-12 `Hello` (`#d861247c`). That head touched no files, so the engine
reports the surviving working tree as empty and demotes the real on-disk code (v_c) to a rewound
branch. Today's CLI default output:

```
## surviving  tip #d861247c
no files touched
## rewound  tip #546718c1  (rewind @ #04c69f8b)     <- v_a
  scenario8.py            0  create  2 lines  #014hpZNH
  tests/test_scenario8.py 0  create  5 lines  #018tEkT7
## rewound  tip #84d669da  (rewind @ #04c69f8b)     <- v_b
  scenario8.py            0  create  2 lines  #014Yd3uL
  tests/test_scenario8.py 0  create  5 lines  #01DtfEsT
## rewound  tip #2988ac8f  (rewind @ #04c69f8b)     <- v_c, WRONGLY rewound
  scenario8.py            0  create  2 lines  #01WWP6tD
  tests/test_scenario8.py 0  create  5 lines  #01Jn7kgw
```

That is wrong twice: the surviving tree is "no files touched" when v_c is plainly on disk, and v_c
(`#2988ac8f`) is listed as a rewound (abandoned) branch when its code is exactly what survived.

**The fix is to make `findSurvivingHead` working-tree-aware** by reading the transcript's own record
of the working tree: the `file-history-snapshot` records. Every snapshot carries
`trackedFileBackups` — a per-path map of the file's current backup `{ backupFileName, version,
backupTime }`. The harness re-snapshots after every turn, so the **last snapshot whose tracked set
actually changed** marks the last time the working tree changed, and that snapshot's `messageId` is a
conversation record on the branch that produced the surviving files. A conversation-only rewind
produces only trailing snapshots with an **unchanged** tracked set, so it is correctly ignored.

### Verified ground truth (throwaway analysis scripts, not committed)

For the S8 transcript:

- The `last-prompt` `leafUuid` heads, in file order, are
  `04c69f8b → d37f3b91 → 546718c1 → 9b8a4d98 → 84d669da → 81d1ff92 → 2988ac8f → e7814dd1 → d861247c`.
  The final head (`#d861247c`) is the step-12 `Hello` and wrote no files.
- The three Write pairs all fork from the root checkpoint `#04c69f8b`:
  | label | scenario8.py changeId | test changeId | head (last-prompt) | write times (Z) |
  |-------|-----------------------|---------------|--------------------|-----------------|
  | **v_a** | `toolu_014hpZNHr2bFtwmSCznHkcyg` | `toolu_018tEkT7V2MhRu8bZAmvMeVx` | `546718c1-d296-4574-9fae-be9f2bcbd30d` | 16:18:49 / 16:18:50 |
  | **v_b** | `toolu_014Yd3uLE2117YAypwyU9qBg` | `toolu_01DtfEsTj8g6b3Cc19qZPtF2` | `84d669da-d5f2-4513-bc1b-953da432e5ff` | 16:20:18 / 16:20:19 |
  | **v_c** | `toolu_01WWP6tDqo6z9fBrcPm9PR9H` | `toolu_01Jn7kgwR4AzdQNhq9ys36EG` | `2988ac8f-78f8-49eb-a992-5f4b705eac04` | 16:21:09 / 16:21:10 |
- There are **11** `file-history-snapshot` records. Per-file `version` numbers rise monotonically
  (1→7) — they are a backup-event counter, not a write counter, so versions are used only for
  **change detection** (does this snapshot's tracked set differ from the previous one), never as a
  write identity.
- The **final** snapshot (file-order last) has `messageId = f9238a6c…` (the step-12 `Hello`) and
  tracks `scenario8.py @ version 7` + `tests/test_scenario8.py @ version 7`, both
  `backupTime 2026-06-18T16:21:22.652Z`.
- The snapshot **before** it (`messageId = 81d1ff92…`) tracks both files at `version 6`. The snapshot
  that first records `version 7` is `messageId = 2267781c-8e69-49da-b83e-4a352ab2fef7` (the step-10
  `Thanks`), whose `parentUuid` is `2988ac8f…` — i.e. on **v_c's** branch. So the **last
  tracked-set change** is owned by `messageId 2267781c`, and the conversation head at-or-above it is
  `2988ac8f…` (v_c). The trailing step-12 snapshot leaves the tracked set unchanged (still v7), so it
  contributes no working-tree change.
- **scenario8.py is byte-identical across v_a/v_b/v_c** (`"def celsius_to_fahrenheit(c):\n    return
  c * 9 / 5 + 32\n"`, 2 lines) — it cannot disambiguate which version survived. **The test file
  differs and is the disambiguator:** v_a/v_b's test defines `def test_freezing_point():` while
  **v_c's test defines `def test_celsius_to_fahrenheit_zero():`** (both 5 lines). Assertions key on
  this.

Running the proposed algorithm (below) over the real transcripts yields: **S8** surviving head
`2988ac8f` (v_c) with rewound `[546718c1 (v_a), 84d669da (v_b)]`; **S7** surviving head `77494da3`
(unchanged from today); **S1** surviving head unchanged. The change is a verified **no-op for
S1–S7** and fixes S8.

## What S8 adds

S8 adds **working-tree-survival awareness** to the one place that decides which branch is the
surviving one — `findSurvivingHead`. Everything downstream (`selectLiveBranch`,
`findConversationBranches`, `collectSurvivingUuids`, `reconstructAll`, `reconstructBranches`, and the
CLI's default/`--surviving`/`--list-branches`/`--branch` views) already routes through
`findSurvivingHead` and needs **no behavioral change**.

The decision rule:

1. The surviving working tree is whatever the **last `file-history-snapshot` whose tracked set
   changed** owns. Call that snapshot's `messageId` the **working-tree owner**.
2. The surviving head is:
   - the **final `last-prompt` head** when the owner lies on that head's ancestor chain (i.e. the
     working tree IS reachable from the final conversation head — every non-rewind transcript and
     every `code`-rewind-ending transcript, including S1–S7); otherwise
   - the **`last-prompt` head at-or-above the owner** (walk the owner's `parentUuid` chain up to the
     first conversation head — this is the v_c head in S8, where a conversation-only rewind made the
     working tree diverge from the final head).
3. **Fallback (unchanged from today):** when there is no snapshot / no tracked-set change / the owner
   resolves to no head, use the final `last-prompt` head. This keeps any unmarked transcript on
   today's behavior.

**No new `EventKind`, no new per-line shape, no new container type, no sidecar change.** S8 reuses
S7's `RewoundBranchHistory` / `BranchedReconstruction` exactly; the only new code is the working-tree
resolution and a generic tree-walk extraction needed to keep files under the 250-line cap.

## Locked decisions (drive output shape; the implementer must confirm with the user — these mirror S2–S7's locked decisions and may be adjusted before coding if the user objects)

1. **The surviving working tree is defined by the transcript's `file-history-snapshot` records, not
   by the final conversation head.** The snapshots are the harness's own authoritative record of what
   is on disk; reconstructing from them is the faithful answer. (Rationale: S8's final action is a
   conversation-only rewind, so the final `last-prompt` head wrote nothing yet v_c is on disk.
   Anchoring "surviving" on the snapshots makes the reconstruction match reality. Rejected:
   "surviving = the abandoned branch with the latest write" — it happens to give v_c for S8 but is a
   guess that ignores restores and would mis-handle S9 `s9-code-restore-no-post-edit`, where the
   final action restores OLDER code with no new write.)
2. **The surviving head is chosen by the LAST tracked-set CHANGE, not the last snapshot.** A
   conversation-only rewind appends trailing snapshots whose tracked set is unchanged; those must not
   move the surviving pointer. (Rejected: using the final snapshot's `messageId` directly — in S8
   that is the step-12 `Hello`, which is exactly the wrong, file-less head.)
3. **Tracked-set change is detected by comparing each snapshot's `{path → version}` map to the
   previous snapshot's.** `version` is monotonic per file, so any add/remove/bump of a tracked file
   changes the map; an unchanged map (same paths, same versions) is "no working-tree change."
   (Rejected: comparing `backupFileName` — it is `null` for a file's first tracked version, so a
   freshly written file would compare equal-to-absent; `version` is always present and strictly
   increases.)
4. **When the working tree IS reachable from the final `last-prompt` head, keep that final head as
   the surviving head (do not switch to the owner's head).** This makes the change a strict no-op for
   S1–S7: in those transcripts the working-tree owner is always on the final head's ancestor chain,
   so `findSurvivingHead` returns exactly what it returns today (including S7's surviving tip
   `#77494da3`, which the S7 tests assert literally). Only a transcript where the working tree
   **diverges** from the final head (S8's conversation-only ending) takes the new path. (Rejected:
   always switching to the owner's head — it would change S7's surviving tip to an interior head and
   break S7's locked output for no benefit.)
5. **No snapshots / no tracked-set change → fall back to the final `last-prompt` head (today's
   behavior), never throw.** Guards unmarked or file-less transcripts and keeps S1–S6's single-branch
   transcripts a pure no-op.
6. **Rewound-branch enumeration, scoping, and CLI rendering are unchanged from S7.** Once
   `findSurvivingHead` returns the v_c head, `findConversationBranches` marks v_a/v_b as the abandoned
   maximal tips with file changes, the empty step-12 `Hello` tip is dropped (no diverging file change,
   exactly like S7's `#72` tangent), and the CLI's existing all-branches default renders surviving +
   2 rewound with **no CLI code change**.
7. **File-organization: extract the generic `parentUuid`/head walkers into a new leaf module
   `src/reconstruction_tree.ts`, and put the snapshot→owner detection in a new leaf module
   `src/reconstruction_worktree.ts`.** This is forced by the 250-line cap (`reconstruction_branch.ts`
   is 241/250 and the new logic would overflow it) and keeps the import graph acyclic.
   (`reconstruction_extract.ts` imports `FileEvent` types from `reconstruction_engine.ts`, which
   imports from `reconstruction_branch.ts`; the snapshot/tree helpers must therefore NOT depend on
   the engine or extract. They depend only on `structures/*`.) This mirrors S7's split of
   `reconstruction_branches.ts` off the engine for the same cap reason. (Rejected: a private
   re-implementation of the walkers inside `reconstruction_worktree.ts` — it would duplicate
   `collectAncestorUuids`/`indexRecordsByUuid`, violating the one-canonical-home rule.)

## Per-line model impact

**None.** No `EventKind`, no `FileRevision`/`LineEntry`/`LineValue` change, no new event or container
type. S8 changes only which records are selected as "surviving," upstream of all reconstruction.

## Module / import-graph plan (no cycles)

```
structures/{envelope,domain,vocabulary,session-meta,file-history}.ts   (leaves, unchanged)
        ▲                         ▲
        │                         │
reconstruction_tree.ts        reconstruction_worktree.ts     (NEW leaves)
        ▲                         ▲
        └──────────┬──────────────┘
            reconstruction_branch.ts        (imports tree + worktree; engine-type imports unchanged)
                     ▲
            reconstruction_engine.ts         (unchanged imports from branch)
```

- **`src/reconstruction_tree.ts`** (NEW) — generic conversation-tree walkers, moved verbatim out of
  `reconstruction_branch.ts` (their new canonical home; `reconstruction_branch.ts` imports them back):
  `indexRecordsByUuid`, `collectAncestorUuids`, `collectHeadUuids`, plus a NEW `findHeadAtOrAbove`.
  Imports only `TranscriptRecord` (envelope), `Uuid` (domain), `getLastPromptEntry` (session-meta).
- **`src/reconstruction_worktree.ts`** (NEW) — `findWorkingTreeOwner(records): Uuid | undefined`.
  Imports only `getFileHistorySnapshot` (file-history), `TranscriptRecord` (envelope), `Uuid`
  (domain). No dependency on `reconstruction_branch.ts`/`tree.ts` (it does not walk the tree — it
  only scans snapshots), so no cycle.
- **`src/reconstruction_branch.ts`** — drops the three moved walkers (imports them from
  `reconstruction_tree.ts`); imports `findWorkingTreeOwner` from `reconstruction_worktree.ts`; revises
  the private `findSurvivingHead`. All other functions unchanged.

---

## Task 1 — Working-tree-aware surviving head (the core fix)

The whole behavioral change lives here. RED proves both the synthetic divergence case and the real
S8 transcript; GREEN adds the two leaf modules and revises `findSurvivingHead`.

### RED

**1a. Add `S8_JSONL` to `tests/fixtures.ts`** (after `S7_JSONL`, same absolute-Desktop convention):
```ts
export const S8_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s8-repeated-code-restore-rewinds/ac304418-47fe-4c2b-be86-ea62783110e0.jsonl";
```

**1b. Add a synthetic conversation-only-rewind test to `tests/reconstruction_branch.test.ts`.** Build
records by hand (parsed-record shape, `Uuid` wrappers — never bare strings). Model: root `R`; a write
turn whose tail `Wa` is a `last-prompt` head, with a snapshot (`messageId = Wa`) that tracks `file` at
`version 2` (the working tree changed here); then a conversation-only rewind — a `Hello` turn `Hc`
forked from `R`, a final `last-prompt` for `Hc`, and a trailing snapshot (`messageId = Hc`) that
tracks `file` at the SAME `version 2` (no working-tree change). The surviving branch must be `Wa`
(the working tree), not the final head `Hc`.

```ts
import { RecordType } from "../src/structures/vocabulary.ts";

// A file-history-snapshot record in parsed/wire shape; getFileHistorySnapshot hydrates messageId
// and backupTime. version is what drives tracked-set change detection.
function snapshotRec(messageId: string, tracked: Record<string, number>): TranscriptRecord {
    const trackedFileBackups: Record<string, unknown> = {};
    for (const [path, version] of Object.entries(tracked)) {
        trackedFileBackups[path] = {
            backupFileName: null,
            version,
            backupTime: "2026-01-01T00:00:00.000Z",
        };
    }
    return {
        type: RecordType.fileHistorySnapshot,
        messageId,
        snapshot: { messageId, timestamp: "2026-01-01T00:00:00.000Z", trackedFileBackups },
        isSnapshotUpdate: true,
    } as unknown as TranscriptRecord;
}

// R = root checkpoint; Wa = the write turn's head (working tree changes to file@2 here);
// Hc = a conversation-only rewind back to R that writes nothing (working tree stays file@2).
function buildConversationRewindRecords(): TranscriptRecord[] {
    return [
        rec(RecordType.user, "R", null),
        rec(RecordType.assistant, "Wa", "R"),       // the write turn's tail
        lastPrompt("Wa"),                            // head: the code branch
        snapshotRec("Wa", { "file.py": 2 }),         // working tree changed -> file@2
        rec(RecordType.user, "Hc", "R"),             // conversation-only rewind to root: a new Hello
        lastPrompt("Hc"),                            // final head, but it wrote nothing
        snapshotRec("Hc", { "file.py": 2 }),         // working tree UNCHANGED (still file@2)
    ];
}

// The surviving branch is the one that produced the on-disk files (Wa), even though Hc is the final
// conversation head — because the final rewind was conversation-only (the snapshot is unchanged).
test("test_find_conversation_branches_survives_working_tree_not_final_head", () => {
    const branches = findConversationBranches(buildConversationRewindRecords());
    const surviving = branches.find((b) => b.isSurviving)!;
    assert.equal(surviving.tip.toString(), "Wa");
    // Hc is not surviving (it is the file-less conversation head).
    assert.ok(!branches.some((b) => b.isSurviving && b.tip.toString() === "Hc"));
});

// selectLiveBranch follows the same decision: it keeps Wa's chain (R, Wa), not Hc.
test("test_select_live_branch_follows_working_tree_after_conversation_rewind", () => {
    const kept = selectLiveBranch(buildConversationRewindRecords());
    const uuids = kept.filter((r) => r.uuid).map((r) => r.uuid!.toString()).sort();
    assert.deepEqual(uuids, ["R", "Wa"]);
});
```
These fail today (`findSurvivingHead` returns the final head `Hc`). The existing branch tests (no
snapshots → fallback) must keep passing.

**1c. Add `tests/reconstruction_engine_s8.test.ts`** (the real-transcript proof):
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { S8_JSONL } from "./fixtures.ts";

function scriptOf(histories) {
    return histories.find((h) => h.target.toString().endsWith("scenario8.py"))!;
}
function testFileOf(histories) {
    return histories.find((h) => h.target.toString().endsWith("tests/test_scenario8.py"))!;
}

// The surviving working tree is v_c (the last code written), because step 11 was a conversation-only
// rewind that left v_c's files on disk — even though the final conversation head wrote nothing.
test("test_default_reconstruction_is_the_last_written_code_after_conversation_rewind", () => {
    const surviving = reconstructAll(loadRecords(S8_JSONL));
    const script = scriptOf(surviving);
    assert.equal(script.revisions.length, 1);
    assert.equal(script.revisions[0]!.kind, EventKind.write);
    assert.equal(script.revisions[0]!.changeId.toString(), "toolu_01WWP6tDqo6z9fBrcPm9PR9H");
    // v_c's test is the disambiguator: test_celsius_to_fahrenheit_zero, not test_freezing_point.
    const lines = testFileOf(surviving).revisions[0]!.lines.map(
        (e) => e.values[e.values.length - 1]!.line,
    );
    assert.ok(lines.some((l) => l.includes("test_celsius_to_fahrenheit_zero")));
    assert.ok(!lines.some((l) => l.includes("test_freezing_point")));
});

// The two code-rewound versions (v_a, v_b) are preserved as rewound branches; the file-less step-12
// Hello head is NOT a branch (no diverging file change).
test("test_reconstruct_branches_retains_two_code_rewound_branches", () => {
    const { survivingTip, surviving, rewound } = reconstructBranches(loadRecords(S8_JSONL));
    assert.equal(survivingTip!.toString(), "2988ac8f-78f8-49eb-a992-5f4b705eac04");
    assert.equal(scriptOf(surviving).revisions[0]!.changeId.toString(), "toolu_01WWP6tDqo6z9fBrcPm9PR9H");
    assert.equal(rewound.length, 2);
    // Every rewound branch forked at the root checkpoint.
    assert.ok(rewound.every((b) => b.rewindPoint.toString() === "04c69f8b-47ae-4821-964c-bf30bcefd911"));
    const tips = rewound.map((b) => b.tip.toString()).sort();
    assert.deepEqual(tips, [
        "546718c1-d296-4574-9fae-be9f2bcbd30d", // v_a
        "84d669da-d5f2-4513-bc1b-953da432e5ff", // v_b
    ]);
    // v_a's scenario8.py is its own create (#014hpZNH), distinct from the surviving v_c (#01WWP6tD).
    const va = rewound.find((b) => b.tip.toString().startsWith("546718c1"))!;
    assert.equal(scriptOf(va.histories).revisions[0]!.changeId.toString(), "toolu_014hpZNHr2bFtwmSCznHkcyg");
});
```
These fail today (surviving is empty / three rewound branches).

### GREEN

**1. Create `src/reconstruction_tree.ts`** with a header comment ("Generic conversation-tree walkers
over the `parentUuid` forest and the `last-prompt` heads. The canonical home for ancestor-chain and
head lookups; `reconstruction_branch.ts` and the surviving-head decision both build on these. See
plans/s8/s8-reconstruction-plan.md.") and **move** `indexRecordsByUuid`, `collectAncestorUuids`, and
`collectHeadUuids` here **verbatim** from `reconstruction_branch.ts` (export them), and add:
```ts
// The first last-prompt head at or above `start` — walk start -> root by parentUuid and return the
// first uuid that is itself a conversation head. undefined when none is found (cycle/eof guarded).
// Used to map a working-tree owner record up to the conversation head that owns that working tree.
export function findHeadAtOrAbove(
    records: TranscriptRecord[],
    start: Uuid,
): Uuid | undefined {
    const headKeys = new Set(collectHeadUuids(records).map((head) => head.toString()));
    const byUuid = indexRecordsByUuid(records);
    const visited = new Set<string>();
    let current = byUuid.get(start.toString());
    while (current !== undefined) {
        const key = current.uuid!.toString();
        if (visited.has(key)) {
            break;
        }
        visited.add(key);
        if (headKeys.has(key)) {
            return current.uuid;
        }
        const parent = current.parentUuid;
        if (parent === undefined || parent === null) {
            break;
        }
        current = byUuid.get(parent.toString());
    }
    return undefined;
}
```

**2. Create `src/reconstruction_worktree.ts`** with a header comment ("Which working-tree state
survived a session. The harness re-snapshots tracked files after every turn; the LAST
file-history-snapshot whose `{path → version}` set differs from the previous one marks the last time
the working tree actually changed. Its `messageId` (the working-tree owner) names the conversation
record that produced the surviving files. A conversation-only rewind appends trailing snapshots with
an unchanged set, so it is correctly ignored. See plans/s8/s8-reconstruction-plan.md.") and:
```ts
import type { TranscriptRecord } from "./structures/envelope.ts";
import { getFileHistorySnapshot, type FileHistorySnapshotMessage } from "./structures/file-history.ts";
import { Uuid } from "./structures/domain.ts";

// A stable key for a snapshot's tracked set: each tracked file as "<path>@<version>", sorted. Two
// snapshots with the same key represent the same working-tree state (versions are monotonic, so any
// write/delete changes the key); an empty set is "".
function trackedVersionKey(snapshot: FileHistorySnapshotMessage): string {
    return snapshot.snapshot.trackedFileBackups
        .entries()
        .map(([path, backup]) => `${path.toString()}@${backup.version}`)
        .sort()
        .join("|");
}

// The messageId of the last file-history-snapshot whose tracked set changed vs. the previous
// snapshot — the record that produced the surviving working tree. undefined when there is no
// snapshot or the tracked set never changes (the caller then falls back to the final head).
export function findWorkingTreeOwner(
    records: TranscriptRecord[],
): Uuid | undefined {
    let owner: Uuid | undefined;
    let previousKey = "";
    for (const record of records) {
        const snapshot = getFileHistorySnapshot(record);
        if (snapshot === undefined) {
            continue;
        }
        const key = trackedVersionKey(snapshot);
        if (key !== previousKey) {
            owner = snapshot.messageId;
        }
        previousKey = key;
    }
    return owner;
}
```
(`FileBackupMap.entries()` already returns `Array<[Path, FileHistoryBackup]>` — see
`src/structures/file-history.ts`.)

**3. Revise `reconstruction_branch.ts`:**
- Replace the local definitions of `indexRecordsByUuid`, `collectAncestorUuids`, `collectHeadUuids`
  with an import from `./reconstruction_tree.ts` (also import `findHeadAtOrAbove`). Update the file's
  header comment to note the walkers now live in `reconstruction_tree.ts`.
- Import `findWorkingTreeOwner` from `./reconstruction_worktree.ts`.
- Replace `findSurvivingHead` with the working-tree-aware version:
```ts
// The surviving head: normally the final last-prompt head, but when a conversation-only rewind left
// the working tree on a branch the final head can't reach, the head at-or-above the working-tree
// owner instead. Falls back to the final head when there is no snapshot / no tracked-set change.
function findSurvivingHead(records: TranscriptRecord[]): Uuid | undefined {
    const heads = collectHeadUuids(records);
    if (heads.length === 0) {
        return undefined;
    }
    const finalHead = heads[heads.length - 1]!;
    const owner = findWorkingTreeOwner(records);
    if (owner === undefined) {
        return finalHead;
    }
    const finalChain = collectAncestorUuids(records, finalHead);
    if (finalChain.has(owner.toString())) {
        return finalHead;
    }
    const workingTreeHead = findHeadAtOrAbove(records, owner);
    if (workingTreeHead === undefined) {
        return finalHead;
    }
    return workingTreeHead;
}
```
Keep every branch single-condition. `selectLiveBranch`, `findConversationBranches`,
`collectSurvivingUuids` are unchanged — they already call `findSurvivingHead`.

### Verify gate

All 101 prior tests + the new S8 tests pass; `tsc` clean; every file ≤250 lines (confirm the two new
modules and that `reconstruction_branch.ts` is now well under 250). The S7 engine/CLI tests
(`#77494da3` surviving tip, S1–S6 plain lists) must stay green — this is the no-op proof.

---

## Task 2 — CLI all-branches lock-in for S8 + docs

No CLI source change is expected: once Task 1 fixes `findSurvivingHead`, the existing all-branches
default renders surviving v_c + two rewound branches, and `--surviving`/`--list-branches`/`--branch`
work unchanged. This task **locks that in** with CLI regression tests (they assert the now-correct
behavior that was wrong before Task 1) and updates the docs. If any assertion fails, fix the renderer
— do not weaken the assertion.

### RED → GREEN (regression lock)

Add to `tests/reconstruction_cli.test.ts` (import `S8_JSONL`; `S1_JSONL` is already imported for the
no-rewound passthrough test):
```ts
// Default (no flag): the surviving section is v_c's real files (NOT "no files touched"), plus the
// two code-rewound branches v_a and v_b. The file-less step-12 Hello head is not a branch.
test("test_default_view_shows_surviving_vc_plus_two_rewound", () => {
    const out = runCli([S8_JSONL]);
    assert.ok(out.includes("surviving"));
    assert.ok(!out.includes("no files touched"));
    assert.ok(out.includes("#01WWP6tD"));            // surviving v_c scenario8.py
    assert.ok(out.includes("#01Jn7kgw"));            // surviving v_c test
    assert.ok(out.includes("#014hpZNH"));            // rewound v_a
    assert.ok(out.includes("#014Yd3uL"));            // rewound v_b
    assert.ok(out.includes("#04c69f8b"));            // rewind point (root)
    assert.ok(!out.includes("overwrite"));           // each write is a create on its own branch
});

// --surviving: only v_c (the on-disk files), no rewound ids, no branch headers.
test("test_surviving_flag_shows_only_vc", () => {
    const out = runCli([S8_JSONL, "--surviving"]);
    assert.ok(out.includes("#01WWP6tD"));
    assert.ok(!out.includes("#014hpZNH"));           // v_a not shown
    assert.ok(!out.includes("#014Yd3uL"));           // v_b not shown
    assert.ok(!out.includes("## rewound"));
});

// --list-branches: one surviving line (tip #2988ac8f) and exactly two rewound summary lines.
test("test_list_branches_lists_surviving_vc_and_two_rewound", () => {
    const out = runCli([S8_JSONL, "--list-branches"]);
    assert.ok(out.includes("#2988ac8f"));            // surviving tip = v_c
    assert.ok(out.includes("#546718c1"));            // v_a tip
    assert.ok(out.includes("#84d669da"));            // v_b tip
    assert.equal((out.match(/rewound/g) ?? []).length, 2);
});

// --branch <v_a tip short id>: retrieves exactly v_a's writes, not v_b/v_c.
test("test_branch_id_retrieves_one_rewound_version", () => {
    const out = runCli([S8_JSONL, "--branch", "546718c1"]);
    assert.ok(out.includes("#014hpZNH"));            // v_a shown
    assert.ok(!out.includes("#014Yd3uL"));           // v_b not shown
    assert.ok(!out.includes("#01WWP6tD"));           // surviving v_c not shown
});
```
Run them: the `--branch`/`--list-branches`/`--surviving` assertions pass on the S7 renderer once
Task 1 lands; the default-view assertions were red before Task 1 (today's default says "no files
touched"). If `--list-branches`'s `rewound` count or any id is off, the bug is in Task 1's
surviving-head selection, not the renderer — re-check there.

### GREEN (docs; no engine code expected)

1. **`plans/reconstruction-engine-design.md`** — add an `### S8 — implemented now` section after the
   S7 specs (S7 ends at spec 34) with spec **35. working-tree-survival**: a `code` rewind restores
   the working tree, a conversation-only rewind does not; `findSurvivingHead` therefore picks the
   surviving branch from the `file-history-snapshot` records — the last snapshot whose `{path →
   version}` set changed names the working-tree owner, and the surviving head is the final
   `last-prompt` head when the owner is on its chain (S1–S7, a no-op) or the head at-or-above the
   owner otherwise (S8). `reconstructAll(S8)` is v_c; `reconstructBranches(S8)` additionally retains
   the v_a/v_b code-rewound branches; the file-less final `Hello` head is no branch. Add
   `reconstruction_tree.ts` and `reconstruction_worktree.ts` to the **Code layout** section (line
   ~120), and the new tests (`reconstruction_engine_s8.test.ts`, the two synthetic branch tests, the
   four CLI tests) to the test inventory.
2. **`plans/implementation-notes-api-from-scenarios.md`** — prepend a dated S8 entry: the code-vs-
   conversation rewind distinction; surviving working tree resolved from `file-history-snapshot`
   tracked-set changes; the no-op-for-S1–S7 guard (owner on the final head's chain); the
   `reconstruction_tree.ts` / `reconstruction_worktree.ts` split forced by the 250-line cap; that no
   `EventKind`/per-line/container type was added; foundation for S9 (`s9-code-restore-no-post-edit`,
   where the final action is a `code` restore with no post-edit — the same snapshot mechanism will
   point the surviving head at the restored older code).
3. **`plans/roadmap.md`** — change the `[ ] S8 ->` row to
   `[x] S8 -> [x] repeated code-restore rewinds + final conversation-only rewind (surviving working
   tree resolved from file-history-snapshot tracked-set changes, not the final conversation head; new
   reconstruction_tree.ts walkers + reconstruction_worktree.ts owner detection; findSurvivingHead
   working-tree-aware; no-op for S1–S7; no new event/revision/per-line/container kind)`.

### Verify gate, then the End-to-end check, then stop and report. Commit only after the user approves.

---

## Verify gate (run after every task; all three must pass before the next)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # all prior (101) + new S8 specs, 0 fail
npx tsc --noEmit         # No errors found (tsx does NOT type-check; this is the real type gate)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
`noUnusedLocals`/`noUnusedParameters` make a stray import a hard error. Ignore any stale
`PostToolBatch`/`PostToolUse` in-batch hook failure for a file written in the same batch as its test
— a manually-run `npm test` is authoritative. Clean room is absolute: never import or copy from
`/Users/matkatmusicllc/Desktop/claude code src/` beyond the `S8_JSONL` fixture path.

## End-to-end check (after Task 2)

```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s8-repeated-code-restore-rewinds/ac304418-47fe-4c2b-be86-ea62783110e0.jsonl"

npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null
# DEFAULT = all branches: "## surviving tip #2988ac8f" with scenario8.py create 2 lines #01WWP6tD and
# tests/test_scenario8.py create 5 lines #01Jn7kgw (test_celsius_to_fahrenheit_zero); then
# "## rewound tip #546718c1 (rewind @ #04c69f8b)" (v_a #014hpZNH/#018tEkT7) and
# "## rewound tip #84d669da (rewind @ #04c69f8b)" (v_b #014Yd3uL/#01DtfEsT). NO "no files touched",
# NO third rewound branch, NO overwrite.

npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null
# Surviving only, no headers: scenario8.py -> single create #01WWP6tD; test -> single create #01Jn7kgw.

npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
# Three summary lines: surviving tip #2988ac8f; rewound tip #546718c1 rewind @ #04c69f8b; rewound tip
# #84d669da rewind @ #04c69f8b.

npx tsx src/reconstruction_cli.ts "$P" --branch 546718c1 2>/dev/null
# Just v_a (#014hpZNH/#018tEkT7).

# Sanity: S7 is UNCHANGED (surviving tip still #77494da3, one rewound v1 branch), and a non-rewind
# transcript (S1) is still a plain list with no ## headers.
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s7-minimal-code-restore/d0d14660-4477-40fa-824c-e7f0bb91cd66.jsonl" 2>/dev/null
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s1-delete-file/b3634dc4-a385-40b9-8e23-6695a4f7bb7e.jsonl" 2>/dev/null
```

## Risks / out-of-scope (flag to the user; not part of S8's tasks)

- **S9 `s9-code-restore-no-post-edit` is the natural next step and validates this mechanism.** There
  the final action is a `code` restore (the working tree reverts to OLDER code) with no subsequent
  write. The snapshot tracked-set CHANGES at the restore (it reverts to an earlier backup), so the
  working-tree owner — and thus the surviving head — will point at the restored code, not the
  abandoned newer write. S8 builds exactly the foundation S9 needs; confirm against the S9 transcript
  when planning it. (The rejected "latest write wins" shortcut would fail S9 — call this out.)
- **`version`-based change detection assumes the harness never reuses a `(path, version)` for two
  different contents.** Verified true for S1–S8 (versions are monotonic per file). If a future
  transcript reorders or reuses versions, switch the key to include `backupTime`.
- **Identical-content versions across branches.** v_a/v_b/v_c's `scenario8.py` is byte-identical;
  only the test file differs. The reconstruction keeps them distinct by `changeId` (the right
  behavior — they are distinct write events), but any future "dedupe identical revisions" idea must
  not collapse across branches. Out of scope now.
- **Nested rewinds (a rewind off an already-rewound branch).** S8's three rewinds all return to the
  same root, so the maximal-tip dedup still sees a flat two-level tree. A tree deeper than two levels
  remains untested (flagged in S7 too) — revisit if a later scenario produces one.
- **Latent `2>&1` / `>/dev/null` redirect mis-parse (S5 regression), still open.** Unrelated to S8
  (no redirect here). Track as a separate `parseRedirect` hardening slice.
