# Handoff: Turn-based timeline shipped end-to-end (Phase A + C + UI rounds) — Phase B unblocked and waiting
Conversation name: turn-based timeline steps
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/4c302aac-bd70-4d55-8353-9c1818171384.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/timeline-conversation-turn-steps.md

## Branch
`develop` (HEAD `827fa3f` at handoff time; working tree clean except long-standing untracked files; index empty)

## Goal
Two-part, per the user's ask: (1) WHAT WE WERE WORKING ON — the turn-based timeline plan's Phase A (viewer turn model) and Phase C (cross-session branch misattribution engine fix) are both SHIPPED and committed, plus seven user-driven UI/console rounds on top. (2) THE STAGING PROTOCOL — how finished work gets staged in this repo (see "What gets staged", below).

## What gets staged when work is done
1. Work is verified FIRST (tests green + headless-browser DOM assertions), THEN staged with `git add <explicit paths>` — only the files THIS session touched, plus the running `plans/implementation-notes-<convo>.md`. Never `git add -A`.
2. The USER commits and rebases themselves — the agent never runs `git commit`. After staging, the user asks for "one short sentence" to use as the commit message; provide exactly one.
3. A concurrent session's dirty files are NEVER staged or edited without explicit instruction. (That set is now EMPTY: the last of it was staged as the 7-file vocabulary/xterm/reseed commit on 2026-07-07 and the user rebased it before `259307f`, which needed its enum members — visible as `ee6aa6a`/`8cd39b5 REBASE …` in `git log --all`.)
4. Repo rules that shape staging: merges are always `--no-ff`; files are never deleted (retire by commenting out; removing superseded FUNCTIONS from living files is fine).

## Current State
- `npm test`: 460 tests, 459 pass, 1 fail — `s85 reproduces every captured step state` (tests/scenario_coverage.test.ts, 7/10 steps, `# reviewed by ops` mismatches). PRE-EXISTING; its owner-session's engine changes are now committed, so it may simply be a real remaining engine gap. Do not "fix" tests around it.
- Everything this session built is committed on develop (`3d3b51d` → `827fa3f`): turn-based timeline (one numbered step per prompt/reply/session-end, snapshots nested under agent turns, SMS-style bubbles — user right/accent-tinted, agent left/white, system command-turns full-width dimmed), pick/range-patch/deep-link ports, file-preview details drawer (60/40 timeline/drawer flex split of the space beside the Files column; timeline 100% when hidden), per-file `[name] [{ }] [+/-]` button rows with the exact tooltips "Show revision in Inspector" / "Show JSON for revision in inspector" / "Show Diff in Inspector", `L:<n> (of <max>)` line labels under timestamps, inspector "Go to PreToolUse hook" / "Go to Tool Result" buttons on tool_use lines, per-line console replay on cache hits with cyan `[jsonl:line]` tokens, and the Phase C engine fix (chronological transcript merge + session-forest surviving trunk in `src/reconstruction_branch.ts`/`src/viewer_api.ts`).
- The user's long-running viewer server on port 7343 was started BEFORE the engine fixes: `src/*.ts` is baked into its process (webapp files are re-read per request, engine is not). It needs a restart to show the branch fix, per-record console lines, and progress replay. UI-only changes appear on refresh.

## What Remains
Ordered:
1. Phase B of the plan (`gitOperations[]` in the wire document) — NOW UNBLOCKED: its coordination blocker was the dirty `src/structures/vocabulary.ts`, which is committed. Execute B1–B5 as written in the plan file: extract git Bash tool_use records in `src/viewer_api.ts` document assembly (NOT from the consent scan — s39 proves it under-captures, 4 of 6 git commands), add wire vocabulary members, TDD in new `tests/git-operations.test.ts` against s39 (commit message `baseline`; s19 yields `[]`), render `* git <kind> <detail> *` rows inside agent turns, and derive commit hard-stops from `gitOperations` where `kind === commit` (keep `commitMarkers` as fallback).
2. Open question (a) from the notes, if the user raises it: in s39 session 1 the agent's reply text PRECEDES its tool calls, so file chips land on a synthetic empty-text turn (Step 5) instead of the reply (Step 4). The attribution rule (first agent reply at/after the snapshot; leftovers → ONE synthetic turn per session) was user-approved — changing it needs an explicit decision.
3. Minor flagged item: s84 "Step 17" is a pickable agent turn with zero visible chips (its snapshot's changeIds resolve to no revision and `changedPaths` is empty) — engine data question, unaddressed.

## Key Files
- /Users/matkatmusicllc/.claude/plans/timeline-conversation-turn-steps.md — the plan; Phase B section is the work spec
- RevEng/plans/implementation-notes-turn-based-timeline-steps.md — timestamped log of every decision/deviation this session (committed)
- RevEng/webapp/views/timeline.js — turn view-model + render; per-file button rows; drawer/preview logic
- RevEng/webapp/inspector.js — `openInspectorPane()` (strips the `file-preview-drawer` width modifier on every open), `findToolNavigationTargets`
- RevEng/webapp/app.js — `logProgress`/`tintSourceToken` (cyan tokens), `matchJsonlSourceLink`
- RevEng/src/reconstruction_branch.ts — session-forest trunk (`collectPredecessorFinalHeads`, `collectSurvivingTrunkUuids`)
- RevEng/src/viewer_api.ts — chronological transcript merge, `replayRecordProgress`, both cache-hit replays
- RevEng/src/parse/loadTranscript.ts — per-record labels with `formatRecordSourceToken` (the one canonical token formatter)
- RevEng/tests/{timeline-viewmodels,git-baseline-branching,viewer-progress,viewer-viewmodels}.test.ts — the suites this session grew

## Context the Next Agent Won't Have
- **Verification pattern**: the user's 7343 server must NOT be restarted or reconfigured; to verify ENGINE changes in a browser, launch a throwaway `npx tsx src/viewer_server.ts --port 7399 --projects-dir scenarios/executed`, verify, then `lsof -ti:7399 | xargs kill`. The headless browser (`~/.claude/skills/gstack/browse/dist/browse`) restarts its daemon per Bash invocation — chain goto → consent-click (`[...document.querySelectorAll("button")].find(b => b.textContent.includes("Run scripts"))?.click()`) → sleep → JS assertions inside ONE Bash call. No screenshots ever — the user cannot see them; report DOM-measured numbers.
- **Inspector numbering is 0-based with max index**: the pane shows `line <n> / <rawLines.length - 1>`; timeline `L:` labels deliberately match it. `/at/<n>` anchors and rawLines[] are 0-based; server-side `RecordSource.lineNumber` and console `[jsonl:line]` tokens are 1-BASED (matchJsonlSourceLink subtracts 1 exactly once).
- **Anchor/jump precedence learned by fixing real bugs**: a file-history-snapshot line embeds BOTH a changeId and the triggering prompt's uuid (as `messageId`) — changeId matching must win (`findTimelineNodeIndexForRawLine` is two-pass). The `{ }` button prefers the line containing `"toolUseResult"` over the tool_use call line. Turn clicks match the record's OWN `"uuid":"<uuid>"` field, not a bare uuid substring.
- **Deep engine stages emit counted progress events WITHOUT source tokens** (per-stage totals); tests scope per-record assertions by `total === recordCount`, not by "is counted".
- **The s85 suite failure is content-level** (`# reviewed by ops` line missing in steps 4–10 of 10) and predates everything here; its signature has been byte-identical through every change this session.
- **Style gates**: strict red-green TDD (behavioral step comments in every test, RED confirmed before implementing), single-condition branching (one condition per if, nest instead of &&), verb-named functions, 4-space indent, wire-string discriminants in webapp JS but enum members in TS, `plans/coding-requirements.md` is mandatory reading before writing code.
- **xterm is vendored** (`webapp/vendor/xterm.js` served statically); the `@xterm/*` devDependencies are provenance only — nothing imports them from node_modules.

## How to Verify
- `cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng" && npm test` — 459/460 with only the s85 failure is the healthy baseline; any NEW failure is yours.
- Timeline spot-check (throwaway server, port 7399, project s39-git-baseline-seed): 13 numbered steps across 2 sessions; Step 10 NOT orphaned (pick checkbox present, 0 orphan rows); Step 5 synthetic turn carries both file chips; per-file rows read `[Morders.py] [{ }] [+/-]` with the three exact tooltips.
- Tool-flow spot-check (s40-git-baseline-user-edits, session 632219aa…, `/at/59`): header shows both jump buttons; hook → line 60, result → line 62.
- Console spot-check: warm reload shows "reusing cached…" followed by per-record lines like `2/136 mode [b9783f4b….jsonl:2]` whose token cells are fg palette 6 (cyan).
