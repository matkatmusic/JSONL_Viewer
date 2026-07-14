# Item 77 — Files pane: nested file tree instead of the flat full-path list

## Goal

The timeline sidebar's "Files" pane renders one `.file-item` per **absolute** path
(`sidebar.ts:53-62`). Real targets look like
`/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.9xxymp7j/alpha.py`, and
`styles.css:171-180` clips them with `text-overflow: ellipsis`, so the user cannot tell which file
a row is. Replace the flat list with a nested tree whose leaves show **basenames**.

## Verified facts (do not re-derive; these drove the design)

1. **Targets are absolute and deep.** Confirmed from scenario transcripts: `file_path` values are
   `/private/var/folders/…/T/run-scenario.9xxymp7j/alpha.py`. A naive path-split tree therefore
   renders ~8 single-child folders before the first file — worse than today. **Stripping the
   common root prefix is mandatory**, not cosmetic.
2. **A rename is ONE history keyed by the final path.** `src/reconstruction_lineage.ts:1-4`:
   *"A renamed file is ONE history keyed by its final (surviving) path"*. So the user's
   "final path only" decision is already the engine's behavior — **no engine change**.
   `resolveFinalPath` (`reconstruction_lineage.ts:22-31`) walks the chain.
3. **Rename data is on the wire.** `FileRevision.rename?: RenameInfo` (`reconstruction_engine.ts:48-55`),
   `RenameInfo = { from: Path; to: Path }` (`:38`) — **full paths**, not basenames. Mirrored on the
   wire as `WireRevision.rename?: { from: string; to: string }` (`webapp/views/timeline.ts:42,46`).
   `renameRevision` (`reconstruction_replay.ts:67-79`) sets it and carries prior lines forward.
4. **Delete keeps the file in `filesTouched`.** `deleteRevision` (`reconstruction_replay.ts:56-63`)
   pushes `{ kind: delete, lines: [] }`; `appendRevisionsForEvent:159-162` appends it to the same
   history. The entry is **not** removed. So "deleted" = **last** revision is a delete.
5. **Delete→recreate exists** (m4 ground truth: `write → delete → write`). Hence rule 4 must test the
   **last** revision, never "any delete revision".
6. **`rewoundFilesTouched` is out of scope** — `buildFilesSidebarViewModel` reads only
   `filesTouched`; the Files pane never showed rewound histories.
7. **`sidebar.ts` mirrors its view-model types locally** (`:9-21`) because `timeline.ts:23` imports
   `sidebar.ts` — importing back would be a cycle. The new tree type follows that same mirror
   convention.
8. **`clearSidebarFileSelection` (`sidebar.ts:29-33`) queries `#drawer .file-item.selected`** and is
   also called from `timeline.ts:1658`. Keeping the leaf class `file-item` means **this function and
   its call sites need no change at all**.

## Binding user decisions

| Topic | Decision |
| --- | --- |
| Renamed/moved file | Show at **final path only**, with a rename badge naming the old path. |
| Deleted file | **Show**, dimmed + struck-through. |
| Folder default state | **All expanded**. |

## Status: the algorithm below is pre-verified

Every `findCommonDirectoryPrefix` / `buildFileTree` snippet in this plan was executed against all 12
assertions in Steps 3 and 5 before the plan was written — **all 12 pass**. Two production checks also
ran:

- Real absolute targets (`/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.9xxymp7j/{alpha,beta}.py`)
  collapse to a top level of `["alpha.py", "beta.py"]` — the deep root is gone. This is item 77's fix.
- The existing relative fixture (`alpha.py`, `beta.py`) yields `["alpha.py", "beta.py"]` — unchanged,
  no regression.

Transcribe the snippets as written. If you "improve" the prefix logic, re-run Step 3's cases first —
the segment-wise comparison is load-bearing and a character-wise rewrite silently passes 5 of 6.

## Design

- Pure view-model in `webapp/views/timeline.ts` (beside `buildFilesSidebarViewModel`, which the
  existing test file already covers); dumb recursive render in `webapp/views/sidebar.ts`.
- Expand/collapse uses native `<details open>` — no JS toggle, no state (ponytail rung 4).
- Leaves keep `class="file-item"` so selection + `clearSidebarFileSelection` keep working untouched.

---

## Step 1 — RED: extend `buildFilesSidebarViewModel` with rename/delete facts

File: `tests/timeline-viewmodels.test.ts`. `EventKind` is already imported there and fixtures use
enum members (coding-requirements §4) — keep doing so.

Add a module-level fixture next to `commitWalkDocument` (~line 1250). Targets are absolute to match
production:

```ts
// Item 77: a rename lineage (renamed.py, keyed at its FINAL path per reconstruction_lineage.ts),
// a deleted file, and a delete→recreate (m4) that must NOT read as deleted.
const fileTreeDocument = {
    ...commitWalkDocument,
    filesTouched: [{
        target: "/tmp/proj/src/renamed.py",
        revisions: [
            { kind: EventKind.write, changeId: "c1", timestamp: "2026-01-01T00:00:05.000Z" },
            {
                kind: EventKind.rename,
                changeId: "c2",
                timestamp: "2026-01-01T00:00:06.000Z",
                rename: { from: "/tmp/proj/src/original.py", to: "/tmp/proj/src/renamed.py" },
            },
        ],
    }, {
        target: "/tmp/proj/src/gone.py",
        revisions: [
            { kind: EventKind.write, changeId: "c3", timestamp: "2026-01-01T00:00:07.000Z" },
            { kind: EventKind.delete, changeId: "c4", timestamp: "2026-01-01T00:00:08.000Z" },
        ],
    }, {
        target: "/tmp/proj/README.md",
        revisions: [
            { kind: EventKind.write, changeId: "c5", timestamp: "2026-01-01T00:00:09.000Z" },
            { kind: EventKind.delete, changeId: "c6", timestamp: "2026-01-01T00:00:10.000Z" },
            { kind: EventKind.write, changeId: "c7", timestamp: "2026-01-01T00:00:11.000Z" },
        ],
    }],
};
```

Write these tests (they fail until Step 2):

```ts
test("test_buildFilesSidebarViewModel_flags_a_file_whose_last_revision_is_a_delete", () => {
    // Scenario: a file deleted and never recreated is reported as deleted, so the tree can dim it.
    // Steps:
    // build the sidebar view-model from the item-77 document.
    const entries = buildFilesSidebarViewModel(fileTreeDocument);
    // find the entry whose history ends in a delete revision.
    const gone = entries.find((entry) => entry.target === "/tmp/proj/src/gone.py");
    // it is reported deleted.
    assert.equal(gone?.isDeleted, true);
});

test("test_buildFilesSidebarViewModel_does_not_flag_a_file_recreated_after_a_delete", () => {
    // Scenario: m4's write->delete->write recreate ends alive, so it must NOT be reported deleted
    // (guards against testing "any delete revision" instead of the LAST one).
    // Steps:
    // build the sidebar view-model from the item-77 document.
    const entries = buildFilesSidebarViewModel(fileTreeDocument);
    // find the recreated file's entry.
    const recreated = entries.find((entry) => entry.target === "/tmp/proj/README.md");
    // its last revision is a write, so it is alive.
    assert.equal(recreated?.isDeleted, false);
});

test("test_buildFilesSidebarViewModel_reports_the_original_path_of_a_renamed_file", () => {
    // Scenario: a renamed file is one history at its final path; the pane still needs the path it
    // started life at, for the rename badge.
    // Steps:
    // build the sidebar view-model from the item-77 document.
    const entries = buildFilesSidebarViewModel(fileTreeDocument);
    // find the renamed file, keyed at its FINAL path.
    const renamed = entries.find((entry) => entry.target === "/tmp/proj/src/renamed.py");
    // its first rename revision's `from` is the path it was born at.
    assert.equal(renamed?.originalPath, "/tmp/proj/src/original.py");
});

test("test_buildFilesSidebarViewModel_reports_no_original_path_for_a_never_renamed_file", () => {
    // Scenario: a file that was never renamed must carry no badge.
    // Steps:
    // build the sidebar view-model from the item-77 document.
    const entries = buildFilesSidebarViewModel(fileTreeDocument);
    // find a file with no rename revision.
    const gone = entries.find((entry) => entry.target === "/tmp/proj/src/gone.py");
    // no original path is reported.
    assert.equal(gone?.originalPath, undefined);
});
```

Update the existing `test_buildFilesSidebarViewModel_lists_targets_with_revision_counts`
(`tests/timeline-viewmodels.test.ts:1592-1601`) — its `deepEqual` breaks once the shape grows:

```ts
    assert.deepEqual(entries, [
        { target: "alpha.py", revisionCount: 2, isDeleted: false, originalPath: undefined },
        { target: "beta.py", revisionCount: 1, isDeleted: false, originalPath: undefined },
    ]);
```

## Step 2 — GREEN: implement the facts

File: `webapp/views/timeline.ts`. Add `const DELETE_EVENT_KIND = "delete";` and
`const RENAME_EVENT_KIND = "rename";` beside the existing wire-string consts (`:34-36`) — the webapp
mirrors wire strings as consts because it cannot import the TS enums (`timeline.ts:5-7`); the tests
assert equivalence against the real `EventKind` members.

Replace `buildFilesSidebarViewModel` (`:922-928`):

```ts
// One Files-pane entry: the file plus the two facts the tree renders differently (item 77).
export type FileSidebarEntry = {
    target: string;
    revisionCount: number;
    // True only when the LAST revision is a delete: m4's write->delete->write recreate ends alive.
    isDeleted: boolean;
    // The path this file was born at, when a rename moved it (the history is keyed at the FINAL
    // path — src/reconstruction_lineage.ts). undefined when it was never renamed.
    originalPath: string | undefined;
};

// The Files sidebar's entries (item 66): every surviving touched file with its revision count,
// plus its delete/rename facts (item 77).
export function buildFilesSidebarViewModel(document: WireTimelineDocument): FileSidebarEntry[] {
    return document.filesTouched.map((history) => ({
        target: history.target,
        revisionCount: history.revisions.length,
        isDeleted: findLastRevisionKind(history) === DELETE_EVENT_KIND,
        originalPath: findOriginalPath(history),
    }));
}

// The kind of the revision the file ends life at; undefined for an empty history.
function findLastRevisionKind(history: WireFileHistory): string | undefined {
    return history.revisions[history.revisions.length - 1]?.kind;
}

// The path a renamed file started at: the FIRST rename revision's `from`. Chained renames
// (a->b->c) leave revisions from=a,to=b then from=b,to=c, so the earliest `from` is the origin.
function findOriginalPath(history: WireFileHistory): string | undefined {
    return history.revisions.find((revision) => revision.kind === RENAME_EVENT_KIND)?.rename?.from;
}
```

## Step 3 — RED: the common-root prefix

The single most important helper: without it the tree is ~8 nested single-child folders (fact 1).

**Compare path SEGMENTS, never string characters** — a character-wise common prefix of `/foo/bar` and
`/foo/barn` yields `/foo/bar`, which is wrong. Tests must pin this.

**The prefix is computed over each target's DIRECTORY only** — never let a filename segment enter the
prefix, or a single-file pane would strip the file itself and render an empty tree.

Add to `tests/timeline-viewmodels.test.ts`:

```ts
test("test_findCommonDirectoryPrefix_returns_the_directories_every_target_shares", () => {
    // Scenario: absolute targets share a long root; the tree strips it so files are readable.
    // Steps: two files under the same directory share that whole directory.
    assert.equal(findCommonDirectoryPrefix(["/tmp/proj/src/a.py", "/tmp/proj/src/b.py"]), "/tmp/proj/src");
});

test("test_findCommonDirectoryPrefix_stops_where_targets_diverge", () => {
    // Scenario: targets in sibling directories share only the parent.
    // Steps: /tmp/proj/src/a.py and /tmp/proj/docs/b.md share /tmp/proj.
    assert.equal(findCommonDirectoryPrefix(["/tmp/proj/src/a.py", "/tmp/proj/docs/b.md"]), "/tmp/proj");
});

test("test_findCommonDirectoryPrefix_compares_whole_segments_not_characters", () => {
    // Scenario: /foo/bar and /foo/barn share /foo, NOT /foo/bar — a character-wise prefix is a bug.
    // Steps: the two directories differ at their second segment despite the shared text "bar".
    assert.equal(findCommonDirectoryPrefix(["/foo/bar/a.py", "/foo/barn/b.py"]), "/foo");
});

test("test_findCommonDirectoryPrefix_uses_the_parent_directory_of_a_lone_target", () => {
    // Scenario: one file must not have its own name eaten by the prefix (that would empty the tree).
    // Steps: a single target contributes its directory, never its basename.
    assert.equal(findCommonDirectoryPrefix(["/tmp/proj/src/only.py"]), "/tmp/proj/src");
});

test("test_findCommonDirectoryPrefix_is_empty_when_targets_share_no_directory", () => {
    // Scenario: bare relative targets (the existing commit-walk fixture) have no shared root.
    // Steps: alpha.py and beta.py sit at the root, so nothing is stripped.
    assert.equal(findCommonDirectoryPrefix(["alpha.py", "beta.py"]), "");
});

test("test_findCommonDirectoryPrefix_is_empty_for_no_targets", () => {
    // Scenario: an empty Files pane must not crash the tree builder.
    // Steps: no targets means no prefix.
    assert.equal(findCommonDirectoryPrefix([]), "");
});
```

## Step 4 — GREEN: implement `findCommonDirectoryPrefix`

In `webapp/views/timeline.ts`:

```ts
// The directory segments every target shares, as a path (item 77). Real targets are absolute and
// deep (/private/var/folders/…/T/run-scenario.xxxx/alpha.py), so the tree strips this prefix —
// otherwise the pane is a chain of single-child folders before the first real file.
// Segment-wise on purpose: a character-wise prefix of /foo/bar and /foo/barn wrongly yields /foo/bar.
export function findCommonDirectoryPrefix(targets: readonly string[]): string {
    const directories = targets.map(splitDirectorySegments);
    if (directories.length === 0) {
        return "";
    }
    const shared = directories.reduce(intersectLeadingSegments);
    return shared.join("/");
}

// A target's directory, as segments — never its basename, so a lone file keeps its own name.
function splitDirectorySegments(target: string): string[] {
    return target.split("/").slice(0, -1);
}

// The leading segments two paths agree on.
function intersectLeadingSegments(left: readonly string[], right: readonly string[]): string[] {
    const shared: string[] = [];
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
        if (left[index] !== right[index]) {
            break;
        }
        shared.push(left[index]!);
    }
    return shared;
}
```

Note on the absolute-path case: `"/tmp/proj/src/a.py".split("/")` is `["", "tmp", "proj", "src", "a.py"]`,
so the leading `""` is a shared segment and `join("/")` reproduces the leading slash
(`["", "tmp", "proj", "src"].join("/") === "/tmp/proj/src"`). Relative targets like `"alpha.py"` give
`[]` and join to `""`. Both are covered by Step 3's tests.

## Step 5 — RED: the tree shape

```ts
test("test_buildFileTree_nests_each_file_under_its_directories", () => {
    // Scenario: the pane becomes a real tree — a folder node per directory, files as its leaves.
    // Steps:
    // build a tree from two files in different directories under a shared root.
    const tree = buildFileTree([
        { target: "/root/src/a.py", revisionCount: 1, isDeleted: false, originalPath: undefined },
        { target: "/root/docs/b.md", revisionCount: 1, isDeleted: false, originalPath: undefined },
    ]);
    // the shared /root prefix is stripped, leaving its two directories as the top level.
    assert.deepEqual(tree.map((node) => node.name), ["docs", "src"]);
    // each folder holds its own file, named by basename (never the full path).
    assert.deepEqual(tree[0]!.children.map((child) => child.name), ["b.md"]);
    assert.deepEqual(tree[1]!.children.map((child) => child.name), ["a.py"]);
});

test("test_buildFileTree_sorts_folders_before_files_then_alphabetically", () => {
    // Scenario: a stable, readable order — folders first, each group alphabetical.
    // Steps:
    // build a tree mixing a root-level file with a folder, supplied out of order.
    const tree = buildFileTree([
        { target: "/root/zeta.py", revisionCount: 1, isDeleted: false, originalPath: undefined },
        { target: "/root/alpha.py", revisionCount: 1, isDeleted: false, originalPath: undefined },
        { target: "/root/src/nested.py", revisionCount: 1, isDeleted: false, originalPath: undefined },
    ]);
    // the folder leads, then the two root files in alphabetical order.
    assert.deepEqual(tree.map((node) => node.name), ["src", "alpha.py", "zeta.py"]);
});

test("test_buildFileTree_carries_the_entry_facts_onto_each_leaf", () => {
    // Scenario: leaves must keep the full target (clicks route by full path) and the render facts.
    // Steps:
    // build a tree from one deleted, renamed file.
    const entry = {
        target: "/root/src/renamed.py",
        revisionCount: 2,
        isDeleted: true,
        originalPath: "/root/src/original.py",
    };
    const tree = buildFileTree([entry]);
    // the lone leaf carries the entry verbatim, so onFileClick still receives the full path.
    assert.deepEqual(tree[0]!.entry, entry);
});

test("test_buildFileTree_is_empty_for_no_files", () => {
    // Scenario: a project with no touched files renders an empty pane, not a crash.
    // Steps: no entries yields no nodes.
    assert.deepEqual(buildFileTree([]), []);
});
```

Note the shape asserted above: with a single entry the common prefix is its whole directory, so the
tree is exactly one file leaf at top level (`tree[0].entry`) — this is why Step 3 pins
`findCommonDirectoryPrefix(["/tmp/proj/src/only.py"]) === "/tmp/proj/src"`.

## Step 6 — GREEN: implement `buildFileTree`

In `webapp/views/timeline.ts`:

```ts
// A Files-pane tree node (item 77): a folder with children, or a file leaf carrying its entry.
// Mirrored (not imported) by webapp/views/sidebar.ts — timeline.ts imports sidebar.ts, so importing
// back would be a cycle; the file's existing view-model types are mirrored the same way.
export const FOLDER_NODE_KIND = "folder";
export const FILE_NODE_KIND = "file";

export type FileTreeNode = {
    kind: typeof FOLDER_NODE_KIND | typeof FILE_NODE_KIND;
    name: string;
    children: FileTreeNode[];
    // Set only on a file leaf.
    entry: FileSidebarEntry | undefined;
};

// Shape the flat Files entries into a nested tree, rooted below the directory prefix every target
// shares (item 77). Folders sort before files; each group sorts alphabetically.
export function buildFileTree(files: readonly FileSidebarEntry[]): FileTreeNode[] {
    const prefix = findCommonDirectoryPrefix(files.map((file) => file.target));
    const root = makeFolderNode("");
    for (const file of files) {
        insertFileIntoTree(root, file, prefix);
    }
    sortTreeNodes(root);
    return root.children;
}

function makeFolderNode(name: string): FileTreeNode {
    return { kind: FOLDER_NODE_KIND, name, children: [], entry: undefined };
}

// Walk (creating as needed) the folder chain below the stripped prefix, then hang the file leaf.
function insertFileIntoTree(root: FileTreeNode, file: FileSidebarEntry, prefix: string): void {
    const segments = stripPrefixSegments(file.target, prefix);
    const fileName = segments[segments.length - 1]!;
    let folder = root;
    for (const directory of segments.slice(0, -1)) {
        folder = findOrAddFolder(folder, directory);
    }
    folder.children.push({ kind: FILE_NODE_KIND, name: fileName, children: [], entry: file });
}

// A target's segments below the shared prefix. Splitting the REMAINDER (not the whole target) is
// what removes the deep absolute root; the leading "/" of the remainder is dropped first.
function stripPrefixSegments(target: string, prefix: string): string[] {
    const remainder = target.slice(prefix.length);
    return remainder.split("/").filter((segment) => segment !== "");
}

function findOrAddFolder(parent: FileTreeNode, name: string): FileTreeNode {
    const existing = parent.children.find((child) => child.kind === FOLDER_NODE_KIND && child.name === name);
    if (existing !== undefined) {
        return existing;
    }
    const folder = makeFolderNode(name);
    parent.children.push(folder);
    return folder;
}

// Folders before files, then alphabetical — applied at every depth.
function sortTreeNodes(folder: FileTreeNode): void {
    folder.children.sort(compareTreeNodes);
    for (const child of folder.children) {
        sortTreeNodes(child);
    }
}

function compareTreeNodes(left: FileTreeNode, right: FileTreeNode): number {
    if (left.kind !== right.kind) {
        return left.kind === FOLDER_NODE_KIND ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
}
```

`stripPrefixSegments` is why the prefix must be a directory path with no trailing slash: the
remainder of `/root/src/a.py` after `/root` is `/src/a.py`, and the `filter` drops the empty leading
segment. For relative targets the prefix is `""` and the remainder is the whole target.

## Step 7 — Render the tree (`webapp/views/sidebar.ts`)

Mirror the node type locally (fact 7 — importing `timeline.ts` here would be a cycle):

```ts
// One Files-pane tree node (buildFileTree's shape — mirrored, not imported: timeline.ts imports
// this module, so importing back would be a cycle).
type FileSidebarEntry = {
    target: string;
    revisionCount: number;
    isDeleted: boolean;
    originalPath: string | undefined;
};

type FileTreeNode = {
    kind: string;
    name: string;
    children: FileTreeNode[];
    entry: FileSidebarEntry | undefined;
};

const FOLDER_NODE_KIND = "folder";
```

Change `renderForkSidebar`'s third parameter from `files: FileSidebarEntry[]` to
`files: FileTreeNode[]`, and replace the Files loop (`:52-62`) with a recursive append:

```ts
    drawer.append(el("div", { class: "pane-title", text: "Files" }));
    for (const node of files) {
        drawer.append(renderFileTreeNode(node, callbacks));
    }
}

// A folder renders as a native <details open> (item 77: all folders start expanded, no JS toggle);
// a file renders as the same .file-item the flat list used, so selection and
// clearSidebarFileSelection keep working unchanged.
function renderFileTreeNode(node: FileTreeNode, callbacks: ForkSidebarCallbacks): HTMLElement {
    if (node.kind === FOLDER_NODE_KIND) {
        // open: "" — `el`'s attrs are Record<string, string | EventListener> (webapp/app.ts:31), so a
        // boolean will not typecheck; it forwards unknown keys to setAttribute, and an empty-string
        // `open` attribute is present-and-therefore-expanded.
        return el("details", { class: "file-folder", open: "" }, [
            el("summary", { class: "file-folder-name", text: node.name }),
            ...node.children.map((child) => renderFileTreeNode(child, callbacks)),
        ]);
    }
    return renderFileTreeLeaf(node, node.entry!, callbacks);
}

function renderFileTreeLeaf(node: FileTreeNode, entry: FileSidebarEntry, callbacks: ForkSidebarCallbacks): HTMLElement {
    // The full path stays in the tooltip: the row shows only the basename now.
    const item = el("div", {
        class: entry.isDeleted ? "file-item deleted" : "file-item",
        text: node.name,
        title: entry.isDeleted ? `${entry.target} (deleted)` : entry.target,
    }, []);
    item.append(el("span", { class: "revcount", text: `(${entry.revisionCount})` }));
    if (entry.originalPath !== undefined) {
        // Renamed files live at their final path (one history); the badge names where it came from.
        item.append(el("span", {
            class: "rename-badge",
            text: `← ${entry.originalPath.slice(entry.originalPath.lastIndexOf("/") + 1)}`,
            title: `renamed from ${entry.originalPath}`,
        }));
    }
    item.addEventListener("click", () => {
        clearSidebarFileSelection();
        item.classList.add("selected");
        callbacks.onFileClick(entry.target);
    });
    return item;
}
```

`el` (`webapp/app.ts:33-43`) special-cases `class`, `text`, and `on*`, and forwards everything else to
`setAttribute` — so `title` and `open: ""` both work as written. No `el` change is needed.

`clearSidebarFileSelection` (`:29-33`) and its `timeline.ts:1658` caller stay **unchanged** — the
leaf class is still `file-item`.

## Step 8 — Wire it up (`webapp/views/timeline.ts:1838-1849`)

Change **exactly one line** — the files argument at `:1841`:

```ts
        buildFilesSidebarViewModel(reconstructionDocument),
```

becomes:

```ts
        buildFileTree(buildFilesSidebarViewModel(reconstructionDocument)),
```

Everything else in the `renderForkSidebar(...)` call (`:1838-1848`) stays byte-identical:
`onSessionClick: jumpToTimelineRow` and the `onFileClick` arrow both keep working, because
`onFileClick` still receives the full `target` string from the leaf's `entry.target`.

## Step 9 — CSS (`webapp/styles.css`)

Edit the `.file-item` block at `:171-184`. Keep `nowrap`/`ellipsis` (a long basename can still
overflow), and add the new rules after `:184`, reusing existing palette vars:

```css
.file-folder > summary {
    padding: 3px 10px 3px 18px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;
}
.file-folder > summary:hover { background: var(--sel-hover); }
/* Each nesting level indents its contents; nested <details> compound this naturally. */
.file-folder > *:not(summary) { padding-left: 10px; }
.file-item.deleted { text-decoration: line-through; opacity: 0.55; }
.file-item .rename-badge { color: var(--orange); margin-left: 6px; font-size: 10px; }
```

No `list-style` declaration is needed: `styles.css` has no global `summary` reset (the only existing
`summary` rules are `#timeline-summary` at `:238` and `.consent-readonly-block summary` at `:692`,
neither of which matches these nodes), so the native disclosure triangle already renders.

## Step 10 — Housekeeping

- Delete the now-dead `.tree-file` rules at `styles.css:676-678` (styled, referenced by no TS).
- Leave `project.ts`'s `groupTargetsByDirectory` (`:36-47`) **alone**: it is single-level dirname
  grouping for a *different* pane (`renderProjectDrawer`), not a duplicate of `buildFileTree`, and
  migrating it means re-verifying a second surface for no item-77 benefit. Its ponytail comment
  ("upgrade if deep hierarchies get unreadable") stays accurate for that pane. Note it in TASKS.md
  as a possible follow-up.
- Run `npm run build:webapp` and both typechecks. **Do not run the test suite — the user runs it.**
- Mark item 77 done in `TASKS.md` with a summary of what shipped.

## Out of scope

- `rewoundFilesTouched` (never rendered in this pane).
- Any engine/`src/` change — the wire already carries every fact (facts 2-4).
- Collapsing single-child folder chains *below* the root: the user chose "all expanded". Only the
  shared root prefix is stripped, which is what makes deep absolute paths readable at all.
- A header row naming the stripped root. Skipped deliberately (ponytail): every leaf's `title` already
  carries its full path, which is what item 77 actually asked for. Add it if the stripped root turns
  out to be information the user misses. Note it in TASKS.md as a possible follow-up.
- Multi-root projects (files from sessions with different `cwd`s) get a shallower shared prefix, so
  some real single-child chains survive. That is honest divergence, not a bug, and the user declined
  chain collapsing.
