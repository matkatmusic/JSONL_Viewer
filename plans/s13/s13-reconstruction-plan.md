# Plan: S13 slice — multi-edit, code restore, read (an abandoned branch that *edited a file* but is named by NO `last-prompt` head, so the engine orphans its edit)

> Scope: make `reconstruction_cli` correctly reconstruct the file-change history of
> `s13-multi-edit-code-restore-read`. Two behavioral changes:
> **Part 1** — branch enumeration discovers the rewound branch *structurally* (from the
> `parentUuid` fork), not only from `last-prompt` heads (`src/reconstruction_tree.ts` +
> `src/reconstruction_branch.ts`).
> **Part 2** — the conversationDAG keeps a file-less surviving branch visible when a rewound
> branch exists, so the fork renders honestly instead of collapsing into a misleading trunk
> (`src/reconstruction_graph.ts` + `src/reconstruction_graph_render.ts`).
> The `--surviving` content view and the `fileDAG` are **already correct** and must stay byte-for-byte
> unchanged. All S1–S12 outputs must stay unchanged; the 151-test suite must stay green.
>
> Predecessor: S12 (`s12-write-conv-only-rewrite`) — IMPLEMENTED, 151 tests green, **uncommitted in
> the working tree**. S13 builds directly on S12's branch model + two-DAG renderer. Do NOT commit or
> revert the uncommitted S12 work while implementing S13.

JSONL: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s13-multi-edit-code-restore-read/546faa49-72b6-4b57-9557-d54e2ff7aa56.jsonl`
(identical bytes to the in-worktree copy at `scenarios/executed/s13-multi-edit-code-restore-read/546faa49-72b6-4b57-9557-d54e2ff7aa56.jsonl`)

---

## Background — the scenario, the verified topology, and the gap

`s13-multi-edit-code-restore-read` is the seventh scenario in the rewind / code-restore family
(S7–S23) and the **S9 analog with an edited abandoned branch**. Its recorded steps were:

1. Write `scenario13.py` (`greet`) **and** `tests/test_scenario13.py` — the only writes. *(trunk)*
2. A **rewind fork** happens at the system record that re-prompts from the post-write point. Two
   genuine user prompts share that one parent:
   - **earlier prompt** (16:10:17): *"Edit scenario13.py. Add a function called farewell(name)…"* —
     the agent Reads then **Edits** `scenario13.py` to add `farewell`, then "Good work." / "Thanks!".
     This branch is **abandoned**.
   - **later prompt** (16:10:54): *"Read scenario13.py and tell me what functions it has."* — a Read,
     no file change, then `/exit`. This branch **survives** (the final transcript tail).
3. The fork is a **code restore**: the working tree is rolled back to the step-1 `greet`-only content.
   The `farewell` Edit is discarded from disk.

### Verified topology (all uuids first-8-chars; confirmed by direct transcript inspection)

```
c9a22a89 (root attachment, parent=null)
   … trunk …
   6f235fe3  Write scenario13.py   (greet)              ← letter B, changeId #01KmxQkd
   f8d4a851  Write tests/test_scenario13.py             ← letter C, changeId #01WiSfee
   … trunk …
   8faab841  (system) ── THE REWIND FORK ──┐  parent of TWO genuine user prompts:
            ├─ 5741c77f  user "Edit … farewell"   (16:10:17)  ABANDONED
            │     59db88b1 Read → 6e9cff20 Edit farewell      ← letter D, changeId #01EoFfFx
            │     → 60fe8d80 → f97b8ca1 "Good work." → 45cf4bf8 "Thanks!" (abandoned tip)
            └─ 5f564d7d  user "Read scenario13.py…"  (16:10:54)  SURVIVING
                  41fc0d44 Read (no file change) → … → /exit → 9641c49c (surviving head)
```

Verified facts (each established by running the current engine + parsing the transcript):

- `findWorkingTreeOwner(records)` = **`5f564d7d`** (the surviving Read's snapshot owner): disk = the
  restored `greet`-only content. `findSurvivingHead` therefore = the surviving head **`9641c49c`**.
- `collectHeadUuids(records)` = `[5af693b0, b441f0f6, 8faab841, ee0a6c61, 9641c49c]`. **The abandoned
  branch's tip (`45cf4bf8`) is NOT in this list.** The fork point `8faab841` IS in the list, but it is
  an *ancestor of the surviving head*, so it is never classified as "abandoned".
- `findConversationBranches(records)` therefore returns **only** the surviving branch — **zero rewound
  branches** — even though the abandoned branch **edited a file**.
- The only structural signal that the abandoned branch exists: **`8faab841` is the `parentUuid` of two
  genuine user-prompt records** (`5741c77f`, `5f564d7d`). No other record in the transcript is the
  parent of ≥2 genuine prompts. (Six records have ≥2 children of *any* type, but in five of them the
  extra child is an `attachment` side-record or a tool-result `user` record — not a real fork.)

### The distinction S13 adds (it complements S9 and S11)

| scenario | abandoned branch changed a file? | abandoned tip is a `last-prompt` head? | rewound branches today |
|----------|----------------------------------|----------------------------------------|------------------------|
| S9 / S10 | no (read-only tangent)           | (n/a)                                  | 0 (correct)            |
| S11 / S12| yes                              | **yes** → found via head path          | 1 (correct)            |
| **S13**  | **yes** (the `farewell` Edit)    | **NO** → invisible to head path        | **0 (WRONG — should be 1)** |

S13 is the first scenario where an abandoned branch **both** changed a file **and** has no
`last-prompt` head naming its tip. The rewind re-prompted from the fork point, so no `last-prompt`
record ever pointed at the abandoned tip.

---

## Verified current behavior (what is right, what is wrong)

Run (no flags = both DAGs):
`npx tsx src/reconstruction_cli.ts <S13.jsonl>`

**WRONG — conversationDAG** (no fork; the `farewell` Edit is orphaned — it appears in the fileDAG but
nowhere in the conversationDAG; the surviving trunk wrongly shows the pre-fork writes):
```
══ conversationDAG ══
A  prompt  #c9a22a89
  B  write  scenario13.py       #01KmxQkd
  C  write  test_scenario13.py  #01WiSfee
```

**WRONG — `--list-branches`** (the rewound branch is missing entirely):
```
surviving  tip #9641c49c    scenario13.py, test_scenario13.py
```

**ALREADY CORRECT — `fileDAG`** (cross-branch disk lineage; the `farewell` Edit `D` is shown). Must
stay byte-for-byte identical after the fix:
```
══ fileDAG ══
scenario13.py
  B  write  #01KmxQkd
  D  edit   #01EoFfFx
test_scenario13.py
  C  write  #01WiSfee
```

**ALREADY CORRECT — `--surviving --verbose`** (the restored `greet`-only disk state). Must stay
byte-for-byte identical:
```
### …/scenario13.py
revision 0  @ 2026-06-18T16:10:05.279Z  (2 lines)
     1 | def greet(name):
     2 |     return "Hello, " + name

### …/tests/test_scenario13.py
revision 0  @ 2026-06-18T16:10:05.755Z  (5 lines)
     1 | from scenario13 import greet
     …
```

### Root cause (one sentence)

`findConversationBranches` enumerates rewound branches **exclusively** from `last-prompt` abandoned
heads (`collectAbandonedHeads` over `collectHeadUuids`); S13's abandoned branch has no `last-prompt`
head, so it is never enumerated — and every downstream view that needs the rewound branch
(conversationDAG, `--list-branches`, `--branch <id>`) loses it, while the branch-agnostic `fileDAG`
(which scans *all* records) still shows its Edit, producing the two-DAG disagreement.

---

## The fix

Two parts. Part 1 makes the rewound branch *exist* in the branch enumeration; Part 2 makes the
conversationDAG *render the fork* once a file-less surviving branch coexists with a rewound branch.

### Part 1 — discover the rewound branch structurally

The abandoned branch must be found from the `parentUuid` forest. Add the walkers to
`src/reconstruction_tree.ts` (92/250 lines — ample room), and the enumeration glue to
`src/reconstruction_branch.ts` (212/250 lines — **tight; see line-budget note**).

**New predicate — `isGenuineUserPrompt(record): boolean`** (home: `reconstruction_tree.ts`).
A record is a genuine user prompt when ALL hold:
- `record.type === RecordType.user` (compare the enum member, never the bare string);
- `record.isMeta !== true` (exclude `<local-command-caveat>` /exit machinery);
- it carries **no** `tool_result` block — iterate `getContentBlocks(record)` and require none has
  `block.type === BlockType.tool_result` (this is what excludes tool-result `user` records such as
  `87ad16f4`, the Write result, from counting as a prompt).

Rationale: the two children of the real fork (`5741c77f`, `5f564d7d`) are exactly the records this
predicate accepts; the false-fork extra children (`attachment`s, the tool-result `user`) are exactly
the ones it rejects. Verified against the S13 transcript: this predicate yields the single fork
`8faab841` and no other.

**New walker — `findPromptForkPoints(records): Uuid[]`** (home: `reconstruction_tree.ts`).
Group every uuid-bearing record by its `parentUuid` string; return each parent uuid that has **≥2
children satisfying `isGenuineUserPrompt`**, in first-appearance order. (For S13: `[8faab841]`.)

**New walker — `collectDescendantUuids(records, start: Uuid): Set<string>`** (home:
`reconstruction_tree.ts`). BFS *down* the `parentUuid` forest from `start` (exclusive of `start`),
following children of **every** type (the tree threads through `attachment` records between a prompt
and its assistant continuation — see topology). The dual of the existing `collectAncestorUuids`.

**New walker — `findDeepestPromptOrReply(records, start: Uuid): Uuid | undefined`** (home:
`reconstruction_tree.ts`). Among `collectDescendantUuids(records, start)`, return the uuid of the
record with the **latest `timestamp`** whose `type` is `RecordType.user` **or** `RecordType.assistant`
(exclude trailing `system`/`attachment` bookkeeping). This names the abandoned branch's tip the same
way the surviving tip is a conversational head, not the literal last bookkeeping record. (For S13's
abandoned subtree under `5741c77f`: tip = **`45cf4bf8`**, the final "Thanks!" assistant turn — NOT the
trailing system record `a4380554`.)

**Glue — extend `findConversationBranches` in `reconstruction_branch.ts`.** After building the
head-based `branches` array (unchanged), append structurally-discovered rewound branches:

1. Compute `survivingSet = collectAncestorUuids(records, survivingHead)` (already available).
2. Collect the tips already represented: `existingTips = new Set(branches.map(b => b.tip.toString()))`.
3. For each `forkPoint` in `findPromptForkPoints(records)`:
   a. List its genuine-prompt children, ordered by `timestamp` ascending.
   b. The **last** child (latest) is the surviving-side continuation — skip it.
   c. For each **earlier** child `abandonedPrompt`:
      - `subtree = collectDescendantUuids(records, abandonedPrompt.uuid)` (plus the prompt itself).
      - **Dedup guard (regression safety):** if any uuid in `existingTips` lies in that subtree (or
        equals `abandonedPrompt.uuid`), this abandoned branch is already represented by a head-based
        branch — **skip it** (this is what prevents double-counting S7/S8/S11/S12, whose abandoned
        tips ARE `last-prompt` heads).
      - Otherwise `tip = findDeepestPromptOrReply(records, abandonedPrompt.uuid)`; if `tip` is
        defined and `tip.toString()` not already in `existingTips`, push
        `{ tip, rewindPoint: forkPoint, isSurviving: false }` and add `tip` to `existingTips`.

This is purely **additive**: it appends rewound branches the head path missed, and the dedup guard
guarantees it adds nothing for S1–S12. Read-only abandoned branches (S9/S10) ARE appended here but are
**filtered downstream** for free: `buildRewoundBranchHistory` (engine) and `buildRewoundConvoBranch`
(graph) both already drop a branch whose diverging records changed no file (verified:
`reconstruction_engine.ts:221-223` returns `undefined` on `divergingIds.size === 0`).

### Part 2 — render the fork when the surviving branch is file-less

With Part 1 done, `buildConversationDag` finds `rewound = [farewell-edit branch]` (1 turn, `D`) and a
surviving branch with **0 post-fork file turns** (it only Read). Today `buildSurvivingConvoBranch`
returns `undefined` for a 0-turn branch, so `kept = [rewound]` and `assembleDag` collapses it to a
linear **trunk** — rendering the abandoned `D edit` as if it were the surviving main line (wrong and
misleading). Fix `src/reconstruction_graph.ts` (223/250 lines — **tight; see line-budget note**) so a
file-less surviving branch is preserved **as a branch** whenever a rewound branch exists:

1. **`buildSurvivingConvoBranch`** — when its computed `turns.length === 0`, return `undefined`
   **only if there are no rewound branches** (preserve today's behavior for linear scenarios); when
   `rewound.length > 0`, return a real `ConvoBranch { role: surviving, tip, rewindPoint: undefined,
   turns: [] }` so the fork is kept. (Pass `rewound` in, or gate at the `buildConversationDag` call
   site — keep the surviving branch in `kept` when `rewound.length > 0` even if its `turns` is empty.)
2. **`assembleDag`** — unchanged trigger (`kept.length >= 2` → branch wrappers); with surviving(empty)
   + rewound(1) that is already 2 branches, so it renders wrappers. Confirm `rootUuid` resolves to the
   rewind point (`resolveRootUuid` already returns `rewound[0].rewindPoint` = `8faab841`).
3. **`firstTurnTime(branch)`** — must not index `turns[0]` on an empty branch. Make a file-less branch
   sort **last** (e.g. return `Number.POSITIVE_INFINITY` when `branch.turns.length === 0`), so the
   rewound branch (real turn @ 16:10:29) renders above the file-less surviving branch — matching S11's
   oldest-first / rewound-above-surviving ordering.
4. **`renderBranchBlock`** in `src/reconstruction_graph_render.ts` (129/250 — room) — when
   `branch.turns` is empty, emit a single indented marker line `(no file changes)` under the branch
   header (using the same `turnPrefix` as a turn line) so the surviving branch is not a bare header.

No change to `buildFileDag`, `renderFileDag`, `assignTurnLetters`, the content views, or the CLI
dispatch.

---

## Expected outputs after the fix (the authoritative spec)

**conversationDAG (default, no flags)** — fork rooted at the rewind point; rewound `farewell` Edit
above the file-less surviving Read branch:
```
══ conversationDAG ══
A  prompt  #8faab841   (rewind point)
│
├─ branch rewound (rewound; tip #45cf4bf8; rewind @ #8faab841)
│  D  edit  scenario13.py  #01EoFfFx
│
└─ branch surviving (surviving; tip #9641c49c)
   (no file changes)
```

**fileDAG (default, no flags)** — UNCHANGED from today (see Verified current behavior above): B/D on
`scenario13.py`, C on `test_scenario13.py`.

**`--list-branches`** — the rewound branch now appears (it touched only `scenario13.py`, via the
`farewell` Edit):
```
surviving  tip #9641c49c    scenario13.py, test_scenario13.py
rewound    tip #45cf4bf8  rewind @ #8faab841    scenario13.py
```

**`--surviving --verbose`** — UNCHANGED (`greet`-only `scenario13.py` + the original test).

**`--branch 45cf4bf8 --verbose`** — the abandoned branch's content: `scenario13.py` reconstructs to
`greet` **plus** `farewell` (the Edit replayed over the trunk Write). Assert it contains both
`def greet(name):` and `def farewell(name):`.

---

## TDD task breakdown (strict RED → GREEN, in order)

Follow `~/.claude/guides/tdd.md`: write the failing test first, name it `test_<behavior>`, plain-English
step comments, one behavior per test, minimum code to green. Run `npm test` after every step; keep it
green except for the single RED you are actively driving. Run `npx tsc --noEmit` (the real type gate)
and the 250-line filesize check before declaring a task done.

**Task 0 — fixture.** Add to `tests/fixtures.ts`:
`export const S13_JSONL = "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s13-multi-edit-code-restore-read/546faa49-72b6-4b57-9557-d54e2ff7aa56.jsonl";`

**Task 1 — `isGenuineUserPrompt` (RED → GREEN).** New `tests/reconstruction_tree.test.ts` (no tree
test file exists yet — create it). Tests, each one behavior, using small synthetic records built the
way `tests/reconstruction_extract.test.ts` builds tool-use records:
- `test_a_plain_user_text_record_is_a_genuine_prompt`
- `test_a_user_record_carrying_a_tool_result_is_not_a_prompt`
- `test_an_isMeta_user_record_is_not_a_prompt`
- `test_an_assistant_record_is_not_a_prompt`

**Task 2 — `findPromptForkPoints` (RED → GREEN).** In `tests/reconstruction_tree.test.ts`:
- `test_a_record_parenting_two_genuine_prompts_is_a_fork_point`
- `test_a_record_with_one_prompt_child_and_one_attachment_child_is_not_a_fork_point`
- `test_findPromptForkPoints_returns_the_single_S13_fork_8faab841` (load `S13_JSONL`; assert the
  returned set, short-id, is exactly `["8faab841"]`).

**Task 3 — `collectDescendantUuids` + `findDeepestPromptOrReply` (RED → GREEN).** In
`tests/reconstruction_tree.test.ts`:
- `test_collectDescendantUuids_walks_through_attachment_intermediaries` (synthetic: prompt → attachment
  → assistant; assert the assistant is in the descendant set).
- `test_findDeepestPromptOrReply_returns_the_last_assistant_not_a_trailing_system_record` (load
  `S13_JSONL`; from the abandoned prompt-child `5741c77f` assert the tip is `45cf4bf8`, NOT the
  trailing system record `a4380554`).

**Task 4 — structural rewound discovery in `findConversationBranches` (RED → GREEN).** New
`tests/reconstruction_engine_s13.test.ts` (mirror `tests/reconstruction_engine_s12.test.ts`). Load
`S13_JSONL` via `loadRecords` (`tests/utilities.ts`) — no in-memory backup reader needed for branch
enumeration:
- `test_S13_findConversationBranches_includes_the_structural_rewound_branch` — assert two branches:
  surviving tip `9641c49c`; rewound tip `45cf4bf8` with `rewindPoint` `8faab841`.
- `test_S13_reconstructBranches_yields_one_rewound_branch_touching_only_scenario13` — assert
  `branched.rewound.length === 1`, its `histories` cover `scenario13.py` only.
- `test_S13_rewound_branch_content_is_greet_plus_farewell` — reconstruct the rewound branch; assert
  `scenario13.py`'s final text contains both `def greet(name):` and `def farewell(name):`.
- `test_S13_surviving_content_is_greet_only_unchanged` — assert `scenario13.py` final text is the
  2-line `greet`-only restored content and does NOT contain `farewell` (locks the already-correct
  `--surviving` path against regression).

**Task 5 — file-less surviving branch renders as a kept fork (RED → GREEN).** In
`tests/reconstruction_graph.test.ts`:
- `test_a_file_less_surviving_branch_is_kept_when_a_rewound_branch_exists` — build the conversationDAG
  for `S13_JSONL`; assert it has 2 branches (a surviving `ConvoBranch` with empty `turns`, and a
  rewound `ConvoBranch` with the one `edit` turn), trunk empty, `rootUuid` = `8faab841`.
- `test_an_empty_surviving_branch_sorts_below_a_rewound_branch_with_turns` — assert branch order is
  `[rewound, surviving]`.

**Task 6 — renderer + end-to-end CLI (RED → GREEN).** New `tests/reconstruction_cli_s13.test.ts`
(mirror `tests/reconstruction_cli_s12.test.ts`; the CLI path uses the real on-disk file-history
backups, consistent with the other real-transcript CLI tests):
- `test_S13_default_conversationDAG_shows_the_rewound_fork` — assert the bare-CLI output contains the
  exact conversationDAG block from the spec above (root `#8faab841   (rewind point)`, `branch rewound …
  tip #45cf4bf8 … rewind @ #8faab841`, the `D  edit  scenario13.py  #01EoFfFx` line, the `branch
  surviving … tip #9641c49c` block, and the `(no file changes)` line).
- `test_S13_default_fileDAG_is_unchanged` — assert the fileDAG block is exactly the current output.
- `test_S13_list_branches_includes_the_rewound_branch` — assert both the `surviving …` and
  `rewound    tip #45cf4bf8  rewind @ #8faab841    scenario13.py` lines.
- `test_S13_branch_selects_the_abandoned_farewell_content` — `--branch 45cf4bf8 --verbose` contains
  `def farewell(name):`.

**Task 7 — regression sweep.** Run the full suite. Confirm 151 prior tests + the new S13 tests all
green, `npx tsc --noEmit` clean, and **manually diff the S1–S12 CLI default + `--list-branches`
outputs against their pre-change values** (they must be byte-for-byte identical — the dedup guard and
the `rewound.length > 0` gate are what guarantee this).

---

## Regression safety (why S1–S12 cannot change)

- **Head-based scenarios (S7/S8/S11/S12):** their abandoned tips ARE `last-prompt` heads, so the
  Part-1 dedup guard (`existingTips` ∩ subtree) skips the structural append → identical branch sets.
- **Read-only abandoned tangents (S9/S10):** Part 1 may append a structural branch, but its diverging
  records change no file, so `buildRewoundBranchHistory` and `buildRewoundConvoBranch` drop it (the
  existing `divergingIds.size === 0` / `turns.length === 0` filters) → identical output.
- **Linear scenarios (S1–S6):** no fork point (no record parents ≥2 genuine prompts) → Part 1 appends
  nothing; Part 2's `rewound.length > 0` gate never fires → identical output.
- **Part 2** only changes rendering when a surviving branch has 0 turns AND a rewound branch exists —
  a shape no S1–S12 transcript produces (their surviving branches always changed files, or there was
  no rewound branch).

## Line-budget note (the 250-line cap is enforced by a repo hook)

- `src/reconstruction_tree.ts` 92 → has room for the four new walkers/predicate.
- `src/reconstruction_branch.ts` **212/250** — the `findConversationBranches` extension is tight.
  Extract the structural-append logic into a small private helper (e.g.
  `appendStructuralRewoundBranches(records, branches, survivingHead)`); if it still exceeds 250, move
  that helper into `reconstruction_tree.ts` (it is a pure forest walk) and call it from
  `findConversationBranches`. Do NOT create a re-export shim — move the symbol to one home and import
  it directly.
- `src/reconstruction_graph.ts` **223/250** — Part 2's change is small (a gate + an `Infinity` sort
  fallback). If it crosses 250, extract `firstTurnTime` + the kept-branch assembly into a 1-purpose
  helper rather than condensing existing functions.

## Verify (success criteria)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect: 151 prior + new S13 tests, 0 fail
npx tsc --noEmit         # expect: no errors (tsx does not type-check)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
P="scenarios/executed/s13-multi-edit-code-restore-read/546faa49-72b6-4b57-9557-d54e2ff7aa56.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                 # both DAGs; rewound fork visible
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null # surviving + rewound #45cf4bf8
npx tsx src/reconstruction_cli.ts "$P" --branch 45cf4bf8 --verbose 2>/dev/null  # greet + farewell
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null        # greet only (unchanged)
# Regression spot-check (must be unchanged from pre-S13):
#   S11 default + --list-branches, S9/S10 --list-branches, S1 default.
```

## Open decision flagged for the reviewer

The conversationDAG rendering for a **file-less surviving branch** (the `(no file changes)` marker
under a kept `branch surviving` block) is a display choice. The alternative is to render only the
rewound branch (rooted at the rewind point) and omit the empty surviving block. This plan keeps the
surviving block **visible** because (a) it is honest that the fork had two branches, (b) it mirrors
S11's two-branch layout, and (c) it signals that the on-disk `greet` state came from the pre-fork
writes + restore, not from any post-fork edit. If you prefer the omit-empty-branch rendering, only
Task 5/6's expected strings and the Part-2 `buildSurvivingConvoBranch` gate change; Part 1 is
unaffected.
