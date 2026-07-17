# Handoff: Fix s40 timeline bugs — unattributed user-edit steps split session 2's lane
Conversation name: JFRED scenario rendering bugs: s40
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/05968ea1-68ab-422c-9298-bb35db7fa000.jsonl
Plan file: (none — diagnosis lives in this handoff)

## Branch
`develop` (no parent branch in play; tree has no modified tracked files, only untracked)

## Goal
Fix two rendering bugs on `http://127.0.0.1:7343/#/project/s40-git-baseline-user-edits/timeline`: (1) the 2nd JSONL's session header renders twice, reading as "loaded twice"; (2) the 2nd session's rail (node line) has gaps. Both have ONE root cause, fully diagnosed this session — the fix was explicitly deferred by the user ("Do not fix, just find the cause"), and has now been approved for handoff.

## Current State
Diagnosis complete and verified against the live server; NO code changes made. The chain:

1. s40 has two out-of-band user edits to `orders.py` (scenario steps 4 and 6 append `# reviewed by ops` and `# checked` between agent turns).
2. The reconstruction detects them and manufactures evidence revisions with synthetic changeIds (`originalFile:toolu_01CRtnU7HvFipMPUFAdnqnXQ`, `9cf3da78-7705-4f7f-9d68-0a79d6d7c642`, `e4f98d0309ff4caa@v2`).
3. `src/reconstruction_json.ts:171` (`buildStepSnapshots`) attributes a step's `sessionId` ONLY by looking its changeIds up in `tool_use` blocks (`indexChangeIdsToSessionIds`, line 118). Synthetic changeIds appear in no `tool_use` block → both evidence steps get `sessionId: undefined`.
4. `webapp/views/timeline.js:251-271` (`attachSnapshotsToAgentTurns`): no message node can own a `sessionId: undefined` snapshot, so both steps collapse into ONE synthetic empty-text agent-turn keyed by `undefined`, timestamped at the LAST snapshot (2026-06-27T04:05:11.286Z).
5. That timestamp sorts the synthetic node into the MIDDLE of session `12136035`'s run (between turns at 04:05:07.186 and 04:05:11.989). Verified node order: session 2 runs nodes 6–11, node 12 is `(unattributed)` carrying the `orders.py` chip, session 2 resumes nodes 13–16.
6. Bug 1: `webapp/views/timeline.js:936` emits a session header on every consecutive sessionKey change → the `12136035-….jsonl` header renders at node 6 AND node 13, with an `(unattributed)` header between.
7. Bug 2: `webapp/views/timeline.js:1111` (`drawRail`) sets `prevMain = null` at every `.timeline-session` header → session 2's spine breaks into disconnected segments (the gaps).

## What Remains
1. Attribute user-edit evidence steps to the session whose transcript records evidenced them. Fix at the reconstruction layer, not the webapp: the evidence for both steps comes from session 2's own records (the Edit tool backup and the file-history-snapshot uuid `9cf3da78…` at line 64 of `12136035-6bb7-4c80-8b6e-8e16e6f58ed2.jsonl`). Before editing, trace where the synthetic changeIds/revisions are created (`src/reconstruction_reseed.ts` and `src/reconstruction_extract.ts` both contain `originalFile:`) and decide the safest attribution source — likely carrying the source record's `sessionId` through to the step, or resolving a user-edit changeId to the sessionId of the file-history-snapshot / Edit-backup record that evidenced it, extending `indexChangeIdsToSessionIds` or its call site in `buildStepSnapshots` (`src/reconstruction_json.ts:147-174`).
2. Add a regression test in `tests/timeline-viewmodels.test.ts` following the existing fixture pattern (see `S84_JSONL_PATHS`/`S85_JSONL_PATHS` in `tests/fixtures.ts`; add `S40_JSONL_PATHS` pointing at `scenarios/executed/s40-git-baseline-user-edits/`, session 1 = `632219aa-61df-4f6b-ba90-6f100c4ef853.jsonl`, session 2 = `12136035-6bb7-4c80-8b6e-8e16e6f58ed2.jsonl`). Assert: no node in `buildTurnTimelineViewModel(s40Document).nodes` has `sessionId === undefined`, and each session's nodes form one contiguous run.
3. Check existing multi-session scenarios don't regress: s84, s85, s39 all exercise this code (`node --test tests/` or the project's usual runner via `tsx`). s85 has previously regressed from a session-attribution change (see below).
4. Verify in the real app against the running server. The server runs `tsx` with NO auto-reload — start a fresh instance on a spare port (a previous session used 7399) rather than trusting the one on 7343, and confirm via DOM/API (not screenshots): the s40 timeline has exactly 2 `.timeline-session` headers and the view-model has no unattributed nodes. Fetching `http://127.0.0.1:<port>/api/document?project=s40-git-baseline-user-edits&allowScripts=1` and running `buildTurnTimelineViewModel` over it in node is sufficient (that's how the bug was reproduced).

## Key Files
- `src/reconstruction_json.ts` — `buildStepSnapshots` (147-174) + `indexChangeIdsToSessionIds` (118-131): where step `sessionId` attribution happens; the fix's likely home.
- `src/reconstruction_reseed.ts` — creates the `originalFile:` reseed splice revision (session 2's Edit backup vs session 1's final write).
- `src/reconstruction_extract.ts` — also references `originalFile:`; check which of the two creates the user-edit/`@v2` revisions.
- `webapp/views/timeline.js` — view-model + render: `attachSnapshotsToAgentTurns` (251), header emission (936), `drawRail` spine break (1111). Should need NO changes if attribution is fixed server-side.
- `tests/timeline-viewmodels.test.ts` — pure view-model tests; the regression test goes here.
- `tests/fixtures.ts` — scenario fixture constants (`S39_PROJECT_DIR`/`S39_JSONL_PATHS` pattern to copy for s40).
- `scenarios/executed/s40-git-baseline-user-edits/` — the two JSONLs + scenario ground truth (`../s40-git-baseline-user-edits.txt` describes the 9 steps).

## Context the Next Agent Won't Have
- User instruction this session was diagnosis-only; the fix is now approved. Do the reconstruction-layer fix, not a webapp workaround.
- Commit `6b5a71a` already HID the "(unattributed)" lane header via CSS "keeping the element in the DOM for the rail's spine" — a previous cosmetic mitigation of this same defect. The hidden element still breaks the header-dedup and the rail (drawRail keys off `.timeline-session` elements regardless of CSS visibility). Expect that CSS to become dead once attribution is fixed; don't delete the file (user rule: never delete files, comment out with a RETIRED note — applies to files, CSS rules can just be removed with the commit message noting it).
- Recent history here is touchy: a Phase C fix on 2026-07-07 (chronological JSONL sort + forest-aware surviving trunk, for s39) caused an s85 regression where `selectLiveBranch` included predecessor-session records (claude-mem observation 24496). Run the full test suite, and specifically s85/s84/s39 assertions, after the attribution change.
- Both s40 JSONLs are internally contiguous parentUuid chains — the bug is NOT in the data. Steps in the wire document print `timestamp: undefined` when inspected naively; the field is `when`.
- Timeline "loaded twice" was ALSO plausibly the NDJSON progress stream: `/api/document` emits the full 138-record per-line progress walk TWICE per request (once for the script-consent scan, once for the document build, both labeled "reusing cached"). That's a separate cosmetic issue, unfixed and unrequested — mention it to the user before touching it.
- The `/api/document` endpoint returns `{"kind":"consent-required",...}` unless `allowScripts=1` is passed (s40 has recorded script executions — git commands).
- User verification rule: no screenshots — verify UI via headless DOM/JS assertions and report numbers (see memory `no-screenshots-verify-via-dom`).
- Ponytail ultra mode is active for this user: smallest correct diff, root-cause fixes only, one runnable check per non-trivial change. Global user rule: new code uses 4-space indent even though RevEng is 2-space; functions are named as verb phrases; merges use `--no-ff`.

## How to Verify
```
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
node --test tests/timeline-viewmodels.test.ts    # or the project's tsx-based runner if node --test trips on TS imports
```
Then the live check: start the viewer server (`tsx src/viewer_server.ts` — check its arg convention, previous sessions used ports 7343/7399), fetch `/api/document?project=s40-git-baseline-user-edits&allowScripts=1`, run `buildTurnTimelineViewModel` over the final NDJSON payload, and assert: zero nodes with `sessionId === undefined`, session `12136035` nodes contiguous, exactly 2 session headers implied.
