# Task 340 decisions (2026-07-30)

Settled with the user across two rounds. **Round 2 (the grilling) supersedes
round 1 where they conflict** — superseded entries are marked. Each layer's
spec item restates what applies to it; this file is the single home for
anything cross-cutting.

## Cross-cutting

### Visibility triggers computation

A node kind's data is computed the **first time that kind becomes visible**,
however it was turned on — layer button or checkbox. One rule, no
special-casing, and a checkbox can never reveal empty nodes.

Consequence: the progress bar must be able to fire from the checkbox row, not
only from a layer button. The first such fetch merges new instants and re-runs
the ladder layout client-side (`relayOutLayer1View`, which already exists for
the path filter).

Within a layer, only nodes in the **rendered viewport** compute — the region
the minimap's green box marks, so zoom level changes what runs. Work is done
**once per node**, ever; a node scrolled into view later is already done.

### The checkboxes are the source of truth; `data-layer` retires

~~Round 1: "layer switcher stays cumulative, extending the data-layer CSS
pattern."~~ **Superseded.**

A "show" row of checkboxes — `show: [✓] git [✓] 📷 [✓] Edit …` — governs
visibility. Clicking a layer button ticks that layer's checkboxes; buttons
1–7 remain as presets. The single `data-layer` CSS rule
(`layer1-styles.css:71`) is retired, along with its readers: the unit test,
three visual/CDP probes, and the glossary entry.

**L8 and L9 are not layers.** Neither adds a node kind, so neither has
checkboxes to toggle. The show row is always present; range-export is a mode
you arm.

### Filtering is hide-only

CSS hiding, never re-layout. Dead gaps stay — the ruler does not squish. Nodes
hide; lane tie lines between survivors do not. Zero checked = show nothing.
Whatever is on applies **everywhere**, ruler included, so an expanded ruler
row's file list re-filters too. State persists with the settings data; **no
`&kinds=` URL parameter**. The show row replaces the static legend.

Task **#341** remains separate: a global header "compact the timeline gaps"
button, one-shot re-layout, opt-in.

### Seven confidence states, display-only

Every node carries one of: **verified**, **derived**, **mismatch**,
**reseeded**, **never-provable** (bash), **injected-unverified**,
**original-failed**. Each is visually distinct.

Confidence is **not** a filter axis — the show row filters by node kind alone.

The existing visual idiom to port: `.kind-pre-anchor-stub`
(dashed hollow ring, `layered-styles.css:135`) and `.kind-presumed-user-edit`
(`:137`). Layer 1 renders neither today.

### One beacon definition across all layers

A beacon is any of: a file-history backup, a full-file Read echo, a
`Bash(cat FILE)` result, a git commit, or a snapshot. L6 verifies against
whichever is nearest — not, as today, the backup timeline alone
(`getPostExecutionBeacon` → `backupSeedWriteFor`).

### Records with no timestamp

They take **the previous stamped record's timestamp**. Matches the task-224
precedent, which rejected `+1ms` to "avoid inventing an instant that no
evidence supports."

This is ~22% of records in the RevEng project (42,790 of 192,303) — all
session metadata. The three conflicting behaviours in code converge on this
rule: drop (`viewer_api_layer1_sessions.ts:25-27`), sort-first
(`views/timeline-line-nodes.ts`, `views/reconstruction-coverage.ts:84-86`),
sort-last (`viewer_api_records.ts:83-86`).

Unknown record types render as `[?]`. Not hypothetical: `worktree-state` (124)
and `relocated` (87) are already in the real logs and absent from `RecordType`.

### Session annotation track

Records that are about no file — user prompts, agent responses, and the ~54k
non-file metadata rows — get a **new shared annotation track on the same
ruler**. Every content-bearing widget in layer 1 is file-scoped today
(`buildStagePairs`/`buildOrphanBucket`), and the only session-level element is
a 7px bar with a tooltip (`renderSessionRanges`, `layer1-widgets.ts:83-92`), so
this is new UI. It needs windowing before it can render at all.

### Bubbles have one lane per session

Per `plans/mvp-app-mockup.html`: a bubble holds a 64px column per session, each
with its own rail and rotated label. Bubbles widen; lanes never overlap. Nodes
carry `data-session-id`/`data-session-file`/`data-line` per the existing
`appendSnapshotNode` ↔ `describeNode` contract.

### Reuse the engine

Add one line to `plans/coding-requirements.md`: **if the engine computes it,
consume it — never re-derive branch membership, rewind points, or file state in
the webapp.** No such general rule exists today, only per-feature statements.

The failure it prevents is subtle: reimplement `absorbParallelToolCallSiblings`
wrong and every ordinary parallel tool call renders as a fake abandoned branch.

### Fixture data: one file per layer

`viewer_api_layer<N>_fixture_data.ts` — underscores, matching every existing
sibling. The current `viewer_api_layer1_fixture_data.ts` keeps its name but
**gives up its `SNAPSHOTS`**, which move to `viewer_api_layer2_fixture_data.ts`.
The shared bulk generator and self-check move somewhere common, since both
layers' data comes from one loop and is validated together.

Two fixtures exist and are kept in sync: `plans/layer2-mockup/fixture.js` (the
python-served mockup) and the `viewer_api_layer*_fixture_data.ts` family (the
real webapp's `--fixture` mode, "ported wholesale" from the former).

Fixture content rules:
- Edit fixtures **must** carry real `structuredPatch` rows —
  `{oldStart, oldLines, newStart, newLines, lines[]}` with `+`/`-`/space
  prefixes. `reconstruction_extract.ts:133-135` refuses to build an edit event
  without one, so `oldString`/`newString` alone produces **no node at all**.
- Edits go in **both** halves: crafted ones in the 4 hand-written sessions (for
  clicking through the diff viewer), generated ones in the bulk loop (84 of the
  88 bubbles are bulk, so without these the timeline looks empty).
- The import-time self-check extends to edit hunks, so a bad `oldStart` throws
  on load instead of rendering wrong.

## Per layer

- **L3 — three stages.** (1) Read events → beacons. (2) Bash results carrying
  full contents (`cat`) → beacons. (3) Edit/Write applied onto the preceding
  beacon → provably verified beacons. ~~Round 1: "Edit/Write only; Bash file
  ops are NOT L3."~~ **Superseded** — Bash is excluded as a *change* source,
  included as a *beacon* source.
  Replay is lazy on click, from the nearest preceding beacon, computing any
  unpopulated predecessors first. Output matching the next beacon → verified,
  else derived. Provable beacons render with a check mark (`[R]✓`).
- **L4 — name files when parsing gives them.** ~~Round 1: "strictly visual, NO
  affected-file computation."~~ **Superseded.** If the static scan yields the
  touched files, label them; otherwise the node still says a script ran, and
  clicking shows the script. No sandbox at L4. Identity is
  `scriptRun:<toolUseId>` — one drawer shared across bubbles, joined by a
  clickable horizontal dashed connector.
- **L5 — kept-vs-reverted is byte-content**, via the existing composition:
  `reconstructBranches` + `findWorkingTreeOwner` + the branch-agnostic steps
  core. **No rewind node** — a rewind shows as dimmed nodes plus a dashed elbow.
- **L5 rendering — forked track** (user mockup, 2026-07-31). The abandoned
  branch moves into its own lane beside a trunk that stays solid and unmoved;
  this rejects `mvp-app-mockup.html` layer 8's dim-in-place. Dimmed dashed
  branch connector, alpha-dimmed discarded nodes, dashed elbow marking the
  split. **A code rewind dead-ends; a conversation-only rewind rejoins via a
  mirrored elbow.** The engine already tells the two apart — the scenario DSL
  marks it (`Rewind: N` vs `Rewind: N, code`) and twin pairs s12/s11, s14/s13,
  s17/s16, s19/s20, s22/s23, s59/s60 cover both. Do not re-derive it. See
  L5-branches.md.
- **L6 — execute once, viewport only.** Reuse the existing consent gate; reuse
  the sandbox memo disk file, plus a header button that clears it and forces
  every layer to recompute. Beaconless runs read the **live working tree**, but
  disk may only **confirm** — a match promotes to verified, a mismatch or
  missing file changes nothing. Wiring `is_error` into `executeRunOnce` is
  ~10-15 lines, no plumbing.
- **L6 console — popup over the timeline** (user, 2026-07-31), picked from the
  three placements mocked up for task #347; anchored panel and drawer rejected.
  Live script output plus a cancel button, with distinct terminal states for
  cancelled, completed-with-mismatch, and normal completion. The global load bar
  still carries overall progress — do not design a second progress idiom. Mockup:
  `plans/l6-console-mockup/`.
- **L7 — every record type gets a node**, hidden by default when the engine
  classifies it ignorable (`[✓] hide ignored nodes`, on at load). Tool call and
  tool result are **separate** nodes joined by a dashed bracket. Any layer that
  can resolve a presumed node — because nothing sits between it and its
  surrounding beacons — promotes it to verified.
- **L9 — commit mode.** See its own doc; all eleven ambiguities are settled.

## Still open

- **L5 lane scope** — a lane per session vs a conversation-wide tree spanning
  forked subagents, and whether a tie group spans lanes. The rendering choice
  itself is settled above; the user mockup shows one abandoned lane only.
