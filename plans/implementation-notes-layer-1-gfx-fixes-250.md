## 2026-07-25:19:55:00 — Layer 1 View visual fixes (tasks 250, 245, 247)
Chat title: layer 1 gfx fixes 250
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/163804b9-9393-4236-ab4f-6e7ef6669ee9.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-250-245-247-layer1-visual-fixes.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-feedback-on-the-app-layer1-html-sorted-shore.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/layer1.html
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/layer1-page.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/layer1-page.test.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/bug screenshots/colliding filenames, commit nodes overlapping text.png
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/bug screenshots/on-disk above timeline bubble 2.png
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/bug screenshots/squashed bubble contents colliding.png

### Design decisions

- **Task 245 treatment = basename + full path on hover, not a truncated path.** The task left the
  treatment open. A trailing ellipsis on the full path was rejected on the evidence: in
  `on-disk above timeline bubble 2.png` six bubbles all render `demo-baseline/file-hist…`, so the
  shared *prefix* is what survives truncation and the distinguishing tail is what gets cut — the
  bubbles would stay mutually indistinguishable. The basename inverts that. `max-width` +
  `text-overflow: ellipsis` stays as the guard for a long basename.
- **The directory is not shown anywhere on the bubble.** Folder context is what the File Nav tree
  (tasks 252–255) is for, and the hover title keeps the whole path recoverable. Consequence to
  accept: two files sharing a basename in different folders render two identically-labelled
  bubbles, separable only by hover until File Nav lands.
- **Task 247 fixed by deriving `.filebox` padding-top, not by moving nodes.** `.sub` is abspos at
  `top: 24px` with a 15 px line box, so the header ends at y 39, while the lane began at y 30 and its
  `--axis-px: 0` node reaches 10 px above the lane top. 39 + 10 = 49 → `padding-top: 50px`. Nudging
  the node instead would have made it lie about its own timestamp.
- **`margin-top` deliberately left uncompensated.** Offsetting it by the padding would align the
  first node with its ruler tick, but the bubble's border-box top would then correspond to no
  instant — and that edge is exactly what task 250's leader points at. Verified: bubble top == its
  tick to within 1.5 px for all 807 widgets, at zoom 1 and 0.64, scrolled and unscrolled.
- **Task 250 leader is a CSS `::before`, no JS and no measurement.** `top: -2px` cancels the 2 px
  border so the line sits on the border-box top edge; `right: 100%` starts it at the bubble's left
  edge and it runs leftward, with the opaque sticky `.ruler` (z-index 8) painting over the excess so
  it always appears to begin at the gutter's right edge at any scroll position.
- **`isolation: isolate` on `.canvas` is load-bearing, not tidiness.** `zoom` creates a stacking
  context only when it is not 1, so at 100% zoom the leader's `z-index: -1` would escape to the root
  stacking context, paint behind `.viz-root`'s opaque background and be invisible. Confirmed
  `isolation=isolate` in the live page.

### Deviations

- **No named `getPathBasename` helper — the expression is inlined.** `webapp/layer1-page.ts` was
  already at the repo's hard 250-line cap (enforced by a Stop hook), so the plan's 3-line documented
  helper could not be added; two attempts were rejected by the hook at 259 and 251 lines. The
  basename is now computed inline as `pair.path.split("/").pop() ?? pair.path`, matching the idiom
  already inlined at `webapp/app-consent-model.ts:85`, and the rationale moved into the existing
  comment above `buildPairWidget` at no net line cost. This leaves `webapp/layered-app.ts`'s private
  `takeBasename` as an un-shared duplicate — see Open questions.
- **The leader's width is `calc(100vw / var(--zoom, 1))`, not the planned fixed `100000px`.** The
  plan named the fixed value's ceiling as acceptable; the live check proved it is not. This repo
  renders 805 pairs across a ~156,000 px canvas, and 291 bubbles sat beyond 100,000 px with their
  leaders stopping short of the gutter. The replacement is exact rather than merely bigger: a bubble
  the reader can see is by definition less than one scrollport width right of the pinned gutter, and
  dividing by the inherited `--zoom` cancels the scaling `.canvas` applies, so the *rendered* length
  is exactly 100vw at every zoom level. No ceiling remains.
- **No CSS-invariant unit test was added.** `setupLayer1Dom` injects only `layer1.html`'s *body*
  markup, so happy-dom never evaluates the stylesheet and cannot observe padding, ellipsis or a
  pseudo-element. Rather than regex-parse the CSS to re-derive its own arithmetic (a parser added to
  guard a constant), the derivation lives in a comment beside the value and the behaviour is verified
  by a headless CDP check — see Tradeoffs.

### Tradeoffs

- **CDP browser check instead of a unit test for the CSS.** Wrote
  `scratchpad/layer1-visual-check.mjs` (plain node + built-in WebSocket, no puppeteer) asserting, in
  a real headless Chrome against this repo's own 807 widgets: names are basenames that carry a title
  and stay inside their bubble; no commit node or hash label intersects the bubble header; every
  bubble has a dashed `::before` at `top: -2px`, `z-index: -1` long enough to reach the gutter; and
  each bubble's top edge matches its own ruler tick. Five scenarios pass — zoom 100 % and 64 %,
  unscrolled, scrolled 1,200 px, scrolled 120,000 px, and scrolled to the far edge (155,362 px).
  The script is scratch, not committed: it depends on a running viewer server and a real repo path,
  so it is a verification tool rather than a suite member.
- **Kept the mockup's absolutely-positioned header.** The alternative — making `.fname`/`.sub`
  in-flow so the header's real height pushes the lane down and no magic padding is needed — also
  gives the ellipsis for free, but an in-flow nowrap `.fname` contributes to max-content width, so
  every bubble would grow to fit its whole name unless `.filebox` were pinned to a fixed `width`,
  which would in turn force the self-widening orphan buckets into ellipsised rows. Larger diff,
  more risk, and it discards the signed-off mockup structure.
- **Leader passes behind bubbles rather than being clipped at them.** `.filebox`'s background is
  `color-mix(in srgb, var(--surface) 88%, transparent)`, so a leader crossing a bubble to its left
  shows faintly through it. It never overprints text (it is behind the background). Clipping the
  leader at the neighbouring bubble would require measuring `offsetLeft` per widget in JS.

### Open questions

1. **Should the faint leader show-through be removed?** A leader crossing a bubble to its left is
   visible at ~12 % through that bubble's background. One-token fix if unwanted: make `.filebox`'s
   background fully opaque (`var(--surface)`). Left as-is because it reads as a depth cue rather
   than a defect.
2. **Should `takeBasename` become a shared webapp helper?** `webapp/layered-app.ts:64` has a private
   `takeBasename`, `webapp/app-consent-model.ts:85` inlines the same expression, and this change adds
   a third site. `plans/coding-requirements.md` §3 wants one shared generic helper, but the natural
   home (`webapp/app-dom.ts`) is DOM-only, and `layer1-page.ts` has no line budget for an import.
   Wants its own task — extracting it now would mean touching two unrelated modules.
3. **Bubbles are 20 px taller everywhere.** `padding-top: 30px → 50px` applies to orphan buckets too
   (which incidentally fixes their first list row being drawn under `.sub`). If the extra height is
   unwelcome at scale, the real lever is task 251's measured ruler spacing.
4. **250 disk-node header collisions remain, by design.** The live check counts them separately and
   they are entirely the negative `onDisk − firstCommit` offset owned by tasks 248/249; commit-node
   collisions are now zero. Confirming this is the right split before 248/249 are planned.
