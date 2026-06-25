# Plan: Scenario s39 (`s39-git-baseline-seed`) — CHAR-LOCK, no engine change

`reconstruction_cli` processed Scenario s39 without needing any engine modifications.
Create a test that captures the output when the s39 JSONL is used as the input, that
can be verified as the expected output every time the test runs.

## Why no engine change (probe result)

The s39 JSONL is **only the post-respawn agent's session**. The scenario does
`EndCurrentAgentAndSpawnNewAgent --excludeJSONL`, which keeps the FIRST agent's
session (the `git init` + writing `orders.py` and `tests/test_orders.py` + commit
"baseline" + branch `feature`) OUT of this transcript. So the transcript contains
exactly: one user prompt ("Edit orders.py, add count()"), one `Read`, one `Edit`
of `orders.py`, then "Thanks".

Engine output (byte-verified live against `scenarios/executed/s39-git-baseline-seed/`):
- **`orders.py`** — 2 revisions on one surviving branch (tip `#d8c61657`):
  - rev 0: 29-line baseline (`total`/`names`, NO `count`) — seeded purely from the
    Edit's `toolUseResult.originalFile` (there is NO Write event in this transcript).
  - rev 1 (tip): 41-line, adds documented `count(items)` — **BYTE-IDENTICAL** to
    on-disk `orders.py`.
- **`tests/test_orders.py`** — correctly NOT reconstructed (0 histories). It was
  written in the excluded baseline session, never touched in this transcript.
- No git Bash commands and no spawn markers appear in the JSONL; the respawn is
  invisible to the engine. No rewound branches.

This is the characterization worth locking: a transcript that opens MID-STREAM with
an Edit, where the engine seeds rev 0 from `originalFile` alone (no Write seen) and
produces a byte-perfect tip — and does NOT invent histories for files absent from
the transcript.

## Implementation

No source change. Add tests only. Baseline is 511 green (full suite, TypeScript clean).

1. **Fixture** — add `S39_JSONL` to `tests/fixtures.ts`, pointing at the local copy
   `scenarios/executed/s39-git-baseline-seed/356cbd5e-009f-457d-9c05-d56aa944b25c.jsonl`
   (mirror how `S37_JSONL`/`S38_JSONL` are defined).

2. **CLI test** — `tests/reconstruction_cli_s39.test.ts`, modeled on the s37/s38 CLI
   tests but scaled to ONE file. Per the s33 lesson, **capture live `runCli` output
   first** and lock exact strings from it rather than guessing. Assert the invariants:
   - default view prints `conversationDAG` + `fileDAG`, single surviving branch (no
     rewind/branch header), the lone prompt turn, and an `orders.py` Edit turn.
   - `--verbose` for `orders.py`: exactly 2 revisions; rev 0 has `total`/`names` and
     NO `count`; the FINAL revision contains documented `count(items)` and, after
     stripping the `  N | ` line-number prefixes, BYTE-MATCHES on-disk
     `scenarios/executed/s39-git-baseline-seed/orders.py`.
   - the output contains NO history/section for `tests/test_orders.py`.

3. **Engine test** (optional, to match the per-scenario convention) —
   `tests/reconstruction_engine_s39.test.ts` asserting the same via the engine API
   (`reconstructBranches`): one surviving branch, one file history (`orders.py`) with
   a 2-revision ladder, rev 0 seeded from `originalFile`, tip byte-equal to on-disk;
   and that no history exists for `tests/test_orders.py`. Keep it minimal — the
   characterization is small; do not over-build.

4. Run full suite + `tsc --noEmit`; confirm green. Update
   `plans/reconstruction-engine-design.md` with the s39 entry (mid-stream
   originalFile-seed char-lock) if that doc tracks each scenario.

## Hazards / notes

- Verbose output carries `  N | ` line-number prefixes — strip before byte-comparing.
- Do NOT pass a file-history sidecar root expecting `tests/test_orders.py` to appear:
  it has no event in this transcript, so the sidecar can't surface it either, and
  inventing it would be wrong for this input.
- The engine keys `orders.py` under its absolute temp path
  (`…/run-scenario.n06bs921/orders.py`); match on the `/orders.py` suffix, not the
  full path (as the existing CLI tests do).
