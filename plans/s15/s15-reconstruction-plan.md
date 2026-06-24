# Plan: S15 slice — user out-of-band edit, then conversation-only rewind (the engine never sees the user's edit because it arrives as an `edited_text_file` attachment, not a tool_use; teach extraction to emit a `user-edit` file event and the S13/S14 fork machinery surfaces the abandoned branch)

> Audience: the implementing agent. This plan is "How" and "In what order". Follow it with strict
> RED → GREEN TDD (`~/.claude/guides/tdd.md`) and the project coding rules
> (`plans/coding-requirements.md` + `~/.claude/guides/coding-standards.md`). Every code snippet here
> already conforms to those rules; reproduce them verbatim unless a test forces otherwise.
>
> NOTE on expected outputs: the uuids, letters, and content below were derived **read-only** from the
> live transcript by replaying the existing engine's own tip-resolution logic (`findPromptForkPoints`,
> `findDeepestPromptOrReply`, `assignTurnLetters`) — NOT from a built prototype. They are high-confidence
> but you MUST lock the **exact** CLI strings during TDD by running the commands in *Verify* and pasting
> the real bytes into the lock tests. The alignment widths (padding) are the only thing a hand-derivation
> can get subtly wrong; the structure/ids/labels are certain.

---

## TL;DR (the whole slice in six sentences)

1. S15 opens the **user-edit family** (S15–S23): the first scenario where a file change originates
   **outside any agent tool call** — a user edits `scenario15.py` directly on disk.
2. That edit reaches the transcript as an **`attachment` record** with
   `attachment.type === "edited_text_file"`, whose `snippet` carries the full post-edit file content in
   `cat -n` form (`<lineNo>\t<line>`). There is **no** `Write`/`Edit` tool_use and **no** file-history
   backup for it.
3. The extraction layer (`reconstruction_extract.ts`) only inspects `tool_use` blocks, so the user edit
   produces **zero** file events — the engine shows only the two trunk Writes, no fork, no user edit.
4. Structurally S15 is the **conv-only twin of S13** (already handled): a `Rewind` forks `a94b7090` into
   an abandoned branch `75934004` ("What time is it?", where the user edit landed) and a surviving
   Read-only branch `5463dc91` that reaches the final head `4eb82c06`. The abandoned tip is named by
   **no** last-prompt head ⇒ it is the *structural* (S13) case, **not** the dedup-collision (S14) case.
5. The fix is **one new capability**: recognize the `edited_text_file` attachment as a `user-edit` file
   event (a new `EventKind`, modeled as a full-content revision like `overwrite`). Once that event
   exists, the **already-shipped** S13 structural discovery + S14 surviving-head guard surface the fork
   with zero further engine change.
6. The correct S15 render is the **same shape as S13/S14** — a conversationDAG fork (rewound `user-edit`
   turn above a file-less surviving Read branch) + a fileDAG showing the trunk `write` then the
   `user-edit`; **180 prior tests stay green** (S1–S14 have no `edited_text_file` attachment, so nothing
   they produce changes).

---

## Background — the scenario, the verified topology, and the gap

### The scenario (driven steps)
`scenarios/executed/s15-user-edit-then-conv-rewind/` — the recorded run:
1. Say: *Write a file called scenario15.py with a function `hello()` that prints "hello"… and write
   `tests/test_scenario15.py`…*
2. **User edits `scenario15.py` on disk** (out-of-band, via the IDE/filesystem — not an agent tool):
   prepends a `# user edit` comment line.
3. Say: *What time is it?* (the agent answers on this branch — this is the branch the user edit lives on)
4. **Rewind** (conversation-only) back to the fork point.
5. Say: *Read scenario15.py and show me the contents.* (surviving branch — Read only)
6. Say: *Thanks.* / *Bye!*

The conv-only rewind does **not** roll back disk, so the file on disk keeps the user's edit. Final disk
`scenario15.py`:
```
# user edit
def hello():
    print("hello")
```

### Verified topology (first-8 uuids; confirmed by direct transcript inspection)
Fixture transcript (92 records):
`…/scenarios/executed/s15-user-edit-then-conv-rewind/7365140d-8666-4dbf-81bc-9d92e9d6cac9.jsonl`.

- **Trunk (pre-fork, shared by both branches):**
  - `B` = `write scenario15.py` changeId **`018tu7eT`** (`hello`, 2 lines) @ `16:11:03Z`
  - `C` = `write test_scenario15.py` changeId **`018f4SXM`** @ `16:11:04Z`
- **Fork / rewind point: `a94b7090`** — the last-prompt leaf the rewind re-prompts from; it parents
  **two** genuine user prompts (time-ordered):
  - **Abandoned branch (earlier child):** `75934004` — *"What time is it?"* @ `16:11:15Z`. Its immediate
    child is the **user edit**: `attachment` `d675bbfe` (`edited_text_file`, `scenario15.py`) @
    `16:11:15Z`, then assistant `56da61e5` *"…the time is…"* @ `16:11:18Z` (the branch's deepest
    user/assistant turn ⇒ its tip), then trailing `system` bookkeeping `2bdafb2e`/`fcda08f8`.
  - **Surviving branch (later child):** `5463dc91` — *"Read scenario15.py and show me the contents."* @
    `16:11:34Z` → Read → assistant → `Thanks.` → trailing `system` `4eb82c06` (the final last-prompt
    leaf = surviving head).

Key uuids/ids the tests assert on:

| role | id (8) | what it is |
|------|--------|-----------|
| fork / rewind point | `a94b7090` | last-prompt leaf parenting both branch prompts |
| surviving head | `4eb82c06` | final `last-prompt` leaf (Read branch) |
| abandoned prompt | `75934004` | *"What time is it?"* — **not** a last-prompt head (⇒ S13 case) |
| **rewound tip** | `56da61e5` | deepest user/assistant turn under `75934004` |
| **user edit** | `d675bbfe` | the `edited_text_file` attachment record (its uuid = the event changeId) |
| write scenario15.py | `018tu7eT` | trunk `B` |
| write test_scenario15.py | `018f4SXM` | trunk `C` |

### The `edited_text_file` attachment (the one new wire shape)
Record `d675bbfe` (`type: "attachment"`) carries:
```jsonc
"attachment": {
  "type": "edited_text_file",
  "filename": "/private/var/folders/.../run-scenario.zfw3zphd/scenario15.py",
  "snippet": "1\t# user edit\n2\tdef hello():\n3\t    print(\"hello\")"
}
```
- `filename` = the same absolute path as the trunk Write's `file_path` (so the fileDAG groups them).
- `snippet` = the **full** post-edit file content in `cat -n` form. Recover the real content by stripping
  the `^\d+\t` prefix from each line ⇒ `# user edit\ndef hello():\n    print("hello")`.
- `userType: "external"` corroborates the out-of-band origin.

> **Scope assumption (record it; do not over-build):** for S15 the `snippet` IS the whole file (3 lines).
> A larger file's `edited_text_file` snippet may be a *windowed* slice; this plan deliberately treats the
> snippet as full content (correct for S15) and leaves windowing to a later user-edit scenario that
> actually exhibits it. Do **not** add windowing logic now — it would be untested speculation.

### Why this is the S13 case, not S14 (no second bug)
- `75934004` (the abandoned prompt) is **not** itself a `last-prompt` leaf, so the head-based pass never
  "claims" it ⇒ the S14 dedup-collision (`subtreeHoldsClaimedTip` short-circuit) does **not** arise.
- Once the user edit is a recognized file event, `findStructuralRewoundBranches` (shipped in S13) finds
  the fork `a94b7090`, picks the abandoned child `75934004`, and resolves its tip `56da61e5`.
- `findSurvivingHead` keeps the final head `4eb82c06` because the **surviving branch already records the
  trunk Writes `B`/`C`** (shared pre-fork ancestors) ⇒ `survivingBranchRecordsFileChange` is true ⇒ the
  S14 working-tree override is suppressed. **Both of these are already committed (S13 + S14).**

---

## Verified current behavior (the RED baseline)

Run before any change (`P` = the S15 fixture; debugger noise on stderr is harmless):
```
P="scenarios/executed/s15-user-edit-then-conv-rewind/7365140d-8666-4dbf-81bc-9d92e9d6cac9.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null
#   conversationDAG: A prompt #39894567 → B write + C write (linear trunk, NO fork).   ← WRONG
#   fileDAG: scenario15.py B write only; test C write. The user edit is ABSENT.        ← WRONG
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
#   surviving  tip #4eb82c06    scenario15.py, test_scenario15.py   (no rewound branch) ← WRONG
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
#   scenario15.py revision 0 = `def hello():` + `    print("hello")`  (no `# user edit`)
#     ↑ This stays CORRECT after the fix — the surviving branch is Read-only; the user edit is on the
#       abandoned branch. The bug is purely the MISSING rewound branch + MISSING fileDAG user-edit turn.
```

### Root cause (one gap, in extraction)
`collectEventsFromRecord` (`reconstruction_extract.ts`) iterates `getContentBlocks(record)` and only maps
`tool_use` blocks to events. An `attachment` record has no message content blocks, so the
`edited_text_file` user edit is never turned into a `FileEvent`. Downstream, the abandoned branch then has
**zero diverging file changes**, so `buildRewoundBranchHistory` / `buildRewoundConvoBranch` filter it out
(`divergingIds.size === 0`) exactly like a read-only tangent — no rewound branch, no fileDAG turn.

---

## The fix — six edits (one new capability, then the shipped machinery does the rest)

Apply in the TDD order in the task breakdown (tests first). Files and their current line budgets:
`vocabulary.ts` 112, `reconstruction_engine.ts` 228, `reconstruction_extract.ts` 233 (near cap → the new
logic goes in a **new leaf module**), `reconstruction_replay.ts` 138, `reconstruction_render_list.ts` 145.

### Edit 1 — vocabulary: two new members (`src/structures/vocabulary.ts`)
Add the wire attachment kind and the engine event kind (one canonical home, coding-requirements §2):
```ts
// in AttachmentPayloadType, after `diagnostics`:
    edited_text_file = "edited_text_file",
```
```ts
// in EventKind, after `append`:
    userEdit = "user-edit",
```
Update the `// Attachment payload kinds…` and `// The evidence kinds…` doc comments to mention
`edited_text_file` (s15) and `user-edit` (s15-user-edit-then-conv-rewind) respectively, matching the
existing per-scenario annotation style.

### Edit 2 — the event type (`src/reconstruction_engine.ts`)
Add the event next to `OverwriteEvent`, and append it to the `FileEvent` union:
```ts
// A user's out-of-band edit to a file on disk (NOT an agent tool call): captured as an
// `edited_text_file` attachment whose snippet carries the full post-edit content. Modeled as a
// full-content revision (like an overwrite) but kept a distinct kind for honest provenance in the
// render. content is the snippet's text with its `<n>\t` line-number prefixes stripped. See
// plans/s15/s15-reconstruction-plan.md.
export type UserEditEvent = {
    kind: EventKind.userEdit;
    changeId: Uuid;
    target: Path;
    content: string;
    timestamp: Date;
};
```
```ts
export type FileEvent =
    | WriteEvent
    | DeleteEvent
    | EditEvent
    | RenameEvent
    | CopyEvent
    | AppendEvent
    | OverwriteEvent
    | UserEditEvent;
```

### Edit 3 — NEW leaf module `src/reconstruction_user_edit.ts`
Keeps `reconstruction_extract.ts` under the 250-line cap (project rule: split, don't condense). It imports
only `envelope`, `session-meta`, `vocabulary`, `domain`, and the `UserEditEvent` *type* from the engine —
no cycle with `extract`/`replay`/`branch`/`fork`/`worktree`.
```ts
// Extraction of a user's out-of-band file edit (s15-user-edit-then-conv-rewind). A user editing a
// file on disk leaves no tool_use; the harness records it as an `edited_text_file` attachment whose
// `snippet` is the full post-edit content in `cat -n` form (`<lineNo>\t<line>`). This leaf module
// turns that attachment into a UserEditEvent. Used by reconstruction_extract.ts. Design: the engine
// file (reconstruction_engine.ts) + plans/s15/s15-reconstruction-plan.md.

import type { TranscriptRecord } from "./structures/envelope.ts";
import { getAttachmentEntry } from "./structures/session-meta.ts";
import { AttachmentPayloadType, EventKind } from "./structures/vocabulary.ts";
import { Path } from "./structures/domain.ts";
import type { UserEditEvent } from "./reconstruction_engine.ts";

// Strip the `<lineNo>\t` prefix every line of an `edited_text_file` snippet carries, recovering the
// file's actual post-edit text. `1\t# user edit\n2\tdef hello():` -> `# user edit\ndef hello():`.
function stripLineNumberPrefixes(snippet: string): string {
    return snippet
        .split("\n")
        .map((line) => line.replace(/^\d+\t/, ""))
        .join("\n");
}

// Turn an `edited_text_file` attachment record into a UserEditEvent, or undefined when the record is
// not such an attachment. The event's changeId is the attachment record's own uuid (a user edit has
// no tool_use id); its content is the snippet with line-number prefixes stripped.
export function userEditEventFrom(record: TranscriptRecord): UserEditEvent | undefined {
    const entry = getAttachmentEntry(record);
    if (entry === undefined) {
        return undefined;
    }
    if (entry.attachment.type !== AttachmentPayloadType.edited_text_file) {
        return undefined;
    }
    const filename = entry.attachment.filename as string;
    const snippet = entry.attachment.snippet as string;
    return {
        kind: EventKind.userEdit,
        changeId: entry.uuid,
        target: new Path(filename),
        content: stripLineNumberPrefixes(snippet),
        timestamp: entry.timestamp,
    };
}
```

### Edit 4 — dispatch the new event during extraction (`src/reconstruction_extract.ts`)
Add the import and emit the user-edit event per record (an attachment record contributes at most one).
`collectEventsFromRecord` already guards `timestamp instanceof Date`; add the attachment check after the
tool_use loop so a record yields its tool_use events AND any user-edit event:
```ts
// near the other imports:
import { userEditEventFrom } from "./reconstruction_user_edit.ts";
```
```ts
// inside collectEventsFromRecord, AFTER the `for (const block of getContentBlocks(record))` loop:
    const userEdit = userEditEventFrom(record);
    if (userEdit) {
        events.push(userEdit);
    }
```
(`extractFileEvents` already timestamp-sorts the combined list, so the user-edit event lands in disk order
after the trunk Writes — letter `D`.)

### Edit 5 — replay the user edit as a full-content revision (`src/reconstruction_replay.ts`)
The snippet is full content, not a patch, so replay it like a write/overwrite: every line genesis, stamped
at the edit time, labelled with the distinct `user-edit` kind. Add a handler and dispatch it:
```ts
// import the type alongside the others from ./reconstruction_engine.ts:
    UserEditEvent,
```
```ts
// A user's out-of-band edit: a wholesale full-content revision (the snippet carried the entire post-edit
// file). Like an overwrite it replaces all content — every line genesis — but keeps the `user-edit` kind
// so the render attributes it to the user, not an agent write.
function userEditRevision(event: UserEditEvent): FileRevision {
    const lines = splitLines(event.content).map((line) =>
        genesisLine(line, event.timestamp),
    );
    return {
        kind: EventKind.userEdit,
        changeId: event.changeId,
        timestamp: event.timestamp,
        lines,
    };
}
```
```ts
// in appendRevisionsForEvent, before the final `throw`:
    if (event.kind === EventKind.userEdit) {
        revisions.push(userEditRevision(event));
        return;
    }
```

### Edit 6 — list label (`src/reconstruction_render_list.ts`)
`getEntryLabel` falls through to `"delete"`, so an unhandled `user-edit` would mislabel. Add it (defensive;
the two DAGs already render the raw enum value `"user-edit"` via `GraphTurn.kind`, so no graph-render
change is needed):
```ts
// in getEntryLabel, before the final `return "delete";`:
    if (kind === EventKind.userEdit) {
        return "user-edit";
    }
```

---

## Expected outputs after the fix (the authoritative spec — lock the exact bytes via *Verify*)

### `--list-branches`
```
surviving  tip #4eb82c06    scenario15.py, test_scenario15.py
rewound    tip #56da61e5  rewind @ #a94b7090    scenario15.py
```

### bare default (both DAGs) — same shape as S13/S14
```
══ conversationDAG ══
A  prompt  #a94b7090   (rewind point)
│
├─ branch rewound (rewound; tip #56da61e5; rewind @ #a94b7090)
│  D  user-edit  scenario15.py  #d675bbfe
│
└─ branch surviving (surviving; tip #4eb82c06)
   (no file changes)

══ fileDAG ══
scenario15.py
  B  write      #018tu7eT
  D  user-edit  #d675bbfe
test_scenario15.py
  C  write      #018f4SXM
```
Notes for the lock test: `user-edit` is the longest kind (9 chars), so in the fileDAG `write` is padded to
that width (`write` + 4 spaces). The rewound branch renders first (its turn at `16:11:15Z` is older than
the file-less surviving branch, which sorts last). `#d675bbfe` is `shortenChangeId` of the attachment
uuid; `#56da61e5`/`#4eb82c06`/`#a94b7090` are `shortUuid` of the tips/rewind point.

### `--branch 56da61e5 --verbose` (the abandoned user-edit content)
`scenario15.py` reconstructs to **two** revisions: rev 0 = trunk `write` (`hello`, 2 lines), rev 1 =
`user-edit` (3 lines). Assert both appear:
```
# user edit
def hello():
```

### `--surviving --verbose` (unchanged from the RED baseline)
The surviving Read branch has no file events of its own; its `scenario15.py` is the trunk `hello` (2 lines)
and `tests/test_scenario15.py` is the trunk test. Assert `def hello():` present and `# user edit`
**absent** — even though disk physically kept the user edit, the *surviving branch's* reconstruction is
hello-only (the persisted user edit shows in the **fileDAG** and on the **rewound** branch).

---

## TDD task breakdown (strict RED → GREEN, in order)

> A repo Stop hook reruns the full suite after every source/test edit; expect inline RED while tests are
> red — that is intended. The hook log can lag one edit (it may report the prior step's failure); confirm
> true state with `npx tsx --test <file>`. A lint hook caps files at 250 lines and blocks >3× indent
> nesting; a hook also WARNS when a new `src/*.ts` has no test (Task 4 adds the unit test that clears it).

**Task 0 — register the fixture (no test).**
In `tests/fixtures.ts`, after `S14_JSONL`, add (Desktop absolute path, matching every other fixture):
```ts
export const S15_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s15-user-edit-then-conv-rewind/7365140d-8666-4dbf-81bc-9d92e9d6cac9.jsonl";
```

**Task 1 — RED: vocabulary membership.**
Extend the existing vocabulary membership tests (the `deepStrictEqual` over `Object.values(...)` for
`AttachmentPayloadType` and `EventKind` — find them in the vocabulary/structures test file) to include
`"edited_text_file"` and `"user-edit"`. Then apply **Edit 1**. GREEN.

**Task 2 — RED: extraction emits the user-edit event.**
New `tests/reconstruction_user_edit.test.ts` (mirrors the smallest existing structure unit test):
- `test_userEditEventFrom_reads_edited_text_file_attachment` — build/parse the `d675bbfe` record (or load
  `S15_JSONL` and find it) and assert `userEditEventFrom` returns `{ kind: EventKind.userEdit, target`
  ending `scenario15.py`, `changeId` = `d675bbfe…`, `content` = `"# user edit\ndef hello():\n    print(\"hello\")"` }`.
- `test_userEditEventFrom_ignores_other_records` — returns `undefined` for a tool_use / non-attachment
  record.
- `test_extractFileEvents_includes_the_user_edit_for_S15` —
  `extractFileEvents(loadRecords(S15_JSONL))` contains exactly one `EventKind.userEdit` event, ordered
  after the two `write` events (timestamp order).
RED until Edits 2–4. Apply **Edits 2, 3, 4**. GREEN.

**Task 3 — RED: branch enumeration + contents.**
New `tests/reconstruction_engine_s15.test.ts` (mirror `…_s13.test.ts`):
- `test_S15_findConversationBranches_includes_the_structural_rewound_branch` —
  `findConversationBranches(loadRecords(S15_JSONL))`: surviving tip starts `4eb82c06`; a non-surviving
  branch has tip starting `56da61e5` with `rewindPoint` starting `a94b7090`.
- `test_S15_reconstructBranches_yields_one_rewound_branch_touching_only_scenario15` —
  `reconstructBranches(...)` has `rewound.length === 1`; its single target ends `scenario15.py`.
- `test_S15_rewound_branch_content_is_user_edit` — the rewound branch's `scenario15.py` final text
  contains `# user edit` and `def hello():`.
- `test_S15_surviving_content_is_hello_only` — `reconstructAll(...)`'s `scenario15.py` final text contains
  `def hello():` and does **not** contain `# user edit`.
These pass once Edits 2–5 are in (Edit 5 = replay; without it `--branch`/content reconstruction throws
`UnsupportedEventKindError`). Apply **Edit 5**. GREEN.

**Task 4 — clear the no-test warning.**
Task 2 already created `tests/reconstruction_user_edit.test.ts`, which clears the Stop-hook warning for the
new `src/reconstruction_user_edit.ts`. Confirm no WARNING remains.

**Task 5 — RED→GREEN: CLI locks.**
New `tests/reconstruction_cli_s15.test.ts` (mirror `…_cli_s14.test.ts`, `import { runCli }`, real on-disk
file-history reader). Run each *Verify* command, paste the **exact** bytes, and assert:
- `test_S15_default_conversationDAG_shows_the_rewound_fork` — `A  prompt  #a94b7090   (rewind point)`;
  `branch rewound (rewound; tip #56da61e5; rewind @ #a94b7090)`; `D  user-edit  scenario15.py  #d675bbfe`;
  `branch surviving (surviving; tip #4eb82c06)`; `(no file changes)`; and
  `indexOf("branch rewound") < indexOf("branch surviving")`.
- `test_S15_default_fileDAG_shows_write_then_user_edit` — under `scenario15.py`: `B  write` `#018tu7eT`
  then `D  user-edit  #d675bbfe`; under `test_scenario15.py`: `C  write  #018f4SXM`.
- `test_S15_list_branches_includes_the_rewound_branch` — `surviving` + `4eb82c06`; `rewound` + `56da61e5`;
  `rewind @ #a94b7090`.
- `test_S15_branch_selects_the_user_edit_content` —
  `runCli([S15_JSONL, "--branch", "56da61e5", "--verbose"])` includes `# user edit` and `def hello():`.
- `test_S15_surviving_excludes_the_user_edit` —
  `runCli([S15_JSONL, "--surviving", "--verbose"])` includes `def hello():` and NOT `# user edit`.

> Apply **Edit 6** (list label) here if any lock test exercises `renderHistoryList`; otherwise it is
> defensive and can land with Edit 5. Either way it must be in before Task 6.

**Task 6 — full green + regression.** `npm test` = **180 prior + N new**, 0 fail. `npx tsc --noEmit` clean.
Filesize sweep clean (see line budget). Spot-check S13/S14 default + `--list-branches` and S1 default are
**byte-for-byte unchanged**.

**Task 7 — docs.** Flip `plans/roadmap.md` `[ ] S15 ->` to `[x] S15 -> …` (one-line summary mirroring
S14's entry: the user-edit family opens; `edited_text_file` → `user-edit` event; S13/S14 machinery reused;
no second bug). Prepend an S15 entry to `plans/implementation-notes-api-from-scenarios.md` (top of file)
recording the single-gap root cause, the new `EventKind.userEdit`, the new leaf module, and the
full-content (overwrite-style) replay decision.

**Task 8 — create handoff.** Write a handoff doc with the `/jot:handoff-prompt` skill (verified state,
180+N green, nothing committed unless the user asks). Then surface the diff for the user to review/commit
(project rule: commit only when the user asks; one-commit-per-scenario precedent → `Implemented S15
handling`). Do **NOT** start S16.

---

## Regression safety (why S1–S14 cannot change)

- A `user-edit` event is emitted **only** from an `edited_text_file` attachment. That payload kind appears
  for the first time in **S15**; no implemented scenario (S1–S14, M1–M7) contains one (verify with a grep
  for `edited_text_file` across `scenarios/executed/s1*`…`s14*`/`m*` — expect S15 only). So
  `extractFileEvents` returns an **identical** list for every prior transcript ⇒ every view is byte-for-byte
  unchanged.
- The new replay branch and the new `getEntryLabel` branch are reached **only** for `EventKind.userEdit`,
  which no prior scenario produces.
- The fork/surviving machinery is **unchanged** — S15 reuses the already-committed S13 structural discovery
  and S14 surviving-head guard exactly; this slice adds no branch/worktree/fork logic.

---

## Line-budget note (the 250-line cap is enforced by a repo hook)

Current: `vocabulary.ts` 112 (+2), `reconstruction_engine.ts` 228 (+~13 → ~241, under cap),
`reconstruction_extract.ts` 233 (+~5 → ~238, under cap — the bulk of the new logic is in the **new** leaf
module, by design), `reconstruction_replay.ts` 138 (+~12), `reconstruction_render_list.ts` 145 (+3), new
`reconstruction_user_edit.ts` ~45. All comfortably under 250. Project rule is **split, don't condense** —
if `engine.ts` ever crowds the cap while you add `UserEditEvent`, that is the signal to extract, not to
compress (it does not here). Keep new functions ≤ 3 levels of nesting (lint hook blocks deeper).

---

## Verify (success criteria)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect: 180 prior + N new, 0 fail
npx tsc --noEmit         # expect: no errors (tsx does not type-check)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
P="scenarios/executed/s15-user-edit-then-conv-rewind/7365140d-8666-4dbf-81bc-9d92e9d6cac9.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                 # fork: rewound #56da61e5 (user-edit) above surviving #4eb82c06 (no file changes); fileDAG B write + D user-edit
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null # surviving #4eb82c06 + rewound #56da61e5 (rewind @ #a94b7090)
npx tsx src/reconstruction_cli.ts "$P" --branch 56da61e5 --verbose 2>/dev/null  # `# user edit` + `def hello():`
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null        # `def hello():`, NO `# user edit`
# Regression spot-check (must be unchanged): S13 default + --list-branches; S14 default + --list-branches; S1 default.
```
