## 2026-07-08:01:35:00 — s40 timeline: attribute user-edit evidence steps to their evidencing session
Chat title: JFRED scenario rendering bugs: s40
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/05968ea1-68ab-422c-9298-bb35db7fa000.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/s40-timeline-session-attribution.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260708-0119.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/src/reconstruction_json.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/src/reconstruction_reseed.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/timeline-viewmodels.test.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/fixtures.ts

### Design decisions
- Fixed at the reconstruction layer (`buildStepSnapshots` call site in `reconstruction_json.ts`), not the
  webapp — as the handoff directed. Two mechanisms, empirically derived before coding:
  (1) extended `indexChangeIdsToSessionIds` to also map each record's own `uuid → sessionId` (resolves the
  `9cf3da78…` file-history-snapshot record uuid on s40 step 5); (2) added `resolveSyntheticChangeIdToSourceId`
  to strip the `originalFile:` prefix, exposing the real tool_use id (resolves s40 step 3).
- Exported `ORIGINAL_FILE_SEED_CHANGE_ID_PREFIX` from `reconstruction_reseed.ts` (its creation site) and
  imported it into the normalizer, so the literal has one canonical home (coding-requirements §3), instead
  of re-typing `"originalFile:"`.
- Verified with a throwaway probe (loadProjectRecords + the extended index) that BOTH s40 unresolved steps
  resolve to session 2 (`12136035…`, the correct one), and that s84's one and s85's three unresolved steps
  resolve to nothing even with the record-uuid index — so those scenarios (the prior session-attribution
  regression class) are provably untouched. s39 has zero unresolved steps.
- Regression test's RED signal is the agent-turn `sessionId === undefined` check (PRE: 1 → POST: 0). The
  contiguity test counts session-key runs vs distinct keys (PRE: 4 vs 3 → POST: 2 vs 2), which captures both
  the double-header and the split rail at the view-model layer.

### Deviations
- Chose the index+normalize approach over the handoff's *primary* suggestion (thread `sessionId` through the
  synthetic-changeId creation in `reconstruction_reseed.ts`/`reconstruction_extract.ts`). Same approved scope
  ("extending its call site in buildStepSnapshots"), smaller diff, and it does not touch the reseed/extract
  revision plumbing that caused the earlier s85 regression.
- Did NOT add `<blob>@vN` changeId normalization — no observed step needs it (the `@v2` base is a blob hash,
  never a record uuid; its sibling record-uuid changeId already resolves the step). YAGNI.

### Tradeoffs
- The record-uuid index is a broad key set (every record uuid), but the namespaces are disjoint from tool_use
  ids and record uuids are globally unique, so no currently-resolved step changes attribution. Confirmed by the
  full suite (493/493) and by the s84/s85 probe.

### Open questions
- None blocking. Two follow-ups noted in the plan as out-of-scope and left untouched: (1) commit `6b5a71a`'s CSS
  that hides the now-defunct `(unattributed)` lane header is dead but not removed (no file deletion, user rule);
  (2) `/api/document` emits its per-line progress walk twice per request — separate cosmetic issue, unrequested.

### Verification
- `npx tsx --test tests/timeline-viewmodels.test.ts` → 32/32 (30 prior + 2 new).
- `npm test` → 493/493, 0 fail (s84/s85/s39 intact).
- `npx tsc --noEmit` → clean. No `webapp/views/timeline.js` change required.
