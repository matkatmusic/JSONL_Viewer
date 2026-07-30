// The drawer's diff half (#305, #319/#320, #323, #324); the real page fetches /api/layer1-diff.

const CONTEXT_LINES = 3;   // git's default; the "full content" toggle drops the window entirely
const SHORT_HASH = 8;
const TOAST_MS = 2600;

// Injected once by app.js: the DOM and fixture helpers this module would otherwise duplicate.
let deps = null;
// The shown pair, or null. `{ path, base: {dot, name}, target: {dot, name} }`.
let shownPair = null;
let mode = "side";
// Task #320: widens the window to the whole file. Survives across pairs, like the Revision Viewer's.
let fullContents = false;
let toastTimer = 0;

// ---- the differ ------------------------------------------------------------------------------
// Longest common subsequence over lines: one op per line, the granularity git reports.
export function diffLines(base, target) {
  const n = base.length, m = target.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1)
    for (let j = m - 1; j >= 0; j -= 1)
      lcs[i][j] = base[i] === target[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (base[i] === target[j]) { ops.push({ op: " ", text: base[i] }); i += 1; j += 1; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { ops.push({ op: "-", text: base[i] }); i += 1; }
    else { ops.push({ op: "+", text: target[j] }); j += 1; }
  }
  while (i < n) { ops.push({ op: "-", text: base[i] }); i += 1; }
  while (j < m) { ops.push({ op: "+", text: target[j] }); j += 1; }
  return ops;
}

// Rows drawn: each change plus `context` lines either side, one gap marker per dropped run.
export function windowOps(ops, context) {
  if (context === null) return ops;
  const keep = new Set();
  ops.forEach((o, i) => {
    if (o.op === " ") return;
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k += 1) keep.add(k);
  });
  const out = [];
  let inGap = false;
  ops.forEach((o, i) => {
    if (keep.has(i)) { out.push(o); inGap = false; return; }
    if (!inGap) { out.push({ op: "gap", text: "⋯" }); inGap = true; }
  });
  return out;
}

// Side-by-side pairs each deletion run with the additions replacing it, so a change reads across one row.
function pairForColumns(ops) {
  const rows = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].op === " " || ops[i].op === "gap") { rows.push({ left: ops[i], right: ops[i] }); i += 1; continue; }
    const dels = [], adds = [];
    while (i < ops.length && ops[i].op === "-") { dels.push(ops[i]); i += 1; }
    while (i < ops.length && ops[i].op === "+") { adds.push(ops[i]); i += 1; }
    for (let k = 0; k < Math.max(dels.length, adds.length); k += 1)
      rows.push({ left: dels[k] ?? null, right: adds[k] ?? null });
  }
  return rows;
}

// ---- rendering -------------------------------------------------------------------------------
const CLASS_FOR_OP = { "+": "d-add", "-": "d-del", " ": "d-ctx", gap: "d-gap" };

function buildCell(entry, number, path) {
  const cell = deps.el("div", `dcell ${entry ? CLASS_FOR_OP[entry.op] : "d-nil"}`);
  cell.append(deps.el("span", "dnum", entry && entry.op !== "gap" ? String(number) : ""));
  const code = deps.el("code");
  // The fixture's own colours (#294) still apply inside a diff row — the real renderer highlights too.
  code.innerHTML = entry ? deps.highlightCode(entry.text, path) : "";
  cell.appendChild(code);
  return cell;
}

function renderColumns(container, ops, path) {
  const grid = deps.el("div", "diff-cols");
  let baseLine = 0, targetLine = 0;
  for (const row of pairForColumns(ops)) {
    if (row.left && row.left.op !== "gap") baseLine += 1;
    if (row.right && row.right.op !== "gap") targetLine += 1;
    grid.append(buildCell(row.left, baseLine, path), buildCell(row.right, targetLine, path));
  }
  container.replaceChildren(grid);
}

function renderInline(container, ops, path) {
  const list = deps.el("div", "diff-inline");
  let baseLine = 0, targetLine = 0;
  for (const entry of ops) {
    if (entry.op === "-" || entry.op === " ") baseLine += 1;
    if (entry.op === "+" || entry.op === " ") targetLine += 1;
    const row = deps.el("div", `dcell ${CLASS_FOR_OP[entry.op]}`);
    row.append(deps.el("span", "dnum", entry.op === "gap" ? "" : String(entry.op === "-" ? baseLine : targetLine)));
    row.append(deps.el("span", "dsign", entry.op === "gap" ? "" : entry.op));
    const code = deps.el("code");
    code.innerHTML = deps.highlightCode(entry.text, path);
    row.appendChild(code);
    list.appendChild(row);
  }
  container.replaceChildren(list);
}

// ---- the pair ---------------------------------------------------------------------------------
// Header name: a commit's short hash, a snapshot's version, else the working tree.
function sideName(dot) {
  if (dot.classList.contains("n-commit")) return (dot.title || "").slice(0, SHORT_HASH);
  if (dot.classList.contains("n-snap")) return dot.dataset.event ?? "snapshot";
  return "on disk";
}

export function clearDiffPair() {
  shownPair = null;
  for (const marked of document.querySelectorAll(".diff-base, .diff-target"))
    marked.classList.remove("diff-base", "diff-target");
}

// One strip at a time (#324): pair mode swaps single arrows for two pairs, revealing row 2.
export function setDrawerTools(kind) {
  deps.byId("difftools").hidden = kind !== "diff";
  deps.byId("dhead2").hidden = kind !== "diff";
  deps.byId("pairtools").hidden = kind !== "diff";
  deps.byId("dprev").hidden = kind === "diff";
  deps.byId("dnext").hidden = kind === "diff";
}

// A refusal is VISIBLE, never a silent no-op (#305).
function flashToast(text) {
  const toast = deps.byId("dtoast");
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, TOAST_MS);
}

// #324 step target: lane DOM order, skips created-at, stops at ends, never hits the other endpoint.
function findNeighbour(side, offset) {
  if (!shownPair) return null;
  const from = shownPair[side].dot;
  const nodes = [...from.parentElement.querySelectorAll(".node:not(.n-created)")];
  const neighbour = nodes[nodes.indexOf(from) + offset] ?? null;
  return neighbour === shownPair[side === "base" ? "target" : "base"].dot ? null : neighbour;
}

function paintPairArrows() {
  for (const [id, side, offset] of ARROWS) deps.byId(id).disabled = findNeighbour(side, offset) === null;
}

const ARROWS = [["dbprev", "base", -1], ["dbnext", "base", 1],
                ["dtprev", "target", -1], ["dtnext", "target", 1]];

function paintModeButtons() {
  for (const button of deps.byId("difftools").querySelectorAll("button[data-mode]"))
    button.classList.toggle("current", button.dataset.mode === mode);
  deps.byId("dfull").checked = fullContents;
}

// The ops for the shown pair at the current context width.
function currentOps() {
  const base = deps.linesOf(shownPair.path, deps.nodeOf(shownPair.base.dot));
  const target = deps.linesOf(shownPair.path, deps.nodeOf(shownPair.target.dot));
  return windowOps(diffLines(base, target), fullContents ? null : CONTEXT_LINES);
}

function renderDiffBody() {
  if (!shownPair) return;
  paintModeButtons();
  const body = deps.byId("dbody");
  const ops = currentOps();
  if (!ops.some(o => o.op === "+" || o.op === "-")) {
    body.replaceChildren(deps.el("div", "dbinary", "No text differences between these revisions."));
    return;
  }
  (mode === "inline" ? renderInline : renderColumns)(body, ops, shownPair.path);
}

// The tail every pair entry shares: marks, state, drawer. #324's arrows reuse it.
export function showDiffPair(baseDot, targetDot, path) {
  clearDiffPair();
  // The pair's own marks REPLACE the single-selection [ ] brackets: one selection language at a time.
  for (const lit of document.querySelectorAll(".found")) lit.classList.remove("found");
  baseDot.classList.add("diff-base");
  targetDot.classList.add("diff-target");
  shownPair = { path, base: { dot: baseDot }, target: { dot: targetDot } };
  // Row 1 (#324): `<file name> [^][v] <base> - <target> [^][v]`.
  deps.byId("dpath").textContent = deps.basename(path);
  deps.byId("dpath").title = path;
  deps.byId("dpairlabel").textContent = `${sideName(baseDot)} - ${sideName(targetDot)}`;
  deps.byId("dmeta").textContent =
    `${path}   ·   base ${sideName(baseDot)} → target ${sideName(targetDot)}`;
  setDrawerTools("diff");
  paintPairArrows();
  deps.byId("drawer").classList.add("open");
  renderDiffBody();
}

// The shift-clicked node; direction comes from axis position, never click order.
export function extendDiffSelection(anchor, dot, path) {
  if (anchor.dot.closest(".filebox") !== dot.closest(".filebox")) {
    flashToast(`diff needs two nodes on ONE bubble — ${deps.basename(anchor.path)} is selected`);
    return;
  }
  if (anchor.dot === dot) return;
  const axis = node => Number(node.style.getPropertyValue("--axis-px")) || 0;
  const [baseDot, targetDot] = axis(anchor.dot) <= axis(dot) ? [anchor.dot, dot] : [dot, anchor.dot];
  showDiffPair(baseDot, targetDot, path);
}

// "export as patch": headers plus one whole-file hunk, so the download is git-apply-able (#218).
function exportPatch() {
  if (!shownPair) return;
  const base = deps.linesOf(shownPair.path, deps.nodeOf(shownPair.base.dot));
  const target = deps.linesOf(shownPair.path, deps.nodeOf(shownPair.target.dot));
  const ops = diffLines(base, target);
  if (!ops.some(o => o.op === "+" || o.op === "-")) { flashToast("no differences to export"); return; }
  const path = shownPair.path;
  const body = ops.map(o => o.op + o.text).join("\n");
  const patch = `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n` +
                `@@ -1,${base.length} +1,${target.length} @@\n${body}\n`;
  const link = deps.el("a");
  link.href = URL.createObjectURL(new Blob([patch], { type: "text/x-patch" }));
  link.download = `${deps.basename(path)}.patch`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Wired once, like the real page's wireDiffTools.
export function initDiffDrawer(injected) {
  deps = injected;
  for (const button of deps.byId("difftools").querySelectorAll("button[data-mode]"))
    button.addEventListener("click", () => { mode = button.dataset.mode; renderDiffBody(); });
  // #320: full content is a WIDTH toggle — the diff stays shown, re-windowed rather than replaced.
  deps.byId("dfull").addEventListener("change", () => {
    fullContents = deps.byId("dfull").checked;
    renderDiffBody();
  });
  for (const [id, side, offset] of ARROWS) deps.byId(id).addEventListener("click", () => {
    const neighbour = findNeighbour(side, offset);
    if (!neighbour) return;
    const moved = { base: shownPair.base.dot, target: shownPair.target.dot, [side]: neighbour };
    showDiffPair(moved.base, moved.target, shownPair.path);
  });
  deps.byId("dexport").addEventListener("click", exportPatch);
}
