# Plan: S14 slice — multi-edit, conversation-only rewind, read (the conv-only twin of S13; the abandoned branch edited a file, but a conv-only rewind misroutes `findSurvivingHead` so the engine names the *abandoned* branch as surviving and orphans the edit)

> Audience: the implementing agent. This plan is "How" and "In what order". Follow it with strict
> RED → GREEN TDD (`~/.claude/guides/tdd.md`) and the project coding rules
> (`plans/coding-requirements.md` + `~/.claude/guides/coding-standards.md`). Every code snippet here
> already conforms to those rules; reproduce them verbatim unless a test forces otherwise.

---

## TL;DR (the whole slice in five sentences)

1. S14 is the **conversation-only-rewind twin of S13**: the same write→edit→rewind→read shape, but
   the rewind is `Rewind: 2` (conv-only) instead of `Rewind: 2, code`.
2. Because a conv-only rewind does **not** roll back disk, the on-disk content is the *abandoned*
   branch's `farewell` Edit, so `findWorkingTreeOwner` points at the abandoned branch and
   `findSurvivingHead`'s working-tree override hands the *abandoned* prompt back as "surviving".
3. A **second** bug then hides the rewound branch: in S14 the abandoned prompt **is** a `last-prompt`
   head (in S13 it was not), so the head-based pass "claims" it and the structural dedup guard skips
   the real `farewell` tip.
4. The correct S14 reconstruction is **byte-identical to S13's** (modulo `s13`→`s14`, uuids,
   timestamps): a conversationDAG fork — rewound `farewell` Edit above a file-less surviving Read
   branch — with an unchanged fileDAG (`B write` + `D edit`).
5. The fix is two surgical edits (one in `reconstruction_branch.ts`, one in `reconstruction_fork.ts`),
   each provably scoped, plus the S14 fixture and lock tests; **172 prior tests stay green**.

---

## Background — the scenario, the verified topology, and the gap

### The scenario (from the recorded run sheet)
`scenarios/executed/s14-multi-edit-conv-only-read/` — driven steps:
1. Say: *Write a file called scenario14.py with a function greet(name)… and write tests/test_scenario14.py…*
2. Say: *Edit scenario14.py. Add a function called farewell(name) that returns "Goodbye, " + name.*
3. Say: *Good work.*
4. **Rewind: 2** ← conversation-only (no `, code`)
5. Say: *Read scenario14.py and tell me what functions it has.*
6. Say: *Thanks.*

This is the exact step list of **S13** with one difference: step 4 is a **conversation-only** rewind,
where S13's was `Rewind: 2, code` (a code-restore). That single difference is the entire slice.

### Verified topology (all uuids first-8-chars; confirmed by direct transcript inspection)
Fixture transcript (157.2K): `…/scenarios/executed/s14-multi-edit-conv-only-read/6d632174-79b3-4c11-953f-1308a957d748.jsonl`.

- **Trunk (pre-fork, shared by both branches):**
  - `798ea718` — user prompt #1 *"Write a file called scenario14.py …"*
  - `B` = `write scenario14.py` changeId **`0131TtyG`** (greet, 2 lines)
  - `C` = `write test_scenario14.py` changeId **`01YE6fsX`**
- **Fork point: `acc07a57`** — a `system` record that parents **two** genuine user prompts:
  - **Abandoned branch:** `fadbe55d` — user prompt #2 *"Edit scenario14.py. Add a function called farewell"* → Read → `D` = `edit scenario14.py` changeId **`01X52CXE`** (adds `farewell`) → `2f3a2bcb` *"Good work."* → assistant **`68f74356`** *"Thanks!"* (the deepest reply = abandoned tip).
  - **Surviving branch:** `d95943dc` — user prompt #3 *"Read scenario14.py …"* → Read (no edit) → assistant *"It has two functions…"* → `6c297fb2` *"Thanks."* → `b65ff705` *"You're welcome!"* → trailing `system` **`de63b23a`** (the final `last-prompt` leaf = surviving head).

Key uuids the tests will assert on:

| role | uuid (8) | what it is |
|------|----------|-----------|
| fork / rewind point | `acc07a57` | system record parenting both prompts |
| surviving head | `de63b23a` | final `last-prompt` leaf (Read branch) |
| abandoned tip | `68f74356` | deepest assistant reply on the `farewell` branch |
| abandoned prompt (the trap) | `fadbe55d` | also a `last-prompt` head ⇒ the dedup collision |
| write scenario14.py | `0131TtyG` | trunk B |
| write test_scenario14.py | `01YE6fsX` | trunk C |
| edit scenario14.py (farewell) | `01X52CXE` | abandoned D |

### The distinction S14 adds (it completes the S9/S11 ↔ S10/S12 and S13 ↔ S14 grid)
- **S13 = code-restore** twin: disk rolls back to greet-only ⇒ `findWorkingTreeOwner` lands on the
  **trunk** greet Write, which is on the surviving chain ⇒ the override never fires ⇒ surviving =
  final head ⇒ the structural pass surfaces the `farewell` Edit. **Already correct.**
- **S14 = conv-only** twin: disk keeps `farewell` ⇒ `findWorkingTreeOwner` lands on the **abandoned**
  branch ⇒ the override **mis-fires**. S14 makes the engine route the conv-only case onto the same
  code path S13 already proved correct.

---

## Verified current behavior (what is right, what is wrong)

Run before any change (the RED baseline; debugger noise on stderr is harmless):

```
P="scenarios/executed/s14-multi-edit-conv-only-read/6d632174-79b3-4c11-953f-1308a957d748.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
#   surviving  tip #fadbe55d    scenario14.py, test_scenario14.py        ← WRONG (abandoned prompt named surviving)
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null
#   conversationDAG shows only A→B→C (trunk); the farewell Edit D is ORPHANED; NO fork.   ← WRONG
#   fileDAG shows scenario14.py B write + D edit, test C write.                            ← already RIGHT
```

- **`fileDAG` is already correct** (branch-agnostic disk lineage). It must stay byte-for-byte unchanged.
- **`conversationDAG` / `--list-branches` are wrong**: the surviving tip is the *abandoned* prompt
  `fadbe55d`, the rewound `farewell` branch is missing, and the `farewell` Edit `D` is orphaned.

### Root cause (two independent bugs, both required to fix)

**Bug 1 — `findSurvivingHead` working-tree override mis-fires (`src/reconstruction_branch.ts`).**
Verified inputs on the real transcript:
```
finalHead          = de63b23a            (the Read branch's true tip)
findWorkingTreeOwner = 2f3a2bcb          ("Good work." — on the ABANDONED branch, because conv-only
                                          left farewell on disk)
finalChain.has(owner) = false            ⇒ the override block runs
findHeadAtOrAbove(owner) = fadbe55d      ⇒ returns the ABANDONED prompt as "surviving"
```
The override exists for S8/S9/S10, where the surviving (Read) branch made **no file changes** and the
on-disk files were created entirely on an off-branch Write — there the redirect is correct. In S14 the
surviving branch's chain **does** carry file changes (the trunk Writes `B`/`C` are pre-fork ancestors
of `finalHead`), so the redirect is wrong.

**Bug 2 — the structural dedup guard skips the real rewound tip (`src/reconstruction_fork.ts`).**
After Bug 1 is fixed, `findSurvivingHead` returns `de63b23a` and the head-based pass enumerates the
abandoned prompt `fadbe55d` as an abandoned head (in S14 `fadbe55d` **is** a `last-prompt` leaf; in
S13 the abandoned prompt was not). That degenerate branch (tip = the prompt) carries no diverging file
change and is filtered downstream — **but** it is now in `claimed`, and
`subtreeHoldsClaimedTip` short-circuits on `claimed.has(abandonedPrompt)`, so the structural pass
refuses to discover the real `farewell` tip `68f74356`. Net: still no rewound branch.

---

## The fix

Two surgical edits. Apply them in the TDD order in the task breakdown below (tests first).

### Part 1 — only redirect to the working-tree owner when the surviving branch has no file changes (`src/reconstruction_branch.ts`)

`findSurvivingHead` currently ends:
```ts
    const workingTreeHead = findHeadAtOrAbove(records, owner);
    if (workingTreeHead === undefined) {
        return finalHead;
    }
    return workingTreeHead;
```
Change the tail to keep `finalHead` whenever the final-head branch already records file changes of its
own (i.e. the on-disk files are owned via the shared trunk, so the off-branch owner is an abandoned
post-rewind modification, not the surviving tree):
```ts
    const workingTreeHead = findHeadAtOrAbove(records, owner);
    if (workingTreeHead === undefined) {
        return finalHead;
    }
    if (survivingBranchRecordsFileChange(records, finalHead)) {
        return finalHead;
    }
    return workingTreeHead;
```
Add this verb-named helper next to `findSurvivingHead` (keep it shallow; one statement):
```ts
// True when the final-head branch produces any file event of its own (its trunk holds the creating
// Writes). When it does, the on-disk working tree is already attributed to the surviving branch and a
// working-tree owner found off-branch is an abandoned post-rewind change, not the surviving tree — so
// the override must NOT redirect (S14). When it is empty, the on-disk files came from an off-branch
// Write and the override correctly redirects to the owner's head (S8/S9/S10).
function survivingBranchRecordsFileChange(
    records: TranscriptRecord[],
    finalHead: Uuid,
): boolean {
    return extractFileEvents(selectBranchRecords(records, finalHead)).length > 0;
}
```
Add the import at the top (alongside the existing `reconstruction_fork.ts` import):
```ts
import { extractFileEvents } from "./reconstruction_extract.ts";
```
`reconstruction_extract.ts` imports none of `reconstruction_branch.ts`/`_fork.ts`/`_worktree.ts`
(verified) — **no import cycle**. `selectBranchRecords` already lives in this file.

### Part 2 — let a deeper structural tip win over a claimed shallow prompt-tip (`src/reconstruction_fork.ts`)

In `subtreeHoldsClaimedTip`, delete the `claimed.has(abandonedPrompt)` short-circuit:
```ts
// DELETE these three lines:
    if (claimed.has(abandonedPrompt.toString())) {
        return true;
    }
```
The function keeps only the descendant scan:
```ts
function subtreeHoldsClaimedTip(
    records: TranscriptRecord[],
    abandonedPrompt: Uuid,
    claimed: Set<string>,
): boolean {
    const subtree = collectDescendantUuids(records, abandonedPrompt);
    for (const tip of claimed) {
        if (subtree.has(tip)) {
            return true;
        }
    }
    return false;
}
```
Why this is safe (verified): `collectDescendantUuids(start)` **excludes** `start` itself.
- **S7/S8/S11/S12** (head-based abandoned tips): the abandoned prompt's deepest reply **is** the
  already-claimed head tip, which is a descendant ⇒ the surviving scan still returns `true` ⇒ skipped,
  exactly as before. (And the later `claimed.has(tip)` check in `buildRewoundBranchForPrompt` is a
  second guard.)
- **S14**: `fadbe55d`'s descendants contain neither `de63b23a` (surviving) nor `fadbe55d` (self), and
  the real tip `68f74356` is not yet claimed ⇒ the structural branch is discovered. ✔

> Do not "improve" beyond these two edits. The fix is intentionally minimal; both files are near the
> 250-line cap (see line-budget note).

---

## Expected outputs after the fix (the authoritative spec — captured from a verified prototype)

These are the exact strings the lock tests assert. They are byte-identical in shape to S13's.

### `--list-branches`
```
surviving  tip #de63b23a    scenario14.py, test_scenario14.py
rewound    tip #68f74356  rewind @ #acc07a57    scenario14.py
```

### bare default (both DAGs)
```
══ conversationDAG ══
A  prompt  #acc07a57   (rewind point)
│
├─ branch rewound (rewound; tip #68f74356; rewind @ #acc07a57)
│  D  edit  scenario14.py  #01X52CXE
│
└─ branch surviving (surviving; tip #de63b23a)
   (no file changes)

══ fileDAG ══
scenario14.py
  B  write  #0131TtyG
  D  edit   #01X52CXE
test_scenario14.py
  C  write  #01YE6fsX
```

### `--branch 68f74356 --verbose` (the abandoned `farewell` content)
`scenario14.py` reconstructs to **two** revisions: rev 0 = `greet` only (trunk Write), rev 1 =
`greet` + `farewell` (after the abandoned Edit). Assert both function defs appear:
```
def greet(name):
def farewell(name):
```

### `--surviving --verbose` (unchanged-from-trunk content)
The surviving Read branch has no file events of its own; its `scenario14.py` is the trunk `greet`
(2 lines) and `tests/test_scenario14.py` is the trunk test. Assert `greet` present and `farewell`
**absent** — even though disk physically kept `farewell`, the *surviving branch's* reconstruction is
greet-only (the conversationDAG view; the fileDAG above is where the persisted Edit shows).

---

## TDD task breakdown (strict RED → GREEN, in order)

> A repo Stop hook reruns the suite after every edit; expect inline RED while tests are red — that is
> intended. The hook log can lag one step (it may report the prior edit's failure); confirm true state
> by running `npx tsx --test <file>` directly.

**Task 0 — register the fixture (no test).**
In `tests/fixtures.ts`, after `S13_JSONL`, add (Desktop absolute path, matching every other fixture):
```ts
export const S14_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s14-multi-edit-conv-only-read/6d632174-79b3-4c11-953f-1308a957d748.jsonl";
```

**Task 1 — RED: branch enumeration discovers both branches.**
New file `tests/reconstruction_engine_s14.test.ts` (mirror `…_s13.test.ts`). First test:
`test_S14_findConversationBranches_includes_the_structural_rewound_branch` —
`findConversationBranches(loadRecords(S14_JSONL))` returns length 2; surviving tip starts `de63b23a`;
the non-surviving tip starts `68f74356` with `rewindPoint` starting `acc07a57`.
This is RED on **both** bugs. Proceed to GREEN only after Tasks 4–5's code, but write the test now.

**Task 2 — RED: the rewound branch touches scenario14.py only.**
`test_S14_reconstructBranches_yields_one_rewound_branch_touching_only_scenario14` —
`reconstructBranches(loadRecords(S14_JSONL))` has `rewound.length === 1`; its histories' single target
ends with `scenario14.py`. (No backup reader needed: the abandoned Edit replays over the trunk Write,
both in-transcript — same as S13.)

**Task 3 — RED: branch contents.**
- `test_S14_rewound_branch_content_is_greet_plus_farewell` — the rewound branch's `scenario14.py`
  final text contains both `def greet(name):` and `def farewell(name):`.
- `test_S14_surviving_content_is_greet_only` — `reconstructAll(loadRecords(S14_JSONL))`'s
  `scenario14.py` final text contains `def greet(name):` and does **not** contain `farewell`.

**Task 4 — GREEN Part 1: `findSurvivingHead` override guard.**
Apply Part 1 (the `survivingBranchRecordsFileChange` guard + import). After this, `findSurvivingHead`
returns `de63b23a`, but the rewound branch is still missing (Bug 2). Re-run Task 1's test — surviving
tip is now correct; the `length === 2` / `68f74356` assertions still RED.

**Task 5 — GREEN Part 2: dedup guard.**
Apply Part 2 (delete the `claimed.has(abandonedPrompt)` short-circuit). Tasks 1–3 now all GREEN.

**Task 6 — RED→GREEN: CLI locks.**
New file `tests/reconstruction_cli_s14.test.ts` (mirror `…_cli_s13.test.ts`, `import { runCli }`,
real on-disk file-history reader). Four tests asserting the *Expected outputs* section verbatim:
- `test_S14_default_conversationDAG_shows_the_rewound_fork` — `A  prompt  #acc07a57   (rewind point)`;
  `branch rewound (rewound; tip #68f74356; rewind @ #acc07a57)`; `D  edit  scenario14.py  #01X52CXE`;
  `branch surviving (surviving; tip #de63b23a)`; `(no file changes)`; and
  `indexOf("branch rewound") < indexOf("branch surviving")`.
- `test_S14_default_fileDAG_is_unchanged` — `B  write  #0131TtyG`, `D  edit   #01X52CXE`,
  `C  write  #01YE6fsX`.
- `test_S14_list_branches_includes_the_rewound_branch` — `surviving` + `de63b23a`; `rewound` +
  `68f74356`; `rewind @ #acc07a57`.
- `test_S14_branch_selects_the_abandoned_farewell_content` —
  `runCli([S14_JSONL, "--branch", "68f74356", "--verbose"])` includes `def greet(name):` and
  `def farewell(name):`.

**Task 7 — full green + regression.** `npm test` = **172 prior + 8 new** (4 engine + 4 CLI), 0 fail.
`npx tsc --noEmit` clean. Filesize sweep clean (see line budget).

**Task 8 — docs.** Flip `plans/roadmap.md` `[ ] S14 ->` to `[x] S14 -> …` (one-line summary mirroring
S13's entry). Prepend an S14 entry to `plans/implementation-notes-api-from-scenarios.md` (top of file)
recording the two-bug root cause and the two fixes.

---

## Regression safety (why S1–S13 cannot change)

The working-tree override only runs when `finalChain.has(owner) === false`. Verified across the entire
corpus, that is true for **only**: `s8`, `s9`, `s10`, `s14` (and the not-yet-implemented `s15`). For
every other scenario (`s1`–`s7`, `s11`, `s12`, `s13`, `m1`–`m7`) the override never runs, so
**Part 1 cannot touch them**.

For the three implemented scenarios where it does run:
- **S9, S10** — the surviving (Read) branch has **no** file events ⇒
  `survivingBranchRecordsFileChange` is `false` ⇒ the redirect still fires ⇒ unchanged
  (`surviving #f1b8dede` / `#bfd9d428`, verified).
- **S8** — the surviving branch carries its own file changes, so Part 1 keeps `finalHead`; S8's tips
  are head-based and its rewound branches are unaffected (verified `--list-branches`: surviving
  `#2988ac8f` + two rewound, unchanged).

Part 2 is a no-op for S7/S8/S11/S12: their abandoned prompt's deepest reply is the already-claimed head
tip and lies inside the descendant subtree, so `subtreeHoldsClaimedTip` still returns `true`. S9/S10
read-only abandoned branches remain filtered downstream (no diverging file change). **Confirmed by a
verified prototype: all 172 prior tests stayed green with both edits applied; S8/S9/S10/S13
`--list-branches` and the S13 default were byte-for-byte unchanged.**

---

## Line-budget note (the 250-line cap is enforced by a repo hook)

Current counts: `reconstruction_branch.ts` = 215, `reconstruction_fork.ts` = 125. Part 1 adds ~9 lines
to `branch.ts` (→ ~224, under cap). Part 2 **removes** 3 lines from `fork.ts`. No new module needed.
Project rule is **split, don't condense** — if `branch.ts` ever crowds the cap, extract a helper into a
leaf module rather than compressing; it does not here. Keep new functions ≤ 3 levels of nesting (lint
hook blocks deeper).

---

## Verify (success criteria)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect: 180 pass / 0 fail (172 prior + 8 new)
npx tsc --noEmit         # expect: no errors (tsx does not type-check)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
P="scenarios/executed/s14-multi-edit-conv-only-read/6d632174-79b3-4c11-953f-1308a957d748.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                 # fork: rewound #68f74356 above surviving #de63b23a (no file changes)
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null # surviving #de63b23a + rewound #68f74356 (rewind @ #acc07a57)
npx tsx src/reconstruction_cli.ts "$P" --branch 68f74356 --verbose 2>/dev/null  # greet + farewell
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null        # greet only
# Regression spot-check (must be unchanged): S13 default + --list-branches; S8/S9/S10 --list-branches; S1 default.
```
