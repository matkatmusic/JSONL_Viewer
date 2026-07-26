## 2026-07-26:10:21:32 — Tasks 259 + 252: Layer 1 View tie-group indicator and File Nav pane
Chat title: tackle-tasks 259 252 (Layer 1 View)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/43c514bd-96ca-47ab-a199-1694877495c9.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-259-tie-group-indicator.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-252-layer1-file-nav.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks245-247-250-layer1-visual-fixes (memory) — the tasks 245/247/248/249/250 round that preceded these
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/layer1-tie-groups.ts (new)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/layer1-filenav.ts (new)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/layer1-tie-groups.test.ts (new)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/layer1-filenav.test.ts (new)

### Design decisions

- **Task 259 groups by `instant`, not by geometry.** The wire already ships each node's own ISO
  `instant` alongside its `axisPx`, so a tie is an equality test on two strings. Nothing was added to
  `src/layer1_ruler_axis.ts` or the wire format; the page needed no new data at all.
- **One linear pass, no map.** `src/viewer_api_layer1.ts`'s `listPairNodeLadder` emits commits
  oldest-first then the on-disk node, and the axis charges tied nodes consecutive rows in that same
  order, so tied nodes are always CONTIGUOUS in the ladder. Grouping is therefore a single pass with
  a "same instant as the previous node?" test rather than a keyed collection.
- **The rectangle's geometry is derived from `.node`, not chosen.** A node is centred on its
  `--axis-px` and its painted box (15 px + a 2.5 px ring) reaches 10 px past that in every
  direction, so the marker is `top: --axis-px - 11px`, `height: --span-px + 22px`,
  `left: -11px`. If `.node`'s size or ring changes, this must be redone — the CSS comment says so.
- **The marker has no `z-index`.** It is appended to the lane BEFORE the nodes, so DOM order alone
  keeps it behind both the dots (`z-index: 6`) and the labels (no z-index). Giving it a z-index of
  its own would have put it over the labels.
- **Both tasks got their own module.** `webapp/layer1-page.ts` was at 238/250 lines after task 259's
  wiring; the File Nav's entry mapping would have pushed it over. This follows the split pattern
  `layer1-sources.ts` / `layer1-find-file.ts` / `layer1-zoom.ts` already set.
- **Task 252 reuses the shared tree, as the task mandated.** `buildFileTree`
  (`views/timeline-file-tree.ts`) and `renderFileTreeNode` (`views/sidebar.ts`) are called
  unchanged. `buildFilesSidebarViewModel` is NOT reused — it consumes a `WireTimelineDocument`,
  which Layer 1 does not have — so only the `FileSidebarEntry[]` it would have produced is
  constructed here, from `pairs` + `gitOrphans` + `diskOrphans`.
- **The File Nav is a flex sibling of the scroll container, not a column inside `.canvas`.**
  `.stagewrap` is already `display: flex`, so an `<aside>` as its first child lands left of
  `main.timelines` and therefore left of the sticky ruler gutter, with no involvement in the
  `zoom`ed canvas and no interaction with the ruler's `position: sticky`.
- **Both new module types are declared structurally.** `layer1-page.ts` imports both new modules, so
  importing its `WireLayer1View` back would be a cycle. This is the same reason `views/sidebar.ts`
  mirrors `timeline-file-tree.ts`'s types; the existing mirror was NOT touched, since neither task
  adds a field.

### Deviations

- **The `--filenav-w` custom property named in the plan was dropped.** A property set on `.filenav`
  is not in scope on `.minimap`, which is `position: absolute` against `.stagewrap` and had to be
  shifted right by the pane's width. Two literal `232px` values with a comment pairing them is
  smaller and more honest than hoisting a variable onto `.viz-root` for two uses.
- **The rename-badge and coverage-strip CSS were not brought across.** Layer 1 sets neither
  `originalPath` nor `coverage`, so those rules would be dead on this page.
- **The copied tree rules were retargeted at Layer 1's tokens** rather than copied verbatim.
  `styles.css` uses `--mono/--text/--sel/--sel-hover/--guide/--orange`, none of which exist in
  `layer1-styles.css`; adding six tokens to carry ten rules verbatim was the larger change. Hover is
  `color-mix(in srgb, var(--ink) 8%, transparent)` and selection is `var(--sel-edge)`.
- **Test fixture correction, not a code change.** `test_the_nav_renders_folders_as_native_details`
  originally used three paths all directly under `src/`; `buildFileTree` strips the shared prefix,
  so no folder survived. The fixture now nests one path a level deeper. Worth remembering: a
  single-directory fixture cannot exercise the tree's folder rendering.

### Tradeoffs

- **File Nav clicks reuse `jumpToNamedBubble` (task 261) instead of a second scroll path.** A
  paired file's full path is a substring of its bubble's `.fname` title, so a pair lands its own
  bubble for free. An ORPHAN has no bubble of its own — it lives in a bucket whose `.fname` is the
  bucket title — so clicking one reports "no bubble matches" into the crumb. That is accurate rather
  than wrong, and scrolling to the owning bucket belongs to this pane's task-253/254/255 behaviour.
  Marked with a `ponytail:` comment in `layer1-filenav.ts`.
- **Orphan rows carry a revision count of 0.** The wire ships no commit count for an orphan. 0 is
  visibly "no repo history counted here" rather than an invented number; showing nothing at all
  would have meant a second leaf-rendering path in the shared component.
- **The tie marker is per-bubble only.** Two DIFFERENT bubbles sharing an instant are already
  connected by the shared ruler tick and task 264's leader line, so a cross-bubble affordance was
  not built.

## 2026-07-26:11:05:00 — Round two: regressions from the above, fixed in the same session

User feedback arrived before this work was committed. Per their standing rule, the bugs caused by
what was just delivered were fixed FIRST; the remaining items became tasks 277–280.

- **Task 277 — a jump never brought the bubble's TOP into view.** `jumpToNamedBubble` scrolled with
  `block: "center"`. A `.filebox` is as tall as its own ladder span, so a long-history file is
  thousands of px tall and centring it vertically puts its name and first node far above the
  viewport — which reads as "only the horizontal scroll worked". Now `block: "start"` with
  `inline: "center"` kept, in a new shared `landOnBubble` helper, plus `scroll-margin-top: 14px` on
  `.filebox` so the landed bubble is not flush against the legend.
  **Sibling caller fixed too:** `webapp/layer1-ruler-click.ts:76` carried the identical
  `block: "center"`, so a ruler-row click had the same defect. Fixed there as well and its test
  updated — patching only the reported path would have left that one broken.
- **Task 278 — a File Nav click cycled instead of targeting one file.** Task 252 wired
  `onFileClick: jumpToNamedBubble`, which substring-matches, keeps a cycle counter, and writes
  `find "<term>": n of N` into the crumb. Clicking the root `.gitignore` therefore walked every
  nested `.gitignore` — and no substring rule could ever have picked the root one, since its path is
  a substring of all the others. New exported `jumpToBubbleAtPath` matches the `.fname` title for
  EQUALITY, has no cycle state, and writes no find-counter text; an unmatched path (an orphan, which
  lives in a bucket rather than a bubble) reports that into the crumb.
- **Task 269 — the minimap still covered the ruler.** Round one moved `.minimap`'s `left` to
  `calc(232px + 12px)`, which cleared the new File Nav but landed it squarely on the sticky gutter.
  Now `calc(232px + 82px + 12px)` — nav width, gutter width (`--rail-x` 80px + the rail's 2px
  border), inset. This closes task 269; it is no longer just a side effect.

### Open questions

1. **File Nav width.** Fixed at 232 px. If that crowds the timeline on your display, say so — it is
   one number in `.filenav` plus the paired `calc(232px + 12px)` on `.minimap`.
2. **Orphan clicks.** Confirm the "no bubble matches" outcome is acceptable until tasks 253/254/255
   land, or whether an orphan click should scroll to its bucket now.
3. **Tie-marker colour.** `--c-anchor` (pink) border over a `--seg-a` (faint green) wash was chosen
   because both tokens already exist for light and dark. If it reads as noise next to the commit
   blue, the border colour is the only thing to change.
