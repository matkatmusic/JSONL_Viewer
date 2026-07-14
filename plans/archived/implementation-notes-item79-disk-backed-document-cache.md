## 2026-07-13:19:20:00 — Item 79: disk-backed builtDocumentCache
Chat title: tackle-tasks 78,80,79,77
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/744de2b7-f578-4a78-a3d6-bddbfb44f399.jsonl

### References
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item79-disk-backed-document-cache.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260713-1826.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/src/reconstruction_document_cache.ts (new)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/reconstruction_document_cache.test.ts (new)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/src/reconstruction_script_execution.ts (item 11 precedent)

### Design decisions
- **Type-driven serialize/hydrate, not per-type hydrators.** One `tagDomainValue` replacer + one
  `reviveDomainValue` reviver in `reconstruction_document_cache.ts` handle the entire tree with three
  `instanceof` branches (Path/Uuid/Date). Justified by a full audit of every persisted field across
  `ReconstructionDocument`, `FileHistory`/`FileRevision`, `StepSnapshot`, `ConversationMessage`,
  `BranchSummary`, `LineVerdict`, `CommitMarker`, `GitOperation`, `ToolCall`, `LineEntry`/`LineValue`:
  each leaf is Path, Uuid, Date, or a JSON primitive — no Map/Set/function/cycle anywhere.
- **The replacer reads the holder (`this[key]`), not `value`.** `JSON.stringify` runs `toJSON()` before
  the replacer, so `value` is already a bare string; `this[key]` is the pre-`toJSON` object, which
  `instanceof` still identifies. Proven empirically before implementing (6-claim node repro against the
  real domain-class semantics, including `hydrated.target.equals()`).
- **Eviction by on-disk mtime** (`DOCUMENT_CACHE_CAPACITY = 4`, exported/tunable). The filesystem
  already stamps recency on write, so no in-memory recency map is kept or rebuilt on startup.
- **Opt-in lifecycle copied from item 11**: `configureDocumentCachePersistence(dir | undefined)`,
  `resetDocumentCacheOnDisk`, corrupt-file-tolerant read (log + rebuild), persistence-failure-tolerant
  write (log + continue). Only `viewer_server.ts` configures a directory.
- **`schemaVersion` tag** (currently 1): a file with a different version reads as a miss and is
  overwritten by the next rebuild (same cacheKey → same filename), so a shape change cannot deserialize
  into corruption.

### Deviations
- The handoff specced ~13 hand-written per-type hydrators and asserted "a generic tag-based replacer
  will NOT work." That claim holds only for a value-only replacer; the holder trick refutes it. Chose
  the type-driven tagger — fewer lines, and it cannot silently ship a bare string for a forgotten
  field (the exact bug the handoff wanted to prevent). **User approved this deviation explicitly.**
- The handoff said "LRU-capped"; used mtime-ordered file eviction instead (same behavior, no in-memory
  structure). **User approved.**
- No write batching (item 11 batches because it rewrites its whole memo; here each write is one file
  for one cacheKey).

### Tradeoffs
- mtime eviction is coarse: rapid same-content writes can tie on mtime, so *which* file is evicted is
  not a stable contract. The eviction test therefore asserts the file COUNT is capped, not which file
  went. Ceiling noted in a `ponytail:` comment (switch to in-memory recency if it ever matters).
- Cap 4 (~350 MB at 87 MB/file) vs the in-memory cache's 8: smaller because each disk file is the full
  document, whereas in-memory entries share structure. Exported so it is a one-line tune.

### Open questions
- None blocking. The suite was not run per instructions (user runs it). If the round-trip test surfaces
  a domain type the audit missed, that type just needs one more `instanceof` branch in
  `tagDomainValue`/`reviveDomainValue` — the design localizes any such fix to two adjacent functions.
