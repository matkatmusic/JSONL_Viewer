## 2026-07-14:11:20:00 — Item 84: unify the bottom pane for ALL file-related content
Chat title: review TASKS.md #84 / tackle-tasks 84
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/6b82f2c5-dd59-403f-bf4e-87afc59bfa14.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item84-unify-bottom-pane.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (item 84, line 1055)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/views/details.ts (the Revision View — everything converges here)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/views/timeline.ts (the chip row — now four deep-links)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/details-revision-view.test.ts (new; 11 tests)

### Design decisions

**The rule, as implemented.** One view — `renderDetailsFileMode` (`details.ts`). Every route picks
(which file, which revision selection, which right-column mode). Chip button X ≡ `treeview entry →
that revision's card → the card's X`:

| Route | focus | Right column |
|---|---|---|
| Files treeview | none | revision #1, diff (**unchanged from before item 84**) |
| Chip name | `{changeId, content}` | that revision's file content |
| `+/-` | `{changeId, diff}` | that revision's diff (the card's own default render) |
| `{ }` | `{changeId, record}` | that revision's causing JSONL record |
| `⤷` | — | untouched; navigates to the File History route |

**`focus` as an explicit parameter, not a synthetic `.click()`.** `renderDetailsCommitMode` already
drives selection with `items[0]!.click()` (`details.ts:367`), so there was precedent for expressing
"open on card N in mode M" by clicking DOM nodes. Rejected: clicking buttons by index/text to
express intent is exactly the kind of coupling that let these two paths drift apart in the first
place. `renderDetailsFileMode(target, context, focus?)` states it directly.

**`{ }` needs no new machinery.** `openInspectorPane` (`inspector.ts:353`) only ever touches
`#details-right-label`, `#diff-mode-toggle` and `#details-right-body` — it never clears
`#details-left`. So rendering a transcript record leaves the rev cards standing for free, which is
precisely the "revision cards still shown" the item asks for. The plan's "gotcha" about that
function force-hiding the diff toggle and pinning the label to "JSON" turned out to be *correct*
behavior for the record mode, and irrelevant to the other two (they route through details.ts's own
`showContentInDetails` / `showDiffInDetails`, which set their own chrome).

**Two new `DetailsContext` callbacks, matching the existing pattern.** `openRecordForChangeId` and
`fetchRangePatch` join `openNodeInspector` / `selectTimelineRow`. Both wrap timeline-closure-local
state (`findTranscriptLineForChangeId`; `fetchRangePatch`'s consent params + cache) that details.ts
must not rebuild.

**Step-range diff → contiguous multi-card selection** (user-decided, over dropping it). Rev cards
gained a `☐`/`☑` toggle as the first child of `.rev-head`. A contiguous run renders the range diff;
a gapped run is refused. The path is the one `showFilePreview` used: card run → owning nodes →
`computeRangeSummary` → `/api/range-patch` → `splitPatchByFile` → this file's block.

### Deviations

**1. The `.file-preview-drawer` / `.timeline-preview` CSS was NOT deleted** (the plan said to
delete it). Those rules now have zero live users — the only code that added the classes is the
commented-out `showFilePreview` / `showRevisionDiff`. But per the project's comment-out-don't-delete
rule, that JS is commented rather than deleted so it can be restored; deleting its CSS would break
that rollback path. The CSS should go when the commented JS is finally deleted, not before.
Rules: `webapp/styles.css:824` (`.details-pane.file-preview-drawer .timeline-preview`), `:859`
(`.timeline-preview`), `:864` (`.timeline-preview-head`), and `.timeline-preview` in the font-family
list at `:84`.

**2. Chip-click-while-a-step-range-is-picked was NOT rebuilt.** `showFilePreview`'s range branch
(old `timeline.ts:1532-1544`) fired when `pickedIndexes.length > 0`. The user's decision preserved
the range-diff *capability* (via card toggles); carrying the picked-step range into the chip's click
is a separate convenience that was never requested. A `rangeChangeIds?: string[]` field on
`RevisionFocus` seeding `rangeSelection` would restore it in ~10 lines if the flow is missed.

**3. Tests were run, against the tackle-tasks instruction not to.** The project's TDD rule
(`~/.claude/guides/tdd.md`, mandatory per CLAUDE.md) requires observing red→green, and the repo's
own `PostToolBatch` hook runs the suite on every edit regardless. I ran only the two targeted
view-model files (`details-revision-view.test.ts`, `details-viewmodels.test.ts` — 17/17 pass) and
left the full suite to the user.

**4. Item 84's own text contained three factual errors, all corrected in TASKS.md before planning.**
Recorded here because they were reasoned from, and could mislead a future reader of the git history:
- It claimed `⤷`'s snapshot-bearing card "needn't be the chip's own". FALSE:
  `computeSnapshotJumpRoute` (`timeline.ts:284`) resolves `findRevisionForChangeId(files,
  change.changeId, undefined)` — the chip's own changeId, the same revision `+/-` resolves.
- It claimed deleting `showRevisionDiff` "retires its near-duplicate twin
  `showRevisionDiffInDetails`". FALSE: that twin has a live caller (`appendFileList`,
  `details.ts:321`, used by message + commit modes). It SURVIVES as the single implementation.
- It claimed `{ }` was "UNCHANGED". Wrong word: its meaning is unchanged, its rendering is not.

**5. A guard was added that the plan justified wrongly.** `computeOwningNodeIndexes` skips owners
with an EMPTY `snapshots` array. The plan justified it as "commit nodes could own cards" — false:
`CommitNode` and `ToolCallNode` declare BOTH `fileChanges?: undefined` AND `snapshots?: undefined`,
so a snapshot-LESS owner is unreachable by construction. The real hazard is snapshot-EMPTY: an owner
with `snapshots: []` would make `computeRangeSummary` (`timeline.ts:416-421`) `Math.min()` an empty
array into `Infinity` and issue a garbage `/api/range-patch` request. The guard stays; the reason
changed. The old range path could not hit this — its indexes came from pick checkboxes, which only
exist on snapshot-bearing rows.

### Tradeoffs

**Click-again-to-close was dropped.** `toggleDrawerButton` let a second click on the same chip hide
the pane. The Files-treeview path — which the chip now IS — never had it, so keeping it would have
broken the very equivalence this item asserts. Its deletion also retired `activeChip`'s toggle
bookkeeping. The **chip `active` highlight was kept** (as `markChipActive`, ~6 lines): it is the
only affordance showing which chip drove the pane, and it costs almost nothing.

**Range toggles flip glyphs in place rather than re-rendering the card list.** Re-entering
`renderDetailsFileMode` on every toggle would have been fewer lines, but it rebuilds the cards and
would drop both the selection and the focus. `rangeToggles[]` + `refreshRangeToggleGlyphs()` keeps
the set and the elements in one closure.

**Net deletion, as the item required.** Retired: `showFilePreview` (43 lines), `showRevisionDiff`
(30), `toggleDrawerButton` (14), `fetchStepFiles` (5, its only caller was `showFilePreview`), plus
three now-dead imports (`renderDiffText`, `splitDiffBlocks`, `renderCodeInto`). Added: one enum, one
type, three pure helpers (all tested), two context callbacks, one rev-card button, and the range
toggle machinery.

## 2026-07-14:12:10:00 — Two user-reported bugs, fixed

**Bug 1: `⤷` caused a full page load.** It set `location.hash` to the File History route, so the
app re-navigated (progress bar, full document re-parse) just to show a revision the bottom pane
can already show. Now it calls `renderDetailsFileMode(change.path, ctx, {changeId, content})` — the
same destination as the chip name, in the pane, no page load.

The BUTTON is unchanged and still guarded by `computeSnapshotJumpRoute(...) !== undefined`, because
that guard is the whole point of it: not every revision has a File History Snapshot, and the
button's absence is how the row says so. The route string is now computed purely as a presence
test, never navigated to. (This supersedes the earlier "⤷ UNTOUCHED" decision: keeping the button
was the user's intent; keeping its *navigation* was my over-reading of "keep it".)

**Bug 2: "Files touched" showed truncated full paths.** `appendFileList` rendered a flat `.dfile`
list of absolute paths, ellipsis-truncated to uselessness — the exact problem item 77 fixed in the
Files sidebar. It now renders item 77's own tree component over the node's changed paths ONLY
(never the whole project, per the user's clarification).

Three things this required:
- **`sidebar.ts:renderFileTreeNode` is now exported**, and takes a `selectionRoot`. There are two
  trees on screen now (`#drawer` and `#details-left`), and a leaf click must clear the selection in
  its OWN tree and no further.
- **`clearSidebarFileSelection()` → `clearFileSelectionIn(root)`.** The old signature hardcoded
  `#drawer`. Renamed rather than wrapped (the project bans forwarding layers); its one outside
  caller — `timeline.ts`, "the details pane leaves file mode" — now passes `#drawer` explicitly.
- **`buildTouchedFileEntries`** resolves each changed path against `buildFilesSidebarViewModel`
  (the same source the Files sidebar reads, so both trees agree about a file's revision count /
  deleted / renamed-from state). A changed path with no surviving history still gets a leaf.

**Dedup note (behavior change):** the tree is one leaf per PATH, whereas the flat list was one row
per CHANGE. A turn that edits the same file twice used to show two rows; it now shows one leaf
carrying the LAST change (that file's end state for the node). `renderDetailsCommitMode`'s
`items[0]!.click()` still works — `appendFileList` returns the leaves in DOM order, so it now opens
the first file in TREE order rather than in `changes` order (i.e. the first file the user sees).

**`.dfile` CSS (`styles.css:527-537`) is now dead but was NOT deleted** — same reasoning as
`.file-preview-drawer` above: the old `appendFileList` body is commented out, not deleted, so its
CSS stays until that JS is deleted for good.

### Open questions

1. **One more near-duplicate of the Revision View is still out of scope.**
   `renderFileHistoryView` (`file-history.ts:161`) — the `#/project/<p>/file/<path>` route renders
   per-revision rows with the *same five actions* as the rev cards (Show content / Export this
   version / Copy patch / Export .patch / Jump to timeline step). It was `⤷`'s destination; after
   bug 1's fix, nothing on the chip row reaches it. It is still reachable from the inspector's
   revision links and the snapshot pane's "View in File History" button. Own item?
   (`appendFileList` — previously listed here — is now handled: see bug 2 above. Its clicks still
   show a diff with no rev cards, which is correct for that mode: its left column is the node's
   file tree, not a revision list.)
2. **The `☐`/`☑` range toggle is rendered by `buildActionButton`, i.e. a `<button>` inside
   `.rev-head`**, which otherwise holds `<span>`s. It may need a CSS nudge to sit right. Needs your
   visual verify.
3. **`details.ts` is now 623 lines** and `timeline.ts` 2071; the `jot:post_tool_use` hook warns at
   250 on every edit (both files were already far over before item 84 — details.ts was 464). It also
   flags pre-existing deep nesting in the `cards.forEach`. Splitting either file is not in this
   item's scope. Confirm whether a split item is wanted.
4. **`⤷`'s render condition may not match its stated meaning.** You kept it because its presence
   indicates a revision that HAS a File History Snapshot. But `computeSnapshotJumpRoute` returns
   `undefined` only when the changeId is absent, resolves to no history, or resolves to a blob name
   with no anchored revision — i.e. the button renders for essentially any changeId that matches a
   revision, whether or not a snapshot backs it. If the indicator is meant to be precise, that is a
   separate bug.
