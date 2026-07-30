// Layer 1 + Layer 2 mockup code; data lives in fixture.js, markup and CSS in index.html.
import { BRANCHES, COMMITS, DISK, SESSIONS, SNAPSHOTS, basename, ms, titleAt, titlesOf }
  from "./fixture.js";
import { clearDiffPair, diffLines, extendDiffSelection, initDiffDrawer, renderInline, setDrawerTools,
         windowOps } from "./diff.js";

  // tasks #323/#324: the fixture node a dot stands for; a WeakMap, so discarded dots are collected.
  const nodeForDot = new WeakMap();
  // task #305: the last PLAINLY clicked node — the anchor a shift-click extends into a pair.
  let anchor = null;

  const PX_PER_HOUR = 2.5;  // locked with the user
  const CAP_PX = 24;        // 0.25" at 96dpi — the widest any single gap may render
  const FLOOR_PX = 16;      // the shipped per-gap floor
  const ROW_PX = 22;        // task #251: the height ONE node row (dot + 10px label) needs
  const SCALE = PX_PER_HOUR / 3600000;
  const MINIMAP_SMOOTH_LIMIT_PX = 4000;   // task #274
  const EXPAND_ROW_PX = 13;               // OPEN #284: one file name's row inside an expanded tick
  const LABEL_GAP_PX = 13;                // the least ON-SCREEN room two printed timestamps need

  // task #276: seconds AND hundredths, so instants seconds apart never render identically.
  const label = t => new Date(t).toISOString().slice(5, 22).replace("T", " ");
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls;
                                  if (txt != null) n.textContent = txt; return n; };
  const setPx = (n, px) => { n.style.setProperty("--axis-px", px); return n; };
  const byId = id => document.getElementById(id);

  // tasks #253/#254/#255 — the folder filter's whole state. Empty = show everything.
  const selectedFolders = new Set();
  // task #328: file leaves join the nav selection like folders; shift toggles membership.
  const selectedFiles = new Set();
  // task #326: a folder click only STORES the selection; the timeline narrows while the toggle is on.
  let onlySelectedIsOn = false;
  const inSelection = path => !onlySelectedIsOn || selectedFolders.size === 0 ||
    [...selectedFolders].some(f => path === f || path.startsWith(f + "/"));
  // task #292: the picked JSONLs, holding the fixture objects themselves. Empty = every session.  Two filters, one rule: a file is drawn only if BOTH pickers admit it.
  const selectedSessions = new Set();
  const touchedBySelection = path => selectedSessions.size === 0 ||
    [...selectedSessions].some(s => s.paths.includes(path));
  const isShown = path => inSelection(path) && touchedBySelection(path);
  // OPEN #284: the ruler row currently expanded into its file list, as an instant. One at a time — the list changes the axis layout, so two open rows would be two stacked shifts to reason about.
  let expandedInstant = null;
  // The instants the current selection sits on: what the gutter bolds and what keeps a leader up.
  let selectedInstants = [];
  // The bubbles' scale. Declared with the rest of the view state because the gutter's own layout reads it — the ruler is outside the zoom, so it converts axis px to screen px itself.
  let zoom = 1;
  // OPEN #282
  let timeSource = "committer";
  const commitInstant = c => ms(timeSource === "author" ? c.wrote : c.at);
  // task #304: snapshots are left OUT of the model at Layer 1, never hidden in CSS — a hidden node would still hold its ruler entry, so Layer 1 would not read as Layer 1.
  let layer = 1;
  const snapshotsFor = path => layer === 1 ? [] : SNAPSHOTS.filter(s => s.path === path);

  // ---- task #251: content-driven ruler spacing -------------------------------------------------
  // Any two CONSECUTIVE nodes of one widget are forced at least ROW_PX apart, so a bubble is always tall enough to show its name, its commits and its on-disk rows. The linear/capped rule sets the baseline; content only ever pushes entries further apart, never closer.  `extraAt` is task #284's expanded ruler row: the file list it opens lives IN the gutter, so the rows below it — and therefore every bubble and every node below it — must move down by exactly the list's height (user, 2026-07-26). Feeding it in HERE rather than positioning the list over the canvas is what makes a bubble that spans the expanded instant grow instead of being written over: a widget's span is `last node pos - first node pos`, both read from this one map.
  function resolveOffsets(instants, rowsAt, extraAt = new Map()) {
    const pos = new Map([[instants[0], 0]]);
    for (let i = 1; i < instants.length; i += 1) {
      const t = instants[i], prev = instants[i - 1];
      const linear = Math.min(Math.max((t - prev) * SCALE, FLOOR_PX), CAP_PX);
      pos.set(t, pos.get(prev) + Math.max(linear, (rowsAt.get(prev) ?? 1) * ROW_PX) + (extraAt.get(prev) ?? 0));
    }
    return pos;
  }

  // task #292: where an ARBITRARY time sits on an axis built from events. A session opens and closes between events, not on them, so its band has to be read off the two entries it falls between — and read by interpolation, because the axis is capped and floored rather than linear in time.
  function axisAt(t, pos, instants) {
    if (t <= instants[0]) return pos.get(instants[0]);
    const i = instants.findIndex(x => x >= t);
    if (i < 0) return pos.get(instants.at(-1));
    const before = instants[i - 1], after = instants[i];
    if (after === t) return pos.get(after);
    return pos.get(before) +
      (pos.get(after) - pos.get(before)) * ((t - before) / (after - before));
  }

  function buildModel() {
    const dir = byId("dir").value.trim().replace(/\/$/, "");
    const repo = byId("repo").value.trim().replace(/\/$/, "");
    const unrelated = repo !== dir;

    const repoPaths = [...new Set(COMMITS.flatMap(c => c.files))];
    const diskPaths = DISK.map(f => f.path);
    const pairedAll = unrelated ? [] : repoPaths.filter(p => diskPaths.includes(p));

    // The filter bites HERE, before instants are collected — which is what makes the timeline range shrink to the selected folders (#253) rather than just hiding widgets.
    const paired = pairedAll.filter(isShown);
    const repoOrphans = repoPaths.filter(p => !pairedAll.includes(p)).filter(isShown);
    const diskOrphans = DISK.filter(f => !pairedAll.includes(f.path)).filter(f => isShown(f.path));

    const widgets = paired.map(path => {
      const disk = DISK.find(f => f.path === path);
      const nodes = COMMITS.filter(c => c.files.includes(path))
        .map(c => ({ t: commitInstant(c), cls: "n-commit", text: c.hash.slice(0, 8), kind: "commit", hash: c.hash }));
      // task #301: just another node kind, so it inherits the ladder, the tie groups, the ruler rows and the leaders with no second code path. No snapshots means no row (S18 retired that).
      for (const s of snapshotsFor(path))
        nodes.push({ t: ms(s.at), cls: "n-snap", text: `${s.version} 📸`, kind: "snapshot",
                     version: s.version, session: s.session, line: s.line });
      // One node when born === modified, two when they differ.
      if (disk.born !== disk.at)
        nodes.push({ t: ms(disk.born), cls: "n-disk n-created", text: "created at", kind: "created" });
      nodes.push({ t: ms(disk.at), cls: "n-disk", text: "on disk", kind: "disk" });
      nodes.sort((a, b) => a.t - b.t);
      // A commit and an mtime can land on the SAME instant — README.md does. Drawing both at one axis position is `5636d8ec` overprinting `on disk` in the bug screenshots, so tied nodes get successive row slots and the ruler pays for them (#247/#251); #259 then draws the group.
      nodes.forEach((n, i) => { n.slot = i > 0 && nodes[i - 1].t === n.t ? nodes[i - 1].slot + 1 : 0; });
      return { path, nodes };
    });

    // A bucket row carries the SAME shape a node does — kind, instant, and a hash for a commit — so it can be inspected exactly like a paired file's node (user, 2026-07-26). A repo-only file is absent from disk but its bytes are still in the repository at its LAST commit, which is the row's own instant; a disk-only file is read from the working tree.
    const lastCommitFor = p => COMMITS.filter(c => c.files.includes(p)).sort((a, b) => commitInstant(a) - commitInstant(b)).at(-1);
    const bucketRows = which => which === "repo"
      ? repoOrphans.map(p => ({ path: p, t: commitInstant(lastCommitFor(p)), kind: "commit", hash: lastCommitFor(p).hash }))
      : diskOrphans.map(f => ({ path: f.path, t: ms(f.at), kind: "disk" }));
    const noDisk = bucketRows("repo").sort((a, b) => a.t - b.t);
    const noRepo = bucketRows("disk").sort((a, b) => a.t - b.t);

    const instants = [...new Set([
      ...widgets.flatMap(w => w.nodes.map(n => n.t)),
      ...noDisk.map(r => r.t), ...noRepo.map(r => r.t),
    ])].sort((a, b) => a - b);

    // How many stacked rows any one widget needs at a given instant — the input to #251's spacing.
    const rowsAt = new Map(instants.map(t => [t, 1]));
    for (const w of widgets)
      for (const n of w.nodes) rowsAt.set(n.t, Math.max(rowsAt.get(n.t), n.slot + 1));

    // task #275: how many events share each instant, which is what a ruler row reports in (n).
    const countAt = new Map(instants.map(t => [t, 0]));
    for (const w of widgets) for (const n of w.nodes) countAt.set(n.t, countAt.get(n.t) + 1);
    for (const r of [...noDisk, ...noRepo]) countAt.set(r.t, countAt.get(r.t) + 1);

    return { widgets, noDisk, noRepo, instants, rowsAt, countAt, pairedAll, repoPaths, diskPaths };
  }

  // ---- tasks #268/#275: which rows the gutter prints ------------------------------------------
  // Instants whose LABELS read the same collapse into one row carrying the summed count (#268), and the row keeps the earliest instant's offset. A row also remembers every instant it stands for, so a click and a leader-line hover answer for all of them, not just the first.
  function listRulerRows(instants, pos, countAt) {
    const rows = [];
    for (const t of instants) {
      const text = label(t);
      const last = rows.at(-1);
      if (last && last.text === text) { last.count += countAt.get(t); last.instants.push(t); continue; }
      // Distinct labels still too close to read: skip the label, keep the leader (a skipped row still has bubbles sitting on it). The gap is measured in SCREEN px — the timestamps keep their size at every zoom, so zooming out is exactly what makes two rows collide, and the axis distance that clears a label grows as the axis itself shrinks.
      if (last && (pos.get(t) - last.axisPx) * zoom < LABEL_GAP_PX) {
        last.instants.push(t); last.count += countAt.get(t); continue;
      }
      rows.push({ text, axisPx: pos.get(t), count: countAt.get(t), instants: [t] });
    }
    return rows;
  }

  let model = null;   // the last rendered model, read by the ruler-click and find lookups

  function render() {
    const m = model = buildModel();
    const stage = byId("stage");
    const ruler = byId("ruler");
    stage.replaceChildren();
    ruler.replaceChildren(el("div", "rail"));
    byId("leaders").replaceChildren();

    renderNav(m);
    renderSessions();
    syncSourceButtons();
    byId("crumb").textContent =
      `${m.widgets.length} pairs · ${m.noDisk.length} repo-only · ${m.noRepo.length} disk-only` +
      (selectedFolders.size ? ` · filtered to ${[...selectedFolders].join(", ")}` : "") +
      (selectedSessions.size ? ` · ${[...selectedSessions].map(s => s.file).join(", ")}` : "");

    byId("ranges").replaceChildren();
    byId("washes").replaceChildren();
    if (!m.instants.length) {
      stage.appendChild(el("div", "nopairs", "Nothing selected."));
      drawMinimap();
      return;
    }

    // TWO passes, and the first one exists only to answer "which instants did the expanded row absorb?" — a printed row can stand for several instants (task #268's merge and the 13 px label skip), and the height its file list adds depends on how many files those instants hold.  The layout then has to be redone with that height in it. Cheap, and it keeps the merge rule and the expansion from having to know about each other.
    const draft = resolveOffsets(m.instants, m.rowsAt);
    const expandedRow = listRulerRows(m.instants, draft, m.countAt)
      .find(row => row.instants.includes(expandedInstant));
    const expandedEvents = expandedRow === undefined ? [] : listEventsAtInstants(m, expandedRow.instants);
    // The list is drawn in the gutter, which the zoom does not touch, so its height is screen px — divided back into axis px, because that is the space `resolveOffsets` deals in.
    const extraAt = new Map(expandedEvents.length
      ? [[expandedRow.instants.at(-1), (expandedEvents.length * EXPAND_ROW_PX + 4) / zoom]] : []);

    const pos = resolveOffsets(m.instants, m.rowsAt, extraAt);
    const rowY = n => pos.get(n.t) + n.slot * ROW_PX;   // the node's own row within its instant
    m.pos = pos;

    // The gutter. Every printed row is also the navigation control for the instants it stands for.
    for (const row of listRulerRows(m.instants, pos, m.countAt)) {
      const tick = setPx(el("div", "tick", `${row.text} (${row.count})`), row.axisPx);
      tick.dataset.instants = row.instants.join(",");
      // Marked when the row would EXPAND — the same test the click makes, so the underline never promises a list the click then refuses to open.
      if (listEventsAtInstants(m, row.instants).length > 1) tick.classList.add("multi");
      if (expandedRow !== undefined && row.axisPx === expandedRow.axisPx && expandedEvents.length) {
        tick.classList.add("expanded");
        tick.appendChild(buildTickFileList(expandedEvents));
      }
      // task #292: this row's time falls inside a picked session.
      if ([...selectedSessions].some(s => row.instants.some(t => t >= ms(s.started) && t <= ms(s.ended))))
        tick.classList.add("inrange");
      ruler.appendChild(tick);
    }

    // task #292: per picked JSONL, a wash over the stretch it covers and a bar for its extent. Both are the same two numbers, so they are built together; the name is a tooltip rather than printed text — the lane is 7 px wide, which is the price of never covering a file.
    const mark = (cls, from, span) => {
      const node = setPx(el("div", cls), from);
      node.style.setProperty("--span-px", span);
      return node;
    };
    const spans = [...selectedSessions].map((session, slot) => {
      const from = axisAt(ms(session.started), pos, m.instants);
      // The BAR is the session's own two times, wherever they fall between events.
      const bar = mark("range", from, axisAt(ms(session.ended), pos, m.instants) - from);
      bar.style.setProperty("--slot", slot);
      bar.title = `${session.file}\n${label(ms(session.started))} → ${label(ms(session.ended))}`;
      // The WASH is the NODES those times reach (user, 2026-07-27) — it closes on the first and last event inside the window, half a row clear of each so the dots and labels sit inside it rather than on its edge. A session whose window catches no event gets a bar and no wash.
      const covered = m.instants.filter(t => t >= ms(session.started) && t <= ms(session.ended));
      if (!covered.length) return { bar };
      const top = pos.get(covered[0]) - ROW_PX / 2;
      const foot = pos.get(covered.at(-1)) + (m.rowsAt.get(covered.at(-1)) - 1) * ROW_PX + ROW_PX / 2;
      return { bar, wash: mark("range-wash", top, foot - top) };
    });
    byId("washes").replaceChildren(...spans.map(s => s.wash).filter(Boolean));
    byId("ranges").replaceChildren(...spans.map(s => s.bar));

    // One dashed line per ruler ENTRY, hidden until something asks for it.
    byId("leaders").replaceChildren(...m.instants.map(t => {
      const line = setPx(el("div", "leader"), pos.get(t));
      line.dataset.instant = t;
      return line;
    }));

    // One widget per pair. EVERY node lives inside its own bubble — the stray hashes below a bubble (#248) and the stray "on disk" above one (#249) are what this must never produce, so the bubble's height is derived from its own last node.
    for (const w of m.widgets) {
      const start = rowY(w.nodes[0]), end = rowY(w.nodes.at(-1));
      const box = setPx(el("div", "filebox"), start);
      box.dataset.path = w.path;
      box.dataset.instant = w.nodes[0].t;
      // #280: the full path lives on `data-path`, never on `title` — the native tooltip is delayed, unstyled and gone on the first mouse move, which the user rejected. The swap below plus the `.fname:hover` rule is the in-page reveal.
      const name = el("div", "fname", basename(w.path));
      name.dataset.path = w.path;
      name.addEventListener("mouseenter", () => { name.textContent = w.path; });
      name.addEventListener("mouseleave", () => { name.textContent = basename(w.path); });
      box.append(name, el("div", "sub", `${w.nodes.filter(n => n.kind === "commit").length} commits · on disk`));

      const lane = setPx(el("div", "lane"), 0);
      lane.style.setProperty("--span-px", end - start);
      lane.appendChild(el("div", "lrail"));
      // #259 first, so the rectangle stays behind the dots it groups.
      for (const marker of tieGroupMarkers(w.nodes, start, rowY)) lane.appendChild(marker);
      for (const n of w.nodes) addNode(lane, rowY(n) - start, n, w.path);
      box.appendChild(lane);
      stage.appendChild(box);
    }
    if (!m.widgets.length) stage.appendChild(el("div", "nopairs", "No git ↔ on-disk pairs."));

    addBucket(stage, "No on-disk match", m.noDisk, pos, "bucket-disk");
    addBucket(stage, "No repository match", m.noRepo, pos, "bucket-repo");
    markSelectedTicks();   // the gutter is rebuilt every render; the selection is not
    drawMinimap();
  }

  // task #259: one dashed rectangle per run of nodes sharing an instant. A single node is not a tie.  `rowY` is the same widget-relative row the nodes themselves are placed at, so the rectangle can never drift off the dots it groups.
  function tieGroupMarkers(nodes, startPx, rowY) {
    const out = [];
    for (const t of new Set(nodes.map(n => n.t))) {
      const tied = nodes.filter(n => n.t === t);
      if (tied.length < 2) continue;
      const marker = setPx(el("div", "tiegroup"), rowY(tied[0]) - startPx);
      marker.style.setProperty("--span-px", (tied.length - 1) * ROW_PX);
      marker.dataset.instant = t;
      out.push(marker);
    }
    return out;
  }

  // OPEN #257: a commit node is always clickable. An on-disk node is clickable only when it is the LATEST disk node — the "created at" node is inert unless created === modified, in which case the file has exactly one disk node and that node IS the latest.
  function addNode(lane, px, node, path) {
    const hot = node.kind !== "created";
    const dot = setPx(el("i", `node ${node.cls}${hot ? " hot" : ""}`), px);
    const tag = setPx(el("span", `nlabel ${hot ? "hot" : "cold"}`, node.text), px);
    for (const element of [dot, tag]) {
      element.dataset.instant = node.t;
      element.dataset.path = path;
      // What distinguishes this node from a SIBLING sharing its instant — see jumpToPath.
      element.dataset.event = node.text;
    }
    if (node.kind === "commit") dot.title = node.hash;
    if (hot) {
      nodeForDot.set(dot, node);
      // task #305: shift extends the anchor into a pair; a plain click resets to one node.
      const open = event => {
        if (event.shiftKey && anchor && byId("drawer").classList.contains("open"))
          return extendDiffSelection(anchor, dot, path);
        openDrawer(path, node, dot);
      };
      dot.addEventListener("click", open);
      tag.addEventListener("click", open);
    } else {
      tag.title = "created-at is not the latest on-disk state — nothing to show";
    }
    lane.append(dot, tag);
  }

  // A bucket's rows are PLACED, not stacked: each one sits at its own instant, exactly as a pair's nodes do (user, 2026-07-26 — the second row of "No on-disk match" was drawn immediately under the first while its timestamp was hours further down the ruler). A row's `--axis-px` is relative to the bucket's own offset, and the list starts at the same in-box height a `.lane` does, so a row lands on the same y as the tick for its instant.
  function addBucket(stage, title, rows, pos, id) {
    if (!rows.length) return;
    const start = pos.get(rows[0].t);
    const box = setPx(el("div", "filebox bucket"), start);
    box.id = id;
    box.dataset.instant = rows[0].t;
    box.append(el("div", "fname", title), el("div", "sub", `${rows.length} files`));
    const ul = el("ul");
    ul.style.setProperty("--span-px", pos.get(rows.at(-1).t) - start);
    for (const r of rows) {
      const li = setPx(el("li"), pos.get(r.t) - start);
      li.dataset.instant = r.t;
      li.dataset.path = r.path;
      const p = el("span", null, r.path); p.title = r.path;
      li.append(p, el("em", null, label(r.t)));
      // An orphan is inspectable like any node: a repo-only file opens `git show <hash>:<path>` at its last commit, a disk-only file opens the working tree.
      li.addEventListener("click", () => openDrawer(r.path, r, li));
      ul.appendChild(li);
    }
    box.appendChild(ul);
    stage.appendChild(box);
  }

  // ---- dashed leader lines, ON DEMAND (user, 2026-07-26) ---------------------------------------
  // The lines are keyed by INSTANT, not by pixel: a bubble, its nodes and the gutter row all carry `data-instant`, so one delegated hover handler serves all three sources and no geometry is measured. `pinned` is the selection half — a found bubble, a ruler-clicked node, the node whose contents the drawer is showing — and survives until the selection changes.
  const pinnedInstants = new Set();
  let hoveredInstants = new Set();

  function paintLeaders() {
    for (const line of document.querySelectorAll(".leader")) {
      const t = Number(line.dataset.instant);
      line.classList.toggle("on", pinnedInstants.has(t) || hoveredInstants.has(t));
    }
  }
  function pinInstants(instants) {
    pinnedInstants.clear();
    for (const t of instants) pinnedInstants.add(Number(t));
    paintLeaders();
  }
  const instantsOn = element => (element?.dataset.instants ?? element?.dataset.instant ?? "")
    .split(",").filter(Boolean).map(Number);

  // Hover: the closest ancestor carrying an instant wins, which is the node when the pointer is on a node and the bubble when it is anywhere else inside one.
  byId("root").addEventListener("pointerover", event => {
    const source = event.target.closest?.("[data-instant], [data-instants]");
    hoveredInstants = new Set(instantsOn(source));
    paintLeaders();
  });
  byId("root").addEventListener("pointerleave", () => { hoveredInstants = new Set(); paintLeaders(); });

  // ---- tasks #260/#266 + OPEN #267/#283/#284: the ruler row as a control -----------------------
  // ONE selection at a time, and it PERSISTS: it is switched off by the next landing or by emptying the find box, never by a timer. A mark that fades is gone by the time the reader has finished scrolling to what it marked.
  function highlight(elements) {
    for (const lit of document.querySelectorAll(".found")) lit.classList.remove("found");
    for (const element of elements) element.classList.add("found");
    // A bubble carries its FIRST node's instant, so including it here bolded a second gutter row whenever the picked node was not the first one. When something more precise than the bubble is in the selection (a node, its label, a bucket row) that is what the gutter follows; the bubble only speaks for itself when it was selected alone, as by a find-box match.
    const precise = elements.filter(e => !e.classList.contains("filebox"));
    selectedInstants = (precise.length ? precise : elements)
      .map(e => Number(e.dataset.instant)).filter(t => !Number.isNaN(t));
    pinInstants(selectedInstants);      // the green dashes for the selected row
    markSelectedTicks();
  }

  // The gutter half of that selection: the row(s) standing for the selected instant go bold.  Re-applied after every render because the ticks are rebuilt from scratch each time.
  function markSelectedTicks() {
    for (const tick of document.querySelectorAll(".ruler .tick"))
      tick.classList.toggle("selected", instantsOn(tick).some(t => selectedInstants.includes(t)));
  }

  // Put `target` in the middle of the part of the timeline the reader can actually SEE (user, 2026-07-26). Two things eat the scrollport and neither moves the scroll box: the sticky ruler covers its left edge, and the Detail View drawer — a flex sibling — has already narrowed the pane by the time this runs. So the visible strip is the pane's own box minus the gutter's width, and the target is centred in THAT, not in the scrollport.  scrollIntoView cannot express this: `inline: "center"` centres on the full scrollport, which is what left a landed bubble sitting behind the ruler with the drawer open.
  function centerInVisibleTimeline(target) {
    const pane = byId("timelines");
    const paneBox = pane.getBoundingClientRect();
    const gutter = byId("ruler").getBoundingClientRect().width;
    const box = target.getBoundingClientRect();
    pane.scrollBy({
      left: (box.left + box.width / 2) - (paneBox.left + gutter + (paneBox.width - gutter) / 2),
      top: (box.top + box.height / 2) - (paneBox.top + paneBox.height / 2),
      behavior: "smooth",
    });
  }

  // Land on a file. What is CENTRED is the node — not the bubble: a bubble is as tall as its own ladder, so centring one thousands of px tall puts everything on it off screen (#277). A dot is 15 px, so centring it is unambiguous and its bubble comes with it.
  function landOnBubble(box, extra = []) {
    const focus = extra.find(e => e.classList.contains("node") || e.tagName === "LI")
      ?? box.querySelector(".node") ?? box;
    centerInVisibleTimeline(focus);
    highlight([box, ...extra]);
  }

  // Every EVENT at any of `instants`, one entry each — NOT one per file. The row's own count is an event count (task #275: "the number of events that occurred at that timestamp"), so a file with both a commit and its on-disk mtime on one instant contributes TWO, and listing it once made the list disagree with the (n) beside it (user, 2026-07-26: "(3) is shown but only 2 file names are displayed"). An orphan's entry is its own PATH with the bucket named as its kind — the bucket's title used to be listed as though "No on-disk match" were a file.
  function listEventsAtInstants(m, instants) {
    const at = t => instants.includes(t);
    return [
      // `n.text` is already the node's own name — the hash, "on disk", and for #302 `@vN 📸`, so the row shape needs no snapshot case. `session` is undefined elsewhere; #303's click reads it.
      ...m.widgets.flatMap(w => w.nodes.filter(n => at(n.t))
        .map(n => ({ path: w.path, t: n.t, kind: n.text, session: n.session }))),
      // An orphan's row is its NAME alone. The bucket's title is not a property of the file and the user rejected seeing it here twice over (2026-07-26) — the bucket the name jumps to is what says which direction the orphan is.
      ...m.noDisk.filter(r => at(r.t)).map(r => ({ path: r.path, t: r.t, kind: "" })),
      ...m.noRepo.filter(r => at(r.t)).map(r => ({ path: r.path, t: r.t, kind: "" })),
    ];
  }

  // The list itself, a child of its tick so it opens directly under the timestamp inside the gutter.  Clicking a name jumps to that file (user, 2026-07-26) — the row stays expanded, so the reader can walk the list one file at a time without re-opening it.
  function buildTickFileList(events) {
    const list = el("div", "tickfiles");
    for (const hit of events) {
      const row = el("button", null, `${basename(hit.path)}  ${hit.kind}`.trimEnd());
      row.title = hit.path;
      // task #303: a snapshot row ALSO answers "which JSONL did this come from" — it flashes that session in the nav without selecting it, because selecting is what filters the timeline.
      row.addEventListener("click", event => {
        event.stopPropagation();
        jumpToPath(hit.path, hit.t, hit.kind);
        if (hit.session) flashSession(hit.session);
      });
      list.appendChild(row);
    }
    return list;
  }

  byId("ruler").addEventListener("click", event => {
    const tick = event.target.closest(".tick");
    if (!tick) return;
    const instants = instantsOn(tick);
    const events = listEventsAtInstants(model, instants);
    // OPEN #284: more than one EVENT at this row -> expand it into their names rather than silently jumping to whichever the lookup found first. Re-clicking the open row closes it.
    if (events.length > 1) {
      expandedInstant = instants.includes(expandedInstant) ? null : instants[0];
      pinInstants(expandedInstant === null ? [] : [expandedInstant]);
      render();
      return;
    }
    if (events.length === 1) jumpToPath(events[0].path, events[0].t, events[0].kind);
  });

  // Land on the one file `path` names, and mark what is drawn for it AT `t` — OPEN #267/#283's "which node did that row mean". The bucket branch is not a special case bolted on: an orphan has no bubble of its own, so the thing drawn for it is its ROW inside a bucket, and that row is what gets marked. Shared by the File Nav leaf click, the expanded ruler row and a single-event tick.
  //
  // `event` is the row's own name for the node — the hash, "on disk", "@v3 📸". Without it a path and an instant name TWO nodes whenever a file's commit and its snapshot share a second, so clicking one ruler row lit both (user, 2026-07-27). The File Nav passes none and still means the file.
  function jumpToPath(path, t, event = null) {
    const box = [...document.querySelectorAll(".filebox")].find(b => b.dataset.path === path);
    if (box) return landOnBubble(box, [...box.querySelectorAll(".node, .nlabel")]
      .filter(n => Number(n.dataset.instant) === t)
      .filter(n => event === null || n.dataset.event === event));
    const row = [...document.querySelectorAll(".bucket li")].find(li => li.dataset.path === path);
    if (row) landOnBubble(row.closest(".filebox"), [row]);
  }

  // Escape closes the expanded row, which is the only page state a click cannot obviously undo.
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || expandedInstant === null) return;
    expandedInstant = null;
    pinInstants([]);
    render();
  });

  // ---- tasks #261/#271/#272/#273/#277/#278: the Find bubble box --------------------------------
  // Matching is on the BASENAME the bubble displays. The box owns the cycle position; a File Nav click does NOT come through here (#278) — it targets one exact path and leaves this readout alone, which is what stopped a `.gitignore` click cycling every gitignore in the render.
  let cycleTerm = "", cycleIndex = 0;
  const findMatches = term => [...document.querySelectorAll(".filebox:not(.bucket)")]
    .filter(b => basename(b.dataset.path ?? "").toLowerCase().includes(term));

  function stepFind(delta) {
    const term = byId("find-file").value.trim().toLowerCase();
    if (!term) return clearFind();
    const matches = findMatches(term);
    if (!matches.length) { byId("find-status").textContent = "0 of 0"; return; }
    cycleIndex = term === cycleTerm ? (cycleIndex + delta + matches.length) % matches.length : 0;
    cycleTerm = term;
    byId("find-status").textContent = `${cycleIndex + 1} of ${matches.length}`;
    landOnBubble(matches[cycleIndex]);
  }
  function clearFind() {
    cycleTerm = ""; cycleIndex = 0;
    byId("find-status").textContent = "";
    highlight([]);   // #273: the marks, the bolded gutter row and its leader go with the readout
  }
  byId("find-file").addEventListener("input", () => { if (!byId("find-file").value.trim()) clearFind(); });
  byId("find-file").addEventListener("keydown", e => { if (e.key === "Enter") stepFind(1); });
  byId("find-next").addEventListener("click", () => stepFind(1));
  byId("find-prev").addEventListener("click", () => stepFind(-1));

  // ---- tasks #252/#253/#254/#255/#278/#281: File Nav -------------------------------------------
  // Shape: the same folder/leaf tree the current webapp renders. Every identified file is here — paired, orphaned, and repo-only paths that no longer exist on disk (rendered .deleted).
  function renderNav(m) {
    const query = byId("nav-search").value.trim().toLowerCase();
    const all = [...new Set([...m.repoPaths, ...m.diskPaths])].sort()
      .filter(p => !query || p.toLowerCase().includes(query));   // #281
    const root = { name: "", folders: new Map(), files: [] };
    for (const path of all) {
      let node = root;
      const segments = path.split("/");
      for (const segment of segments.slice(0, -1)) {
        if (!node.folders.has(segment))
          node.folders.set(segment, { name: segment, folders: new Map(), files: [] });
        node = node.folders.get(segment);
      }
      node.files.push({ name: segments.at(-1), path, deleted: !m.diskPaths.includes(path) });
    }
    const nav = byId("nav");
    nav.replaceChildren(...(all.length ? renderNavLevel(root, "") : [el("div", "navempty", "no matches")]));
    byId("clear-filter").disabled = selectedFolders.size === 0;
  }

  function renderNavLevel(node, prefix) {
    const out = [];
    for (const folder of node.folders.values()) {
      const full = prefix ? `${prefix}/${folder.name}` : folder.name;
      const summary = el("summary", "file-folder-name", folder.name);
      if (selectedFolders.has(full)) summary.classList.add("selected");
      // A REAL element, not a ::before, so `event.target` can tell the triangle from the name.
      const toggle = el("span", "file-folder-toggle");
      summary.prepend(toggle);
      summary.addEventListener("click", event => {
        // Expanding is this click's default action, so return rather than cancel — cancelling killed it.
        if (event.target === toggle) return;
        // A click on the NAME filters. Shift extends (#255); clicking the only selected one clears (#254).
        event.preventDefault();
        if (!event.shiftKey) {
          const only = selectedFolders.size === 1 && selectedFolders.has(full);
          selectedFolders.clear();
          if (!only) selectedFolders.add(full);
        } else if (!selectedFolders.delete(full)) selectedFolders.add(full);
        render();
        refreshMultiDrawer();
      });
      const details = el("details", "file-folder");
      details.open = true;
      details.append(summary, el("div", "file-folder-kids", null));
      details.lastChild.append(...renderNavLevel(folder, full));
      out.push(details);
    }
    for (const file of node.files) {
      const item = el("div", `file-item${file.deleted ? " deleted" : ""}`, file.name);
      item.title = file.deleted ? `${file.path} (deleted)` : file.path;
      // #278: EXACT path, one destination, no cycling and no find-box readout — the same jumpToPath the expanded ruler row uses, so a leaf and a listed name can never land differently.  task #325: also selects the on-disk node, by dispatching the click the stage already handles.  `:not(.n-created)` is load-bearing: created-at also carries `.n-disk`, sorts first, and is inert.  The clicked ROW marks itself: a deleted file has no bubble, so nothing else answers the click.
      if (selectedFiles.has(file.path)) item.classList.add("selected");
      item.addEventListener("click", event => {
        // task #328: shift toggles this leaf's membership without clearing others or moving the stage.
        if (event.shiftKey) {
          if (!selectedFiles.delete(file.path)) selectedFiles.add(file.path);
          item.classList.toggle("selected", selectedFiles.has(file.path));
          refreshMultiDrawer();
          return;
        }
        selectedFiles.clear();
        selectedFiles.add(file.path);
        for (const lit of document.querySelectorAll("#nav .file-item.selected")) lit.classList.remove("selected");
        item.classList.add("selected");
        jumpToPath(file.path);
        const box = [...document.querySelectorAll(".filebox")].find(b => b.dataset.path === file.path);
        box?.querySelector(".node.n-disk:not(.n-created)")?.click();
      });
      out.push(item);
    }
    return out;
  }

  // ---- task #292: the JSONL picker --------------------------------------------------------------
  // The folder tree's selection rules, applied to sessions: a plain click picks one, a plain click on the only picked one clears it, shift extends. What it filters is the FILE LIST — each surviving file keeps its whole history, and the band drawn over the canvas is what says which stretch of that history the session is answerable for.
  function renderSessions() {
    // task #309: filters the LIST, never the timeline — filtering the timeline is what CLICKING a row does, and the two must stay separate. A session with no customTitle matches only an empty box.
    const query = byId("session-search").value.trim().toLowerCase();
    const shown = SESSIONS.filter(s => !query || titlesOf(s).some(t => t.toLowerCase().includes(query)));
    byId("sessions").replaceChildren(...(shown.length ? shown : []).map(session => {
      const item = el("div", "session-item");
      item.dataset.file = session.file;   // task #303: how the flash finds this row again
      if (selectedSessions.has(session)) item.classList.add("selected");
      // task #306: the customTitle is what identifies a session to a reader, so it comes before the timestamp — one row per DISTINCT title, and nothing at all when the session was never named.
      const titles = titlesOf(session);
      item.append(el("div", "sname", session.file),
                  ...titles.map(t => el("div", "stitle", t)),
                  el("div", "smeta", `${label(ms(session.started)).slice(0, 11)} · ${session.paths.length} files`));
      item.title = [...titles, `${label(ms(session.started))} → ${label(ms(session.ended))}`,
                    ...session.paths].join("\n");
      item.addEventListener("click", event => {
        if (!event.shiftKey) {
          const only = selectedSessions.size === 1 && selectedSessions.has(session);
          selectedSessions.clear();
          if (!only) selectedSessions.add(session);
        } else if (!selectedSessions.delete(session)) selectedSessions.add(session);
        render();
      });
      return item;
    }));
    if (!shown.length) byId("sessions").appendChild(el("div", "navempty", "no matches"));
    byId("clear-sessions").disabled = selectedSessions.size === 0;
  }

  // ---- task #303: highlight a JSONL, then let it fade. ONE helper, two callers (#303's ruler row,
  // #305's snapshot node). It must NOT select the session — selecting is what filters the timeline — so its colour is --c-echo, never the --c-script the selection owns.  FLASH_MS is the one place the duration lives; the CSS reads it back off the element.
  const FLASH_MS = 2600;
  // task #308: one click can answer for SEVERAL JSONLs, so every named row lights together and the caller passes its best match FIRST — that is the one the scroll follows. A row filtered out by #309's search simply is not there to light.
  function flashSession(...files) {
    const pane = byId("sessions");
    for (const lit of pane.querySelectorAll(".flash, .flash-lead")) lit.classList.remove("flash", "flash-lead");
    const rows = files.map(f => pane.querySelector(`[data-file="${f}"]`)).filter(Boolean);
    for (const item of rows) {
      // Re-clicking restarts the fade, and an animation only restarts once the class has been off for a layout — hence the reflow read.
      item.classList.remove("flash");
      void item.offsetWidth;
      item.style.setProperty("--flash-ms", `${FLASH_MS}ms`);
      item.classList.add("flash");
      setTimeout(() => item.classList.remove("flash"), FLASH_MS);
    }
    // The pane holds every session, so the answer is often below the fold — a flash nobody can see answers nothing (user, 2026-07-27). Nothing scrolls while one lit row is already readable.  The lead is the caller's best match and the only row a scroll ever follows — marked so the headless run can read which session answered, which a scroll offset does not say.
    rows[0]?.classList.add("flash-lead");
    setTimeout(() => rows[0]?.classList.remove("flash-lead"), FLASH_MS);
    if (rows.length && !rows.some(isInSessionsView))
      rows[0].scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  const isInSessionsView = row => {
    const pane = byId("pane-sessions").getBoundingClientRect(), r = row.getBoundingClientRect();
    return r.bottom > pane.top && r.top < pane.bottom;
  };

  // ---- task #308: a bubble click highlights the JSONLs that touched that file -------------------
  // HIGHLIGHT, not select — selecting is what filters the timeline. The clicked POINT is load-bearing: a bubble can span months and its sessions are spread across that span, so the row that gets scrolled to is the session nearest the instant under the cursor, not the first one in the list.
  byId("stage").addEventListener("click", event => {
    const box = event.target.closest(".filebox");
    if (!box?.dataset.path || event.target.closest(".node, .nlabel")) return;
    const touched = SESSIONS.filter(s => s.paths.includes(box.dataset.path));
    if (!touched.length) return;
    const t = instantUnder(box, event.clientY);
    flashSession(...touched.sort((a, b) => sessionGap(a, t) - sessionGap(b, t)).map(s => s.file));
  });
  // 0 while the instant is inside the session's window, else how far outside it falls.
  const sessionGap = (s, t) => Math.max(0, ms(s.started) - t, t - ms(s.ended));
  // The ruler's own map, read backwards: the click's axis offset -> the nearest entry on the axis.  The rect is in SCREEN px and the map is in axis px, so the zoom has to come back out.
  function instantUnder(box, clientY) {
    // Measured from the LANE, not the box: the box carries a 52 px header above its first node, so its own top edge is not the anchor instant's position.
    const axisPx = model.pos.get(Number(box.dataset.instant)) +
                   (clientY - box.querySelector(".lane").getBoundingClientRect().top) / zoom;
    return model.instants.reduce((best, t) =>
      Math.abs(model.pos.get(t) - axisPx) < Math.abs(model.pos.get(best) - axisPx) ? t : best);
  }
  byId("clear-sessions").addEventListener("click", () => { selectedSessions.clear(); render(); });

  byId("clear-filter").addEventListener("click", () => { selectedFolders.clear(); render(); });
  // task #326: makes the stored selection bite; it re-renders, so the timeline's range shrinks (#253).
  byId("only-selected").addEventListener("click", () => {
    onlySelectedIsOn = !onlySelectedIsOn;
    byId("only-selected").classList.toggle("current", onlySelectedIsOn);
    render();
  });
  byId("nav-search").addEventListener("input", () => renderNav(model));
  byId("nav-search-clear").addEventListener("click", () => {
    byId("nav-search").value = "";
    renderNav(model);
  });
  // task #309: the list only — no render(), because the timeline is not what this filters.
  byId("session-search").addEventListener("input", () => renderSessions());
  byId("session-search-clear").addEventListener("click", () => {
    byId("session-search").value = "";
    renderSessions();
  });

  // ---- task #279 + OPEN #288: drag the File Nav's right edge -----------------------------------
  // The width is written ONCE PER FRAME. Writing it on every pointermove reflows a canvas holding ~800 widgets across ~156,000 px, which is the latency the user reported (#288); rAF coalescing is the smallest fix that removes it, and the minimap reads the same custom property so it cannot drift back over the pane.
  (() => {
    const grip = byId("filenav-grip"), root = byId("root");
    let dragging = false, pendingWidth = 0, frame = 0;
    const commit = () => { frame = 0; root.style.setProperty("--filenav-w", `${pendingWidth}px`); };
    grip.addEventListener("pointerdown", event => {
      dragging = true; grip.classList.add("dragging"); grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener("pointermove", event => {
      if (!dragging) return;
      pendingWidth = Math.min(Math.max(event.clientX - root.getBoundingClientRect().left, 140), 520);
      if (!frame) frame = requestAnimationFrame(commit);
    });
    grip.addEventListener("pointerup", () => {
      dragging = false; grip.classList.remove("dragging"); drawMinimap();
    });
  })();

  // ---- task #292: drag the split between the Files pane and the JSONLs pane ---------------------
  // A share of the column rather than a pixel height, so the two panes keep filling it exactly when the window resizes. Clamped well short of 0 and 100 — a pane dragged to nothing is a pane the reader cannot get back.
  (() => {
    const grip = byId("navpane-grip"), nav = byId("filenav");
    let dragging = false, pendingShare = 50, frame = 0;
    const commit = () => { frame = 0; nav.style.setProperty("--files-share", pendingShare); };
    grip.addEventListener("pointerdown", event => {
      dragging = true; grip.classList.add("dragging"); grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener("pointermove", event => {
      if (!dragging) return;
      const box = nav.getBoundingClientRect();
      pendingShare = Math.min(Math.max((event.clientY - box.top) / box.height * 100, 12), 88);
      if (!frame) frame = requestAnimationFrame(commit);
    });
    grip.addEventListener("pointerup", () => { dragging = false; grip.classList.remove("dragging"); });
  })();

  // ---- tasks #246/#269/#274: minimap ------------------------------------------------------------
  function drawMinimap() {
    const plot = byId("mm-plot"), pane = byId("timelines"), canvas = byId("canvas"), view = byId("mm-view");
    plot.replaceChildren(view);

    const w = Math.max(canvas.scrollWidth, pane.scrollWidth, 1);
    const h = Math.max(canvas.scrollHeight, pane.scrollHeight, 1);
    const scale = Math.min(plot.clientWidth / w, plot.clientHeight / h);
    const base = canvas.getBoundingClientRect();

    for (const box of document.querySelectorAll(".filebox")) {
      const r = box.getBoundingClientRect();
      const mm = el("div", `mm-box${box.classList.contains("bucket") ? " bucket" : ""}`);
      // `base` is the CANVAS, which scrolls with the boxes, so `r.left - base.left` is already the box's offset inside the canvas. Adding the pane's scroll on top counted it twice and slid every box off the plot as soon as anything scrolled the timeline — which opening the Detail View does, because it re-centres the node it just opened (user, 2026-07-27).
      Object.assign(mm.style, {
        left: `${(r.left - base.left) * scale}px`,
        top: `${(r.top - base.top) * scale}px`,
        width: `${Math.max(r.width * scale, 1.5)}px`,
        height: `${Math.max(r.height * scale, 1.5)}px`,
      });
      plot.insertBefore(mm, view);
    }
    plot.dataset.scale = scale;
    syncMinimapViewport();
  }

  function syncMinimapViewport() {
    const pane = byId("timelines"), plot = byId("mm-plot");
    const scale = Number(plot.dataset.scale || 0);
    Object.assign(byId("mm-view").style, {
      left: `${pane.scrollLeft * scale}px`, top: `${pane.scrollTop * scale}px`,
      width: `${pane.clientWidth * scale}px`, height: `${pane.clientHeight * scale}px`,
    });
  }
  byId("timelines").addEventListener("scroll", syncMinimapViewport);
  window.addEventListener("resize", () => drawMinimap());

  // Click the minimap to centre the view there. task #274: a smooth scroll across tens of thousands of px animates every intermediate frame, so a long jump lands instantly instead.
  byId("mm-plot").addEventListener("click", event => {
    const plot = event.currentTarget, pane = byId("timelines");
    const scale = Number(plot.dataset.scale || 0);
    if (!scale) return;
    const r = plot.getBoundingClientRect();
    const left = (event.clientX - r.left) / scale - pane.clientWidth / 2;
    const top = (event.clientY - r.top) / scale - pane.clientHeight / 2;
    const far = Math.abs(top - pane.scrollTop) + Math.abs(left - pane.scrollLeft) > MINIMAP_SMOOTH_LIMIT_PX;
    pane.scrollTo({ left, top, behavior: far ? "auto" : "smooth" });
  });

  // ---- task #256: jump to either bucket ---------------------------------------------------------
  const jumpTo = id => { const box = byId(id); if (box) landOnBubble(box); };
  byId("jump-repo").addEventListener("click", () => jumpTo("bucket-repo"));
  byId("jump-disk").addEventListener("click", () => jumpTo("bucket-disk"));

  // ---- OPEN #257 + #258: Detail View drawer -----------------------------------------------------
  // Real page: a commit node reads `git show <hash>:<path>`; an on-disk node reads the working tree.  Here both return canned text, since the mockup has no server.
  function openDrawer(path, node, dot) {
    // task #305: a plain click RESETS to a one-node selection and re-anchors the next shift-click.
    clearDiffPair();
    anchor = { dot, path };
    setDrawerTools("none");
    byId("dmulti").hidden = true;
    paintSingleArrows();
    byId("drawer").classList.add("open");
    // The header says WHAT is being shown (user, 2026-07-26): "<File Name> — Current on-disk state" for a disk node, the commit for a commit node. It used to be the bare path, with the provenance buried in two comment lines at the top of the CONTENTS — which put a description of the file inside the file, where it read as part of the source.  task #305: a snapshot's header carries the customTitle IN EFFECT AT ITS LINE RANGE — not the session's first title and not its last. A session renamed part-way through would otherwise attribute the snapshot to work it has nothing to do with.
    const heading = {
      commit: () => `${basename(path)} — at commit ${node.hash.slice(0, 8)}`,
      snapshot: () => `${basename(path)} Snapshot - ${titleAt(node.session, node.line)}`,
    }[node.kind] ?? (() => `${basename(path)} — Current on-disk state`);
    const provenance = {
      commit: () => `git show ${node.hash}:${path}   ·   ${label(node.t)}`,
      snapshot: () => `file-history ${node.version} of ${node.session}   ·   ${label(node.t)}`,
    }[node.kind] ?? (() => `working tree   ·   modified ${label(node.t)}`);
    byId("dpath").textContent = heading();
    byId("dpath").title = path;
    byId("dmeta").textContent = `${path}   ·   ${provenance()}`;
    // #dbody holds ROWS since task #319 put a diff in it, so the single-node view brings its own <pre>.
    byId("dbody").innerHTML = `<pre>${highlightCode(fakeContents(path, node), path)}</pre>`;
    // Clicking a node to inspect it IS selecting it (user, 2026-07-26): the dot gets its [ ] marks, its ruler row goes bold and its dashed leader turns green — the same language a ruler-tick landing speaks, so the reader never has to learn two.  The dot's own label is its next sibling (see addNode); a bucket row has none.
    const twin = dot.nextElementSibling?.classList.contains("nlabel") ? [dot.nextElementSibling] : [];
    highlight([dot.closest(".filebox"), dot, ...twin].filter(Boolean));
    // task #305: and it says WHERE the bytes came from, through #303's one helper — a flash, not a selection, so opening a snapshot never silently filters the timeline to its session.
    if (node.kind === "snapshot") flashSession(node.session);
    // #258: the drawer SHRINKS the timeline pane, so the node just clicked can end up behind the ruler or off the edge. Re-centre against the POST-reflow layout, never the pre-open one — which is also why `.drawer` carries no width transition: a re-centre measured mid-animation aims at a pane width that is already stale.
    requestAnimationFrame(() => {
      centerInVisibleTimeline(dot);
      drawMinimap();
    });
  }
  byId("dclose").addEventListener("click", () => {
    byId("drawer").classList.remove("open");
    byId("dmulti").hidden = true;
    clearDiffPair();
    anchor = null;
    drawMinimap();
  });

  // ---- task #328: multi-selection drawer — every nav-selected file, alphabetical ---------------
  function listNavSelectionTargets() {
    const all = [...new Set([...model.repoPaths, ...model.diskPaths])];
    const fromFolders = all.filter(p => [...selectedFolders].some(f => p === f || p.startsWith(f + "/")));
    return [...new Set([...selectedFiles, ...fromFolders])].sort();
  }
  // Every recorded revision of one path, oldest -> newest, from the FIXTURE (never the DOM).
  function nodeLadderFor(path) {
    const ladder = COMMITS.filter(c => c.files.includes(path))
      .map(c => ({ kind: "commit", t: commitInstant(c), hash: c.hash }));
    for (const s of snapshotsFor(path))
      ladder.push({ kind: "snapshot", t: ms(s.at), version: s.version, session: s.session, line: s.line });
    const disk = DISK.find(f => f.path === path);
    if (disk) ladder.push({ kind: "disk", t: ms(disk.at) });
    return ladder.sort((a, b) => a.t - b.t);
  }
  // The revision-marker vocabulary; future layers add kinds here, and only here.
  const markerOf = node => node.kind === "commit" ? node.hash.slice(0, 8)
    : node.kind === "snapshot" ? `${node.version} 📸 ${node.session}` : "on disk";
  const stampOf = node => `${markerOf(node)} · ${label(node.t)}`;

  // One section: summary bar, base/target pickers, diff body; identical sides show the whole file.
  function buildFileSection(path) {
    const ladder = nodeLadderFor(path);
    const details = el("details", "dfile");
    details.open = true;
    const stamp = el("span", "dfile-stamp");
    const summary = el("summary", "dfile-head");
    summary.append(el("span", "dfile-path", path), stamp);
    const selects = ["base", "target"].map(() => {
      const select = el("select", "dfile-select");
      ladder.forEach((node, i) => {
        const option = el("option", null, stampOf(node));
        option.value = String(i);
        select.appendChild(option);
      });
      select.value = String(ladder.length - 1);   // newest = on disk when the file still exists
      return select;
    });
    const controls = el("div", "dfile-controls");
    controls.append(el("span", null, "base"), selects[0], el("span", null, "→ target"), selects[1]);
    const body = el("div", "dfile-body");
    const renderSection = () => {
      const base = ladder[Number(selects[0].value)];
      const target = ladder[Number(selects[1].value)];
      stamp.textContent = base === target ? stampOf(target) : `${stampOf(base)}  →  ${stampOf(target)}`;
      const ops = windowOps(diffLines(contentLines(path, base), contentLines(path, target)),
                            base === target ? null : MULTI_DIFF_CONTEXT_LINES);
      renderInline(body, ops, path);
    };
    for (const select of selects) select.addEventListener("change", renderSection);
    renderSection();
    details.append(summary, controls, body);
    return details;
  }

  function openMultiDrawer(targets) {
    clearDiffPair();
    anchor = null;
    paintSingleArrows();
    setDrawerTools("none");
    byId("dmulti").hidden = false;
    byId("drawer").classList.add("open");
    byId("dpath").textContent = `${targets.length} files — Current on-disk state`;
    byId("dpath").title = targets.join("\n");
    byId("dmeta").textContent = `working tree   ·   ${targets.length} selected`;
    byId("dbody").replaceChildren(...targets.map(buildFileSection));
  }
  const setEverySectionOpen = open => {
    for (const section of document.querySelectorAll("#dbody details.dfile")) section.open = open;
  };
  byId("dcollapse-all").addEventListener("click", () => setEverySectionOpen(false));
  byId("dshow-all").addEventListener("click", () => setEverySectionOpen(true));
  // A selection of 0 or 1 leaves the drawer showing whatever it showed — the single-click path owns it.
  function refreshMultiDrawer() {
    const targets = listNavSelectionTargets();
    if (targets.length > 1) openMultiDrawer(targets);
  }

  // ---- task #323: step ONE node along the anchored file's lane ---------------------------------

  // Lane DOM order is the timeline; created-at has no bytes, so cycling skips it.  STOP at the ends: a missing neighbour disables that arrow rather than wrapping.
  function findAdjacentDot(offset) {
    if (!anchor) return null;
    const dots = [...anchor.dot.parentElement.querySelectorAll(".node:not(.n-created)")];
    return dots[dots.indexOf(anchor.dot) + offset] ?? null;
  }
  function paintSingleArrows() {
    byId("dprev").disabled = findAdjacentDot(-1) === null;
    byId("dnext").disabled = findAdjacentDot(1) === null;
  }
  for (const [id, offset] of [["dprev", -1], ["dnext", 1]]) {
    byId(id).addEventListener("click", () => {
      const dot = findAdjacentDot(offset);
      // Cycling never leaves the lane, so the anchored path carries over.
      if (dot) openDrawer(anchor.path, nodeForDot.get(dot), dot);
    });
  }

  // tasks #305/#319/#320/#324: the diff half — it owns the pair, the header rows and the arrows.
  initDiffDrawer({ byId, el, basename, highlightCode,
                   linesOf: contentLines, nodeOf: dot => nodeForDot.get(dot) });

  // The FILE's bytes and nothing else: which file this is and where it came from is the drawer header's job, so no provenance banner is prepended to the body any more.  One canned body per LANGUAGE rather than one for every file, so #294's colours are visible on each kind the mockup can open — including the two that must come out plain.  Long enough that a 3-line context window drops something; at 8 lines #320 had nothing to reveal.
  const TEMPLATES = {
    ts: [`import { parse } from "./parse";`, `import { Logger } from "./logger";`, "",
         "// dispatch one scenario case", `export function run(input: string): string {`,
         `  const cleaned = input.trim();`, "  if (cleaned.length > 0) return parse(cleaned);",
         `  throw new Error("empty input");`, "}", "",
         "// the settled middle of the file: nothing below here changes between revisions, which is",
         "// what gives the full-content toggle something to reveal.", "",
         "export function describe(kind: string): string {", "  switch (kind) {",
         `    case "commit": return "a commit";`, `    case "snapshot": return "a snapshot";`,
         `    default: return "the working tree";`, "  }", "}", "",
         "export const VERSION = 1;"],
    py: ['"""Dispatch one scenario case."""', "import sys", "",
         "def run(text):", `    cleaned = text.strip()`, "    if len(cleaned) > 0:",
         "        return cleaned.lower()", `    raise ValueError("empty input")`, "",
         "# the settled middle of the file: unchanged between revisions.", "",
         "def describe(kind):", `    if kind == "commit":`, `        return "a commit"`,
         `    if kind == "snapshot":`, `        return "a snapshot"`,
         `    return "the working tree"`, "", "VERSION = 1"],
    sh: ["#!/usr/bin/env bash", "set -euo pipefail", "",
         "# push the built bundle", `TARGET="${"${1:-staging}"}"`,
         `if [ -d dist ]; then`, `  rsync -a dist/ "deploy@host:/srv/$TARGET"`, "fi", "",
         "# the settled middle of the file: unchanged between revisions.", "",
         "describe() {", `  case "$1" in`, `    commit) echo "a commit" ;;`,
         `    snapshot) echo "a snapshot" ;;`, `    *) echo "the working tree" ;;`, "  esac", "}", "",
         "VERSION=1"],
    md: ["# demo-app", "", "The notes this repository used to keep for the old API.", "",
         "- one bullet", "- another", "", "## Unchanged section", "",
         "The paragraphs below are the same in every revision, so a windowed diff hides them",
         "and the full-content toggle brings them back.", "", "- stable", "- stable", "- stable", "",
         "## End"],
    txt: ["plain text has no grammar to colour,", "so #294 leaves it exactly as it is.", "",
          "the lines below never change between revisions,", "which is what a windowed diff drops",
          "and what the full-content toggle restores.", "", "one", "two", "three", "four", "five"],
  };
  const LINE_COMMENT = { ts: "//", py: "#", sh: "#" };
  // task #328: the one deliberately long file, so the multi-view's pane heights face real lengths.
  const LONG_FILE = "src/index.ts";
  const LONG_FILE_PAD_LINES = 150;
  const MULTI_DIFF_CONTEXT_LINES = 3;   // git's default, matching the pair diff

  // What one node's bytes are called; #300/#305: a snapshot differs per owning SESSION, not by name.
  const revisionStamp = node => node.kind === "snapshot" ? `${node.version} of ${node.session}`
    : node.kind === "commit" ? node.hash.slice(0, 8) : "working tree";
  // Stable, and no clock is read: the headless checks compare one render against another.
  const seedOf = text => [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);

  // One node's bytes, derived from its identity — canned text would diff to nothing every time.

  // Three edits give variety: a stamped line, a modified line, and a sometimes-added or removed one.
  function contentLines(path, node) {
    const language = languageOf(path);
    const lines = [...TEMPLATES[language]];
    const stamp = revisionStamp(node);
    const seed = seedOf(stamp);
    const note = LINE_COMMENT[language];
    lines.splice(1, 0, note ? `${note} revision ${stamp}` : `revision ${stamp}`);
    const changed = 3 + (seed % Math.max(1, lines.length - 4));
    lines[changed] += note ? `  ${note} r${seed % 100}` : ` (r${seed % 100})`;
    if (seed % 2 === 0) lines.push(note ? `${note} TODO(${seed % 100}): revisit before release`
                                        : `TODO(${seed % 100}): revisit before release`);
    if (seed % 3 === 0) lines.splice(2, 1);
    // task #328: one >150-line file; identical padding in every revision, like real unchanged code.
    if (path === LONG_FILE)
      for (let i = 1; i <= LONG_FILE_PAD_LINES; i += 1)
        lines.push(note ? `${note} padding line ${i} of the long-file layout fixture`
                        : `padding line ${i} of the long-file layout fixture`);
    return lines;
  }
  const fakeContents = (path, node) => contentLines(path, node).join("\n");

  // ---- task #294: syntax highlighting in the Detail View ---------------------------------------
  // The REAL page reuses webapp/highlight.ts (its renderCodeInto already colours the revision view); this is the mockup's stand-in, small enough to show what the drawer will look like and no more.  Language comes from the extension, and an unknown one is not an error — it is plain text.
  const LANGUAGES = { ts: "ts", tsx: "ts", js: "ts", jsx: "ts", py: "py", sh: "sh", bash: "sh",
                      md: "md", txt: "txt" };
  const languageOf = path => LANGUAGES[path.slice(path.lastIndexOf(".") + 1)] ?? "txt";
  // Non-capturing groups THROUGHOUT: the scanner below joins these into one alternation and reads which rule fired off the group index, so a stray capture inside a rule mislabels every rule after it.
  const KEYWORDS = {
    ts: /\b(?:import|export|from|function|const|let|var|return|if|else|throw|new|async|await|class|interface|type)\b/,
    py: /\b(?:import|from|def|class|return|if|elif|else|raise|for|while|in|not|and|or|None|True|False)\b/,
    sh: /\b(?:if|then|fi|else|for|in|do|done|set|export|local|function)\b/,
  };
  const COMMENTS = { ts: /\/\/[^\n]*/, py: /#[^\n]*/, sh: /#[^\n]*/ };
  const escapeHtml = text => text.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  // ONE pass, comments and strings first, so a keyword inside either is left alone — the mistake a per-rule replace chain always makes.
  function highlightCode(source, path) {
    const language = languageOf(path);
    if (!KEYWORDS[language]) return escapeHtml(source);
    const rules = [
      ["tok-com", COMMENTS[language]],
      ["tok-str", /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/],
      ["tok-key", KEYWORDS[language]],
      ["tok-typ", /\b(?:string|number|boolean|void)\b/],
      ["tok-num", /\b\d+(?:\.\d+)?\b/],
    ];
    const scanner = new RegExp(rules.map(([, rule]) => `(${rule.source})`).join("|"), "g");
    return escapeHtml(source).replace(scanner, (match, ...groups) => {
      const hit = rules.findIndex((_, i) => groups[i] !== undefined);
      return `<span class="${rules[hit][0]}">${match}</span>`;
    });
  }

  // ---- OPEN #295/#296/#297: source paths, and the settings that hold them -----------------------
  // The real [+] opens a folder-only native dialog and the chosen folder is then WALKED for nested files — picking `…/projects/` is meant to pull in every JSONL underneath it. Here the walk is a fixture: each candidate carries the count that walk would have returned, and a candidate with zero is refused exactly as the real one must be.
  const CANDIDATES = {
    jsonl: [
      { path: "/Users/you/Programming/jot-recovery/claude-data/projects", found: 148 },
      { path: "/Users/you/.claude/projects", found: 61 },
      { path: "/Users/you/Desktop/exports", found: 0 },
    ],
    fh: [
      { path: "/Users/you/.claude/file-history", found: 2104 },
      { path: "/Users/you/Programming/jot-recovery/claude-data/file-history", found: 890 },
      { path: "/Users/you/Desktop/exports", found: 0 },
    ],
  };
  const PICKER_TITLES = { jsonl: "JSONL Source Paths", fh: "File History Snapshot Paths" };
  const SETTINGS_KEY = "layer1-mockup-project-settings";
  // A project folder implies where its transcripts and snapshots normally live, and that derived folder is what a first-time list holds (#295). `touched` is what stops a re-derive from throwing away a list the user has since edited.
  const deriveFor = (kind, dir) => kind === "jsonl"
    ? `/Users/you/.claude/projects/${dir.replace(/\//g, "-")}`
    : "/Users/you/.claude/file-history";
  const sources = { jsonl: { paths: [], touched: false }, fh: { paths: [], touched: false } };
  let settingsDirty = false;

  // Re-derived on every render, so a new project folder brings its own default lists with it, and the two buttons say how many folders each list holds without the dialog having to be opened.
  function syncSourceButtons() {
    const dir = byId("dir").value.trim().replace(/\/$/, "");
    for (const kind of ["jsonl", "fh"])
      if (!sources[kind].touched) sources[kind].paths = [deriveFor(kind, dir)];
    byId("pick-jsonl").textContent = `JSONL sources (${sources.jsonl.paths.length})`;
    byId("pick-fh").textContent = `File History Snapshots (${sources.fh.paths.length})`;
  }
  function markDirty() {
    settingsDirty = true;
    byId("save-settings").disabled = false;
    byId("saved-note").textContent = "";
  }

  // The dialog edits a COPY. Cancel drops it, "set and close" is what commits and rebuilds.
  let draftKind = null, draftPaths = [], draftPick = -1, alertTimer = 0;

  function openPicker(kind) {
    draftKind = kind;
    draftPaths = [...sources[kind].paths];
    draftPick = -1;
    byId("pp-title").textContent = PICKER_TITLES[kind];
    byId("pp-alert").hidden = true;   // a warning about the LAST list is not about this one
    byId("pathpicker").hidden = false;
    renderPicker();
  }
  function renderPicker() {
    byId("pp-list").replaceChildren(...(draftPaths.length
      ? draftPaths.map((path, i) => {
          const row = el("div", i === draftPick ? "picked" : null, path);
          row.addEventListener("click", () => { draftPick = i; renderPicker(); });
          return row;
        })
      : [el("div", "mempty", "no source folders")]));
    byId("pp-remove").disabled = draftPick < 0;
  }
  function flashEmptyAlert(kind) {
    const alert = byId("pp-alert");
    alert.textContent = kind === "jsonl" ? "no JSONL files found" : "no snapshots found";
    alert.hidden = false;
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { alert.hidden = true; }, 2600);
  }
  byId("pick-jsonl").addEventListener("click", () => openPicker("jsonl"));
  byId("pick-fh").addEventListener("click", () => openPicker("fh"));
  byId("pp-add").addEventListener("click", () => {
    // Stands in for the native folder dialog: the next candidate this list has not already taken.
    const next = CANDIDATES[draftKind].find(c => !draftPaths.includes(c.path));
    if (!next) return;
    if (next.found === 0) return flashEmptyAlert(draftKind);
    draftPaths.push(next.path);
    draftPick = draftPaths.length - 1;
    renderPicker();
  });
  byId("pp-remove").addEventListener("click", () => {
    if (draftPick < 0) return;
    draftPaths.splice(draftPick, 1);
    draftPick = Math.min(draftPick, draftPaths.length - 1);
    renderPicker();
  });
  byId("pp-cancel").addEventListener("click", () => { byId("pathpicker").hidden = true; });
  byId("pp-ok").addEventListener("click", () => {
    const changed = draftPaths.join("\n") !== sources[draftKind].paths.join("\n");
    sources[draftKind] = { paths: draftPaths, touched: true };
    byId("pathpicker").hidden = true;
    if (changed) markDirty();
    render();   // #295: committing the list rebuilds the timeline off the new sources
  });

  // #297. A mockup has no config file, so localStorage stands in for one — same shape, same moment: written on demand, read once at boot. The unload prompt is the browser's own; a page cannot word it, which is why "discard" is the reader leaving anyway rather than a third button of ours.
  byId("save-settings").addEventListener("click", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      dir: byId("dir").value, repo: byId("repo").value,
      branch: byId("branch").value, ref: byId("ref").value,
      jsonl: sources.jsonl.paths, fh: sources.fh.paths,
    }));
    settingsDirty = false;
    byId("save-settings").disabled = true;
    byId("saved-note").textContent = "saved";
  });
  addEventListener("beforeunload", event => { if (settingsDirty) event.preventDefault(); });
  (() => {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (!saved) return;
    byId("dir").value = saved.dir; byId("repo").value = saved.repo;
    sources.jsonl = { paths: saved.jsonl, touched: true };
    sources.fh = { paths: saved.fh, touched: true };
  })();

  // ---- zoom, and OPEN #282's time-source toggle -------------------------------------------------
  // A full render, not just a CSS variable: which timestamps the gutter can print depends on how far apart the zoom has pushed them, so the row list has to be rebuilt at the new scale.
  const applyZoom = () => {
    byId("canvas").style.setProperty("--zoom", zoom);
    byId("zoom-reset").textContent = `${Math.round(zoom * 100)}%`;
    render();
  };
  byId("zoom-in").addEventListener("click", () => { zoom = Math.min(zoom * 1.25, 3); applyZoom(); });
  byId("zoom-out").addEventListener("click", () => { zoom = Math.max(zoom / 1.25, 0.1); applyZoom(); });
  byId("zoom-reset").addEventListener("click", () => { zoom = 1; applyZoom(); });

  // On the real page the choice is a fourth query param, because the instants are computed server side and flipping it re-loads the view. Here it just re-reads the other field of each commit.
  for (const [id, source] of [["t-committer", "committer"], ["t-author", "author"]])
    byId(id).addEventListener("click", () => {
      timeSource = source;
      byId("t-committer").classList.toggle("current", source === "committer");
      byId("t-author").classList.toggle("current", source === "author");
      render();
    });

  // ---- task #304: the layer switcher ------------------------------------------------------------
  // A full render off the same fixture, which is what makes 1 -> 2 -> 1 land back exactly where it started: Layer 1 is rebuilt, not a Layer 2 with things removed. The expanded row is dropped — one opened on a snapshot-only instant has nothing left to stand for at Layer 1.
  for (const button of document.querySelectorAll(".layerbar button"))
    button.addEventListener("click", () => {
      layer = Number(button.dataset.layer);
      for (const other of document.querySelectorAll(".layerbar button"))
        other.classList.toggle("current", other === button);
      byId("layer-h1").textContent = `Layer ${layer} View`;
      expandedInstant = null;
      pinInstants([]);
      render();
    });

  // ---- OPEN #286: branch + commit dropdowns, populated once the repo is confirmed ---------------
  // The real page needs its own FAST route for this — never a side effect of the ~10 s view build.
  const option = (text, value) => { const o = el("option", null, text); o.value = value; return o; };
  function confirmRepo() {
    byId("root").classList.add("repo-ok");
    byId("branch").replaceChildren(...BRANCHES.map(b => option(b, b)));
    // 75 characters of subject plus the timestamp, which is why the control is sized in `ch`.
    byId("ref").replaceChildren(
      option("(default branch)", ""),
      ...[...COMMITS].reverse().map(c =>
        option(`${c.hash.slice(0, 8)}  ${c.subject.padEnd(75).slice(0, 75)}  ${label(commitInstant(c))}`, c.hash)));
  }

  // [Open…] — in the real page this POSTs /api/pick-folder and the local server runs the OS folder dialog. Here it just cycles sample paths.
  const SAMPLES = ["/Users/you/code/demo-app", "/Users/you/code/some-other-repo",
                   "/Users/you/archive/backup-2024"];
  document.querySelectorAll("button.pick").forEach(b => b.addEventListener("click", () => {
    const box = byId(b.dataset.for);
    box.value = SAMPLES[(SAMPLES.indexOf(box.value) + 1) % SAMPLES.length];
    render();
  }));
  document.querySelectorAll("#dir, #repo").forEach(c => c.addEventListener("input", render));
  //byId("load").addEventListener("click", () => { confirmRepo(); render(); });

  confirmRepo();
  render();
  requestAnimationFrame(drawMinimap);   // geometry is only real after the first layout pass

// The CDP checks in jfred/scripts/visual/mockup.ts read the fixture straight off the page. Modules have no globals, so this is the one deliberate hand-off — nothing in the page reads it.
window.__fixture = { COMMITS, DISK, SESSIONS, SNAPSHOTS };
