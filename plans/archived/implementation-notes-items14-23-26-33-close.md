## 2026-07-08:11:55:00 — Close TASKS.md items 33, 26, 23, 14
Chat title: tackle-tasks 26, 23, 33, 14
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/3b784259-7992-45a8-a442-eca9650f1389.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/items14-23-26-33-close.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/handoff-develop-20260704-2232.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-implement-clickable-jsonl-lines.md

### Design decisions

- Item 14 "build the corpus" implemented as ONE cache-state home (`src/reconstruction_corpus.ts`),
  NOT the handoff-2232 `historiesFor(...)` method facade — the facade shape would be a
  forwarding layer, which the user has standing instructions against. Public functions keep
  their homes and signatures; only the five identity-keyed WeakMaps move.
- Item 23 endpoint reads the OWNER session dir only (no cross-session fallback) — owner-keyed
  reads are the s56/s59/s64 collision fix; probing other dirs would reintroduce wrong-content
  risk.
- Item 26 pins assertions from a live capture of the two-session s41 document (s33 lesson),
  not from the scenario script.

### Deviations

- Phase 4: `getDerivedCaches` uses nested single-condition `if`s instead of a compound
  `||` validity check — house single-condition-branching rule (matches the style the old
  `getLineageSeedCache` used).
- Phase 4: the memo tests duplicate a local `buildToolRecord` (mirroring
  `tests/reconstruction_script_stage.test.ts:19`) rather than extracting to
  `tests/utilities.ts` — extraction would have crossed into files owned by the parallel
  phase-3 work; fold together later if wanted.
- Phase 4: the now-dead `isImpureExecutionAllowed` import in `reconstruction_branches.ts`
  was commented out with the item-14 marker (the gate check moved into the corpus) — not
  listed in the plan's edit list.
- Phase 2: capture script needed file-URL absolute imports (tsx resolves relative
  specifiers against the script's own dir, and the scratchpad lives outside the repo).
- Phase 3: `src/reconstruction_sidecar_reader.ts` untouched — `getDefaultFileHistoryRoot`
  was already exported.
- Phase 3: snapshot token handling extracted into an `appendSnapshotToken` helper instead
  of inline in the token loop; drawer close button labeled "Close"; presence-probe failures
  leave presence unknown (plain token, the spec's unknown state); snapshot content is
  re-fetched per open (the spec's allowed simpler option — only presence is cached).

### Tradeoffs

- Item 23 presence data is fetched per shown record and cached client-side, with one
  re-render when fetches settle — chosen over shipping existence in the document (document
  stays disk-independent) and over per-click checks (the "(missing from disk)" suffix must
  render at display time).

### Open questions

- Phase 3 CSS: the 50/50 split uses `max-height: 50%` on `.inspector-json` /
  `.snapshot-pane` inside the scrollable `.inspector-content` column, per the plan's CSS as
  written. If the visual split looks off in the browser, `.inspector-content` may want
  `display: flex; flex-direction: column` — eyeball on s43 line 126 and say the word.
- Phase 3: the `[View in File History]` button renders inline inside the JSON `<pre>` after
  the link; it inherits pre whitespace context. No dedicated button CSS was added — flag if
  it needs styling.
- Phase 4: two of the four new memo tests (branch-selections-survive-flip, reader-identity)
  pass against the pre-corpus code too — they pin the validity split rather than go RED;
  only the exec-gate execution-memo test is truly RED against the old code.
