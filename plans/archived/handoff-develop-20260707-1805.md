# Handoff: "(unattributed)" timeline header hidden + engine pipeline diagrams updated — both committed
Conversation name: inherited-dongarra
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/3f688f51-ac9f-4001-988e-851d664c3766.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/the-timeline-view-of-inherited-dongarra.md

## Branch
`develop` (no parent feature branch; work is directly on develop)

## Goal
Two small deliverables: (1) hide the noisy "(unattri…" lane header the Timeline
shows for steps with no session attribution (s43's git-baseline splice), without
touching the engine's truthful `sessionId: undefined`; (2) bring
`engine-pipeline-diagrams.html` up to date with the engine changes that landed
after its last update (commit 9988044).

## Current State
- **Both deliverables are DONE and COMMITTED by the user:**
  - `6b5a71a` — one CSS rule in `webapp/styles.css` (~line 254):
    `.timeline-session[data-session="(unattributed)"] { display: none; }`,
    plus `plans/implementation-notes-inherited-dongarra.md` (root-cause writeup).
  - `051ce6c` — `engine-pipeline-diagrams.html`: multi-session forest-trunk node
    (`collectSurvivingTrunkUuids`), `gitOperations[]`/`parseGitOperation` node,
    `[jsonl:line]` source-token and chronological-merge notes, drill-map entries.
- Red-green verified via headless DOM assertions on
  `#/project/s43-git-baseline-uncommitted-module/timeline/session/a4918fd5-….jsonl`:
  RED `{headerCount:1, hiddenHeaderCount:0}` → GREEN `{headerCount:1,
  hiddenHeaderCount:1, visibleUnattributedRowCount:1, visibleSessionHeaderCount:3}`.
- Diagram verified: all 4 mermaid tabs render 1 SVG each, 0 syntax errors, both
  new nodes present.
- `npm test`: 466/467 pass. The 1 failure (`s85 reproduces every captured step
  state`, tests/scenario_coverage.test.ts) is pre-existing from concurrent
  engine work — NOT from this session.
- Still uncommitted (NOT this session's work): `webapp/views/file-history.js`
  (+4/−3) — the jumpToConversation → `routeToTimeline` fix from the earlier
  session (see plans/handoff-develop-20260707-1632.md).

## What Remains
1. Commit `webapp/views/file-history.js` on develop (user commits, or agent when
   asked). Suggested message from the prior handoff: "Jump to conversation now
   anchors the timeline at the revision's step instead of opening the
   conversation view."
2. (Open question, ask user) Rename the File Versions view's "Jump to
   conversation" button — it now lands on the timeline anchored at the step.
   Carried over from handoff-develop-20260707-1632.md.
3. (Open question, ask user) With the "(unattributed)" header hidden, an
   unattributed step's only signal is a muted rail dot + spine break. Enough, or
   should the step row get a tooltip/tag (e.g. "git baseline" / "user edit")?
   The engine knows the origin (`EventKind.userEdit` at splice time,
   reconstruction_git_evidence.ts) but the lane label collapsed it to
   sessionId-undefined; revisions already carry `eventKind` into the view-model
   (webapp/views/timeline.js:47) if a label is wanted.
4. (Pre-existing) Fix the s85 scenario_coverage failure from the concurrent
   engine session — not started here.

## Key Files
- `webapp/styles.css` (~254) — the hide rule; comment explains the DOM-presence
  constraint.
- `webapp/views/timeline.js` — lane headers ~935-954; rail-drawing loop
  ~1107-1112 (uses `.timeline-session` elements as spine breaks — the reason the
  hide must be CSS, not JS); session anchor ~1149.
- `src/reconstruction_json.ts:115-171` — changeId→session attribution
  (`indexChangeIdsToSessionIds`); `src/reconstruction_git_evidence.ts:~350` —
  synthetic changeId minting (`new Uuid(randomUUID())`) for evidence splices.
- `plans/implementation-notes-inherited-dongarra.md` — full root-cause +
  decisions writeup for the hide.
- `engine-pipeline-diagrams.html` — the updated diagrams; drill maps at the
  bottom `DRILL` object must list any node ids you add.
- `webapp/views/file-history.js` — the uncommitted prior-session fix (item 1).

## Context the Next Agent Won't Have
- **The missing attribution is correct, not a bug.** Synthetic changeIds
  (git-evidence / user-edit splices) exist in no `tool_use` block by
  construction, so the session lookup must return undefined. Do not "fix"
  attribution by inheriting a neighboring session — that fabricates provenance.
- **Hiding had to be CSS `display:none`, not skipping the header in JS**: the
  rail loop walks `body.children` and treats each `.timeline-session` element as
  a spine-break + color-switch marker; removing the element merges the
  unattributed step into the previous session's lane color.
- **gstack browse gotchas (cost this session ~6 failed attempts):**
  - The daemon dies between Bash invocations — run EVERYTHING (goto included) in
    ONE invocation; a `chain` that assumes a prior page silently runs on
    about:blank.
  - Chain startup intermittently times out; booting with a throwaway `$B status`
    first, then piping the chain, worked. `$B stop; sleep 2` before is hit-or-miss.
  - `file://` URLs are blocked (http/https only). To verify a local HTML file,
    serve it: `python3 -m http.server 8899 &` in the same invocation, then goto
    `http://127.0.0.1:8899/…`, kill after.
  - Skip the consent dialog entirely by pre-seeding
    `sessionStorage.setItem('consent:<project>', '1')` on `http://127.0.0.1:7343/`
    then navigating (key format: webapp/app.js:220 `computeConsentKey`). Clicking
    the dialog needs a long async poller that made chains time out.
- Verify UI with headless DOM assertions and report numbers — user cannot see
  screenshots (standing rule).
- Test baseline moved since the 1632 handoff: 466/467 now (was 462/463), same
  single pre-existing s85 failure.
- The diagrams file renders tabs lazily (mermaid runs on first tab activation) —
  a syntax check must click every tab, not just load the page.

## How to Verify
1. `cd RevEng && npm test` — expect 466/467, only `s85 reproduces every captured
   step state` failing.
2. Hide rule (server usually already runs at 127.0.0.1:7343): one browse
   invocation — seed consent on `http://127.0.0.1:7343/`, goto
   `#/project/s43-git-baseline-uncommitted-module/timeline/session/a4918fd5-f197-42e8-826d-149e0100aef2.jsonl`,
   wait `.timeline-selectbar`, assert
   `.timeline-session[data-session="(unattributed)"]` has `offsetParent === null`
   while `.timeline-row[data-session="(unattributed)"]` is visible.
3. Diagrams: `python3 -m http.server 8899 &` in RevEng, goto
   `http://127.0.0.1:8899/engine-pipeline-diagrams.html`, click tabs t2/t3/t4,
   assert 1 SVG per tab and 0 "Syntax error" strings.
