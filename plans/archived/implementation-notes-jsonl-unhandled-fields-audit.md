## 2026-07-07:18:19:21 — TASKS.md #4: coverage for unhandled JSON fields in real JSONLs
Chat title: plan 'JSONL unhandled fields audit'
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/2d892ad7-44b1-48be-9af5-9892b7149cdb.jsonl

### References

/Users/matkatmusicllc/.claude/plans/plan-for-item-4-velvety-scone.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260705-1334.md

### Design decisions

- Corpus audited per user direction: `~/Programming/jot-recovery/claude-data/projects/`
  (1,472 .jsonl / ~459k lines), NOT `~/.claude/projects` — TASKS.md #4's original wording
  predates that instruction. The `jotVerifySequence` symlink into `~/.claude/projects` is
  excluded (the script skips all symlinks).
- Coverage form (user-approved): allowlist + tests only, no new executed scenarios —
  the `custom-title`/`agent-name` precedent. Empirically forced anyway: several fields are
  version-transient (`sessionKind` CC 2.1.154/173, `preventContinuation` 2.1.181–197,
  `retry*`/`cause` ≤2.1.179) and cannot be recaptured; others need unscriptable conditions
  (API failures, Esc-interrupts, permission denials).
- Fields added per-type only where observed (fog-of-war), not to `ENVELOPE_KEYS` — that
  list mirrors the `EnvelopeBase` TYPE and must not gain fields the type doesn't declare.
  `session_id`/`sessionKind` (observed on all four conversational types) share one
  `OBSERVED_SESSION_METADATA_KEYS` group in `loadTranscript.ts`.
- `fork-context-ref` gets no `session-meta.ts` typed view — nothing consumes it; it only
  needs to pass the gate. Its allow-set is built from `["type"]`, not `META_KEYS`, because
  it carries `agentId` instead of `sessionId`.
- Synthetic records (user decision 2026-07-07): records stamped
  `version: "0.0.0-reconstructed"` (jot-recovery's own reconstruction output carrying
  tool-invented `reconstructed`/`timestampEstimated`) are NOT allowlisted; the audit
  script skips them via the exported `SYNTHETIC_RECONSTRUCTED_VERSION` sentinel so
  zero-findings stays a clean drift signal.
- Evidence file:line for all 28 fields lives as comments on
  `OBSERVED_REAL_SESSION_FIELD_SAMPLES` in `tests/loadTranscript.test.ts`, not in the
  source allowlist — the source cites the audit date and groups by cause.

### Deviations

- None from the approved plan. All six touched files staged; nothing else staged
  (`webapp/views/file-history.js` was already modified by another session and left alone).
- Subagents were not used for implementation: the red→green phases edit the same two
  files serially and the script depends on an export added in the green phase — no
  profitable parallelism.

### Tradeoffs

- The audit script re-implements the line walk (JSON.parse per line) instead of calling
  `loadTranscript`: the loader throws on the first unknown record type and console.logs
  per file, both wrong for a batch auditor. It still imports `ALLOWED_TOP_LEVEL_KEYS` and
  the newly-exported `findUnmodeledTopLevelKeys` as the single source of the gate.
- Gate tests use minimal synthetic lines (type + one field) rather than full real
  records: `parseTranscriptLine` validates presence against the allow-set, so a subset
  record exercises exactly the gate; full records would just be noise.

### Open questions

- **s85 coverage regression is live (pre-existing, NOT from this change):**
  `check_scenario_coverage.ts` reports 84/85; s85 fails steps 4–10
  ("core_two.py @line 7: expected '# reviewed by ops' got ''", provenance
  `injectScriptExecutions … no user-edit beacon`). Verified by stashing this session's
  src changes: still 0/1 at clean HEAD `27d29ec`. Last known 85/85 was 2026-07-04; engine
  commits `4a8c675`/`de15df8` (gitOperations) landed since, and the s85 temp cwd
  (`/private/var/folders/…/run-scenario.o1fs4eqs`) still EXISTS — so this may be a new
  regression from the gitOperations work rather than TASKS.md #15's temp-cleanup mode.
  Needs its own investigation; TASKS.md #15 is the adjacent known bug.
- TASKS.md #4 checkbox not ticked — left for you to mark after reviewing/committing.
