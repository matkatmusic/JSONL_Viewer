# Item 80 — Console word-wrap: keep xterm `cols` fit to the console's real width

## Problem (context for the implementer)

The loading console is an xterm.js terminal mounted at `#progress-console`
(`webapp/app.ts`). xterm auto-wraps a logical line to the next row when it is
longer than the terminal's `cols` (DECAWM autowrap, on by default) — so wrapping
is already "on." The bug is that `cols` drifts out of sync with the console's
actual pixel width, and when `cols` is **larger** than the visible width, xterm
lays out lines past the right edge; `.progress-console { overflow: hidden }`
clips the overflow, so long lines look like they run off the edge instead of
wrapping.

`cols` is set only by `fitProgressColumns()` (`webapp/app.ts:162`), which is
called in exactly two places:

- once at terminal creation (`ensureProgressTerminal`, app.ts:140), and
- on `window.addEventListener("resize", …)` (app.ts:141), plus
- `expandProgressConsole()` (app.ts:192) when un-collapsing.

Nothing re-fits when the console's width changes **without** a window resize:

1. Dragging the sidebar↔rightcol splitter `#split-lr` changes `#rightcol`'s
   width (and thus the console's) — no `resize` event fires, so `cols` stays at
   the old, wider value → subsequent long lines overflow the now-narrower console.
2. If the very first fit measures the element before layout settles (0 width),
   `fitProgressColumns` skips the resize (its `if (dimensions?.cols)` guard) and
   the terminal keeps xterm's **default 80 cols**; on a console narrower than 80
   chars, 80-col lines overflow.

## Goal

Long console lines always wrap at the console's current visible width. Achieve it
by re-fitting `cols` whenever the console element's box actually changes, not only
on window resizes.

## Fix (the "why" for each line)

Add a `ResizeObserver` on `#progress-console` that calls `fitProgressColumns()` on
every size change. A `ResizeObserver` fires for **any** cause of the element's box
changing — splitter drags, layout settling, and window resizes alike — so `cols`
tracks the real rendered width and xterm wraps at the visible edge.

- **Keep the existing `window` resize listener.** It is harmless alongside the
  observer (a redundant re-fit on window resize is cheap) and is a safety net if
  the observer ever misses a case. The observer's job is specifically the
  *non-window* width changes the listener misses (the `#split-lr` drag).
- **Observe the element, not `window`.** The element's box is the exact quantity
  `fitProgressColumns` measures via `FitAddon.proposeDimensions()`, so observing it
  directly is the tightest possible trigger.
- **No CSS change.** `overflow: hidden` is correct and stays; the defect is `cols`
  correctness, not a scroll-container issue. Fixing `cols` makes the clip moot
  because content no longer exceeds the width.
- **The existing zero-width guard already handles the default-80 case.** When the
  first fit measures 0 width it is skipped; the observer then fires once the
  element gains real width and fits correctly — no extra guard needed.

## Files touched

- `webapp/app.ts` — add the `ResizeObserver` in `ensureProgressTerminal`.
- Rebuild `webapp/dist` via `npm run build:webapp` (gitignored — not staged).

No CSS, no engine, no dependency changes.

## TDD note

This change is pure browser wiring (`new ResizeObserver(fit).observe(el)`) with no
extractable pure logic — the same category as the existing untested console DOM
functions (`fitProgressColumns`, `collapseProgressConsole`, …). Per
`~/.claude/guides/tdd.md`, a trivial non-branching wiring change carries no unit
test; it is verified by the headless/visual pass. No contrived
ResizeObserver-mock test is added.

## Step 1 — add the observer in `ensureProgressTerminal`

In `webapp/app.ts`, the tail of `ensureProgressTerminal` currently reads:

```ts
    document.getElementById("progress-copy")!.onclick = copyConsoleText;
    fitProgressColumns();
    window.addEventListener("resize", fitProgressColumns);
}
```

Change it to also observe the console element's size:

```ts
    document.getElementById("progress-copy")!.onclick = copyConsoleText;
    fitProgressColumns();
    window.addEventListener("resize", fitProgressColumns);
    // The window-resize listener misses width changes with no resize event — chiefly
    // dragging the sidebar↔rightcol splitter (#split-lr), which narrows the console.
    // A ResizeObserver on the console element re-fits `cols` on ANY box change, so
    // xterm always wraps at the visible width instead of overflowing (clipped) it (item 80).
    const consoleResizeObserver = new ResizeObserver(() => fitProgressColumns());
    consoleResizeObserver.observe(document.getElementById("progress-console")!);
}
```

`ResizeObserver` is a standard browser global (no import). The observer lives for
the page lifetime alongside the once-created terminal — no teardown needed (the
console is a persistent skeleton element).

## Step 2 — build + verify

- `tsc -p tsconfig.webapp.json --noEmit` and `npm run build:webapp` clean.
- Visual check (user's standing pass) at the repro
  (`http://127.0.0.1:7343/#/project/-Users-matkatmusicllc-Programming-jot-backup/timeline`
  or any project that logs long console lines): a console line longer than the
  console width wraps to the next row; then drag `#split-lr` to narrow the
  console and confirm previously-fitting long lines re-wrap at the new width.
- Do **not** run the test suite — the user runs it.

## Success criteria

- Long console lines wrap at the console's current width, including after a
  sidebar-splitter drag (no window resize).
- Typecheck + webapp build clean; no CSS/engine/dependency changes.
