# s38 Reconstruction Plan — `s38-script-rename-script-user-edit-mcp`

`reconstruction_cli` processed Scenario s38 without needing any engine
modifications. Create a single test that captures the output when the JSONL for
Scenario s38 is used as the input, that can be verified as the expected output
every time the test for that scenario is run.

## Verified (this planning session)

Ran the s38 JSONL through `reconstruction_cli --verbose` and diffed each file's
final reconstructed revision against the on-disk executed file. All three match
byte-for-byte:

| file | result |
|------|--------|
| `inventory.py` | MATCH (229 lines) |
| `tests/test_inventory.py` | MATCH (74 lines) |
| `rename_inv.py` | MATCH (47 lines) |

CLI ran clean (no parser crash) — s38 is the MCP twin of S35: the rename script
itself is user-edited (S27/S28 incomplete-beacon rescue) and the run is driven
via MCP `ctx_execute` (S32 parser fix). Both fixes are already in the worktree,
so no source change is required.

- JSONL: `scenarios/executed/s38-script-rename-script-user-edit-mcp/fa5ad942-4316-406b-95a5-65995b112970.jsonl`
- Executed output: `scenarios/executed/s38-script-rename-script-user-edit-mcp/`

## Implementation

Add one engine test (mirror an existing char-lock CLI test, e.g. the s35/s36
suite) that runs `runCli` on the s38 JSONL and snapshots the output as the
expected value. No `src/` changes.
