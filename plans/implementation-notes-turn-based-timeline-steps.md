## 2026-07-06:19:16:00 — Turn-based timeline steps (Phase A)
Chat title: turn-based timeline steps
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/4c302aac-bd70-4d55-8353-9c1818171384.jsonl

### References

/Users/matkatmusicllc/.claude/plans/timeline-conversation-turn-steps.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260706-1908.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-implement-clickable-jsonl-lines.md

### Design decisions

- 2026-07-06T19:16 — Baseline verified before any edit: full suite has exactly one failure (`tests/scenario_coverage.test.ts`, the s85 step-state test the handoff pins as pre-existing and owned by the concurrent session). Bar for all Phase A work: no NEW failures.
- 2026-07-06T19:16 — Executing Phase A only (viewer + tests, conflict-free). Phases B/C touch `src/` files the concurrent session has dirty; will stop and ask before either.

- 2026-07-06T19:20 — A1 GREEN on first run: s2 needed NO synthetic agent turns (the plan's node-count arithmetic `messages + session ends` held exactly), confirming every s2 snapshot has a later text-bearing assistant reply in its session.
- 2026-07-06T19:25 — `test_session_end_node_closes_every_session` asserts the end node's position after every USER/AGENT turn of its session (not after commit nodes of that session): a commit timestamped after the session's last reply would legitimately sort after the session-end node. The plan's "after every other node of that session" was read as "every conversation turn".
- 2026-07-06T19:30 — A4 diff-preview label: the old head showed `diff before step <snapshotIdx> → at step <snapshotIdx>`; snapshot indexes no longer match visible step numbers, so the label now uses the picked nodes' turn stepNumbers. The /api/range-patch CALL (and the exported .patch filename) still speak snapshot indexes, per the plan's out-of-scope rule.
- 2026-07-06T19:30 — A4 file-state preview: a turn can own several snapshots; "state at step N" now shows the LAST owned snapshot that carries the clicked path (the turn's final state of that file).

### Deviations

- 2026-07-06T19:20 — `appendSessionEndNodes(turnNodes)` drops the plan's unused `document` parameter (nothing in it was needed; max-when derives from the turn nodes).
- 2026-07-06T19:25 — Plan A5 said the turn tests "cover every behavior" of the old node-model tests; four old tests (chronology, session ids, commit nodes, rename event kinds) were PORTED to `buildTurnTimelineViewModel` instead of deleted — a 1-line change each keeps their scenario coverage. Only `test_timeline_prompt_excerpts_come_from_same_session` was deleted (superseded: turn nodes carry their own message text, asserted by `test_turn_timeline_has_one_node_per_message_plus_session_ends`).
- 2026-07-06T19:30 — Orphaned agent turns render with NO pick checkbox (plan: checkbox only when pickable). The old UI showed a disabled checkbox with a tooltip; the plan's wording drops it entirely, so the tooltip went with it.

### Tradeoffs

- 2026-07-06T19:30 — `renderTimelineView` was mid-transition broken between A2 and A4 (pick helpers spoke turn nodes, render still built snapshot nodes). Accepted: no browser verification happens until A6, and unit tests never exercise the render half.



- 2026-07-06T19:45 — Three defects found and fixed during A6 browser verification (each RED→GREEN):
  1. **Synthetic-turn multiplicity** — s39's two trailing snapshots each spawned their own synthetic agent turn; the plan says leftovers attach to "a synthetic trailing agent-turn node" (singular). Leftover snapshots of a session now collect into ONE synthetic turn (its `when` advances to the last snapshot). Ownerless snapshots are provably a trailing suffix per session, so one node suffices.
  2. **"end of session undefined"** — s84's unattributed script-execution snapshots (no sessionId) produced a session-end node for the `undefined` session. `appendSessionEndNodes` now skips unattributed turns; the synthetic agent turn still surfaces the changes (pickable).
  3. **Anchor precedence** — s43 line 110 (a file-history-snapshot record) embeds BOTH a changeId and the uuid of the prompt that triggered it; single-pass matching let the earlier user turn steal the anchor. `findTimelineNodeIndexForRawLine` now runs a changeId (agent-turn) pass before the uuid (user-turn) pass.
- 2026-07-06T19:45 — A6 verified in-browser via DOM assertions (no screenshots): s39 = 13 numbered steps / 2 sessions / chips on the synthetic turn / orphan on the step-10 reply (known Phase C engine defect); s84 = continuous 1..31→30 numbering across 7 interleaved session blocks, 3 commit hard-stops unnumbered, checkboxes only on snapshot-owning agent turns, selection bar reads "2 steps picked · 1 file"; `/api/range-patch` returns a valid diff (server untouched); deep links `/at/28` → user-turn Step 3, `/at/110` → agent-turn Step 27, inspector open on the exact line both times.

- 2026-07-07T — SMS-style turn styling (user request): user turns are right-attached bubbles, agent turns left-attached bubbles (both clear of the 96px rail gutter; agent bubbles keep a 20% right margin, user bubbles a mirrored left margin), and SYSTEM turns render full-width at 0.55 opacity — dimmer than either. "System" = harness-generated message text (`<command-message>`/`<command-name>`, `<local-command-*>`, `<system-reminder>`), flagged as `isSystem` in `buildTurnTimelineViewModel` (tested); this also resolves the earlier open question (a): command prompts STAY on the timeline, dimmed, rather than being filtered. The pick checkbox is pulled back into the rail gutter (`left: -76px`) since agent bubbles now start at 96px.
- 2026-07-07T — Limitation: the agent's ACK of a slash command (e.g. "Ponytail ultra active") is plain assistant text and cannot be reliably detected as system — it renders as a normal agent bubble.

- 2026-07-07T — Bubble colors (user request): user bubbles use `var(--badge-accent-bg)` (accent tint, theme-aware), agent bubbles stay `var(--code-bg)`. Verified distinct in-browser (rgba(10,102,194,0.12) vs rgb(255,255,255) in light theme).
- 2026-07-07T — Turn-click drawer fix (user bug report): user turns had no click handler and text-only agent turns fell through the changeId scan to a "no transcript line" notice. Every turn with a message uuid now opens the transcript drawer on its OWN JSONL line via `openTurnInspector`, matching `"uuid":"<uuid>"` first (a bare-uuid scan lands on the file-history-snapshot line that references the message as messageId), bare uuid second, changeId scan as the synthetic-turn fallback. Verified: s39 Step 3 → line 28 (type user), Step 4 → line 31, Step 12 (👍) → line 53, Step 1 (system) → line 12.

- 2026-07-07T — File-preview drawer (user request): clicking a file chip no longer expands an inline preview inside the row — it opens the right-side inspector drawer at 50% of the Details view (`.inspector-pane.file-preview-drawer`, `left: drawer-width + (100% − drawer-width)/2`), with `pre-wrap`/`overflow-wrap: anywhere` so all preview lines wrap. The active chip is highlighted (accent border + tint) while its file shows; clicking it again closes the drawer; `openInspectorPane()` strips the width modifier so transcript/JSON inspections return to the default width. The pick checkbox moved from x≈20 to x≈5 in the rail gutter — its old position occluded the row's rail dot (ring spans x 23–41).
- 2026-07-07T — All verified in-browser by DOM geometry: checkbox spans x 5–20 (clear of the dot ring at 23); drawer = 40% of layout = exactly 50% of the view; active chip follows clicks and clears on toggle-close; turn-row clicks restore default inspector width.

### Open questions

- Phases B and C await user go-ahead (concurrent session has `src/structures/vocabulary.ts` and `src/reconstruction_*` dirty).
- **s39 renders 13 steps, not the reference sketch's 7.** Two causes, both faithful to decision #1 ("every user prompt and every agent reply is its own numbered step"):
  (a) the transcripts start with the `/ponytail` command prompt and its acknowledgment reply — 4 extra turns across the 2 sessions. Should command-message prompts (and their acks) be filtered from the timeline, or stay as steps?
  (b) in session 1 the agent emitted its reply text BEFORE running the file-writing tool calls, so the snapshots have no agent reply at-or-after them and land on a synthetic empty-text turn (Step 5) — the reference sketch shows the chips on the reply itself (Step 4). The attribution rule ("first agent reply at/after the snapshot") was user-approved and is implemented exactly as specified; if chips should bind to the PRECEDING reply when no later one exists, that is a rule change to decide explicitly.
- s84 Step 17 is a pickable agent turn with zero visible chips (its snapshot's changeIds resolve to no revision and `changedPaths` is empty). Engine data question, not a viewer defect — flagging for awareness.
