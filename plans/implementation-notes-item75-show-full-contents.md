# Implementation notes — Item 75: "Show full contents" diff toggle

- **Timestamp:** 2026-07-13T16:55:00-07:00 (PDT)
- **Conversation:** tackle-tasks item 75 (File Revision Panel — show full contents)
- **JSONL log:** /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/05b037e8-5e3f-4eb4-a3de-23c70ea806b1.jsonl

## References
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item75-show-full-contents.md (the plan)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (item 75)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md

## Summary of what shipped
A "Show full contents" toggle button added to the details-pane diff header, LEFT of
`Columns | Inline`. When on, the revision diff widens git's context (`--unified=1000000`)
so the whole file renders with add/del/context coloring in both Columns and Inline modes.
The flag persists in localStorage and threads button → `/api/diff?context=full` → server →
`renderRevisionDiff` → `renderDiffWithContext` → `runGitUnifiedDiff(contextLines)`.

Files touched:
- `src/render_git_diff.ts` — `contextLines` param (default `DEFAULT_DIFF_CONTEXT_LINES = 3`); `FULL_FILE_CONTEXT_LINES = 1_000_000`.
- `src/reconstruction_render.ts` — `renderDiffWithContext(revisions, fullContext=false)`.
- `src/viewer_api.ts` — `renderRevisionDiff(document, filePath, fullContext=false)`.
- `src/viewer_server.ts` — `handleDiffRequest` reads `context=full`.
- `webapp/index.html` — `#dm-full` button.
- `webapp/views/details.ts` — storage/resolver helpers, `reload` threading, per-width memo.
- Tests (RED-first): `tests/render_git_diff.test.ts`, `tests/reconstruction_render.test.ts`, `tests/details-viewmodels.test.ts`.

## Design decisions (spec was thin here)
- **`reload` thunk threading.** A full-context diff is a different server response, so the
  full toggle cannot re-render the already-fetched text (unlike Columns/Inline). Each render
  path now supplies a `reload` closure that re-fetches at the CURRENT stored width. This is
  the minimal design that keeps Columns/Inline as pure re-renders (no refetch) while making
  the full toggle refetch.
- **Per-width memo in file-revisions mode.** Kept two promises (`defaultBlocks`/`fullBlocks`)
  instead of resetting one memo on toggle, so switching rev-cards still never refetches.
- **Storage key lives in `details.ts`.** `FULL_CONTENTS_STORAGE_KEY` is used only by the
  details pane, so it stays there (not in the shared `diff-vs-base.ts`).

## Deviations from spec
- None material. Phase 2's RED test reuses the existing `createLongFileThenEditMiddle`
  fixture in `reconstruction_render.test.ts` rather than building a new one (DRY; the plan
  anticipated reusing "the same helper the sibling tests use").

## Tradeoffs
- Chose server-side git `--unified` widening over a client-side diff/expand algorithm or a
  third-party lib (diff2html). Reuses every existing renderer; zero new deps; smallest diff.
  Ceiling: a whole-file diff is one big hunk → many DOM rows. Acceptable for a local viewer;
  add row windowing only if a real file makes the pane janky (noted in plan, not built).
- Copy patch / Export .patch now export at the currently-viewed width (full or hunks) — the
  patch matches what the user sees. This is a minor behavior change, intended.

## Out of scope (not built, by decision)
- The FileViewer "Diff vs Base" view (`renderDiffVsBase`) — different view; its
  `renderDiffWithContext` call keeps the default context.

## Open questions
- None blocking. Visual polish only: "Show full contents" is a wider label than Columns/
  Inline; if the header row looks cramped, that's a CSS tweak for the user's standing visual
  pass. Tests were not run per the user's instruction (they will run the suite).
