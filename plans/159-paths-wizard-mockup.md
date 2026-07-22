# Task 159 — Paths… settings wizard: flow mockup (deliverables a + b)

Supersedes the two-section-popover design in
`plans/item46-custom-data-source-paths.md` for the popover's future shape.
Implementation is deliverable (c), gated on this mockup's review.

## Resolved ambiguities

Answered by the user 2026-07-22 (AskUserQuestion) or fixed by the task text:

1. **Trigger**: first launch with no global config → full wizard; a project
   loading with no reveng-paths.json entry → per-project screens 2–5; the
   Paths… button → wizard on demand (summary panel first, see (b)). No
   auto-run on ordinary project switches.
2. **Screen-2 default**: auto-derive (today's behavior — empty posts `''`
   and the server re-derives; `app-header.ts computeFileHistoryDirToPost`).
3. **Screen-4 default**: the commit the SESSION records (s85-style recorded
   baseline) when one exists; otherwise the repo's default-branch tip
   (resolved, never a hardcoded `master`).
4. **Skip semantics**: declining screens 3/4 leaves the project
   reconstructing exactly as with no reveng-paths entry (fixed by task).
5. **Persistence**: screen 1 → `/api/config` (global); screens 2–4 →
   `/api/project-paths` with the persist flag; the wizard's Finish step IS
   the 137-style "store?" prompt (fixed by task, see table below).
6. **Task-56 pre-baseline question**: becomes wizard screen 5 when the
   wizard runs for a project (it depends on the screen-4 commit); outside
   the wizard the existing load-time dialog keeps firing.

## Flow logic

```
first launch, no global config ──────────► [1] → [2] → [3] ─yes→ [4] → [5] → [Finish]
project load, no reveng-paths entry ─────►       [2] → [3] ─yes→ [4] → [5] → [Finish]
Paths… button ───────────────────────────► [Summary panel] ─row edit→ single screen → [Finish]
                                                  └─"Run full wizard"→ [1] → …
[3] answered "no" ───────────────────────────────────────────────────► [Finish]
                                                     (skips 4 AND 5 — no repo ⇒ no baseline)
```

- Back/Next on every screen; Esc/Cancel abandons the run (nothing posted,
  nothing persisted — same as closing today's popover without Apply).
- Every screen prefills the stored/derived current value.

## Screens

Screen 1 — project path (GLOBAL)

```
┌─ Settings wizard (1 of 5) ────────────────────────────┐
│ Where are your Claude Code session logs?              │
│                                                       │
│ Projects folder                                       │
│ [ ~/.claude/projects                    ] [Open…]     │
│ [Set Projects Folder location]                        │
│                                                       │
│                              [Cancel]      [Next ▸]   │
└───────────────────────────────────────────────────────┘
```

Screen 2 — file-history (per project)

```
┌─ Settings wizard (2 of 5) ── <project name> ──────────┐
│ Do you wish to set a custom file history snapshot     │
│ path, or auto-derive the path?                        │
│                                                       │
│ (•) Auto-derive (default — server derives from the    │
│     projects folder)                                  │
│ ( ) Custom path:                                      │
│     [                                     ] [Open…]   │
│                                                       │
│                    [◂ Back]   [Cancel]     [Next ▸]   │
└───────────────────────────────────────────────────────┘
```

Screen 3 — git repo (per project)

```
┌─ Settings wizard (3 of 5) ── <project name> ──────────┐
│ Do you wish to set a Git Repo path?                   │
│                                                       │
│ ( ) No (default — reconstruct without a repo)         │
│ (•) Yes:                                              │
│     [ ~/code/myproject                  ] [Open…]     │
│     [Set Git Repo location]                           │
│                                                       │
│                    [◂ Back]   [Cancel]     [Next ▸]   │
└───────────────────────────────────────────────────────┘
```

"No" → Next goes straight to Finish (screens 4 and 5 need a repo).

Screen 4 — commit pick (per project)

```
┌─ Settings wizard (4 of 5) ── <project name> ──────────┐
│ Do you wish to pick a git repo commit?                │
│                                                       │
│ (•) Default: a1b2c3d "baseline msg" (session-recorded │
│     baseline)            ← or "<branch> tip" when the │
│                            session records none       │
│ ( ) Pick one:                                         │
│     [Filter commits…                        ]         │
│     ┌───────────────────────────────────────┐         │
│     │ e4f5a6b  fix crash          2h ago    │         │
│     │ 9c8d7e6  add feature        1d ago    │         │
│     │ … (task-154 list: 500 newest)         │         │
│     └───────────────────────────────────────┘         │
│                                                       │
│                    [◂ Back]   [Cancel]     [Next ▸]   │
└───────────────────────────────────────────────────────┘
```

Screen 5 — pre-baseline (task 56, per project)

```
┌─ Settings wizard (5 of 5) ── <project name> ──────────┐
│ Reconstruct file states preceding the baseline        │
│ commit?                                               │
│                                                       │
│ ( ) Yes — include pre-baseline reconstruction         │
│ (•) No                                                │
│                                                       │
│                    [◂ Back]   [Cancel]   [Finish ▸]   │
└───────────────────────────────────────────────────────┘
```

Finish — the 137-style store prompt

```
┌─ Apply settings ──────────────────────────────────────┐
│ Projects folder   ~/.claude/projects                  │
│ File history      auto-derived                        │
│ Git repo          ~/code/myproject                    │
│ Base commit       a1b2c3d (session baseline)          │
│ Pre-baseline      no                                  │
│                                                       │
│ [Apply to session only]   [Store for this project]    │
└───────────────────────────────────────────────────────┘
```

Store subsumes Apply: `postProjectPaths(true)` applies AND persists
(`app-paths-project.ts:122-123`).

## (b) Changing values after a session loads

Paths… opens a compact **summary panel** (the popover's new default face),
not screen 1:

```
┌─ Paths ── <project name> ─────────────────────────────┐
│ Projects folder   ~/.claude/projects          [Edit]  │
│ File history      auto-derived                [Edit]  │
│ Git repo          ~/code/myproject            [Edit]  │
│ Base commit       a1b2c3d (session baseline)  [Edit]  │
│ Pre-baseline      no                          [Edit]  │
│                                                       │
│ [Run full wizard…]                                    │
└───────────────────────────────────────────────────────┘
```

- Each [Edit] jumps to that SINGLE wizard screen; its Next becomes Finish
  (one-screen round trip through the same store prompt).
- [Run full wizard…] re-enters at screen 1 with all stored answers
  prefilled.
- Changing a value mid-session re-fires reconstruction exactly as today's
  Apply path does (including the task-149 re-ask documentCache drop).

## Persistence map

| Screen | Value | Lands in |
|---|---|---|
| 1 | projects folder | `/api/config` (global) |
| 2 | fileHistoryDir ('' = auto-derive) | `/api/project-paths` (+persist on Store) |
| 3 | repo path (jfred-root-relative or absolute) | `/api/project-paths` (+persist) |
| 4 | base commit | `/api/project-paths` (+persist) |
| 5 | preBaseline | task-56 mirror (`baseline:` sessionStorage + `preBaselineAllowed` stamp); Store also persists to the project entry |

## Implementation pointers (deliverable c, not started)

- Rebuild `#paths-popover` (`jfred/webapp/index.html:18-42`) as the summary
  panel + a screen container; today's inputs/buttons become the screens'
  bodies (ids preserved where tests reference them).
- Wizard state machine in `app-header.ts` / `app-paths-project.ts`; commit
  list reuses task-154's 500-newest picker (`#commit-pick-list`).
- Picker-button naming carry-over: "Set Projects Folder location" /
  "Set Git Repo location".
- The task-56 load-time dialog code stays; the wizard sets the same
  sessionStorage mirror so the dialog knows it was answered.
