# Handoff: Continue viewer work on develop — staged clickable-links/timeline-base work + turn-based timeline plan ready to execute
Conversation name: implement clickable JSONL lines
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/7667b49b-9ceb-43e7-ae59-863e5da549c8.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/timeline-conversation-turn-steps.md

## Branch
`develop` (HEAD `12d5088` at handoff time; nothing new committed this session)

## Goal
Two-part: (1) the STAGED work — TASKS.md items 5+6 (revision deep-links + clickable console `[file:line]` tokens) plus five follow-ups shipped on top (timeline default view, inspector backupFileName revision links with backupTime resolution, file viewer as drawer, timeline as base view for EVERY project route, prompt word-wrap) — is done, verified, and awaiting the user's commit. (2) The NEXT work — restructure the timeline to turn-based steps (user prompts AND agent replies as numbered steps, actions nested inside agent steps, git-op rows, session-end steps) — is fully planned in the plan file above and NOT started.

## Current State
- `npm test`: 443 pass / 1 fail. The single failure (`s85 reproduces every captured step state`, tests/scenario_coverage.test.ts) is PRE-EXISTING and owned by a concurrent session's uncommitted `src/` edits — do not fix it, do not build on it.
- STAGED (11 files, 583 insertions): `webapp/app.js`, `webapp/inspector.js`, `webapp/styles.css`, `webapp/views/{file-history,diff-vs-base,timeline}.js`, `tests/{route-predicates,timeline-viewmodels,viewer-progress,viewer-viewmodels}.test.ts`, `plans/implementation-notes-implement-clickable-jsonl-lines.md`. All verified in-browser against the live server. NOT committed — the user commits themselves (and always merges `--no-ff`).
- UNSTAGED (concurrent session's, DO NOT TOUCH OR STAGE): `package.json`, `package-lock.json`, `src/reconstruction_reseed.ts`, `src/structures/vocabulary.ts`, `tests/vocabulary.test.ts`, `webapp/views/conversation.js`, `webapp/views/projects.js`.
- The turn-based-timeline plan is complete and reviewed by the user; Phase A awaits an explicit "go".

## What Remains
Ordered:
1. Wait for the user's instruction. If they say "go" / "execute the plan": run Phase A of `/Users/matkatmusicllc/.claude/plans/timeline-conversation-turn-steps.md` exactly as written (A1→A6: `buildTurnTimelineViewModel` RED→GREEN, pick/anchor ports, render cutover, dead-code removal, verification). It is viewer-only and conflict-free.
2. Phases B (`gitOperations[]` in the wire document) and C (cross-session branch misattribution fix) REQUIRE coordination first: they touch `src/structures/vocabulary.ts` and `src/reconstruction_*`, which the concurrent session has dirty. Ask the user before starting either.
3. Two open items recorded in `plans/implementation-notes-implement-clickable-jsonl-lines.md`: (a) `fb2558d7813b8799@v2`-style blobs whose prefix matches NO changeId stay unlinked — needs a server-side blob→path map if wanted; (b) inspector drawer width may be cramped for conversation reading — CSS follow-up if the user complains.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/timeline-conversation-turn-steps.md` — the plan; read FIRST before any timeline work
- `RevEng/plans/implementation-notes-implement-clickable-jsonl-lines.md` — timestamped log of everything shipped + open questions
- `RevEng/webapp/views/timeline.js` — node model (view-model half) + render half; Phase A rewrites both
- `RevEng/webapp/app.js` — router; every `#/project/*` route now renders the timeline as base, sub-routes render via `renderSubRouteDrawer` into the inspector pane
- `RevEng/webapp/inspector.js` — JSON inspector + shared `openInspectorPane()` drawer chrome + revision links (`findBackupTimeForBlob`)
- `RevEng/tests/timeline-viewmodels.test.ts` — Phase A rewrites this file's node-model tests
- `RevEng/plans/coding-requirements.md` — mandatory style; plus user guides: 4-space indent, verb-named functions, single-condition branching, red-green TDD

## Context the Next Agent Won't Have
- **Viewer is plain JS by design** — `webapp/*.js` is handwritten source served raw from disk (`viewer_server.ts` readFileSync per request); `tsconfig.json` has `noEmit: true`, so NOTHING compiles TS→JS. Never look for a build step; edit the JS directly. The user asked about this twice.
- **User rules enforced this session**: no screenshots (user cannot see them — verify UI via headless-browser DOM/JS assertions and report numbers); never delete files (retire by commenting out; removing superseded functions from living files is fine); the user commits/merges themselves.
- **Verification setup**: a viewer server ALREADY RUNS on port 7343 (user's own; serves edited files live since static reads are per-request — do NOT restart it or POST /api/config). Headless browser: `~/.claude/skills/gstack/browse/dist/browse`; it LOSES page state between Bash invocations — chain goto→consent→assert inside ONE Bash call. Script-consent is per browser session: click "Run scripts for this reconstruction" freshly each time (safe: the served projects dir contains only scenario fixtures).
- **s39 findings that motivated the plan** (verified against ground truth): identical prompts on steps 1+2 are CORRECT under the old model (one prompt wrote two files); step 3's orphan flag is an ENGINE defect — `.step_states/step-003..006/orders.py` all contain `def count`, but the document routes the second session's edit to `rewoundFilesTouched` (branch construction fails across the `EndCurrentAgentAndSpawnNewAgent --excludeJSONL` boundary, forking from snapshot-backup blob `03ae887b…`); `commitMarkers` is EMPTY even though the scenario commits, and the consent scan captured only 4 of 6 git commands — hence Phase B extracts from raw Bash tool_use records, NOT the consent scan.
- **Backup blob semantics** (drives inspector links): `<hex>@vN` blob names are per-file (`hex` stable across versions); an exact changeId match anchors `/rev/<n>`; a prefix match resolves the revision via the snapshot entry's `backupTime` (last revision at-or-before it — the convention `computeContentAtTime` uses).
- **`app.js ↔ inspector.js` is a deliberate import cycle** (function-level use only; safe under ES modules; node suite exercises it). `renderProjectView` in `views/project.js` is unreachable but intentionally kept.
- **Off-by-one trap**: progress labels carry 1-based transcript line numbers; `/at/<n>` anchors and rawLines[] are 0-based; `matchJsonlSourceLink` subtracts 1 exactly once. xterm buffer coords are 1-based, end cell inclusive.
- The plan's Phase A test names and attribution rule (snapshot → first agent reply of same session with timestamp >= snapshot.when; leftovers get a synthetic agent turn) were chosen with the user — do not redesign them.

## How to Verify
- `cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng" && npm test` — 443 pass / 1 pre-existing fail (s85) is the healthy baseline; any NEW failure is yours.
- Staged work spot-checks (server on 7343): `#/project/s43-git-baseline-uncommitted-module/timeline/session/a4918fd5-f197-42e8-826d-149e0100aef2.jsonl/at/110` → consent → inspector on line 110; click `5436e8e9f917cd04@v2` → file-history DRAWER over the timeline (URL unchanged) with revision #2 outlined+expanded. Any `#/project/<p>/jsonl/…` or `/file/…` URL → timeline base + content in the right drawer.
- After Phase A: s39 timeline shows 7 numbered steps across 2 sessions per the plan's reference rendering (minus git rows = Phase B; minus orphan fix = Phase C).
