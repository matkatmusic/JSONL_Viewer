# s40 (`s40-git-baseline-user-edits`) — reconstruction plan

**CHAR-LOCK. No engine changes required.**

`reconstruction_cli` processed Scenario s40 without needing any engine modifications.
Create a single test (mirroring the s39 CLI test) that captures the output when the
s40 JSONL is used as input, verifiable as the expected output every time the test runs.

## What s40 is

s40 = s39 (`git-baseline-seed`) **+ two interleaved USER edits** on `orders.py`. The
`--excludeJSONL` respawn again drops the baseline session, so the transcript opens
mid-stream with the post-respawn agent only. Four nodes on `orders.py`, linear, one
surviving branch:

```
A  prompt  #e84ca6bc
  B  edit       orders.py  #0112WZX4   (Claude adds count)
  C  user-edit  orders.py  #9a3cae75   (append `# reviewed by ops`)
  D  edit       orders.py  #017v7Ebf   (Claude adds subtotal, inserted before count)
  E  user-edit  orders.py  #450a2098   (append `# checked`)
```

Like s39 the git-baseline family is **reader-DEPENDENT** — `runCli` builds the real
sidecar reader internally, so the CLI test needs no special wiring (just call
`runCli([S40_JSONL, ...])`, exactly like the s39 CLI test).

## Locked literals (captured live from `runCli`, 2026-06-24)

- `--list-branches`: `surviving  tip #86c30c1a    orders.py`; NO `rewound`, NO `test_orders.py`.
- `--graphFile` / default fileDAG: the 4-node ladder above (B edit, C user-edit, D edit, E user-edit).
- `--verbose` renders ONE `### …/orders.py` section, **7 rendered revisions (0..6)** with line
  counts `28, 40, 9, 41, 54, 9, 55`:
  - rev 1 (40) = after B (count); rev 3 (41) = after C (`# reviewed by ops`);
    rev 4 (54) = after D (subtotal); rev 6 (55) = tip, after E (`# checked`).
  - **rev 2 and rev 5 are the 9-line user-edit partial-echo snapshots** (the tail window
    ending in the appended comment) — expected, not a defect. Same value-snapshot rendering
    s39 documented for its single edit.
  - **Tip (rev 6, 55 lines) byte-matches the rendered on-disk `orders.py`** after stripping
    the `  N | ` line-number prefixes and the single trailing newline (verified).
- `tests/test_orders.py` has no event here (written in the excluded baseline session) →
  must appear NOWHERE, exactly as s39.

## Implementation (for the next agent)

1. Add `S40_JSONL` to `tests/fixtures.ts` pointing at the LOCAL worktree executed copy
   `scenarios/executed/s40-git-baseline-user-edits/e2fee02a-29c1-4710-9146-8d8055e7fe94.jsonl`
   (same local-copy convention s39 used so the byte-compare reads the `orders.py` beside it).
2. Add `tests/reconstruction_cli_s40.test.ts` modeled on `tests/reconstruction_cli_s39.test.ts`:
   - default DAG: the 4-node ladder + prompt `#e84ca6bc`; assert linear (no `branch `), no `test_orders.py`.
   - `--list-branches`: `surviving  tip #86c30c1a`, one file `orders.py`, no `rewound`/`test_orders.py`.
   - `--graphFile`: the 4 nodes, in order.
   - `--verbose`: the 7-revision ladder; tip (rev 6, 55 lines) byte-matches on-disk `orders.py`
     using the same `fileVerboseBlock` / `finalRevisionSlice` / `stripLineNumberPrefixes` /
     `stripTrailingNewline` helpers from the s39 test; assert rev 3 carries `# reviewed by ops`
     and NOT `# checked`; lock the two 9-line partial-echo revisions.
   - assert no `tests/test_orders.py` section anywhere.
3. (Optional, matching s39) an engine test under `tests/reconstruction_engine_s40.test.ts`
   only if the implementer wants the structural/reader-dependence lock; the CLI test alone
   satisfies the characterization. Re-capture exact literals live before writing asserts
   (S33 lesson) — do not trust these from memory.
4. Verify: `node --import tsx --test tests/*.test.ts` all green; `npx tsc --noEmit` clean.
   Append the s40 entry to `plans/reconstruction-engine-design.md` and notes to
   `plans/implementation-notes-api-from-scenarios.md`. Do NOT commit (user commits).
