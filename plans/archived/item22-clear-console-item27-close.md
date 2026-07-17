# Plan: close TASKS.md items 22 and 27

Two closures. Item 22 (clear the xterm progress console when a new project load starts) is a
small webapp change, done with strict red-green TDD. Item 27 (trailing-newline artifact) was
investigated during planning and is ALREADY FIXED — it duplicates completed roadmap item 14 —
so it is a TASKS.md close-out only, with a verification command the implementer must run.

Constraints for the implementer:

- Follow `plans/coding-requirements.md` and `~/.claude/guides/coding-standards.md`
  (4-space indent, imperative style, verb-named functions).
- Webapp files are plain `.js` — no type annotations in `webapp/app.js`.
- STAGE all work at the end; do NOT commit.
- Test runner is `npm test` (`node --import tsx --test tests/*.test.ts`) — NOT vitest.

---

## Task 1 — Item 27: verify the fix, then mark it done in TASKS.md

Item 27 says 2 files show `recon=''` one line beyond reference EOF. Planning-time archaeology
found: both evidence records are Read `tool_result` dumps whose text ends in a final numbered
line with empty content (`…\n85\t` / `…\n498\t`) — the "terminal Read phantom". Completed
roadmap item 14 fixed exactly this class (`dropTrailingReadPhantom` in
`api/numbered-entries.js`), and its gate results (`plans/implementation-notes-item14-trailing-extent.md:64-65`)
record BOTH of item 27's files going `mismatched 1→0`. The JSON reports under
`tools/line-state-reports/` are stale pre-fix outputs from 2026-06-11; item 27 was created
2026-07-07 from a follow-up note that predates the fix.

### Step 1.1 — verify the two evidence records carry the phantom signature

Run this exact command from the repo root and confirm both lines of output end with a
`\n<number>\t` tail (a final numbered line with empty content and no trailing newline):

```bash
node -e '
const fs = require("fs");
const targets = [
    ["/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jot-backup/3689e384-a88e-45ca-89f6-c071a0f3b04b.jsonl", 21],
    ["/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jot-recovery/0e2e10a5-2552-460e-9495-9a44fbc63724.jsonl", 278],
];
for (const [path, lineNumber] of targets) {
    const record = JSON.parse(fs.readFileSync(path, "utf8").split("\n")[lineNumber - 1]);
    console.log(JSON.stringify(record.message.content[0].content.slice(-12)));
}'
```

Expected output (already confirmed during planning):

```
"tests should pass.\n85\t"-style tail → "s pass.\n85\t" and "main())\n498\t" endings
```

Precisely: the first prints a string ending in `\n85\t`, the second ending in `\n498\t`.
If either JSONL file is missing, do NOT fail the task — the item-14 gate results in
`plans/implementation-notes-item14-trailing-extent.md:64-65` stand as the record; note the
missing file in the TASKS.md entry instead.

### Step 1.2 — verify the item-14 fix is still in place

The item-14 unit suite (`tests/test-numbered-entries.js`) was retired with the golden-value
tests (TASKS item 28), so verify the fix textually instead:

```bash
grep -n "dropTrailingReadPhantom" api/numbered-entries.js
```

Expected: the function is present (definition plus its call in the Read-path entry builder).
If `api/numbered-entries.js` were ever missing, the item-14 gate results in
`plans/implementation-notes-item14-trailing-extent.md:64-65` stand as the record.

### Step 1.3 — mark item 27 done in TASKS.md

In `TASKS.md`, change item 27's checkbox from `- [ ]` to `- [x]` and append this closure note
(keep the existing text, add below it, matching the file's 2-space continuation indent):

```markdown
  **Closed 2026-07-08:** duplicate of completed roadmap item 14. Both evidence records are
  Read tool_result dumps ending in a final numbered empty line (`…\n85\t` / `…\n498\t`) — the
  "terminal Read phantom" fixed by `dropTrailingReadPhantom` (`api/numbered-entries.js`);
  item-14 gates recorded both files going mismatched 1→0
  (`plans/implementation-notes-item14-trailing-extent.md:64-65`). The
  `tools/line-state-reports/*.json` reports are stale pre-fix outputs (2026-06-11). The live
  engine is unaffected (its `splitLines` drops the trailing empty element). No code change.
```

---

## Task 2 — Item 22: clear the progress console when a new project load starts (TDD)

### Behavior (plain English)

The xterm progress console (`progressTerminal` in `webapp/app.js`) is created once and only
ever appended to, so output from a previously loaded project stays above the new project's
output. Desired: when a navigation starts loading a DIFFERENT project than the one whose
output currently fills the console, clear the console first. Navigations within the same
project (timeline → file → jsonl sub-routes) must NOT clear — those lines are part of the
same load's story. Navigating to the projects list must NOT clear (nothing new is loading).
Switching the projects folder resets the tracking, so re-entering a same-named project from
the new folder clears.

Named things (per coding-standards):

- `checkNavigationStartsNewProjectLoad(previousProject, nextProject)` — exported pure
  predicate; true only when `nextProject` is a project name different from `previousProject`.
- `lastLoadedProject` — module-level variable in `webapp/app.js`: the project whose load
  output currently fills the console (`undefined` before any project load).

### Step 2.1 — RED: add the predicate tests

Append to `tests/route-predicates.test.ts` (23 lines today; stays well under the 250 cap).
Add `checkNavigationStartsNewProjectLoad` to the existing import from `../webapp/app.js`,
then add:

```ts
test("test_check_navigation_starts_new_project_load_on_project_change", () => {
    // Scenario: the console holds project A's load output; navigating to project B starts a
    // new load, so the console must clear (TASKS item 22).
    assert.equal(checkNavigationStartsNewProjectLoad("project-a", "project-b"), true);
});

test("test_check_navigation_starts_new_project_load_on_first_project_load", () => {
    // Scenario: before any project load the console holds only landing-page output; the
    // first project load clears it so the console shows exactly that load.
    assert.equal(checkNavigationStartsNewProjectLoad(undefined, "project-a"), true);
});

test("test_check_navigation_keeps_console_within_one_project", () => {
    // Scenario: sub-route hops (timeline → file → jsonl) inside one project belong to the
    // same load story — never clear.
    assert.equal(checkNavigationStartsNewProjectLoad("project-a", "project-a"), false);
});

test("test_check_navigation_keeps_console_on_non_project_routes", () => {
    // Scenario: the projects list loads no project — leaving A's output visible is correct.
    assert.equal(checkNavigationStartsNewProjectLoad("project-a", undefined), false);
    assert.equal(checkNavigationStartsNewProjectLoad(undefined, undefined), false);
});
```

Run `npm test` — the suite MUST go red with an import/undefined error for
`checkNavigationStartsNewProjectLoad` before any app.js edit. Record the red.

### Step 2.2 — GREEN: export the predicate

In `webapp/app.js`, directly above `async function renderRoute()` (line ~387), add:

```js
// The project whose load output currently fills the progress console; undefined before any
// project load. Set by renderRoute, reset by the projects-folder switch.
let lastLoadedProject;

// True only when a navigation starts loading a project DIFFERENT from the one whose output
// fills the console. Same-project sub-route hops and non-project routes keep the console
// (TASKS item 22: clear on new project/session load, not on every navigation).
export function checkNavigationStartsNewProjectLoad(previousProject, nextProject) {
    if (nextProject === undefined) {
        return false;
    }
    return nextProject !== previousProject;
}
```

Run `npm test` — the four new tests go green.

### Step 2.3 — wire the clear into renderRoute

In `renderRoute` (webapp/app.js), immediately after
`const segments = parseRouteSegments();` (line ~396), add:

```js
    const nextProject = segments[0] === "project" ? segments[1] : undefined;
    if (checkNavigationStartsNewProjectLoad(lastLoadedProject, nextProject)) {
        // A different project's load is starting: the retained output belongs to the previous
        // project, so clear before the first line of this load lands (TASKS item 22).
        ensureProgressTerminal();
        progressTerminal.clear();
    }
    if (nextProject !== undefined) {
        lastLoadedProject = nextProject;
    }
```

Notes pinning the how:

- Use `progressTerminal.clear()` (keeps the terminal instance, wipes the buffer), NOT
  `reset()` (also resets modes/decorations, unnecessary).
- `ensureProgressTerminal()` first, matching `logProgress`'s pattern — in the browser it is
  already created at bootstrap (line ~476), so this is a no-op guard.
- This placement is BEFORE the drawer render and view render, so the folder-scan and
  document GET lines of the new load are the first lines in the cleared console.

### Step 2.4 — reset tracking on projects-folder switch

In `initializeHeader`'s click handler (webapp/app.js line ~466), next to
`documentCache.clear();` / `rawLinesCache.clear();`, add:

```js
        lastLoadedProject = undefined;
```

Why: after a folder switch every project is a fresh load even under an identical name; the
cache clears on the adjacent lines already encode "everything is stale".

### Step 2.5 — verify

1. `npm test` — full suite green (baseline before this work: all passing; expect +4 tests).
2. Static sanity: `node --input-type=module -e "import('./webapp/app.js').then(m => console.log(typeof m.checkNavigationStartsNewProjectLoad))"`
   prints `function` (proves the module still imports DOM-free — the test suite relies on this).
3. Manual browser check is OPTIONAL (the wiring is 8 lines exercised only in a browser); if
   the dev server is trivially startable, load two different projects and confirm the console
   clears between them and does NOT clear on sub-route clicks within one project.

### Step 2.6 — mark item 22 done in TASKS.md

Change item 22's checkbox to `- [x]` and append (2-space continuation indent):

```markdown
  **Closed 2026-07-08:** `renderRoute` clears the console via `progressTerminal.clear()` when
  navigation starts loading a different project (`checkNavigationStartsNewProjectLoad`,
  `webapp/app.js`); same-project sub-route hops and the projects list keep the output; the
  projects-folder switch resets tracking. Covered by 4 tests in
  `tests/route-predicates.test.ts`.
```

---

## Final gate

1. `npm test` — everything green.
2. `git add` all touched files (TASKS.md, webapp/app.js, tests/route-predicates.test.ts,
   this plan file, the implementation-notes file). Do NOT commit.
