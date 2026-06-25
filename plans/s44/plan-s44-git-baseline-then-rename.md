# Plan: Scenario s44 (`s44-git-baseline-then-rename`) — CHAR-LOCK regression test

## Verdict

`reconstruction_cli` processed Scenario s44 without needing any engine modifications. Create a
single test that captures the output when the JSONL for Scenario s44 is used as the input, that can
be verified as the expected output every time the test for that scenario is run.

**NO source change.** This is a characterization-lock test only.

## What s44 is

`git-baseline` family again, but the rename runs **mid-stream** (vs s42/s43 where the rename lived in
the excluded baseline). Steps 1-4 (write `inventory.py` terse-named + `tests/test_inventory.py`, add
`low_stock`, `git commit "baseline"`) are dropped by `--excludeJSONL`. The mid-stream transcript then
contains:

- **`rename_inv.py`** — Write (one rename tuple `qty_chk→check_quantity`) + 2 USER edits adding
  `add_item→insert_item` and `rm_item→remove_item`. Reconstructed: rev0/1/2 ladder, **tip = 38 lines**.
- MCP-sandbox run of `rename_inv.py` (`ctx_execute`) applies the 3 whole-word renames to `inventory.py`
  and its test file. **Leaves no `inventory.py` DAG node** — its effect surfaces only through the
  file-history backup that seeds rev0.
- **`inventory.py`** — 4 events: `restock` (Edit), `reorder` (Edit), `# reviewed by ops` (USER edit),
  `shrink` (Edit). Reconstructed: rev0-4 ladder, **tip = 264 lines**.

## Probe result (engine already correct, post-s43 engine, no src change)

`node --import tsx src/reconstruction_cli.ts <s44.jsonl> --verbose`:

- `inventory.py` tip (rev4, 264 lines) — **byte-identical** to on-disk. rev0 (175 lines) already carries
  the **post-rename** names (14 new-name lines, 0 old) — backup-seeded after the MCP rename ran, so the
  renamed identifiers + `low_stock` appear with no rename replay. `restock`/`reorder`/`shrink` apply on
  top using the renamed names. **Reader-DEPENDENT** (rev0 needs the file-history backup), same as s42/s43.
- `rename_inv.py` tip (rev2, 38 lines) — **byte-identical** to on-disk.
- `tests/test_inventory.py` — **NOT reconstructed** (no mid-stream event; only renamed by the script,
  never separately edited). Same as s39/s42/s43. Assert its absence.

DAG (`conversationDAG` / `fileDAG`): `rename_inv.py` [write, user-edit] ; `inventory.py` [edit, edit,
user-edit, edit]. No node for the MCP rename, no node for the test file.

## Implementation (clone the established CHAR-LOCK test)

1. **`tests/fixtures.ts`** — add `S44_JSONL` after `S43_JSONL` (line ~177), pointing at the LOCAL copy:
   `scenarios/executed/s44-git-baseline-then-rename/56f60db2-0bf0-4685-99dd-ef8f65685245.jsonl`. Include
   a comment block mirroring the s43 entry, noting the mid-stream-rename distinction above.
2. **`tests/reconstruction_cli_s44.test.ts`** — clone `tests/reconstruction_cli_s43.test.ts`. Reuse its
   helpers (`fileVerboseBlock`, `finalRevisionSlice`, `stripLineNumberPrefixes`, etc.). Assertions:
   - `inventory.py` final-revision tip byte-matches on-disk `inventory.py` (cross-source check).
   - `rename_inv.py` final-revision tip byte-matches on-disk `rename_inv.py`. **(s44-specific — s43 has
     no mid-stream `rename_inv.py`, so this assertion is new.)**
   - `tests/test_inventory.py` is absent from the reconstruction output.
   - Optionally assert the rev ladder shape (inventory.py 5 revs, rename_inv.py 3 revs).
   `S44_GT` = `scenarios/executed/s44-git-baseline-then-rename`.
3. Run `npm test` (runner is `node --test`, NOT vitest). Capture live `runCli` output before finalizing
   assertions. Expect green; record new total.

## Out of scope

No `src/` change. Do not commit (pipeline convention — nothing committed across the s39+ family).
