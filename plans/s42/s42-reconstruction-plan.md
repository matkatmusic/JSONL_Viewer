# Scenario s42 (`s42-git-baseline-from-s38`) — Reconstruction Plan (CHAR-LOCK)

## Verdict
`reconstruction_cli` processed Scenario s42 without needing any engine modifications.
Create a single new CLI test file that captures the `runCli` output for the s42 JSONL and
locks it as the expected output every time the suite runs. **No `src/` change.** This is a
characterization lock, identical in shape to s39 / s40 / s41.

## What s42 is (one paragraph of context, so the locked values make sense)
s42 is the fourth of the `git-baseline` family and the first that composes it with an s38-style
**MCP script-rename in the baseline**. The baseline session (write `inventory.py` + `tests/test_inventory.py`
with terse names, add `low_stock`, write `rename_inv.py`, run it through the context-mode MCP sandbox to
rename `qty_chk→check_quantity` / `add_item→insert_item` / `rm_item→remove_item`, add `restock`, then
`git commit "baseline"`) is **dropped by `--excludeJSONL`**. So the transcript opens MID-STREAM and the
rename machinery is never present in it. The mid-stream transcript carries exactly three `inventory.py`
events: Claude adds `reorder`, a user edit appends `# reviewed by ops`, Claude adds `shrink`. rev 0 of
`inventory.py` is seeded from the file-history backup left by the (excluded) baseline session — which
already carries the post-rename names — so the renamed identifiers appear in the reconstruction without
any rename replay here.

## Reader dependency (load-bearing — do NOT remove the backup reader)
**s42 is reader-DEPENDENT** (same as s39/s41). The first mid-stream `inventory.py` Edit has **no usable
`toolUseResult.originalFile`**, so rev 0 is seeded from the `~/.claude/file-history` backup. `runCli`
auto-wires the `BackupReader` from the session id + `~/.claude/file-history`; there is no flag to set. The
backups must exist on this machine (they do). If they were absent, rev 0 would degrade — keep this in mind
if a test ever shows a short/empty baseline.

## Facts captured by the planning probe (REFERENCE values — see TDD step 1)
These are what the engine produced today. Treat them as the expected reference; the implementer LOCKS the
values actually emitted by live `runCli` (capture-before-assert, per the s33/s38 lesson), and they should
equal these:

- **Default view** prints `══ conversationDAG ══` and `══ fileDAG ══`. Single prompt node `A prompt`, then a
  linear THREE-node ladder on `inventory.py`:
  - `B  edit       inventory.py  #01HyE14A`  (Claude adds `reorder`)
  - `C  user-edit  inventory.py  #6a022912`  (append `# reviewed by ops`)
  - `D  edit       inventory.py  #01SNebUt`  (Claude adds `shrink`)
  - No `branch ` line (linear, no rewind). No `write` node (rev 0 is backup-seeded, not an observed write).
- **`--list-branches`**: one `surviving  tip #a017b766`, file `inventory.py`; **no `rewound`**.
- **`--graphFile`**: `fileDAG`, `inventory.py` with the same B/C/D ladder, **no `write`** node.
- **`--verbose`** for `/inventory.py`: FOUR revisions (0..3), no revision 4. Line counts `145, 173, 174, 191`:
  - rev 0 (145) — baseline: `check_quantity`, `insert_item`, `remove_item`, `find_item`, `tot_value`.
    NO `reorder`, NO `shrink`, NO `# reviewed by ops`. **NO `low_stock`, NO `restock`.**
  - rev 1 (173) — adds `reorder()`; no comment yet.
  - rev 2 (174) — appends `# reviewed by ops` at EOF; no `shrink` yet.
  - rev 3 (191, TIP) — adds `shrink()`; keeps `# reviewed by ops`. Byte-identical to on-disk `inventory.py`
    after stripping the `  N | ` line-number prefixes and the single trailing newline the engine drops.
- **Only `inventory.py` is reconstructed.** `tests/test_inventory.py` and `rename_inv.py` were both written
  in the excluded baseline session → no event → must appear NOWHERE.
- **`low_stock` / `restock` trap:** the scenario's baseline asks for `low_stock` (step 2) and `restock`
  (step 7), but the executed on-disk `inventory.py` contains NEITHER (the running agent's actual baseline
  did not retain them), and the mid-stream transcript never mentions them. The engine correctly does NOT
  invent them — assert their absence everywhere, the way s41 asserts `subtotal`'s absence.

## TDD implementation steps (the only work)

### Step 1 — add the fixture
In `tests/fixtures.ts`, append `S42_JSONL` after `S41_JSONL`, following the LOCAL-copy convention used by
s39/s40/s41 (absolute path into this worktree's executed dir), with a short comment mirroring the s41 one:

```
export const S42_JSONL =
    "/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s42-git-baseline-from-s38/58525cea-c958-449a-894a-1c562a18a2bd.jsonl";
```

### Step 2 — capture live output BEFORE writing assertions (s33/s38 lesson)
From the repo root, run `runCli` on `S42_JSONL` for each of: default (no flags), `--list-branches`,
`--graphFile`, `--verbose`. Use a throwaway probe **at the repo root** (NOT `/tmp` — the relative
`./src/...` import resolves against the script's own dir) run via `npx tsx probe.ts`, then delete it. Read
the four outputs and lock the ACTUAL emitted strings (node hashes, the tip hash, line counts, the prompt
hash). They should match the reference values above; if any differ, the captured value wins — investigate
only if a STRUCTURAL fact differs (e.g. a `write` node appears, or `low_stock`/`restock`/a test file shows up).

### Step 3 — create `tests/reconstruction_cli_s42.test.ts`
Clone `tests/reconstruction_cli_s41.test.ts` verbatim (same imports, same helper functions
`fileVerboseBlock`, `finalRevisionSlice`, `revisionSlice`, `stripLineNumberPrefixes`,
`stripTrailingNewline`), swapping s41→s42 throughout. Point `S42_GT` at
`scenarios/executed/s42-git-baseline-from-s38` and `readGroundTruth` at its `inventory.py`. Five tests,
adapted to s42's three-node / four-revision ladder:

1. **default_conversationDAG_and_fileDAG** — asserts both DAG banners, the `A  prompt` node, the exact
   three-line `B edit / C user-edit / D edit` ladder for `inventory.py`, NO `branch `, and that
   `test_inventory.py`, `rename_inv.py`, `low_stock`, `restock` all appear NOWHERE.
2. **list_branches_single_surviving_one_file** — `surviving  tip #a017b766`, `inventory.py`, no `rewound`,
   no `test_inventory.py`.
3. **graphFile_three_node_ladder** — `fileDAG`, the B/C/D ladder, and NO `write` node (`assert(!includes("write"))`).
4. **verbose_inventory_four_revisions_tip_byte_matches** — all of revisions 0..3 present and no revision 4;
   the four `(N lines)` counts `145, 173, 174, 191`; rev 0 has the five baseline funcs and NOT
   `reorder`/`shrink`/`low_stock`/`restock`; rev 1 adds `reorder`; rev 2 adds `# reviewed by ops` and not
   `shrink`; the tip (rev 3) adds `shrink`, keeps `# reviewed by ops`, has no `low_stock`/`restock`, and
   `stripLineNumberPrefixes(finalRevision)` equals `stripTrailingNewline(readGroundTruth("inventory.py"))`.
5. **no_history_for_test_inventory** — `--verbose` output renders no `test_inventory.py` section (and, while
   here, no `rename_inv.py` section).

Use word-boundary regex for identifier presence/absence checks (`/\bdef reorder\(/`, `/\blow_stock\b/`,
etc.) so a substring never produces a false match — mirror exactly how s41 guards `count` and `subtotal`.

### Step 4 — verify
- `npm test` → expect the prior count (536 after s41) **+5** new s42 tests, all green on first run. The runner
  is `node --import tsx` / `node:test`, NOT vitest (s38 lesson) — confirm the 5 named s42 tests are actually
  collected and run.
- `npx tsc --noEmit` → clean.
- Confirm NO `src/` file changed (`git status` shows only the new test file, the `fixtures.ts` line, and docs).

### Step 5 — docs (additive, mirror s41)
Add a concise `s42` line to `plans/roadmap.md` (after the s41 line) and a `s42` entry to
`plans/reconstruction-engine-design.md` (after the s40/s41 entries). Write
`plans/implementation-notes-impl-scenario-42.md`. Do NOT commit (the series leaves committing to the user).

## Out of scope
No engine/source change. No script-replay path is exercised (the rename is in the excluded baseline; the
mid-stream transcript is plain Edits + one user edit). Do not touch `reconstruction_*` modules or the parser.
