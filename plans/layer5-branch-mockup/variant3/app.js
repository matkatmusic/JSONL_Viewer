// Same forked-track renderer as variant2/app.js, plus a mirrored elbow rejoining the trunk.
import { BUBBLE } from "./fixture.js";

const TOP = 24, PXM = 4, LANE_W = 64, DIM = 0.45;
const y = t => TOP + t * PXM;

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

function renderLane(lane, extraClass) {
  return el("div", { class: `lane ${extraClass || ""}` },
    el("div", { class: "sname" }, document.createTextNode(lane.session)));
}

function renderTrunk(trunk) {
  const col = renderLane(trunk);
  col.prepend(el("div", { class: "g-rail g-l1" }));
  for (const n of trunk.nodes) col.append(el("div", { class: `node n-${n.kind}`, style: `top:${y(n.t)}px` }));
  return col;
}

function renderBranch(branch) {
  const col = renderLane(branch, "fork-gutter");
  const tipT = Math.max(branch.rejoinAt, ...branch.nodes.map(n => n.t));
  col.append(el("div", { class: "g-rail g-l2",
    style: `top:${y(branch.forkFrom.t)}px; height:${y(tipT) - y(branch.forkFrom.t)}px` }));
  for (const n of branch.nodes) {
    const dot = el("div", { class: `node n-${n.kind}`, style: `top:${y(n.t)}px; opacity:${DIM}` });
    dot.title = `${n.label} — conversation rewound, code kept`;
    col.append(dot);
  }
  return col;
}

function renderSplitElbow(container, forkT) {
  container.append(el("div", { class: "fork-node", style: `top:${y(forkT)}px; left:${LANE_W / 2}px` }));
  container.append(el("div", { class: "split-elbow",
    style: `top:${y(forkT)}px; left:${LANE_W / 2}px; width:${LANE_W}px` }));
}

function renderMergeElbow(container, rejoinAt) {
  container.append(el("div", { class: "merge-elbow",
    style: `top:${y(rejoinAt) - 16}px; left:${LANE_W / 2}px; width:${LANE_W}px` }));
}

function render() {
  const root = document.getElementById("bubble");
  const lanes = el("div", { class: "lanes" });
  const [trunk, branch] = BUBBLE.lanes;
  lanes.append(renderTrunk(trunk));
  lanes.append(renderBranch(branch));
  renderSplitElbow(lanes, branch.forkFrom.t);
  renderMergeElbow(lanes, branch.rejoinAt);
  root.append(lanes);
}

render();
