# Plan: Scenario s41 (`s41-git-baseline-mid-commit`) — CHAR-LOCK, no engine change

`reconstruction_cli` processed Scenario s41 without needing any engine modifications. Create a single
characterization test that captures the `runCli` output for the s41 JSONL as the expected output, verified
on every run. **Tests only — NO source change.**

## What s41 is

Third scenario in the `git-baseline` family. s41 = s40 + a **mid-stream `git commit "wip"`** between the two
interleaved USER edits on `orders.py`. After the `--excludeJSONL` respawn the second agent: adds `count(items)`
(Claude Edit), the user appends `# reviewed by ops`, runs `git add`/`git commit -m wip` (separate Bash
commands), the user appends `# checked`, then says "Thanks" and exits.

## Probe result (engine already correct — verified live)

- Reconstructs **only `orders.py`** (no `tests/test_orders.py` — it was written in the excluded baseline
  session, no event in this transcript; consistent with s39/s40).
- Revision ladder for `orders.py`: `originalFile` seed (total/names) → `count` added → user-edit partial echo
  → **tip = 43 lines** (`count`, `# reviewed by ops`, `# checked`).
- **Tip is byte-identical** to the on-disk ground-truth `orders.py` beside the JSONL (modulo the single
  trailing newline the engine drops at replay).
- The mid-stream **`git commit` is INERT** — `git add`/`status`/`commit`/`log` Bash records produce no file
  events; the engine ignores them cleanly (no crash, no spurious node). fileDAG = 2 nodes (Claude edit +
  user edit), same as s40 minus the subtotal node.
- **reader-DEPENDENT** (load-bearing): correct reconstruction needs the file-history `BackupReader`
  (`46a5ebd9eadf2d8b@v1/v2/v3`). User edit #1 is only a 9-line truncated `edited_text_file` echo in-JSONL and
  user edit #2 (`# checked`) appears **nowhere in the JSONL** — `@v3` supplies the `# checked` tip. Without
  the reader the ladder degrades to 2 short revisions and the tip never materializes. `runCli` auto-wires the
  reader from the session id + `~/.claude/file-history`; no flag needed (same as s40).
- **`subtotal` discrepancy resolved:** scenario step 5 ("add `subtotal`") **never executed** — session ends
  with "Thanks." + exit, no `subtotal` Edit in the JSONL or any backup. Engine correctly does NOT invent one,
  matching the on-disk file. (Contrast s40, whose JSONL DID contain a subtotal Edit → 55-line tip.)

## Implementation (mirror the s40 CLI test exactly)

1. Add `S41_JSONL` to `tests/fixtures.ts` pointing at the local executed-dir copy:
   `scenarios/executed/s41-git-baseline-mid-commit/6d01aabb-79c5-4ca9-88b9-7834a050bf6d.jsonl`
2. Create `tests/reconstruction_cli_s41.test.ts` cloned from `tests/reconstruction_cli_s40.test.ts`
   (same helpers: `fileVerboseBlock` / `finalRevisionSlice` / `revisionSlice` / `stripLineNumberPrefixes` /
   `stripTrailingNewline`). Ground-truth dir = `scenarios/executed/s41-git-baseline-mid-commit`.
   Lock at minimum: the `orders.py` tip is byte-identical to the rendered on-disk `orders.py`, and assert
   `tests/test_orders.py` is **absent** from the output.
3. **Capture the exact `runCli` strings live before writing assertions** (lesson from s33/s38) — run
   `runCli([S41_JSONL, "--verbose"])` and copy real line counts / revision numbers; do not hand-write them.
4. Runner is **`node --import tsx` via `npm test` (node:test), NOT vitest** — verify the new test is actually
   collected (a vitest-style file collects 0 tests). Expect full suite to go from **531 → ~533** green.
5. Update `plans/roadmap.md` and `plans/reconstruction-engine-design.md` with the s41 entry (follow the s40
   entry format).
