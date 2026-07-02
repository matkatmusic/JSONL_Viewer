# Scenario s43 (`s43-git-baseline-uncommitted-module`) — reconstruction plan

`reconstruction_cli` processed Scenario s43 without needing any engine
modifications. Create a single test that captures the output when the JSONL for
Scenario s43 is used as the input, that can be verified as the expected output
every time the test for that scenario is run.

## Classification: CHAR-LOCK (no engine change)

s43 is the `git-baseline` family again, structurally a twin of s42. The baseline
session (write `inventory.py` with terse names + `tests/test_inventory.py`, add
`low_stock`, write `rename_inv.py` with three renames
`qty_chk→check_quantity` / `add_item→insert_item` / `rm_item→remove_item`, run it
through the **MCP `ctx_execute` sandbox** to apply the renames, add `restock`,
then `git init` / `git commit "baseline"`) is dropped by `--excludeJSONL`.

The recorded JSONL therefore opens **mid-stream** with three `inventory.py`
events only:
1. Claude edit — adds `reorder` (rev1)
2. user edit — appends `# reviewed by ops` (rev2)
3. Claude edit — adds `shrink` (rev3)

rev0 is seeded from the file-history backup left by the excluded baseline, which
already carries the post-rename names — which is why `check_quantity` /
`insert_item` / `remove_item` appear with no rename replay in this transcript.

The s43-specific twist — the baseline leaves `inventory.py` **untracked** in git
(only `rename_inv.py` and `tests/` are staged/committed) — is a **no-op for
reconstruction**: git state never enters the JSONL, and the file-history backup
is written regardless of tracking. `rename_inv.py` and `tests/test_inventory.py`
came from the excluded baseline (no events in this transcript) and are **not**
reconstructed, exactly as in s39–s42.

## Verification already performed

```
node --import tsx src/reconstruction_cli.ts \
  scenarios/executed/s43-git-baseline-uncommitted-module/bc144725-0013-4991-8994-4ee99efab8f4.jsonl --verbose
```

- Single reconstructed file: `inventory.py`.
- Rev ladder: rev0 **193** → rev1 **232** → rev2 **233** → rev3 **255** lines (clean, monotonic).
- Tip (rev3, 255 lines) is **byte-identical** to the rendered on-disk
  `scenarios/executed/s43-git-baseline-uncommitted-module/inventory.py`
  (diff empty, modulo the single trailing-newline the renderer drops at replay).

## Implementation (test only — mirror s42)

1. Add `S43_JSONL` to `tests/fixtures.ts` pointing at
   `scenarios/executed/s43-git-baseline-uncommitted-module/bc144725-0013-4991-8994-4ee99efab8f4.jsonl`
   (carry a short comment in the same style as the `S42_JSONL` block).
2. Clone `tests/reconstruction_cli_s42.test.ts` → `tests/reconstruction_cli_s43.test.ts`.
   Swap the fixture to `S43_JSONL`, the ground-truth dir to
   `scenarios/executed/s43-git-baseline-uncommitted-module`, and update the
   per-revision line counts (193 / 232 / 233 / 255) and the comments to match s43.
   The helper functions (`fileVerboseBlock`, `finalRevisionSlice`, `revisionSlice`,
   `stripLineNumberPrefixes`, `stripTrailingNewline`) carry over verbatim.
3. Assert the tip byte-matches the rendered on-disk `inventory.py`, and assert each
   intermediate revision's line count, as s42 does.
4. Run `npm test` (runner is `node --test`, **not** vitest) — expect full suite green.
5. NO engine/`src` changes. Append the s43 entry to
   `plans/reconstruction-engine-design.md` and `plans/implementation-notes-api-from-scenarios.md`.
