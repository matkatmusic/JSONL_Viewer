# Task 90 — Collapse single-child folder chains below the Files-tree root

## Behavior (plain English)

In multi-root projects the Files tree's root is the shallow shared prefix (e.g.
`/Users/matkatmusicllc`), so real single-child folder chains survive below it
(`Programming` → `jot-backup` → `src`), costing one click per level. Collapse
every folder that holds exactly ONE child which is itself a folder into a single
combined node whose name joins the segments with `/` (e.g.
`Programming/jot-backup/src`), repeating until the chain ends at a branching
folder or at files. The root row itself (the stripped shared prefix) is NOT
touched — root-level collapsing was previously declined; user signed off on
below-root collapsing only.

Rules:
- Only folder→folder merges. A folder whose single child is a FILE does not
  collapse (the file keeps its own row under its folder).
- Collapse runs on the whole returned tree, at every depth, including the
  top-level nodes (they are already "below the root" — the root is the stripped
  prefix header, not a tree node).
- Collapse runs AFTER `sortTreeNodes` and must not re-sort: sibling order was
  computed from the original single-segment names and stays as-is.

## Where

- Builder: `buildFileTree` in `webapp/views/timeline.ts` (line ~1126). It is the
  single choke point — both the Files sidebar (`timeline.ts:2206`) and the
  details pane (`webapp/views/details.ts:466`) call it, so one post-pass fixes
  both. Renderers (`renderFileTreeNode` in `webapp/views/sidebar.ts:89`) print
  `node.name` verbatim, so a combined `a/b/c` name renders with zero renderer
  changes.
- Tests: `tests/timeline-viewmodels.test.ts` — the existing `buildFileTree`
  block (line ~1731) with its `makeFileEntry(target)` helper. Append the new
  tests directly after `test_buildFileTree_strips_the_deep_absolute_root_real_targets_carry`.

## Step 1 — RED: add three tests to `tests/timeline-viewmodels.test.ts`

Each test follows the file's existing style: `test("test_<behavior>", ...)`,
plain-English Scenario/Steps comments, `makeFileEntry`.

1. `test_buildFileTree_collapses_a_single_child_folder_chain_into_one_combined_node`
   - Build from `makeFileEntry("/Users/mm/Programming/jot-backup/src/main.ts")`,
     `makeFileEntry("/Users/mm/Programming/jot-backup/src/util.ts")`, and
     `makeFileEntry("/Users/mm/project/orders.py")`.
   - Shared prefix is `/Users/mm`, so the raw tree would be
     `Programming` → `jot-backup` → `src` beside `project`.
   - Assert top level names are `["Programming/jot-backup/src", "project"]`.
   - Assert the combined node's children names are `["main.ts", "util.ts"]`.
   - Assert `project`'s children names are `["orders.py"]` (a folder whose
     single child is a file does NOT merge that file into its name).

2. `test_buildFileTree_stops_collapsing_at_a_branching_folder`
   - Build from `makeFileEntry("/Users/mm/a/b/left/x.py")`,
     `makeFileEntry("/Users/mm/a/b/right/y.py")`, and
     `makeFileEntry("/Users/mm/other/z.py")`.
   - Assert top level names are `["a/b", "other"]` — the chain merges only
     down to `b`, which branches into `left` and `right`.
   - Assert `a/b`'s children names are `["left", "right"]`.

3. `test_buildFileTree_keeps_leaf_entries_intact_through_chain_collapse`
   - Build from one entry at `/Users/mm/deep/chain/file.py` plus one at
     `/Users/mm/flat.py` (forces prefix `/Users/mm`, leaving the
     `deep` → `chain` chain).
   - Assert the collapsed folder is named `deep/chain` and its lone leaf's
     `entry` deep-equals the entry passed in (clicks route by `entry.target`,
     which must stay the full untouched path).

Run `npm test` and confirm all three FAIL (raw uncollapsed names) before Step 2.

## Step 2 — GREEN: implement in `webapp/views/timeline.ts`

Add one function below `sortTreeNodes`/`compareTreeNodes`, and one call in
`buildFileTree`.

In `buildFileTree`, after `sortTreeNodes(root);` and before `return root.children;`:

```ts
    collapseSingleChildFolderChains(root.children);
```

New function (conforms to `plans/coding-requirements.md`: verb name,
enum-member comparison via `FOLDER_NODE_KIND`, imperative style, 4-space
indent):

```ts
// Merge each folder holding exactly one folder child into a combined `a/b/c` node (task 90):
// in multi-root projects the shared prefix is shallow, so real single-child chains survive
// below it and cost one click per level. Only folder->folder merges — a lone FILE child keeps
// its own row. Runs after sorting on purpose: sibling order stays keyed to the original first
// segment. The root header itself never collapses (root-level collapsing was declined).
function collapseSingleChildFolderChains(nodes: FileTreeNode[]): void {
    for (const node of nodes) {
        while (nodeHoldsExactlyOneFolderChild(node)) {
            const onlyChild = node.children[0]!;
            node.name = `${node.name}/${onlyChild.name}`;
            node.children = onlyChild.children;
        }
        collapseSingleChildFolderChains(node.children);
    }
}

// True when the node is a folder whose single child is itself a folder — the collapsible link.
function nodeHoldsExactlyOneFolderChild(node: FileTreeNode): boolean {
    if (node.kind !== FOLDER_NODE_KIND || node.children.length !== 1) {
        return false;
    }
    return node.children[0]!.kind === FOLDER_NODE_KIND;
}
```

No changes to `sidebar.ts`, `details.ts`, or CSS.

## Step 3 — Verify

- `npm test` — the 3 new tests pass; all pre-existing tests stay green
  (existing buildFileTree tests have no folder→folder single-child chains, so
  their expectations are unaffected: `docs`/`src` each hold files;
  `test_..._strips_the_deep_absolute_root` yields bare file leaves).
- `npx tsc --noEmit` (or the project's typecheck script) passes.

## Step 4 — Close task 90

Move task 90's object from `tasks.json` to `completedTasks.json`, appending a
`completionDate` (2026-07-15) and a short `closureNote` ("below-root
single-child chain collapsing signed off and implemented via
collapseSingleChildFolderChains post-pass in buildFileTree"). Leave
`commitHashes` out (work is staged, not committed). Stage all changes; do NOT
commit.
