# Plan: S7 slice — conversation rewind / code restore (preserve rewound branches as retrievable unmerged-branch histories)

Implement in the listed order. Each task is **RED first** (write the failing `test_<behavior>`
with plain-English step comments) then **GREEN** (minimum code in verb-named functions). After
every task run the three checks under **Verify gate** and do not start the next task until all
three are green.

All work is in the `api-from-scenarios` worktree, built directly on the committed S6 slice
(`f5da4e3 Implemented S6 handling`; 88 tests green, `tsc` clean). Source modules today:
`src/reconstruction_engine.ts` (model + public API + copy-seed recursion + optional `BackupReader`),
`src/reconstruction_extract.ts` (records → events), `src/reconstruction_replay.ts` /
`src/reconstruction_replay_edit.ts` (events → revisions), `src/reconstruction_lineage.ts`
(rename/copy path resolution), `src/reconstruction_sidecar.ts` (S5 redirect content),
`src/reconstruction_render.ts` / `src/reconstruction_render_list.ts` (diff + list views),
`src/reconstruction_cli.ts`, `src/structures/vocabulary.ts` (`EventKind`, `RecordType`),
`src/structures/session-meta.ts` (`getLastPromptEntry` — hydrates a `last-prompt` record's
`leafUuid` into a `Uuid`), `src/structures/envelope.ts` (`TranscriptRecord`, with `uuid?: Uuid` and
`parentUuid?: Uuid | null`), `src/structures/domain.ts` (`Uuid`, `Path`),
`src/structures/path-resolve.ts`, `src/structures/line-model.ts` (`DOES_NOT_EXIST_YET`). Tests:
`tests/reconstruction_{engine,engine_s4,engine_s5,engine_s6,extract,replay,sidecar,lineage,render,render_list,cli}.test.ts`;
helpers `loadRecords` (`tests/utilities.ts`), `S1_JSONL`…`S6_JSONL` (`tests/fixtures.ts`). Style:
4-space indent, verb-named functions, `Path`/`Uuid` domain types (never bare strings for
paths/ids), compare enums by member (`x === EventKind.write`), one canonical home per helper
(no forwarding/re-export shims), named types over inline anonymous returns, single-condition
branching.

## Background — why this slice exists, and what was verified

`s7-minimal-code-restore` is the **first scenario in the rewind / code-restore family** (S7–S23).
Its recorded steps were: (1) ask Claude to write `scenario7.py` with `celsius_to_fahrenheit` plus a
test; (2) **Rewind: 1, code** — rewind the conversation one user turn **and restore the code to
that checkpoint**; (3) ask again for `scenario7.py` with `celsius_to_fahrenheit` **and** a new
`fahrenheit_to_celsius`, plus tests; (4) `Thanks.`; (5) exit.

**The mental model (locked by the user): a rewind is a branch point, like an unmerged git branch.**

```
surviving:  A ── B ──────────── D ── E      (the kept work — Claude's post-rewind writes)
                  └── C                      (the rewound-away work — preserved, not discarded)
```
`B` is the checkpoint the rewind returned to. `C` is the work that was abandoned by the rewind —
analogous to commits on a branch that was never merged. `D → E` is the work kept afterward. The
goal of S7 is to **reconstruct and retain BOTH lines** so a consumer can still retrieve the file
changes that happened on a rewound branch — exactly as `git log <other-branch>` shows commits that
were never merged into the surviving line.

**A rewind is recorded in the JSONL as a fork in the `parentUuid` tree.** The pre-rewind request
and the post-rewind request are two children of the same parent — the checkpoint. The transcript
also writes, at each session-segment boundary, a `last-prompt` record whose `leafUuid` points to
the conversation head at that moment; the sequence of those heads traces where the conversation
pointer moved, and the **final** `last-prompt`'s `leafUuid` is the surviving head.

**The current engine is wrong on this transcript.** `extractFileEvents` walks every record in file
order, so for `scenario7.py` it sees the pre-rewind Write (`C`) and the post-rewind Write (`E`) and
treats the second as an **overwrite** of the first. Today's no-flag CLI output:

```
scenario7.py
  0  create  2 lines   16:18:20Z  #012jN7F9        <- rewound (C), wrongly kept inline
  1  overwrite  8 lines  (+6)   16:19:14Z  #01JWycFr   <- surviving (E), wrongly shown as building on C
tests/test_scenario7.py
  0  create  5 lines   16:18:21Z  #015eug6V        <- rewound (C)
  1  overwrite  72 lines  (+67)   16:19:22Z  #01HXdTmy   <- surviving (E)
```

That conflates two branches into one linear history. The correct model is two **separate** branches
that fork at the rewind point: a surviving branch (the v2 writes) and a rewound branch (the v1
writes), each retrievable on its own.

Verified against the real transcript (throwaway scripts, not committed):

- The `last-prompt` `leafUuid` heads, in file order, are `rec#9 → #14 → #48 → #72 → #100 → #123`.
  The final/surviving head is `#123`. The heads NOT on `#123`'s ancestor chain are the **abandoned
  heads** (`#14`, `#48`, `#72`); deduped to maximal tips (dropping any head that is an ancestor of
  another) they are `#48` and `#72`.
- **`#48` is the rewound v1 branch**: it forks from the surviving path at the rewind point `rec#9`
  (uuid `2e47efbe…`), and its diverging portion contains the v1 Writes `scenario7.py` (`#012jN7F9`)
  and `tests/test_scenario7.py` (`#015eug6V`).
- **`#72` is a trivial tangent** (an aborted exploration: a `Read` + `ls`): its diverging portion
  has **no** file-change events, so it is not a code-change branch and is excluded.
- Using last-prompt heads (not raw childless leaves) is what makes this clean: the v1 work has TWO
  childless terminal records (an attachment `#41` and a system `#48`) hanging off the same trunk;
  enumerating by leaf would double-count it, while the single last-prompt head `#48` names the
  branch once.
- The surviving branch reconstructs to exactly the v2 writes; on S1/S2/S5/S6 (no rewind) the
  surviving-branch record set equals all records, so default reconstruction is **unchanged**.

## What S7 adds

S7 adds **conversation-branch awareness**:

1. **Branch enumeration** — derive the conversation's branches from the `last-prompt` heads: one
   surviving branch (the final head) and zero or more rewound branches (abandoned heads, deduped to
   maximal tips), each tagged with its **rewind point** (the record it forked from on the surviving
   line).
2. **Branch-scoped reconstruction** — reconstruct a file's history over the records of any single
   branch, reusing the existing engine unchanged.
3. **Branch-aware public API + retrieval** — `reconstructAll`/`reconstructFile` keep returning the
   **surviving** branch (so the default CLI view and S1–S6 are unchanged), and a new
   `reconstructBranches` returns the surviving histories **plus** each rewound branch's file
   changes. A new CLI `--branches` flag renders them.

**No new `EventKind`, no new per-line shape, no sidecar change.** The rewind is *structural* (a fork
in the conversation tree), not a file event. Each branch's revisions are the existing `FileRevision`
per-line model, just reconstructed over that branch's records.

## Locked decisions (drive output shape; the implementer must confirm with the user — these mirror S2–S6's locked decisions and may be adjusted before coding if the user objects)

1. **Rewound branches are PRESERVED and retrievable, never discarded.** A rewind is an unmerged
   branch off the checkpoint; its file changes must remain reconstructable, like `git log` on a
   branch that was never merged. (This is the user's explicit directive and the organizing principle
   for S7–S23. It reverses the "discard the abandoned branch" stance from this plan's first draft.)
2. **The default CLI view shows ALL branches** (surviving + every rewound branch), but is
   **byte-identical to today's plain list when there are no rewound branches** (so S1–S6 CLI output
   does not change — they have a single branch and render with no headers). Only a transcript that
   actually has rewound branches gets the multi-branch, headered view by default. A `--surviving`
   flag opts back into the surviving-branch-only view (the "current state of the working tree").
   (Rationale: the user's directive is "default to show all branches" — a rewind's unmerged work is
   visible without a flag. The no-rewound-branches passthrough keeps S1–S6 unchanged.) Note: the
   **engine API** `reconstructAll`/`reconstructFile` still return the **surviving** branch only — they
   are the "current files" API used by S1–S6 and by `--surviving`/`--target`; the all-branches view
   is the CLI's default rendering of `reconstructBranches`, not a change to the engine default.
3. **Branch heads come from the `last-prompt` `leafUuid` sequence**, not from enumerating childless
   leaves. Heads (in file order) → surviving = the final head; rewound = heads not on the surviving
   head's ancestor chain, **deduped to maximal tips** (drop a head that is an ancestor of another
   abandoned head). (Rejected: enumerating childless leaves — it double-counts a branch with several
   terminal records, e.g. S7's v1 work has two terminal leaves. Rejected: detecting forks by
   "parent with >1 child" — attachments are routinely siblings of user records, producing false
   forks, and a fork alone never says which child survived. The last-prompt head is the engine's own
   authoritative pointer and is unique per conversation head.)
4. **A branch's records = the records on its tip's `parentUuid` ancestor chain, plus every uuid-less
   meta/header record.** `selectBranchRecords(records, tip)` generalizes the surviving-only
   `selectLiveBranch`. Meta records (`last-prompt`, `mode`, `permission-mode`, `bridge-session`,
   `file-history-snapshot`, `ai-title`) carry **no `uuid`** and are always kept (the sidecar /
   session-id lookup needs them); records with a `uuid` (user/assistant/attachment) are kept only on
   the tip's ancestor chain. (Rejected: "keep if parent on-path" — re-admits the sibling branch's
   first message, whose parent is the shared checkpoint.)
5. **A rewound branch's rewind point = the deepest record on its tip's path that is also on the
   surviving path** (the fork commit "B"). A rewound branch is reported **only if its diverging
   portion (records past the rewind point) contains ≥1 file-change event**, and its reported
   histories are scoped to files changed on that diverging portion — i.e., "the code changes that
   occurred after the rewind." (Rejected: reporting every abandoned head — trivial tangents like
   S7's `#72` Read/`ls` exploration carry no code change and would be noise. Rejected: reporting the
   branch's pre-fork files too — those are identical to the surviving branch's shared history and add
   nothing.)
6. **The selection / reconstruction split keeps the engine core branch-agnostic.** Factor the
   reconstruction body into a core that reconstructs over *exactly the records it is given*
   (`reconstructFilesOver` / `reconstructFileOver`); the public `reconstructAll`/`reconstructFile`
   pre-select the surviving branch and call the core; `reconstructBranches` calls the same core once
   per branch with that branch's records. `extractFileEvents` does **no** filtering. (Rejected:
   hard-coding the surviving filter inside `extractFileEvents` — it would make reconstructing any
   non-surviving branch impossible, the whole point of S7.)
7. **Defensive fallback: a transcript with no `last-prompt` head, or a head that resolves to no
   record, reconstructs as a single surviving branch over all records** — today's behavior, never a
   throw. (All of S1–S7 carry heads; this guards the unknown and keeps S1–S6 a pure no-op.)

## Per-line model impact

**None to the per-line types.** `FileRevision`, `LineEntry`, `LineValue`, and every `EventKind` are
unchanged; each branch's revisions are reconstructed with the existing replay. S7 adds only
**container** types that group existing `FileHistory` values by branch (`RewoundBranchHistory`,
`BranchedReconstruction`) and a conversation-level `ConversationBranch` descriptor. No new genesis
site, no new revision kind.

## Ground truth (S7 transcript — assert against these literal values)

`tests/fixtures.ts` gets `S7_JSONL` pointing at
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s7-minimal-code-restore/d0d14660-4477-40fa-824c-e7f0bb91cd66.jsonl`
(absolute Desktop path, matching the S1–S6 convention; the in-worktree `scenarios/` symlink resolves
to the same file).

- `sessionId` = `d0d14660-4477-40fa-824c-e7f0bb91cd66`.
- `cwd` = `/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.daizis4h`.
- Surviving head (final `last-prompt` `leafUuid`) = `77494da3-68c9-491f-adc6-6cb80ee0c907` (rec `#123`).
- Rewound v1 branch tip = `55ee424f-b714-49fe-895f-c748401bb202` (rec `#48`); its **rewind point** is
  the record with uuid `2e47efbe-fc3a-4ac7-80d2-178e27c61cda` (rec `#9`).
- A second abandoned head exists (rec `#72`) with **no** file changes on its diverging portion — it
  must be **excluded** from the rewound branches.

File events by branch (`changeId` = the tool_use id; `shortChangeId` drops `toolu_` and keeps 8):

| branch | time (Z) | tool | changeId (toolu_…) | effect |
|--------|----------|------|--------------------|--------|
| **rewound (v1)** | 16:18:20.396 | Write | `012jN7F9LdRn7f8dawUAqdUR` | create `scenario7.py`, 2 lines, `celsius_to_fahrenheit` only |
| **rewound (v1)** | 16:18:21.340 | Write | `015eug6VCcqeZykMxELMCoWo` | create `tests/test_scenario7.py`, 5 lines |
| **surviving (v2)** | 16:19:14.264 | Write | `01JWycFrizHxePBLhz35UrhG` | create `scenario7.py`, 8 lines, both functions |
| **surviving (v2)** | 16:19:22.308 | Write | `01HXdTmyKwKMdNYma9WhEYGj` | create `tests/test_scenario7.py`, 72 lines |

There is no `rm`/`mv`/`cp`/`Edit`/redirect event in S7; each branch's only events are its two Writes.

Literal contents:
- Rewound `scenario7.py` = `["def celsius_to_fahrenheit(c):", "    return c * 9 / 5 + 32"]` (2 lines;
  has `celsius_to_fahrenheit`, **not** `fahrenheit_to_celsius`).
- Rewound `tests/test_scenario7.py` = `from scenario7 import celsius_to_fahrenheit` … one
  `test_freezing_point` (5 lines).
- Surviving `scenario7.py` (8 lines) includes `def fahrenheit_to_celsius(f: float) -> float:`.
- Surviving `tests/test_scenario7.py` (72 lines) imports both functions.

## Expected reconstruction

`reconstructAll(loadRecords(S7_JSONL))` (default / surviving) returns **two** histories, each ONE
revision — the v2 creates (`scenario7.py` create 8 lines `#01JWycFr`; `tests/test_scenario7.py`
create 72 lines `#01HXdTmy`). No `overwrite`; neither v1 changeId appears.

`reconstructBranches(loadRecords(S7_JSONL))` returns:
- `surviving`: the two histories above.
- `rewound`: **one** `RewoundBranchHistory` — `rewindPoint` = `2e47efbe…`, `tip` = `55ee424f…`,
  `histories` = `scenario7.py` (one `create`, 2 lines, `#012jN7F9`, `celsius_to_fahrenheit` only) and
  `tests/test_scenario7.py` (one `create`, 5 lines, `#015eug6V`). The `#72` tangent is absent
  (no file change).

Locked default list format (no flag — surviving only):
```
scenario7.py
  0  create  8 lines   16:19:14Z  #01JWycFr

tests/test_scenario7.py
  0  create  72 lines   16:19:22Z  #01HXdTmy
```
The CLI branch operations (all compose with the existing `--target`/`--verbose`/`--diff` render
modes):

- **default (no branch flag)** — render ALL branches. When there are rewound branches, the surviving
  branch is printed under a header, then each rewound branch under a header naming its rewind point
  and tip. **When there are no rewound branches (S1–S6), the output is exactly today's plain list —
  no header.** For S7:
  ```
  ## surviving  tip #77494da3
  scenario7.py
    0  create  8 lines   16:19:14Z  #01JWycFr
  tests/test_scenario7.py
    0  create  72 lines   16:19:22Z  #01HXdTmy

  ## rewound  tip #55ee424f  (rewind @ #2e47efbe)
  scenario7.py
    0  create  2 lines   16:18:20Z  #012jN7F9
  tests/test_scenario7.py
    0  create  5 lines   16:18:21Z  #015eug6V
  ```
- **`--surviving`** — the surviving branch only (the "current state of the working tree"), in the
  chosen render mode — exactly the plain list/diff/verbose of the kept files (v2 for S7). This is the
  opt-out from the all-branches default.
- **`--list-branches`** — a one-line summary per branch (like `git branch`): kind, tip short id,
  rewind point, files touched. For S7:
  ```
  surviving  tip #77494da3                       scenario7.py, tests/test_scenario7.py
  rewound    tip #55ee424f  rewind @ #2e47efbe    scenario7.py, tests/test_scenario7.py
  ```
- **`--branch <id>`** — render ONE specific branch, selected by its tip short id (the ids printed by
  `--list-branches`; the literal `surviving` is also accepted). This retrieves a *specific* unmerged
  branch when there are several. Composes with `--target` (one file on that branch) and
  `--diff`/`--verbose`. `--branch 55ee424f` on S7 prints the rewound v1 histories; `--branch 55ee424f
  --target …/scenario7.py --diff` prints just that file's v1 diff. An unknown id throws the usage
  message listing the available branch ids.

(Exact spacing/line-count follow the existing renderer; the RED tests assert substrings.)

---

## Task 1 — New module `src/reconstruction_branch.ts`: enumerate branches + select a branch's records

Add the conversation-branch model and record-selection, driven by synthetic unit tests before any
engine wiring.

**Types** (named, in this module):
```ts
// A branch through the conversation's parentUuid tree, named by its tip (a last-prompt leafUuid).
// The surviving branch is the one the final last-prompt points to; a rewound branch forked at
// rewindPoint and was abandoned. rewindPoint is undefined for the surviving branch.
export type ConversationBranch = {
    tip: Uuid;
    rewindPoint: Uuid | undefined;
    isSurviving: boolean;
};
```

**Imports it needs** (no engine import — `session-meta` imports only `envelope`/`vocabulary`/
`domain`, so the graph stays acyclic): `TranscriptRecord` (type, `./structures/envelope.ts`),
`getLastPromptEntry` (`./structures/session-meta.ts`), `Uuid` (`./structures/domain.ts`).

**RED:** add `tests/reconstruction_branch.test.ts`. Build synthetic records by hand (no fixture), in
the parsed-record shape (`Uuid`/`Path` wrappers, never bare strings). Model: checkpoint `B`, an
abandoned child `C`, a surviving child `D→E`, a `last-prompt` for the abandoned head `C` and one for
the surviving head `E` (file order: abandoned head's last-prompt first, surviving head's last):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    findConversationBranches,
    selectBranchRecords,
    selectLiveBranch,
} from "../src/reconstruction_branch.ts";
import { RecordType } from "../src/structures/vocabulary.ts";
import { Uuid } from "../src/structures/domain.ts";
import type { TranscriptRecord } from "../src/structures/envelope.ts";

function rec(type: RecordType, uuid: string, parent: string | null): TranscriptRecord {
    return { type, uuid: new Uuid(uuid), parentUuid: parent === null ? null : new Uuid(parent) } as TranscriptRecord;
}
function lastPrompt(leaf: string): TranscriptRecord {
    return { type: RecordType.lastPrompt, leafUuid: leaf } as unknown as TranscriptRecord;
}
// B = rewind checkpoint; C = abandoned child; D->E = surviving; plus a uuid-less meta record.
function buildRewindRecords(): TranscriptRecord[] {
    return [
        rec(RecordType.user, "B", null),
        rec(RecordType.assistant, "C", "B"),     // abandoned branch tip
        lastPrompt("C"),                          // earlier head (abandoned)
        rec(RecordType.user, "D", "B"),
        rec(RecordType.assistant, "E", "D"),     // surviving branch tip
        { type: RecordType.mode } as TranscriptRecord, // uuid-less meta — always kept
        lastPrompt("E"),                          // final head (surviving)
    ];
}

// findConversationBranches names the surviving branch (tip E) and the rewound branch (tip C,
// rewindPoint B), and does not invent others.
test("test_find_conversation_branches_identifies_surviving_and_rewound", () => {
    const branches = findConversationBranches(buildRewindRecords());
    const surviving = branches.find((b) => b.isSurviving)!;
    assert.equal(surviving.tip.toString(), "E");
    assert.equal(surviving.rewindPoint, undefined);
    const rewound = branches.filter((b) => !b.isSurviving);
    assert.equal(rewound.length, 1);
    assert.equal(rewound[0]!.tip.toString(), "C");
    assert.equal(rewound[0]!.rewindPoint!.toString(), "B");
});

// selectBranchRecords keeps the tip's ancestor chain plus uuid-less meta, dropping the sibling
// branch (selecting tip C keeps B,C + meta and drops D,E).
test("test_select_branch_records_keeps_tip_chain_and_meta", () => {
    const kept = selectBranchRecords(buildRewindRecords(), new Uuid("C"));
    const uuids = kept.filter((r) => r.uuid).map((r) => r.uuid!.toString()).sort();
    assert.deepEqual(uuids, ["B", "C"]);
    assert.ok(kept.some((r) => r.type === RecordType.mode));
});

// selectLiveBranch is selectBranchRecords for the surviving head (keeps B,D,E + meta).
test("test_select_live_branch_keeps_surviving_chain", () => {
    const kept = selectLiveBranch(buildRewindRecords());
    const uuids = kept.filter((r) => r.uuid).map((r) => r.uuid!.toString()).sort();
    assert.deepEqual(uuids, ["B", "D", "E"]);
});

// With no last-prompt head, selectLiveBranch returns all records unchanged (the fallback).
test("test_select_live_branch_returns_all_when_no_head", () => {
    const records = buildRewindRecords().filter((r) => r.type !== RecordType.lastPrompt);
    assert.equal(selectLiveBranch(records).length, records.length);
});
```
The module does not exist yet → RED.

**GREEN:** create `src/reconstruction_branch.ts` with a header comment ("Conversation-branch model.
A rewind forks the parentUuid tree; each `last-prompt` record's `leafUuid` names a conversation
head. The final head is the surviving branch; abandoned heads (deduped to maximal tips) are rewound
branches that forked at a rewind point. Selecting a branch keeps its tip's ancestor chain plus
uuid-less meta records. See plans/s7/s7-reconstruction-plan.md.") and these verb-named functions:

1. `collectHeadUuids(records): Uuid[]` — in file order, the `leafUuid` of each record for which
   `getLastPromptEntry` returns an entry.
2. `collectAncestorUuids(records, tip): Set<string>` — `Map<uuid.toString(), record>`; from `tip`,
   follow `parentUuid` upward, adding each `uuid.toString()`; stop at null/unresolvable parent or a
   repeat (cycle guard). Empty set if `tip` resolves to no record.
3. `findSurvivingHead(records): Uuid | undefined` — the last head from `collectHeadUuids`.
4. `findRewindPoint(records, tip, survivingSet): Uuid | undefined` — the deepest record on `tip`'s
   path whose `uuid.toString()` is in `survivingSet` (walk tip→root, return the first that is in the
   set).
5. `findConversationBranches(records): ConversationBranch[]` (exported) — surviving head → one
   `{ tip, rewindPoint: undefined, isSurviving: true }`; abandoned heads = heads whose
   `uuid.toString()` is not in the surviving set, deduped to **maximal tips** (drop a head that is an
   ancestor of another abandoned head — i.e., whose `uuid` is in another abandoned head's ancestor
   set); each → `{ tip, rewindPoint: findRewindPoint(...), isSurviving: false }`. If there is no
   surviving head, return a single surviving branch with `tip` = a synthetic/none marker handled by
   the caller — simplest: return `[]` and let `selectLiveBranch` fall back (see below).
6. `selectBranchRecords(records, tip): TranscriptRecord[]` (exported) — `const set =
   collectAncestorUuids(records, tip);` if `set.size === 0` return `records` unchanged (fallback);
   else `records.filter((r) => r.uuid === undefined || set.has(r.uuid.toString()))`.
7. `selectLiveBranch(records): TranscriptRecord[]` (exported) — `const head =
   findSurvivingHead(records);` if `!head` return `records` unchanged; else
   `selectBranchRecords(records, head)`.

Compare/identify records by `uuid.toString()` (the `Uuid` wrapper is not reference-stable). Keep
every branch single-condition.

**Verify gate.**

---

## Task 2 — Refactor the engine into a branch-agnostic core + surviving-default public API

Split each public reconstruction function into "select the surviving branch, then reconstruct over
those records," so the core can later reconstruct any branch. This changes **no observable behavior**
(default stays surviving) but is the seam Task 3 needs.

**Behavior:** `reconstructAll`/`reconstructFile`/`findDeletedTarget` return the surviving branch's
result (a pure no-op vs. today on S1–S6, where the surviving record set is all records); the real S7
transcript now reconstructs (via `reconstructAll`) to the two single v2 creates instead of
create+overwrite.

**RED:** add `S7_JSONL` to `tests/fixtures.ts`, then add `tests/reconstruction_engine_s7.test.ts`
(fails today — two revisions, the second an overwrite):
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { S7_JSONL } from "./fixtures.ts";

// Default reconstruction follows the surviving branch only: each file is one v2 create, not a
// v1 create + v2 overwrite (the rewound v1 writes are not on the surviving branch).
test("test_default_reconstruction_follows_surviving_branch_only", () => {
    const histories = reconstructAll(loadRecords(S7_JSONL));
    const script = histories.find((h) => h.target.toString().endsWith("scenario7.py"))!;
    assert.equal(script.revisions.length, 1);
    assert.equal(script.revisions[0]!.kind, EventKind.write);
    assert.equal(script.revisions[0]!.changeId.toString(), "toolu_01JWycFrizHxePBLhz35UrhG");
    const lines = script.revisions[0]!.lines.map((e) => e.values[e.values.length - 1]!.line);
    assert.ok(lines.some((l) => l.includes("def fahrenheit_to_celsius")));
});
```

**GREEN:** in `src/reconstruction_engine.ts`:
1. Import `{ selectLiveBranch }` from `./reconstruction_branch.ts`.
2. Rename the private `reconstructLineage(records, target, resolving, reader)` to
   `reconstructFileOver(...)` — **the branch-agnostic core**: identical body, but its copy-seed
   recursion (`seedOneCopy`/`seedCopyEvents`) now calls `reconstructFileOver` (not the public
   `reconstructFile`), so a branch reconstruction's copy seeding stays within that branch's records.
3. Add `reconstructFilesOver(records, reader): FileHistory[]` — the **current `reconstructAll`
   body**, but mapping each `distinctFinalPaths` target through `reconstructFileOver(records, target,
   new Set(), reader)` (not the public `reconstructFile`). Operates on exactly the records given.
4. Make the public entries pre-select the surviving branch:
   ```ts
   export function reconstructFile(records, target, reader?) {
       return reconstructFileOver(selectLiveBranch(records), target, new Set<string>(), reader);
   }
   export function reconstructAll(records, reader?) {
       return reconstructFilesOver(selectLiveBranch(records), reader);
   }
   export function findDeletedTarget(records) {
       const deletion = extractFileEvents(selectLiveBranch(records)).find((e) => e.kind === EventKind.delete);
       return deletion?.kind === EventKind.delete ? deletion.target : undefined;
   }
   ```
   `extractFileEvents` is **unchanged** (does no filtering). Keep all existing helper signatures.

**Verify gate.** (All 88 prior tests must still pass — this is a behavior-preserving refactor for
S1–S6. Confirm `reconstruction_engine.ts` stays ≤250 lines; it is 248 today, and this adds a thin
`reconstructFilesOver` while the renames are net-neutral. If it would exceed 250, move the
branch-aware reconstruction added in Task 3 into a sibling module `src/reconstruction_branches.ts`
— split, never condense.)

---

## Task 3 — `reconstructBranches`: surviving + retrievable rewound branches

Add the branch-aware reconstruction that returns the surviving histories plus each rewound branch's
post-rewind file changes.

**Types** (named, in `src/reconstruction_engine.ts` — they group `FileHistory`):
```ts
// One rewound branch's file changes: the histories of files it changed after its rewind point,
// tagged with where it forked (rewindPoint) and its tip (its identity, like a branch name).
export type RewoundBranchHistory = {
    rewindPoint: Uuid;
    tip: Uuid;
    histories: FileHistory[];
};

// The full branch-aware reconstruction: the surviving files plus every rewound branch's changes.
export type BranchedReconstruction = {
    surviving: FileHistory[];
    rewound: RewoundBranchHistory[];
};
```

**Behavior:** `reconstructBranches(S7)` returns `surviving` = the two v2 creates and `rewound` = one
branch (rewindPoint `2e47efbe…`, tip `55ee424f…`) whose `histories` are the v1 `scenario7.py`
(2-line create) and v1 test (5-line create); the `#72` tangent is excluded.

**RED:** in `tests/reconstruction_engine_s7.test.ts` add:
```ts
import { reconstructBranches } from "../src/reconstruction_engine.ts";

// A rewound branch is retained as its own set of histories, forked at the rewind point, holding the
// v1 (celsius-only) writes — not merged into the surviving branch.
test("test_reconstruct_branches_retains_rewound_v1_branch", () => {
    const { surviving, rewound } = reconstructBranches(loadRecords(S7_JSONL));
    // Surviving is unchanged: two v2 single-create histories.
    assert.equal(surviving.find((h) => h.target.toString().endsWith("scenario7.py"))!.revisions.length, 1);
    // Exactly one rewound branch (the #72 tangent carries no file change and is excluded).
    assert.equal(rewound.length, 1);
    assert.equal(rewound[0]!.rewindPoint.toString(), "2e47efbe-fc3a-4ac7-80d2-178e27c61cda");
    // Its scenario7.py is the v1 create: one revision, 2 lines, celsius-only.
    const v1 = rewound[0]!.histories.find((h) => h.target.toString().endsWith("scenario7.py"))!;
    assert.equal(v1.revisions.length, 1);
    assert.equal(v1.revisions[0]!.kind, EventKind.write);
    assert.equal(v1.revisions[0]!.changeId.toString(), "toolu_012jN7F9LdRn7f8dawUAqdUR");
    const lines = v1.revisions[0]!.lines.map((e) => e.values[e.values.length - 1]!.line);
    assert.ok(lines.some((l) => l.includes("celsius_to_fahrenheit")));
    assert.ok(!lines.some((l) => l.includes("fahrenheit_to_celsius")));
    // The rewound test file is retained too.
    assert.ok(rewound[0]!.histories.some((h) => h.target.toString().endsWith("tests/test_scenario7.py")));
});
```

**GREEN:** in `src/reconstruction_engine.ts`, import `{ findConversationBranches, selectBranchRecords
}` from `./reconstruction_branch.ts` and add:
```ts
export function reconstructBranches(records, reader?): BranchedReconstruction {
    const branches = findConversationBranches(records);
    const surviving = reconstructAll(records, reader); // surviving branch (already selected inside)
    const rewound = branches
        .filter((branch) => !branch.isSurviving)
        .map((branch) => buildRewoundBranchHistory(records, branch, reader))
        .filter((entry): entry is RewoundBranchHistory => entry !== undefined);
    return { surviving, rewound };
}
```
and a helper:
```ts
// Reconstruct one rewound branch, scoped to the files it changed after its rewind point. Returns
// undefined when the branch's diverging portion changed no file (a trivial tangent).
function buildRewoundBranchHistory(records, branch, reader?): RewoundBranchHistory | undefined {
    const branchRecords = selectBranchRecords(records, branch.tip);
    const survivingSet = ... // selectBranchRecords for the surviving head, as a uuid string set
    const divergingRecords = branchRecords.filter((r) => r.uuid !== undefined && !survivingSet.has(r.uuid.toString()));
    const divergingIds = new Set(extractFileEvents(divergingRecords).map((e) => e.changeId.toString()));
    if (divergingIds.size === 0) {
        return undefined;
    }
    const histories = reconstructFilesOver(branchRecords, reader).filter((history) =>
        history.revisions.some((revision) => divergingIds.has(revision.changeId.toString())),
    );
    return { rewindPoint: branch.rewindPoint!, tip: branch.tip, histories };
}
```
For the `survivingSet`, reuse Task 1: `new Set(selectLiveBranch(records).filter((r) => r.uuid).map((r)
=> r.uuid!.toString()))` (or expose a small `collectSurvivingUuids` from `reconstruction_branch.ts`
if cleaner — one canonical home, no duplicated walk). Keep branches single-condition.

**Verify gate.**

---

## Task 4 — CLI all-branches default + retrieval (`--surviving`, `--list-branches`, `--branch <id>`) + lock-in + docs

Make the no-flag CLI render ALL branches (with the no-rewound-branches passthrough that keeps S1–S6
unchanged), and add the listing / per-branch / surviving-only operations. All compose with the
existing render modes.

**Behavior:**
- `runCli([S7_JSONL])` (no branch flag) — ALL branches: surviving v2 creates under a `## surviving`
  header AND the rewound v1 creates under a `## rewound` header. On S1–S6 (no rewound branch) the
  output is byte-identical to today (plain list, no header).
- `runCli([S7_JSONL, "--surviving"])` — surviving v2 creates only, no headers (today's default view).
- `runCli([S7_JSONL, "--list-branches"])` — one summary line per branch.
- `runCli([S7_JSONL, "--branch", "55ee424f"])` — the rewound v1 branch's histories; composes with
  `--target`/`--diff`/`--verbose`; an unknown id throws the usage message with the available ids.

**RED:** add to `tests/reconstruction_cli.test.ts` (import `S7_JSONL`):
```ts
// Default (no flag): ALL branches — both the surviving v2 writes and the rewound v1 writes appear,
// under branch headers naming the rewind point. (No "overwrite": the v2 write is a create on its
// own branch, not an overwrite of v1.)
test("test_default_view_shows_all_branches", () => {
    const out = runCli([S7_JSONL]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("#2e47efbe")); // rewind point
    assert.ok(out.includes("#01JWycFr")); // surviving v2 scenario7.py
    assert.ok(out.includes("#012jN7F9")); // rewound v1 scenario7.py
    assert.ok(out.includes("#015eug6V")); // rewound v1 test
    assert.ok(!out.includes("overwrite"));
});

// A transcript with no rewound branch (S1) renders exactly as before — no branch headers added.
test("test_default_view_unchanged_when_no_rewound_branches", () => {
    const out = runCli([S1_JSONL]); // import S1_JSONL alongside S7_JSONL
    assert.ok(!out.includes("## surviving"));
    assert.ok(!out.includes("## rewound"));
});

// --surviving: only the surviving branch (the v2 creates); no rewound v1 ids, no headers.
test("test_surviving_flag_shows_only_surviving_branch", () => {
    const out = runCli([S7_JSONL, "--surviving"]);
    assert.ok(out.includes("#01JWycFr"));
    assert.ok(!out.includes("#012jN7F9")); // rewound v1 not shown
    assert.ok(!out.includes("## rewound"));
});

// --list-branches: one summary line per branch, naming the surviving and rewound tips + rewind pt.
test("test_list_branches_summarizes_surviving_and_rewound", () => {
    const out = runCli([S7_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving"));
    assert.ok(out.includes("#77494da3")); // surviving tip
    assert.ok(out.includes("rewound"));
    assert.ok(out.includes("#55ee424f")); // rewound tip
    assert.ok(out.includes("#2e47efbe")); // rewind point
    assert.ok(!out.includes("create  2 lines")); // a summary, not the full per-revision listing
});

// --branch <id>: render exactly one branch (the rewound v1), selected by tip short id.
test("test_branch_id_retrieves_one_specific_branch", () => {
    const out = runCli([S7_JSONL, "--branch", "55ee424f"]);
    assert.ok(out.includes("#012jN7F9")); // the rewound v1 writes are shown
    assert.ok(out.includes("#015eug6V"));
    assert.ok(!out.includes("#01JWycFr")); // the surviving branch is NOT shown
});

// --branch <id> with --target narrows to one file on that branch.
test("test_branch_id_with_target_narrows_to_one_file", () => {
    const target = "/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.daizis4h/scenario7.py";
    const out = runCli([S7_JSONL, "--branch", "55ee424f", "--target", target]);
    assert.ok(out.includes("#012jN7F9"));            // the v1 scenario7.py
    assert.ok(!out.includes("tests/test_scenario7.py")); // the test file is filtered out
});

// An unknown branch id is rejected with a message that lists the available ids.
test("test_branch_id_unknown_throws_with_available_ids", () => {
    assert.throws(() => runCli([S7_JSONL, "--branch", "deadbeef"]), /55ee424f|77494da3/);
});
```

**GREEN:**
1. `src/reconstruction_cli.ts` — extend `CliOptions` with `surviving: boolean`, `listBranches:
   boolean`, and `branch: string | undefined`. In `parseArgs`, parse `--surviving` and
   `--list-branches` like `--verbose`/`--diff`, and `--branch <id>` like `--target <path>` (a
   value-taking flag — pull the next argv element, exclude both from the positional scan that finds
   `jsonlPath`). Selection precedence in `runCli` (compute `reconstructBranches(records, reader)`
   once, `reader = buildSidecarReader(records)`; factor the existing "pick render fn + optional
   `--target` filter" into a shared `renderChosen(histories, options)` used by every path):
   - `options.listBranches` → return `renderBranchSummary(branched)`.
   - `options.branch !== undefined` → `findBranchById(branched, options.branch)`; throw the usage
     message **plus the available ids** if none matches; else `renderChosen(branch.histories,
     options)`.
   - `options.surviving` → `renderChosen(branched.surviving, options)` (today's surviving view).
   - else (DEFAULT) → if `branched.rewound.length === 0`, return `renderChosen(branched.surviving,
     options)` with **no header** (byte-identical to today — this is the S1–S6 passthrough); else
     render `branched.surviving` under a `## surviving  tip #<id>` header, then each
     `RewoundBranchHistory` under `## rewound  tip #<tip>  (rewind @ #<rewindPoint>)`, each via
     `renderChosen`.
2. **Branch identity helpers** — add to `src/reconstruction_branch.ts` a `shortUuid(uuid: Uuid):
   string` (first 8 chars of `uuid.toString()`) as the one canonical short-id home; the CLI uses it
   for both rendering and matching. `findBranchById(branched, id)` matches the literal `surviving`
   (→ the surviving histories) or a rewound branch whose `shortUuid(tip) === id`. (Do NOT re-implement
   the change-id `toluu_`→8 trim the renderer already owns; that is a *changeId* shortener, separate
   from a *tip-uuid* shortener.)
3. **Branch rendering** — add `renderBranchSummary(branched: BranchedReconstruction): string` and the
   per-branch header rendering to `src/reconstruction_render_list.ts` (canonical list-render home,
   128/250 lines — room). Summary line per branch: kind, `tip #<shortUuid>`, for rewound also
   `rewind @ #<shortRewindPoint>`, then comma-joined file basenames it touched. Reuse
   `renderHistoryList` for full per-branch histories.
4. Keep `--diff`/`--verbose`/`--target` behavior unchanged within each branch view.

**GREEN (docs; no engine code expected):**
1. `plans/reconstruction-engine-design.md` — add S7 specs (after S6's 29–31):
   - **32. conversation-branch model** — a rewind forks the `parentUuid` tree; `last-prompt`
     `leafUuid`s are the branch heads; `findConversationBranches` returns the surviving branch (final
     head) and rewound branches (abandoned heads, deduped to maximal tips, each tagged with its
     rewind point). `selectBranchRecords`/`selectLiveBranch` pick a branch's records (tip ancestor
     chain + uuid-less meta). A no-op when there is no rewind.
   - **33. branch-agnostic reconstruction core** — `reconstructFileOver`/`reconstructFilesOver`
     reconstruct over exactly the records given; the public `reconstructAll`/`reconstructFile`
     pre-select the surviving branch.
   - **34. rewound-branch retrieval** — `reconstructBranches` returns `surviving` plus
     `RewoundBranchHistory[]` (rewind point + tip + histories of files changed after the rewind). The
     CLI **defaults to rendering all branches** (surviving + rewound under headers; byte-identical to
     the old plain list when there are no rewound branches, keeping S1–S6 unchanged), with
     `--surviving` (surviving only), `--list-branches` (one summary line per branch), and `--branch
     <tip-short-id>` (one specific branch, composing with `--target`/`--diff`/`--verbose`).
     `reconstructAll(S7)` is the surviving v2 creates; `reconstructBranches(S7)` additionally retains
     the rewound v1 branch.
   Add `reconstruction_branch.ts` to the Code-layout section, and the new tests to the inventory.
2. `plans/implementation-notes-api-from-scenarios.md` — prepend a dated S7 entry (rewind as a
   `parentUuid` fork; last-prompt heads as branch identities; the preserve-not-discard decision and
   the git-unmerged-branch mental model; the select/reconstructOver split; CLI default = all branches
   (with the no-rewound passthrough keeping S1–S6 byte-identical), `--surviving`/`--list-branches`/
   `--branch <id>` as the other views; engine `reconstructAll` stays surviving-only; the
   diverging-changeId scoping; foundation for S8–S23).
3. `plans/roadmap.md` — mark the S7 row done (note: branch-aware reconstruction, surviving default +
   rewound retrieval).

**Verify gate**, then run the End-to-end check, then stop and report. Commit only after the user
approves.

---

## Verify gate (run after every task; all three must pass before the next)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # all prior (88) + new S7 specs, 0 fail
npx tsc --noEmit         # No errors found (tsx does NOT type-check; this is the real type gate)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
`noUnusedLocals`/`noUnusedParameters` make a stray import a hard error. Ignore any stale
`PostToolBatch`/`PostToolUse` in-batch hook failure for a file written in the same batch as its test
— a manually-run `npm test` is authoritative. Clean room is absolute: never import or copy from
`/Users/matkatmusicllc/Desktop/claude code src/` beyond the `S7_JSONL` fixture path.

## End-to-end check (after Task 4)

```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s7-minimal-code-restore/d0d14660-4477-40fa-824c-e7f0bb91cd66.jsonl"

npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null
# DEFAULT = all branches: a "## surviving tip #77494da3" section (scenario7.py create 8 lines
# #01JWycFr; tests/test_scenario7.py create 72 lines #01HXdTmy) then a "## rewound tip #55ee424f
# (rewind @ #2e47efbe)" section (scenario7.py create 2 lines #012jN7F9 celsius-only;
# tests/test_scenario7.py create 5 lines #015eug6V). No overwrite anywhere.

npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null
# Surviving only, no headers: scenario7.py -> single create (#01JWycFr, 8 lines);
# tests/test_scenario7.py -> single create (#01HXdTmy, 72 lines). No #012jN7F9 / #015eug6V.

npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
# Two summary lines: surviving tip #77494da3; rewound tip #55ee424f rewind @ #2e47efbe, both
# touching scenario7.py + tests/test_scenario7.py.

npx tsx src/reconstruction_cli.ts "$P" --branch 55ee424f --diff 2>/dev/null
# Just the rewound v1 branch, as a diff. Add --target …/scenario7.py to isolate one file.

# Sanity: a non-rewind transcript is UNCHANGED by the new default (plain list, no ## headers):
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s1-delete-file/b3634dc4-a385-40b9-8e23-6695a4f7bb7e.jsonl" 2>/dev/null
```

## Risks / out-of-scope (flag to the user; not part of S7's tasks)

- **Nested rewinds (rewind off a rewound branch).** S7 has only single-level forks; the
  `findConversationBranches` "maximal tip" dedup handles multiple independent rewinds, but a rewind
  *inside* an already-abandoned branch (a tree deeper than two levels) is untested here. S8
  (`s8-repeated-code-restore-rewinds`) is the place to confirm/extend — flag when planning S8.
- **Per-file branch *tree* vs. per-branch lists.** S7 models each branch as its own
  `FileHistory[]` (a "checkout that branch and view the file" model), sharing pre-fork content by
  re-reconstruction rather than by a shared revision node. If a future need arises to show one file
  as a single revision tree with a fork node, that is a larger model change — out of scope now.
- **"Final `last-prompt` = file-order last" assumption.** Verified for S1–S7. If a future scenario
  interleaves segments differently the head-selection rule may need revisiting; S7 locks the
  verified rule.
- **Latent `2>&1` / `>/dev/null` redirect mis-parse (S5 regression), still open.** Unrelated to S7
  (no redirect event here); fix as a dedicated hardening slice (`parseRedirect` should ignore
  `N>&M` and `/dev/null`). Track separately.
