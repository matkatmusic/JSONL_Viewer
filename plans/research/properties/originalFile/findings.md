# Property: `toolUseResult.originalFile` — when is it populated?

**Date:** 2026-06-16
**Scope:** every `.jsonl` under `projects/`, recursive (1808 files).
**Tool:** [`scan.js`](./scan.js) — run `node scan.js <projects-dir>` to reproduce.

> Note: `projects/` includes the **live transcript of the session that produced
> this report**, so counts drift by a handful (each Write/Edit this session logs
> a new edit/write record). The snapshot below is the canonical run; the
> percentages and every conclusion are stable under that drift.

## Method (as specified)

1. Find candidate lines by a LITERAL substring match — no JSON-tree walk to
   locate the property:
   - `"originalFile":"` → originalFile present as a STRING (empty or non-empty).
   - `"structuredPatch"` → an Edit/Write tool-result (the universe where
     originalFile is relevant; this marker also catches the `null` cases the
     first marker cannot see).
2. Parse ONLY the matched lines; read `toolUseResult.originalFile`.
3. Classify each as nonEmpty / empty / null / absent, and classify the record
   kind from the `toolUseResult` shape (`type: create|update` → Write; presence
   of `oldString`/`newString` → Edit).
4. Cross-tabulate kind × version × originalFile-state.

**Consistency check:** the 1861 literal `"originalFile":"` matches equal exactly
the nonEmpty+empty totals below (1674 Edit + 187 Write(update) = 1861). The
`null` rows were found via the `structuredPatch` marker. `originalFile` is
ALWAYS present as a key on these records (absent = 0 everywhere) — it is either a
string or `null`, never missing. The location is `toolUseResult.originalFile` in
100% of candidates (no stray locations).

## Headline answer: NO — `originalFile` is not populated every time

Across **4885** Edit/Write records, only **1858 (38.0%)** carry a non-empty
`originalFile`. **3024 (61.9%)** are `null`. The meaningful "not usable" state is
`null`, not empty-string (only 3 empty-string records exist in the entire set).

## Table A — by record kind

| kind | nonEmpty | empty | null | absent | total | % usable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Edit | 1671 | 3 | 1992 | 0 | 3666 | **45.6%** |
| Write(create) | 0 | 0 | 983 | 0 | 983 | **0.0%** |
| Write(update) | 187 | 0 | 49 | 0 | 236 | **79.2%** |

- **Write(create): always `null`** (0/983). Correct by definition — a freshly
  created file has no pre-edit content. Never expect originalFile here.
- **Edit: only 45.6% usable.** The majority (1992/3666 = 54%) are `null`.
- **Write(update): 79.2% usable**, but 49 nulls — still not guaranteed.

## Table B — by version (Edit/Write universe)

`% usable` (= % nonEmpty) fluctuates **9.1% – 78.3%** with **no monotonic trend**.
Newer versions are not more reliable than older ones; even the latest
(2.1.177 = 45%, 2.1.178 = 51%) are far from guaranteed.

| version | nonEmpty | empty | null | total | % usable |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2.1.119 | 1 | 0 | 4 | 5 | 20.0% |
| 2.1.140 | 5 | 0 | 7 | 12 | 41.7% |
| 2.1.143 | 136 | 1 | 130 | 267 | 50.9% |
| 2.1.144 | 44 | 0 | 41 | 85 | 51.8% |
| 2.1.145 | 36 | 0 | 22 | 58 | 62.1% |
| 2.1.146 | 85 | 0 | 99 | 184 | 46.2% |
| 2.1.147 | 23 | 0 | 12 | 35 | 65.7% |
| 2.1.148 | 44 | 2 | 91 | 137 | 32.1% |
| 2.1.149 | 18 | 0 | 5 | 23 | 78.3% |
| 2.1.150 | 122 | 0 | 105 | 227 | 53.7% |
| 2.1.152 | 17 | 0 | 53 | 70 | 24.3% |
| 2.1.153 | 11 | 0 | 29 | 40 | 27.5% |
| 2.1.154 | 6 | 0 | 60 | 66 | 9.1% |
| 2.1.156 | 105 | 0 | 323 | 428 | 24.5% |
| 2.1.157 | 23 | 0 | 23 | 46 | 50.0% |
| 2.1.158 | 115 | 0 | 314 | 429 | 26.8% |
| 2.1.159 | 1 | 0 | 1 | 2 | 50.0% |
| 2.1.160 | 56 | 0 | 166 | 222 | 25.2% |
| 2.1.161 | 107 | 0 | 218 | 325 | 32.9% |
| 2.1.162 | 143 | 0 | 266 | 409 | 35.0% |
| 2.1.163 | 64 | 0 | 111 | 175 | 36.6% |
| 2.1.165 | 67 | 0 | 123 | 190 | 35.3% |
| 2.1.166 | 8 | 0 | 39 | 47 | 17.0% |
| 2.1.167 | 30 | 0 | 29 | 59 | 50.8% |
| 2.1.168 | 110 | 0 | 74 | 184 | 59.8% |
| 2.1.170 | 21 | 0 | 109 | 130 | 16.2% |
| 2.1.172 | 56 | 0 | 56 | 112 | 50.0% |
| 2.1.173 | 14 | 0 | 47 | 61 | 23.0% |
| 2.1.174 | 12 | 0 | 18 | 30 | 40.0% |
| 2.1.175 | 18 | 0 | 15 | 33 | 54.5% |
| 2.1.176 | 30 | 0 | 65 | 95 | 31.6% |
| 2.1.177 | 217 | 0 | 262 | 479 | 45.3% |
| 2.1.178 | 113 | 0 | 107 | 220 | 51.4% |

## Table C — kind × version (the cross-reference)

Full 96-row matrix is emitted by `scan.js`; the load-bearing patterns:
- **Write(create) is 0% usable at EVERY version** (always null).
- **Edit usable% per version ranges 7.1% – 100%** with no version trend. The only
  100% Edit rows are low-sample (2.1.159 n=1) or the single anomaly **2.1.163
  (62/62)** — whose immediate neighbours (2.1.162 = 57.9%, 2.1.165 = 39.8%) are
  not, so it is not a version property.
- **Write(update) usable% per version ranges 0% – 100%**, mostly high but with
  null-only versions (2.1.167, 2.1.173, 2.1.178) — also not version-stable.

## Definitive statement of truth — when can we trust `originalFile`?

1. **Never trust it by version.** No version guarantees it; population fluctuates
   non-monotonically across the entire 2.1.119–2.1.178 range. Version is not a
   usable predictor.
2. **By record kind:**
   - `Write(create)` → originalFile is **always `null`**. Never a source.
   - `Edit` → usable **~46%** of the time; `null` the majority of the time.
   - `Write(update)` → usable **~79%**, still not guaranteed.
3. **The only safe rule is runtime, per-record:** treat `originalFile` as usable
   **iff `toolUseResult.originalFile` is a non-empty string**; otherwise (null on
   62% of all edit/write records) fall back to other evidence. The sidecar's
   item-1 emission already guards exactly this (`typeof edit.originalFile !==
   'string'` / `=== ''` → no event), so it is correct — it just fires on a
   minority of edits.
4. **Implication for the roadmap:** because `originalFile` is `null` on the
   majority of Edits, the per-edit fallback evidence — item 3 (`patchContext`,
   the structuredPatch context lines) and the edit splice itself — carries the
   load on exactly those records. Item 3's zero marginal payoff on
   plate_summary.py was a property of that one file (every edit there had
   originalFile); it is NOT representative of the wider data.

## Open follow-ups (not yet measured)

- The non-monotonic fluctuation suggests population is **situational, not
  versioned** — most likely a file-size / content-length threshold (Claude Code
  omitting originalFile for large files to bound transcript size) or first-touch
  vs re-edit. A follow-up scan correlating `ofState` with `newString`/file length
  would confirm the trigger.
- Of the null-`originalFile` Edits, how many have `structuredPatch` hunks WITH
  context lines (i.e. where item 3 actually recovers something) vs pure
  insertions.
