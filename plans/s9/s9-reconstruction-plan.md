# Plan: S9 slice — code restore to older code with no post-edit (the surviving working tree is the *restored* code, even though the final conversation head is a later read-only branch that wrote nothing)

> Scope: make `reconstruction_cli` correctly reconstruct the file-change history of
> `s9-code-restore-no-post-edit`. The single behavioral change lives in
> `src/reconstruction_worktree.ts` (`findWorkingTreeOwner`). Everything downstream
> (`findSurvivingHead`, branch enumeration, the CLI renderer) is reused unchanged from S7/S8.
> Verified by a throwaway prototype before this plan was written: the change makes S9 correct and
> keeps S1–S8 green (109/109).

JSONL: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s9-code-restore-no-post-edit/b381c39b-e81e-45e8-b400-03edc4ee4be3.jsonl`
Predecessor: S8 (`s8-repeated-code-restore-rewinds`) — IMPLEMENTED, 109 tests green, uncommitted in the working tree at the time of writing. S9 builds directly on S8's working-tree-survival machinery.

---

## Background — why this slice exists, and what was verified

`s9-code-restore-no-post-edit` is the **third** scenario in the rewind / code-restore family (S7–S23)
and the first where the surviving working tree comes from a `code` restore to OLDER code rather than
from a write. Its recorded steps were:

1. Write `scenario9.py` (`greet`) **and** `tests/test_scenario9.py` — the only write version.
2. `Looks good, thanks.`
3. **Rewind: 2, code** — rewind the conversation AND restore the working tree. The restore re-versions
   the on-disk files back to the step-1 content (a code restore to OLDER code).
4. `Read scenario9.py and tell me what functions it has.` — a read; no file write.
5. `Thanks, that's all.` — no file write. Then exit.

The two prompts after the rewind (steps 4–5) **fork from the same root checkpoint as the original
write turn** and write nothing. So the conversation ends on a read-only branch, while the on-disk
working tree is the `scenario9.py` + `tests/test_scenario9.py` that the (now conversation-rewound)
write turn produced and the `code` restore put back.

### The distinction S9 adds (it refines S8)

> S8 established: *the surviving working tree is defined by the `file-history-snapshot` records, not
> by the final conversation head.* S9 keeps that, but breaks one S8 assumption: **after a `code`
> restore with no subsequent write, the harness emits trailing "refresh" snapshots that bump the
> per-file `version` counter while the on-disk content is unchanged (their `backupFileName` is
> `null`).** S8 detected working-tree change by the `{path → version}` map; that map changes on every
> refresh, so on S9 it wrongly marks the LAST refresh snapshot (on the read-only branch) as the
> working-tree owner. The fix is to detect change by **content identity (the carried-forward
> `backupFileName`), not the version counter.**

### The current engine is wrong on this transcript

Today's CLI default output (run before this plan; the prototype confirmed it):

```
## surviving  tip #936c10c7
no files touched
## rewound  tip #f1b8dede  (rewind @ #3944b6a8)
  scenario9.py             0  create  2 lines  16:19:13Z  #01PZ3yAw
  tests/test_scenario9.py  0  create  5 lines  16:19:14Z  #012EzSkd
```

That is wrong twice, exactly mirroring the S8 bug before its fix: the surviving tree is "no files
touched" when `scenario9.py` is plainly on disk (step 4 reads it), and the restored code
(`#f1b8dede`) is demoted to a rewound branch when its files are exactly what survived.

### Root cause (located, in source terms)

- `findSurvivingHead` (in `reconstruction_branch.ts`) already calls `findWorkingTreeOwner` and would
  switch the surviving head to the owner's branch if the owner were off the final head's ancestor
  chain — this is the S8 mechanism and it is correct.
- `findWorkingTreeOwner` (in `reconstruction_worktree.ts`) computes the owner as the LAST snapshot
  whose `{path → version}` key changed. On S9 the version bumps on every refresh, so the owner is the
  final refresh snapshot `b71764ed` (on the read-only branch) instead of `f1b8dede` (the last snapshot
  whose CONTENT changed). With the owner on the final head's chain, `findSurvivingHead` keeps the
  read-only head → `reconstructAll` over the read-only branch finds no Write events → "no files
  touched".

### Verified ground truth (throwaway analysis scripts + a reverted prototype, not committed)

**Snapshots (in file order), `{path: version / backupFileName}`:**

| # | snapshot `messageId` | tracked set |
|---|----------------------|-------------|
| 1 | `749d7e1a` | `[]` (empty) |
| 2 | `97d46bd5` | `scenario9.py` v1, bfn=`null` |
| 3 | `c5808115` | `scenario9.py` v1, `tests/test_scenario9.py` v1 — both bfn=`null` |
| 4 | `f1b8dede` | `scenario9.py` v2 bfn=`f59d446cee11359e@v2`, `tests/test_scenario9.py` v2 bfn=`96cd0ae3abd65e5f@v2` |
| 5 | `698b4195` | both v3, bfn=`null` |
| 6 | `9c88e21f` | both v4, bfn=`null` |
| 7 | `b71764ed` | both v5, bfn=`null` |

- The only snapshot carrying a **non-null** `backupFileName` is **#4 `f1b8dede`** (`@v2`). The final
  snapshot's `backupFileName` is `null` (a known property of this transcript version — there is no
  on-disk backup for the final state to recover from). The `@v2` backups exist on disk under
  `~/.claude/file-history/b381c39b-…/` and their content is byte-identical to the Write tool inputs.

**Conversation topology (`leafUuid` heads in file order):**
`3944b6a8 → 492cb51b → f1b8dede → 00e69244 → 936c10c7`.
- Final head (surviving conversation head) = `936c10c7-14c1-4309-8414-88c2cf0e67d6` (the read-only branch).
- Restored-code head = `f1b8dede-2b85-4f15-9e92-37005a262e6f` (the write turn's "Looks good, thanks.").
- Fork / rewind point = `3944b6a8-…` — the shared parent of BOTH the write prompt (`749d7e1a`) and
  the read prompt (`698b4195`).

**Write events (become `changeId`s):**

| path | tool_use id (changeId) | lines |
|------|------------------------|-------|
| `scenario9.py` | `toolu_01PZ3yAwBcZT3utNNCFEEMLn` | 2 (`def greet(name): / return "Hello, " + name`) |
| `tests/test_scenario9.py` | `toolu_012EzSkdGv9PA1K2NBwrwDot` | 5 (`from scenario9 import greet … assert greet("world") == "Hello, world"`) |

**Discriminator verified against BOTH real transcripts (this is the crux — the fix must not regress S8):**

| change-detection rule | S9 owner | S8 owner |
|-----------------------|----------|----------|
| current `{path → version}` | `b71764ed` (read-only branch) ❌ | `2267781c` (v_c) ✓ |
| **carried-forward `backupFileName`** | `f1b8dede` (restored code) ✓ | `2267781c` (v_c) ✓ |

The carried rule treats S8's trailing conversation-only snapshot `f9238a6c` as *unchanged* (same
`@v7` content id as the prior snapshot), preserving S8's owner; and it collapses S9's null-bfn
refreshes (v3/v4/v5) so the owner stays at `f1b8dede`. (S8 snapshot `backupFileName` evidence:
non-null only at `@v2`, `@v4`, `@v7`; the trailing `f9238a6c` repeats `@v7`.)

**Prototype outcome (the change, then reverted):** with the carried rule, S9 CLI default renders the
two files as a plain list (no `## headers`, no rewound branch); `--list-branches` →
`surviving  tip #f1b8dede   scenario9.py, test_scenario9.py`; S8 output unchanged; `npm test` = 109/0.

---

## What S9 adds

A single change to **how a working-tree change is detected** inside `findWorkingTreeOwner`: compare
each snapshot's **content signature** (carried-forward `backupFileName` per path) to the previous
snapshot's, instead of its `{path → version}` map. No new `EventKind`, no per-line/container type, no
CLI change, no new module, no file split. The set of records selected as "surviving" is what changes,
upstream of all reconstruction — identical in spirit to S8.

---

## Locked decisions (drive output shape; the implementer must confirm with the user — these mirror and refine S2–S8's locked decisions and may be adjusted before coding if the user objects)

1. **The surviving working tree is the *restored* code, reported via the existing
   working-tree-survival machinery.** Once `findWorkingTreeOwner` points at `f1b8dede`,
   `findSurvivingHead` switches the surviving head there (the owner is off the final head's ancestor
   chain — the read-only branch forks at root), so `reconstructAll(S9)` reconstructs the restored
   files from the Write events already on `f1b8dede`'s branch. (Rationale: the restored bytes ARE the
   Write events restored to disk, so reconstructing from those events preserves the real
   `changeId`s/line history — no synthetic, backup-sourced revision is needed, and the final
   snapshot's `backupFileName` is `null` anyway so there would be nothing to read.)
2. **A working-tree change is detected by content identity (carried-forward `backupFileName`), not by
   the `version` counter.** This REVISES S8's locked decision #3. (Rationale: S8 chose `version`
   because `backupFileName` is `null` for a file's first tracked version; but on S9 the harness bumps
   `version` on every post-restore refresh while content is unchanged, so `version` falsely reports
   change. The first-tracked-version concern is handled because a freshly written file also changes
   the tracked PATH SET — see decision #3 — so it is still detected.)
3. **The content signature changes when the tracked PATH SET changes OR a path's carried-forward
   `backupFileName` changes.** Per path, carry the last-seen non-null `backupFileName` forward across
   refresh snapshots (which report `null`); a path never yet backed up uses a fixed placeholder. Two
   snapshots with the same signature represent the same on-disk content even when their `version`
   numbers differ. (Rejected: comparing raw `backupFileName` without carry-forward — a refresh's
   `null` would read as "content removed/changed" and wrongly move the owner. Rejected: hashing backup
   file *contents* — the final state's backup is `null`/absent on disk, and content identity is
   already given by `backupFileName`.)
4. **No switch when the working tree is reachable from the final head (strict no-op for S1–S8).** The
   change is confined to `findWorkingTreeOwner`'s comparison; `findSurvivingHead`'s "keep the final
   head when the owner is on its ancestor chain" guard is untouched. Verified: with the carried rule,
   S8's owner is unchanged (`2267781c`) and S1–S7 owners stay on their surviving chains, so
   `findSurvivingHead` returns exactly what it returns today for every prior scenario. (This is what
   the prototype's 109/109 green run proved.)
5. **The read-only branch is dropped as a file-less tangent (no rewound branch for S9).** After the
   surviving head moves to `f1b8dede`, the read-only head `936c10c7` is an abandoned maximal tip whose
   diverging records change no file, so `buildRewoundBranchHistory` returns `undefined` and it is
   dropped — exactly as S7's read tangent and S8's `Hello` head are. The CLI therefore renders S9 as a
   plain single-branch list (no `## headers`), like S1–S6. (Rationale: the write turn's file changes
   are not *diverging* work — they ARE the surviving files, restored — so there is no abandoned file
   history to preserve. Accepted consequence: the default view does not visually flag that a rewind
   occurred; surfacing rewinds that produced no distinct file history is out of scope — see Risks.)
6. **Surviving tip is labelled `#f1b8dede` (the restored-code branch head), not the final read head.**
   This is the same convention S8 uses (its surviving tip is v_c's write head, not the final `Hello`).
   `--list-branches` shows one line: `surviving tip #f1b8dede`. (Accepted consequence: `--branch
   f1b8dede` returns nothing, because `f1b8dede` is now the surviving branch, not a rewound one;
   `--surviving` shows it.)

## Per-line model impact

**None.** No `EventKind`, no `FileRevision`/`LineEntry`/`LineValue` change, no new event or container
type. S9 changes only which records are selected as "surviving," upstream of all reconstruction.

## Module / import-graph plan (no cycles, no new module, no split)

Only `src/reconstruction_worktree.ts` changes (currently 43/250 lines; after the change ≈ 60/250 — no
split). It already imports `getFileHistorySnapshot` + `FileHistorySnapshotMessage` (file-history),
`TranscriptRecord` (envelope), `Uuid` (domain). The change ADDS imports of `FileHistoryBackup`
(file-history) and `Path` (domain). No other source file changes. The import graph is unchanged and
acyclic (`reconstruction_worktree.ts` depends only on `structures/*`).

---

## Task 1 — Content-aware working-tree owner (the entire behavioral fix)

The whole behavioral change lives here. RED proves both a synthetic code-restore-no-post-edit case and
the real S9 transcript; GREEN refines `findWorkingTreeOwner`'s change detection.

### RED

**1a. Add `S9_JSONL` to `tests/fixtures.ts`** (after `S8_JSONL`, same absolute-Desktop convention):
```ts
export const S9_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s9-code-restore-no-post-edit/b381c39b-e81e-45e8-b400-03edc4ee4be3.jsonl";
```

**1b. Extend the existing `snapshotRec` helper in `tests/reconstruction_branch.test.ts`** to model a
per-path `backupFileName` (default `null`, so the two existing S8 callers are unchanged). Replace the
helper's signature and body's backup field — leave the record envelope identical:
```ts
// A file-history-snapshot record in parsed/wire shape; getFileHistorySnapshot hydrates messageId and
// backupTime. `backups` gives a non-null backupFileName per path (default null = a refresh snapshot).
function snapshotRec(
    messageId: string,
    tracked: Record<string, number>,
    backups: Record<string, string> = {},
): TranscriptRecord {
    const trackedFileBackups: Record<string, unknown> = {};
    for (const [path, version] of Object.entries(tracked)) {
        trackedFileBackups[path] = {
            backupFileName: backups[path] ?? null,
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
```

**1c. Add a synthetic code-restore-no-post-edit test to `tests/reconstruction_branch.test.ts`** (after
the S8 `buildConversationRewindRecords` block). It models: a write turn `Wb` whose snapshot carries a
REAL backup (`file.py` v2, non-null `backupFileName`), then a `code` rewind back to root that starts a
read-only turn `Hr` whose snapshot is a refresh (same content, `version` bumped to 3, `backupFileName`
null). The surviving branch must be `Wb`, not the final head `Hr`.
```ts
// R = root checkpoint; Wb = the write turn's head (working tree gets a real backup: file@2 with a
// backupFileName); Hr = a `code` rewind back to R that only reads — its refresh snapshot re-versions
// the SAME on-disk content (file@3) with a NULL backupFileName.
function buildCodeRestoreNoPostEditRecords(): TranscriptRecord[] {
    return [
        rec(RecordType.user, "R", null),
        rec(RecordType.assistant, "Wb", "R"),                          // the write turn's tail
        lastPrompt("Wb"),                                              // head: the code (write) branch
        snapshotRec("Wb", { "file.py": 2 }, { "file.py": "backup-A@v2" }), // real content backup
        rec(RecordType.user, "Hr", "R"),                              // code rewind to root: a read-only turn
        lastPrompt("Hr"),                                              // final head, but it wrote nothing
        snapshotRec("Hr", { "file.py": 3 }),                          // refresh: version bumped, content unchanged (null bfn)
    ];
}

// The surviving branch is the one that produced the on-disk files (Wb), even though Hr is the final
// conversation head — a code restore with no post-edit re-versions the SAME content with a null
// backupFileName, so the version bump must NOT move the working-tree owner.
test("test_find_conversation_branches_survives_restored_code_not_final_refresh", () => {
    const branches = findConversationBranches(buildCodeRestoreNoPostEditRecords());
    const surviving = branches.find((b) => b.isSurviving)!;
    assert.equal(surviving.tip.toString(), "Wb");
    assert.ok(!branches.some((b) => b.isSurviving && b.tip.toString() === "Hr"));
});

// selectLiveBranch follows the same decision: it keeps Wb's chain (R, Wb), not Hr.
test("test_select_live_branch_follows_restored_code_after_code_rewind", () => {
    const kept = selectLiveBranch(buildCodeRestoreNoPostEditRecords());
    const uuids = kept.filter((r) => r.uuid).map((r) => r.uuid!.toString()).sort();
    assert.deepEqual(uuids, ["R", "Wb"]);
});
```
> Why these assertions: with today's `{path → version}` rule the signature changes `file.py@2 →
> file.py@3`, so the owner becomes `Hr` and `surviving.tip === "Hr"` → the first test FAILS (RED). The
> carried-`backupFileName` rule keeps the owner at `Wb`, flipping both to GREEN. `selectLiveBranch`'s
> `["R","Wb"]` proves the surviving record set excludes the read-only branch.

**1d. Add the real-transcript engine test file `tests/reconstruction_engine_s9.test.ts`** (mirror
`reconstruction_engine_s8.test.ts`; helpers typed `FileHistory[]` to satisfy `noImplicitAny`):
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    reconstructAll,
    reconstructBranches,
    type FileHistory,
} from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { S9_JSONL } from "./fixtures.ts";

function scriptOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("scenario9.py"))!;
}
function testFileOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("tests/test_scenario9.py"))!;
}

// The surviving working tree is the restored code (the only write version), recovered from the Write
// events on f1b8dede's branch — even though the final conversation head is a later read-only branch
// that wrote nothing. The code restore re-versioned the same content with a null backupFileName, so
// those refresh snapshots must not be treated as a working-tree change.
test("test_default_reconstruction_is_the_restored_code_after_code_rewind", () => {
    const surviving = reconstructAll(loadRecords(S9_JSONL));
    const script = scriptOf(surviving);
    assert.equal(script.revisions.length, 1);
    assert.equal(script.revisions[0]!.kind, EventKind.write);
    assert.equal(script.revisions[0]!.changeId.toString(), "toolu_01PZ3yAwBcZT3utNNCFEEMLn");
    assert.equal(
        testFileOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_012EzSkdGv9PA1K2NBwrwDot",
    );
});

// A code restore with no post-edit leaves no rewound branch: the read-only head touched no files, so
// it is a file-less tangent (dropped), and the restored write turn IS the surviving branch.
test("test_code_restore_with_no_post_edit_has_no_rewound_branches", () => {
    const { survivingTip, surviving, rewound } = reconstructBranches(loadRecords(S9_JSONL));
    assert.equal(survivingTip!.toString(), "f1b8dede-2b85-4f15-9e92-37005a262e6f");
    assert.equal(
        scriptOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_01PZ3yAwBcZT3utNNCFEEMLn",
    );
    assert.equal(rewound.length, 0);
});
```
> Why these assertions: today `reconstructAll(S9)` is empty (`scriptOf` is `undefined` → throws) and
> `reconstructBranches(S9)` reports `survivingTip === 936c10c7…` with `rewound.length === 1` — so both
> tests FAIL (RED). After GREEN they assert the prototype-verified result.

**Confirm RED:** run the suite; the four new tests (1c×2, 1d×2) must fail for the reasons above, and the
existing 109 must still pass. (`tsx` does not type-check; run `npx tsc --noEmit` too — see Verify gate.)

### GREEN — refine `findWorkingTreeOwner` in `src/reconstruction_worktree.ts`

Replace `trackedVersionKey` with a content-signature that carries `backupFileName` forward, and thread
a `carried` map through the scan. Extract the per-path resolution into its own function (avoids the
`>3×` nesting the project's hook rejects, and keeps each `if` single-condition).

```ts
import type { TranscriptRecord } from "./structures/envelope.ts";
import {
    getFileHistorySnapshot,
    type FileHistoryBackup,
    type FileHistorySnapshotMessage,
} from "./structures/file-history.ts";
import { Path, Uuid } from "./structures/domain.ts";

// Placeholder content id for a file that has been tracked but never yet backed up (its first tracked
// version reports backupFileName = null). Such a file is still detected as a working-tree change by
// the PATH-SET change when it first appears (see buildContentSignature).
const NEVER_BACKED_UP = "∅";

// The content identity of one tracked file: its last-known non-null backupFileName, carried forward
// across refresh snapshots that re-version unchanged content with a null backupFileName. Updates
// `carried` for this path when the snapshot supplies a real backupFileName.
function resolveContentId(
    path: Path,
    backup: FileHistoryBackup,
    carried: Map<string, string>,
): string {
    const key = path.toString();
    if (backup.backupFileName !== null) {
        carried.set(key, backup.backupFileName.toString());
    }
    return carried.get(key) ?? NEVER_BACKED_UP;
}

// A signature of a snapshot's working-tree CONTENT: each tracked file as "<path>@<contentId>", sorted.
// Unlike the version counter (which the harness bumps on every refresh snapshot), the carried
// backupFileName changes only when a file's content is actually re-backed-up — so two snapshots with
// the same signature represent the same on-disk content even if their version numbers differ. A new or
// removed path also changes the signature (so a freshly written file, whose first backupFileName is
// null, is still detected).
function buildContentSignature(
    snapshot: FileHistorySnapshotMessage,
    carried: Map<string, string>,
): string {
    return snapshot.snapshot.trackedFileBackups
        .entries()
        .map(([path, backup]) => `${path.toString()}@${resolveContentId(path, backup, carried)}`)
        .sort()
        .join("|");
}

// The messageId of the last file-history-snapshot whose CONTENT signature changed vs. the previous
// snapshot — the record that produced the surviving working tree. A `code` restore with no post-edit
// emits trailing refresh snapshots whose content is unchanged (bumped version, null backupFileName);
// those keep the same signature and are correctly ignored. undefined when there is no snapshot or the
// content never changes (the caller then falls back to the final head).
export function findWorkingTreeOwner(
    records: TranscriptRecord[],
): Uuid | undefined {
    let owner: Uuid | undefined;
    let previousSignature = "";
    const carried = new Map<string, string>();
    for (const record of records) {
        const snapshot = getFileHistorySnapshot(record);
        if (snapshot === undefined) {
            continue;
        }
        const signature = buildContentSignature(snapshot, carried);
        if (signature !== previousSignature) {
            owner = snapshot.messageId;
        }
        previousSignature = signature;
    }
    return owner;
}
```
Also update the module header comment (lines 1–6) to describe content-signature detection rather than
`{path → version}`.

> Why this shape: `resolveContentId` is the single place that knows "null backupFileName means
> carry the previous content id forward," keeping `buildContentSignature` a flat one-liner per path
> (no nested branch). `Map<string,string>` is keyed by the path's primitive string only as a private
> internal — the public parameters speak `Path`/`FileHistoryBackup` (domain-type rule). The scan
> structure (last-changed wins) is unchanged from the version-based version, so the only behavioral
> difference is the comparison key.

**Confirm GREEN:** the four new tests pass; all prior tests still pass.

### Verify gate (run; all three must pass before Task 2)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect 113 pass, 0 fail (109 + 4 new)
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```

---

## Task 2 — CLI regression lock-in + docs (no engine code expected)

### RED → GREEN (CLI regression lock) in `tests/reconstruction_cli.test.ts`

Mirror the S8 CLI tests. Add `S9_JSONL` to the CLI test imports and add three tests asserting the
prototype-verified rendering. (Use the same CLI-invocation helper the existing S8 CLI tests use; match
its style for capturing stdout and stripping the debugger noise.)

1. `test_s9_default_view_is_a_plain_list_of_the_restored_files` — the default (all-branches) view
   contains `scenario9.py` and `tests/test_scenario9.py` and contains **no** `## ` header and **no**
   `no files touched` (S9 has one surviving branch and zero rewound branches, so it renders like
   S1–S6).
2. `test_s9_list_branches_shows_only_the_surviving_restored_branch` — `--list-branches` output is the
   single line `surviving  tip #f1b8dede   scenario9.py, test_scenario9.py` (no `rewound` line).
3. `test_s9_surviving_flag_shows_the_restored_files` — `--surviving` lists the two files (no headers).

> These should pass immediately after Task 1's GREEN (the CLI is unchanged); they exist to LOCK the
> output so a future change cannot silently regress S9, exactly as S8's CLI regression tests do.

### GREEN (docs; no engine code)

1. **`plans/reconstruction-engine-design.md`** — add a `### S9 — implemented now` subsection with a
   new spec **36 (code-restore-no-post-edit)**: a `code` restore to older code with no subsequent
   write makes the surviving working tree the restored code; `findWorkingTreeOwner` detects
   working-tree change by **content identity (carried-forward `backupFileName`)**, not the `version`
   counter, so post-restore refresh snapshots (bumped version, null `backupFileName`, unchanged
   content) do not move the owner; `reconstructAll(S9)` is the restored write turn, `reconstructBranches(S9)`
   has zero rewound branches (the read-only head is a file-less tangent), and the CLI renders a plain
   single-branch list. Note that this **refines spec 35**: the `{path → version}` detail in spec 35 is
   superseded by the content signature (cross-reference both ways). List the proving tests:
   `test_find_conversation_branches_survives_restored_code_not_final_refresh`,
   `test_select_live_branch_follows_restored_code_after_code_rewind`,
   `test_default_reconstruction_is_the_restored_code_after_code_rewind`,
   `test_code_restore_with_no_post_edit_has_no_rewound_branches`, and the three S9 CLI tests. Also
   update the one-line description of `src/reconstruction_worktree.ts` (the "which working-tree state
   survived" line) to say content-signature, not version.
2. **`plans/implementation-notes-api-from-scenarios.md`** — add an S9 entry at the top: the root cause
   (version bumps on refresh), the fix (carried `backupFileName` signature), the design decision to
   reconstruct from the restored Write events (not synthetic backup content) since the final snapshot's
   `backupFileName` is null, any deviation taken during implementation, and the open questions in Risks.
3. **`plans/roadmap.md`** — mark S9 (`s9-code-restore-no-post-edit`) done.

### Verify gate, then the End-to-end check, then stop and report. Commit only after the user approves.

---

## Verify gate (run after every task; all three must pass before the next)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 113 pass, 0 fail after Task 1; still 113 after Task 2 + the 3 CLI tests = 116
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
(Expected final count: 109 baseline + 4 engine/branch + 3 CLI = **116** tests. Confirm the exact
number against the suite; the point is zero failures and no file over 250 lines.)

## End-to-end check (after Task 2; proves the restore survives and S8/S1 are unchanged)

```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s9-code-restore-no-post-edit/b381c39b-e81e-45e8-b400-03edc4ee4be3.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null
# DEFAULT = a plain list (NO ## headers, NO "no files touched"):
#   <cwd>/scenario9.py
#     0  create  2 lines  16:19:13Z  #01PZ3yAw
#   <cwd>/tests/test_scenario9.py
#     0  create  5 lines  16:19:14Z  #012EzSkd

npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
# One line: "surviving  tip #f1b8dede   scenario9.py, test_scenario9.py"  (no rewound line)

npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null
# The two files, no headers.

# Sanity (unchanged): S8 still default = surviving #2988ac8f + 2 rewound (#546718c1, #84d669da);
# S7 still surviving #77494da3 + one rewound #55ee424f; S1 still a plain list with no ## headers.
```

## Risks / out-of-scope (flag to the user; not part of S9's tasks)

- **The default view does not flag that a rewind/restore happened.** Because the read-only branch has
  no distinct file history, S9 renders like a plain S1-style session. Surfacing "a code restore
  occurred" in the default output is a presentation enhancement that would touch the renderer for ALL
  scenarios — out of scope here (decision #5).
- **`backupFileName` is not always populated** (the final S9 snapshot is null; a known transcript
  property). The fix tolerates this via carry-forward, but a transcript whose backups are *entirely*
  null would degrade to path-set-only change detection. No such scenario is in scope; note it for a
  future slice if one appears.
- **Carried `version` is no longer used for change detection** (it remains in the data). If a later
  scenario needs version for some other purpose, that is a separate concern.
- **Carried-forward `parseRedirect` regression (`2>&1` / `>/dev/null`)** noted in the S8 handoff is
  still open and unrelated to S9 — track it as its own `parseRedirect` hardening slice.
