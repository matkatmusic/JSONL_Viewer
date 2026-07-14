# Item 84 — unify the bottom pane for ALL file-related content

## The rule this implements

The bottom pane shows a file in exactly ONE gui: the **Revision View**
(`renderDetailsFileMode`, `webapp/views/details.ts:372`). Every route into it picks the same
three things:

> **which file · which revision selection (one card, or a contiguous run of cards) · which
> right-column mode**

Every timeline chip-row button becomes a deep-link into that view. Chip button X ≡
`click treeview entry → click that revision's card → click the card's X`. The left column
always holds the `.rev-card` list with the chip's revision selected; only the right column
differs.

**This is a NET DELETION item.** Two renderers die; nothing is rebuilt to look like them. If a
step ends with a new function that renders file content outside `renderDetailsFileMode`, the
step is wrong.

## What exists today (read before editing)

| Path | Handler | Renders |
|---|---|---|
| Files treeview click | `sidebar.ts:106` → `onFileClick` → `timeline.ts:1977` | `renderDetailsFileMode` — rewrites BOTH columns |
| Chip name click | `timeline.ts:1631` → `showFilePreview` (`timeline.ts:1526`) | `#details-right-body` ONLY — left column left stale |
| Chip `+/-` | `timeline.ts:1656` → `showRevisionDiff` (`timeline.ts:1595`) | `#details-right-body` ONLY — left column left stale |
| Chip `{ }` | `timeline.ts:1640` → `openTranscriptInspectorSynced` | `#details-right-body` ONLY (correct chrome already) |
| Chip `⤷` | `timeline.ts:1667` | `location.hash` → File History route |

Load-bearing facts confirmed by reading the code:

1. **`openInspectorPane` (`inspector.ts:353`) never touches `#details-left`.** It clears
   `#details-right-body`, sets the label to `JSON`, hides the diff toggle. So a transcript-record
   render leaves rev cards standing **for free** — this is why `{ }` needs no new machinery.
2. **`computeSnapshotJumpRoute` (`timeline.ts:284`) resolves the chip's OWN changeId**
   (`findRevisionForChangeId(filesTouched, change.changeId, undefined)`) — the same revision
   `showRevisionDiff` resolves at `timeline.ts:1607`. They always agree.
3. **`showRevisionDiffInDetails` (`details.ts:301`) has a live caller**: `appendFileList`
   (`details.ts:321`), used by message + commit modes. It does NOT retire. It SURVIVES as the
   single remaining implementation; `timeline.ts`'s `showRevisionDiff` is the copy that dies.
4. **`computeRangeSummary(nodes, pickedNodeIndexes)` (`timeline.ts:413`)** already maps node
   indexes → `{fromStepIndex, toStepIndex}` for `/api/range-patch`. The range mode reuses it.
5. **`renderDetailsCommitMode` already drives selection with a synthetic `items[0]!.click()`**
   (`details.ts:367`). Precedent exists, but this plan uses an explicit `focus` parameter
   instead — clicking DOM nodes by index to express intent is what made these paths drift.

## Scope decisions (do not re-litigate)

- **`⤷` is NOT touched.** Its value is its *presence*: `computeSnapshotJumpRoute` returns
  `undefined` → no button, so absence signals "no File History Snapshot for this revision".
  It navigates to a different surface (the File History route), which is not bottom-pane
  content. User-decided.
- **Message/commit mode's "Files touched" list is OUT OF SCOPE.** Clicking a file there
  (`appendFileList`, `details.ts:314`) swaps the right column to that file's diff with no rev
  cards. It is a third file-clicking surface the item does not name. Leave it. Flag to the user
  at the end; do not expand.
- **`renderFileHistoryView` (`file-history.ts:161`) is OUT OF SCOPE.** It is a THIRD near-duplicate
  of the Revision View (same five per-revision actions), reached by the `#/project/<p>/file/<path>`
  route. Retiring it is its own item. Flag it; do not touch it.

## Deliberate behavior changes (call these out in the final summary)

- **Click-again-to-close is dropped.** `toggleDrawerButton` (`timeline.ts:1508`) let a second
  click on the same chip hide the pane. The treeview path has no such behavior, and the rule says
  chip ≡ treeview. Dropping it deletes `toggleDrawerButton` outright.
- **The chip's `active` highlight is KEPT** (cheap, and it is the only affordance showing which
  chip drove the pane). `activeChip` + `clearActiveChip` (`timeline.ts:1323-1330`) survive for
  this alone.
- **`.file-preview-drawer` (50%-width pane modifier) becomes unreachable.** Both adders die.
  `openInspectorPane`'s `classList.remove` line is harmless and stays. Delete the CSS rule.

---

## Step 1 — RED: tests for `computeFocusedCardIndex`

Add to `tests/details-viewmodels.test.ts` (existing file, `node:test`, `test_<behavior>` naming,
plain-English step comments — match its style exactly).

```ts
test("test_computeFocusedCardIndex_defaults_to_the_first_card_without_a_focus", () => {
    // Step 1: a three-revision card list.
    const cards = buildRevisionCards(THREE_REVISION_HISTORY);
    // Step 2: no focus means the Revision View opens where it always has — revision #1.
    assert.equal(computeFocusedCardIndex(cards, undefined), 0);
});

test("test_computeFocusedCardIndex_finds_the_card_owning_a_changeId", () => {
    // Step 1: a three-revision card list whose second revision has a known changeId.
    const cards = buildRevisionCards(THREE_REVISION_HISTORY);
    // Step 2: focusing that changeId selects its own card, 0-based.
    const focus = { changeId: "toolu_second", mode: RevisionViewMode.content };
    assert.equal(computeFocusedCardIndex(cards, focus), 1);
});

test("test_computeFocusedCardIndex_falls_back_to_the_first_card_for_an_unknown_changeId", () => {
    // Step 1: a three-revision card list.
    const cards = buildRevisionCards(THREE_REVISION_HISTORY);
    // Step 2: a changeId no card carries (rewound / synthetic) must not select nothing —
    // the view still opens, on revision #1.
    const focus = { changeId: "toolu_missing", mode: RevisionViewMode.diff };
    assert.equal(computeFocusedCardIndex(cards, focus), 0);
});
```

Add three wire-shaped fixture literals beside the file's existing ones (they are what the browser
sees after `fetch` + `JSON.parse`; `kind` via `EventKind` members, never bare strings —
coding-requirements §4). Steps 7-8 reuse all three:

- `THREE_REVISION_HISTORY` — a `WireFileHistory`, `changeId`s `toolu_first` / `toolu_second` /
  `toolu_third`.
- `TWO_NODES_OWNING_REVISIONS` — `TimelineNode[]`, node 0's `fileChanges` carrying `toolu_first`
  and node 1's carrying `toolu_second`; each with a non-empty `snapshots` array. Nothing owns
  `toolu_third` — that absence is what the rewound/synthetic test asserts on.
- `ONE_SNAPSHOTLESS_NODE_OWNING_A_REVISION` — one node whose `fileChanges` carry `toolu_first` but
  whose `snapshots` is absent.

Run `npm test` → these three fail (no such export). That is the RED gate.

## Step 2 — GREEN: the mode enum, the focus type, and the focused-card helper

In `details.ts`, beside the existing `RevisionCard` type:

```ts
// Which right-column render the Revision View opens with. Local to the webapp's view layer —
// this is no wire vocabulary, so it lives here beside its view (same precedent as
// DiffDisplayMode in views/diff-vs-base.ts), not in src/structures/vocabulary.ts.
export enum RevisionViewMode {
    diff = "diff",        // the revision's diff vs the previous revision — the card's own default
    content = "content",  // the revision's full file content
    record = "record",    // the JSONL record that caused the revision
}

// Which revision the Revision View opens on, and how. Absent → revision #1 in diff mode (the
// Files-treeview entry behavior, unchanged).
export type RevisionFocus = { changeId: string; mode: RevisionViewMode };
```

```ts
// The 0-based card a focus selects. An absent focus, or a changeId no card carries (rewound or
// synthetic revisions), opens revision #1 — the view must always land somewhere.
export function computeFocusedCardIndex(cards: RevisionCard[], focus: RevisionFocus | undefined): number {
    if (focus === undefined) {
        return 0;
    }
    const focusedIndex = cards.findIndex((card) => card.changeId === focus.changeId);
    if (focusedIndex < 0) {
        return 0;
    }
    return focusedIndex;
}
```

`RevisionCard` must be exported for the test's type — export the existing type declaration.

Run `npm test` → Step 1's three tests pass.

## Step 3 — GREEN: thread `focus` through `renderDetailsFileMode`

`DetailsContext` (`details.ts:37`) gains ONE callback:

```ts
    // The timeline opens a revision's causing JSONL record in the right column (the rev-card
    // { } action). Only the timeline can resolve changeId → (jsonl, line), so it passes this in
    // — same shape as its existing openNodeInspector / selectTimelineRow callbacks.
    openRecordForChangeId: (changeId: string) => void;
```

`renderDetailsFileMode` signature (`details.ts:372`):

```ts
export function renderDetailsFileMode(target: string, context: DetailsContext, focus?: RevisionFocus): void {
```

Inside, after `const cards = buildRevisionCards(history);`:

```ts
    const focusedIndex = computeFocusedCardIndex(cards, focus);
    const focusedMode = focus?.mode ?? RevisionViewMode.diff;
```

Add the mode dispatcher beside `showCardDiff` (it needs `revisionContents`, `target`, `context`,
all already in scope):

```ts
    // One card's right-column render in a chosen mode. The card's own click always means diff —
    // only an incoming focus can ask for content or record.
    const showCardInMode = (card: RevisionCard, index: number, mode: RevisionViewMode) => {
        if (mode === RevisionViewMode.content) {
            showContentInDetails(target, card.revisionNumber, revisionContents[index]?.content);
            return;
        }
        if (mode === RevisionViewMode.record) {
            context.openRecordForChangeId(card.changeId);
            return;
        }
        void showCardDiff(card, index);
    };
```

Replace the auto-select block at the end of the `cards.forEach` (`details.ts:458-461`):

```ts
        // was: if (index === 0) { selectCard(cardElement); void showCardDiff(card, index); }
        if (index === focusedIndex) {
            selectCard(cardElement);
            showCardInMode(card, index, focusedMode);
        }
```

Everything else in `renderDetailsFileMode` is untouched. The treeview call site passes no
`focus`, so `focusedIndex` is 0 and `focusedMode` is `diff` — byte-identical to today.

## Step 4 — GREEN: wire `openRecordForChangeId` in the timeline

In `timeline.ts`, extend the `detailsContext` literal (`timeline.ts:1805`):

```ts
        openRecordForChangeId: (changeId: string) => {
            void (async () => {
                const located = await findTranscriptLineForChangeId(changeId);
                // Synthetic changeIds (user-edit / evidence splices) match no JSONL line. Say so
                // in the right column; openInspectorPane leaves the rev cards standing.
                if (located === undefined) {
                    openInspectorPane().append(
                        el("div", { class: "muted", text: "no transcript line for this revision (synthetic change id)" }),
                    );
                    return;
                }
                openTranscriptInspectorSynced(located);
            })();
        },
```

`findTranscriptLineForChangeId` (`timeline.ts:1415`) and `openTranscriptInspectorSynced`
(`timeline.ts:1455`) are both already in the same closure. `detailsContext` is declared at 1805,
AFTER them — no hoisting problem.

## Step 5 — GREEN: the rev card's `{ }` button

In the `rev-actions` list (`details.ts:437-451`), append a SIXTH button after
`Jump to timeline step` — order is specified by the user:

```ts
                buildActionButton("{ }", () => context.openRecordForChangeId(card.changeId)),
```

This is the button the chip's `{ }` delegates to, so it is load-bearing for the rule, not a
nicety: without it the Revision View has no JSON route at all.

## Step 6 — GREEN: rewire the three chip buttons, delete the two renderers

In `renderFileButtonRow` (`timeline.ts:1629`):

**Chip name click** (`timeline.ts:1631-1634`) — was `showFilePreview(node, change, …)`. The chip is
built OUTSIDE the `change.changeId !== undefined` guard at `timeline.ts:1635`, so it carries its
own check; a chip naming no revision opens the file's revisions unfocused rather than crashing:

```ts
        const buttons = [renderFileChip(change, (event: Event) => {
            event.stopPropagation();
            markChipActive(event.currentTarget as HTMLElement);
            // item 84: the chip IS the treeview entry, at this revision, showing content.
            // No changeId names no revision — open on #1, the treeview's own default.
            if (change.changeId === undefined) {
                renderDetailsFileMode(change.path, detailsContext);
                return;
            }
            renderDetailsFileMode(change.path, detailsContext, {
                changeId: change.changeId,
                mode: RevisionViewMode.content,
            });
        })];
```

The remaining two buttons live INSIDE the guard. Narrow once at the top of it — TypeScript does not
carry a property narrowing into a callback, and `!` is banned by the project's own style:

```ts
        if (change.changeId !== undefined) {
            // Narrowed once; the onclick closures below capture the string, not the optional.
            const changeId = change.changeId;
```

**`+/-`** (`timeline.ts:1652-1660`) — was `showRevisionDiff(change, …)`:

```ts
            buttons.push(el("span", {
                class: "timeline-chip timeline-chip-action",
                title: "Show Diff in Inspector",
                text: "+/-",
                onclick: (event: Event) => {
                    event.stopPropagation();
                    markChipActive(event.currentTarget as HTMLElement);
                    // Clicking a card IS how you view its diff — diff is the card's own default.
                    renderDetailsFileMode(change.path, detailsContext, { changeId, mode: RevisionViewMode.diff });
                },
            }));
```

**`{ }`** (`timeline.ts:1636-1651`) — keeps its `openTurnInspector` fallback:

```ts
                onclick: (event: Event) => {
                    event.stopPropagation();
                    // A changeId that resolves to no line keeps the item-55 fallback: the turn's
                    // OWN message line. The Revision View has no node to fall back to, so this
                    // stays here rather than moving into details.ts.
                    if (causingLocation === undefined) {
                        openTurnInspector(node, previewPane);
                        return;
                    }
                    markChipActive(event.currentTarget as HTMLElement);
                    renderDetailsFileMode(change.path, detailsContext, { changeId, mode: RevisionViewMode.record });
                },
```

Add the highlight-only helper (replacing `toggleDrawerButton`'s surviving half):

```ts
// The chip whose file the Details pane is showing stays highlighted. item 84 dropped the old
// toggleDrawerButton: click-again-to-close is gone, because the Files-treeview path — which the
// chip now IS — never had it.
const markChipActive = (chipElement: HTMLElement): void => {
    clearActiveChip();
    activeChip = chipElement;
    chipElement.classList.add("active");
};
```

**Now delete** (per the memory rule "comment out, don't delete" — comment these out first, delete
only once the user confirms the new paths work in the browser):

- `showFilePreview` — `timeline.ts:1526-1568`
- `showRevisionDiff` — `timeline.ts:1595-1624`
- `toggleDrawerButton` — `timeline.ts:1508-1521`

Then let the typechecker find the now-unused imports in `timeline.ts` (`openInspectorPane` is
still used by Step 4; `renderDiffText`, `splitDiffBlocks`, `computeRevisionDiffFallbackText`,
`fetchStepFiles`, `computeBaseName`, `downloadText` may drop callers — remove only the ones
`npm run typecheck` / `build:webapp` flags as unused, and ONLY if nothing else in the file uses
them).

`renderDetailsFileMode` and `RevisionViewMode` must be added to timeline.ts's import from
`./details.ts` (line 22 already imports `renderDetailsFileMode`).

## Step 7 — RED: tests for the contiguous card run

The step-range diff does not get dropped (user-decided) — it moves into the Revision View as a
4th right-column mode, hung on a **contiguous** multi-card selection.

Add to `tests/details-viewmodels.test.ts`:

```ts
test("test_checkCardRunIsContiguous_accepts_an_adjacent_run", () => {
    // Step 1: cards #2, #3 and #4 toggled on (0-based 1,2,3).
    // Step 2: an adjacent run is a legal range.
    assert.equal(checkCardRunIsContiguous([1, 2, 3]), true);
});

test("test_checkCardRunIsContiguous_accepts_a_single_card", () => {
    // Step 1: one card toggled on.
    // Step 2: a run of one is trivially contiguous (it is the N=1 case of the same mechanism).
    assert.equal(checkCardRunIsContiguous([2]), true);
});

test("test_checkCardRunIsContiguous_rejects_a_gap", () => {
    // Step 1: cards #1 and #4 toggled on, #2 and #3 left off.
    // Step 2: a gapped selection names no single range and must be refused.
    assert.equal(checkCardRunIsContiguous([0, 3]), false);
});

test("test_checkCardRunIsContiguous_rejects_an_empty_selection", () => {
    // Step 1: nothing toggled on.
    // Step 2: no cards is no range.
    assert.equal(checkCardRunIsContiguous([]), false);
});

test("test_computeOwningNodeIndexes_maps_a_card_run_onto_its_timeline_nodes", () => {
    // Step 1: two nodes, each owning one revision by changeId.
    const nodes = TWO_NODES_OWNING_REVISIONS;
    const cards = buildRevisionCards(THREE_REVISION_HISTORY);
    // Step 2: the run's cards resolve to the node indexes whose fileChanges carry their changeIds.
    assert.deepEqual(computeOwningNodeIndexes(cards, nodes, [0, 1]), [0, 1]);
});

test("test_computeOwningNodeIndexes_skips_cards_no_node_owns", () => {
    // Step 1: a card whose changeId appears in no node's fileChanges (rewound / synthetic).
    const nodes = TWO_NODES_OWNING_REVISIONS;
    const cards = buildRevisionCards(THREE_REVISION_HISTORY);
    // Step 2: it contributes no node index rather than a -1 that would poison the step range.
    assert.deepEqual(computeOwningNodeIndexes(cards, nodes, [2]), []);
});

test("test_computeOwningNodeIndexes_skips_an_owning_node_that_carries_no_snapshots", () => {
    // Step 1: a node that owns the card's changeId but carries no snapshots array (a commit
    // node, or a skeleton step).
    const nodes = ONE_SNAPSHOTLESS_NODE_OWNING_A_REVISION;
    const cards = buildRevisionCards(THREE_REVISION_HISTORY);
    // Step 2: it is dropped. computeRangeSummary dereferences node.snapshots! (timeline.ts:416),
    // so letting a snapshotless node through would throw rather than degrade.
    assert.deepEqual(computeOwningNodeIndexes(cards, nodes, [0]), []);
});
```

Run `npm test` → RED.

## Step 8 — GREEN: the contiguity + owner-mapping helpers

In `details.ts`:

```ts
// Whether a set of toggled cards names ONE range: at least one card, and no gap between the
// lowest and highest. A gapped selection ("#1 and #4") names no single before→after pair, so the
// range mode refuses it rather than silently diffing across the gap.
export function checkCardRunIsContiguous(selectedIndexes: number[]): boolean {
    if (selectedIndexes.length === 0) {
        return false;
    }
    const sorted = [...selectedIndexes].sort((left, right) => left - right);
    const span = sorted[sorted.length - 1]! - sorted[0]!;
    return span === sorted.length - 1;
}

// The timeline node indexes owning a run of cards — each card's changeId names the node whose
// fileChanges carry it, the same resolution the "Jump to timeline step" action already uses
// (details.ts:443). Two kinds of card contribute nothing: one no node owns (rewound / synthetic
// revisions), and one whose owner carries no snapshots — computeRangeSummary dereferences
// node.snapshots! (timeline.ts:416), so a snapshotless owner would throw there. The old range
// path could not hit either case: its indexes came from the pick checkboxes, which only exist on
// snapshot-bearing turn rows.
export function computeOwningNodeIndexes(cards: RevisionCard[], nodes: TimelineNode[], selectedIndexes: number[]): number[] {
    const ownerIndexes: number[] = [];
    for (const cardIndex of selectedIndexes) {
        const card = cards[cardIndex];
        if (card === undefined) {
            continue;
        }
        const ownerIndex = nodes.findIndex(
            (candidate) => (candidate.fileChanges ?? []).some((change) => change.changeId === card.changeId),
        );
        if (ownerIndex < 0) {
            continue;
        }
        if ((nodes[ownerIndex]!.snapshots ?? []).length === 0) {
            continue;
        }
        ownerIndexes.push(ownerIndex);
    }
    return ownerIndexes;
}
```

Run `npm test` → Step 7's six tests pass.

## Step 9 — GREEN: the range mode UI + render

`DetailsContext` gains the second and last callback (`/api/range-patch` is fetched through the
timeline's closure-local consent params, `timeline.ts:1352` — details.ts must not rebuild them):

```ts
    // The multi-card range diff fetches the server's step-range patch. fetchRangePatch is
    // closure-local to the timeline (it owns the consent params + its cache), so it passes in.
    fetchRangePatch: (fromStepIndex: number, toStepIndex: number) => Promise<string>;
```

Wire it in `timeline.ts:1805`'s literal: `fetchRangePatch,` (the closure function at 1352 matches
the signature exactly).

In `renderDetailsFileMode`, add a toggle to each card's `rev-head`, and the range render:

```ts
    // Which cards are toggled for a range diff (0-based). Empty → single-card mode, the default.
    const rangeSelection = new Set<number>();
    // The picked run's diff for THIS file: card run → owning nodes → step range → the server's
    // range patch → this file's block. Same path showFilePreview's range branch took (item 84
    // moved it here); computeRangeSummary still speaks node indexes.
    const showRangeDiff = async () => {
        const selectedIndexes = [...rangeSelection].sort((left, right) => left - right);
        if (!checkCardRunIsContiguous(selectedIndexes)) {
            showTextInDetails(target, "(pick a contiguous run of revisions)");
            return;
        }
        const ownerIndexes = computeOwningNodeIndexes(cards, context.nodes, selectedIndexes);
        if (ownerIndexes.length === 0) {
            showTextInDetails(target, "(no timeline steps own the picked revisions)");
            return;
        }
        const summary = computeRangeSummary(context.nodes, ownerIndexes);
        const patchText = await context.fetchRangePatch(summary.fromStepIndex, summary.toStepIndex);
        const block = splitPatchByFile(patchText).find((entry) =>
            target === entry.path || target.endsWith(`/${entry.path}`));
        const label = `${target} — revisions #${selectedIndexes[0]! + 1}→#${selectedIndexes[selectedIndexes.length - 1]! + 1}`;
        if (block === undefined) {
            showTextInDetails(label, "(file unchanged across the picked revisions)");
            return;
        }
        showDiffInDetails(label, block.block, () => void showRangeDiff());
    };
```

The toggle bookkeeping. Declare beside `rangeSelection`, BEFORE the `cards.forEach`:

```ts
    // Each card's range toggle, pushed in card order by the forEach below — so rangeToggles[i]
    // is always card i's own toggle.
    const rangeToggles: HTMLElement[] = [];
    // Every glyph re-reads the set: one toggle click changes one card's membership, but the
    // whole run's glyphs must agree with it.
    const refreshRangeToggleGlyphs = () => {
        rangeToggles.forEach((toggle, toggleIndex) => {
            toggle.textContent = rangeSelection.has(toggleIndex) ? "☑" : "☐";
        });
    };
    // Never re-enter renderDetailsFileMode to repaint: it would rebuild the cards and drop both
    // the selection and the focus. Flip the glyphs in place, then re-decide the right column.
    const toggleRangeCard = (index: number) => {
        if (rangeSelection.has(index)) {
            rangeSelection.delete(index);
        } else {
            rangeSelection.add(index);
        }
        refreshRangeToggleGlyphs();
        // Emptying the run returns the right column to the focused card's own render.
        if (rangeSelection.size === 0) {
            showCardInMode(cards[focusedIndex]!, focusedIndex, focusedMode);
            return;
        }
        void showRangeDiff();
    };
```

The toggle itself, as the FIRST child of each card's `rev-head` row (`details.ts:432`), before the
`#n` span:

```ts
            el("div", { class: "rev-head" }, [
                rangeToggle,
                el("span", { text: `#${card.revisionNumber}` }),
                ...
```

built just above the `el("div", { class: "rev-card" }, …)` call inside the forEach, so `index` is
in scope:

```ts
        // buildActionButton stops propagation for us — a toggle click must not also fire the
        // card's own diff swap.
        const rangeToggle = buildActionButton("☐", () => toggleRangeCard(index));
        rangeToggles.push(rangeToggle);
```

`details.ts` must import `computeRangeSummary` and `splitPatchByFile` from `./timeline.ts` (it
already imports `computeRevisionDiffFallbackText`, `deriveCommitChangedFiles`, and the types from
there — same module, no new dependency edge).

## NOT BUILT — chip click while a step range is picked

`showFilePreview`'s range branch (`timeline.ts:1532-1544`) fired when `pickedIndexes.length > 0`:
picking steps in the timeline and then clicking a chip showed that file's diff across the picked
steps. **This entry point is not rebuilt.**

The user's decision was that the step-range diff moves into the Revision View behind contiguous
multi-card selection (Steps 7-9) — that preserves the CAPABILITY. Carrying the picked-step range
into the chip's click is a separate convenience nobody asked for; a `rangeChangeIds` field on
`RevisionFocus` seeding the selection would do it in ~10 lines IF the flow turns out to be used.
Do not build it on spec. Report it as dropped in the final summary.

## Verification (the user runs the tests; do not run them yourself)

1. `npm run typecheck` and `npm run build:webapp` must be clean — these you MAY run.
2. Client behavior is the user's standing visual-verify (the console/overlay convention noted on
   items 77 and 82). Do not claim the browser behavior works; state what was implemented and let
   the user drive it.
3. Success criteria, checkable in the browser on `s84-multiagent-scripts-git-baseline`:
   - Treeview click → rev cards + revision #1 diff. **Unchanged from today.**
   - Chip name click → rev cards, chip's revision selected, its CONTENT on the right.
   - Chip `+/-` → rev cards, chip's revision selected, its DIFF on the right.
   - Chip `{ }` → rev cards STILL SHOWN, causing JSONL record on the right.
   - Rev card `{ }` (6th button) → same record render.
   - `⤷` → unchanged (navigates to File History route).
   - `#details-left` is never stale after any of the four.

## Staging

Stage everything; do not commit. Report the two out-of-scope duplicates found
(`appendFileList`'s no-rev-card diff, `renderFileHistoryView`) and the dropped
click-again-to-close so the user can decide on follow-up items.
