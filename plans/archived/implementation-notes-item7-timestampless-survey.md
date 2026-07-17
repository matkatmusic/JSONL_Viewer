# Implementation notes — Item 7 (timestampless dropped-record count): SURVEYED → DEFERRED

**Date:** 2026-06-17
**Disposition:** DEFERRED (no-silent-caps has nothing to surface; the drop is a filter, not a cap).
**Outcome:** No production code added. All four standing gates remain GREEN by construction
(`develop-baseline` unchanged at `880b69d`).

## The item as written
Roadmap §A item 7: *"Dropped-record count for timestampless records — records without timestamps
are silently dropped; emit a dropped-count (no-silent-caps)."* It was a speculative gap-closer,
added before checking whether the silent drop discards anything recoverable.

## What "timestampless" actually means in the data
Read-only survey via `ctx_execute` over the frozen fixture
`~/Programming/jot-recovery/probe-fixture-20260615/projects` (786 transcripts, 194,425 records).
**39,090 records (20.1%) have no top-level `timestamp` — and none of them are file-content evidence:**

| type | count | what it is |
|---|---|---|
| `last-prompt` | 7,549 | `{leafUuid, sessionId, type}` — session sidebar marker |
| `permission-mode` | 7,512 | `{permissionMode, sessionId, type}` |
| `custom-title` | 6,504 | `{customTitle, sessionId, type}` |
| `agent-name` | 6,234 | `{agentName, sessionId, type}` |
| `file-history-snapshot` | 4,633 | carries content, but time is **nested at `.snapshot.timestamp`** |
| `bridge-session` | 3,207 | `{bridgeSessionId, lastSequenceNum, sessionId, type}` |
| `ai-title` | 2,125 | `{aiTitle, sessionId, type}` |
| `mode` | 1,326 | `{mode, sessionId, type}` |

- **34,457** are pure session/UI metadata — no file bytes; never reconstruction evidence.
- **4,633** `file-history-snapshot` are NOT truly timestampless: **0** lack `.snapshot.timestamp`,
  and `api/snapshot-events.js:25` already reads that nested field.
- **Content-bearing records carry a timestamp 100% of the time:** assistant 46,117 (27,631 with a
  `tool_use` block) and user 32,615 (27,553 with a `tool_result` block) — **0** lack a top-level
  timestamp.

## Why this kills item 7 as framed
The 10 emission drop sites — `grep-tool-results.js:78`, `bash-read-events.js:94`,
`bash-op-events.js:33,54`, `structured-patch-events.js:51`, `file-events-extractors.js:94,125,170,188`,
`snapshot-events.js:25` — all gate on `if (!iso) return null`. The survey shows these are
**eligibility filters on ineligible records, not silent caps on viable evidence.** They fire
**zero** times on content in this fixture.

No-silent-caps is about *caps* (you found N viable items, silently used K). A filter that drops
records carrying no content/time is not a cap — counting it is like counting skipped blank lines.
A naive "records without a top-level timestamp" counter would report a misleading **20%** (88%
metadata, 12% nested-time snapshots that are actually consumed); a scoped honest counter reads a
constant **0**.

## Reopen trigger
Reopen only if a transcript appears with a **content-bearing** `tool_use`/`tool_result` (or a
snapshot) lacking a *usable* timestamp — top-level or a known nested field. The plausible cause is
a future Claude Code transcript-format change relocating the timestamp (snapshots already nest
theirs; a future `tool_result` could too).

## The recovery tool to reach for THEN (not now, not item 7)
Carry-forward inference — use the nearest preceding timestamped line's `timestamp` as the
timestampless line's time. Records are appended in ~chronological order, so this is a valid
**lower bound**. Constraints if ever built:
- The inferred event must be **Tier-2 overlay only, never a Tier-1 beacon** — you cannot anchor
  the timeline on a guessed time.
- Its time must be treated as a **window, not a point**: if a beacon falls between the preceding
  record and the event's true moment, a point-estimate places the event before the beacon when it
  truly happened after it, corrupting ordering and the conflict windows
  (`fromBeaconMs`/`toBeaconMs`).
- This is a **separate, correctness-bearing item**, not item 7's "count, don't recover" mandate.
- On current data it would assign ~34k inferred times to titles/modes and produce **0** new
  reconstruction events — zero payoff until the reopen trigger fires.

## Reproduce
Read-only; no production code path. Re-run the `ctx_execute` fixture scan (parse each line, count
records with no top-level `timestamp`, group by `type`); expect 786 transcripts / 194,425 records /
39,090 timestampless, all metadata + nested-time snapshots, 0 content records.
