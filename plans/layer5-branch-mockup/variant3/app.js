// Variant 3 — inline badge next to the trunk node, no lane column. Emerged comparing variants 1 and 2.
import { BUBBLE } from "./fixture.js";

const TOP = 24, PXM = 4;
const y = t => TOP + t * PXM;

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

function renderLane(lane) {
  const col = el("div", { class: "lane" },
    el("div", { class: "lrail" }),
    el("div", { class: "sname" }, document.createTextNode(lane.session)));
  for (const n of lane.nodes) col.append(el("div", { class: `node n-${n.kind}`, style: `top:${y(n.t)}px` }));
  return col;
}

function renderInlineBadge(trunkCol, forkLane) {
  const badge = el("div", { class: "branch-badge", style: `top:${y(forkLane.forkFrom.t)}px` });
  badge.textContent = `${forkLane.nodes.length}`;
  badge.title = `${forkLane.session}: ${forkLane.nodes.map(n => n.label).join(", ")} (abandoned)`;
  trunkCol.append(badge);
  forkLane.nodes.forEach((n, i) => {
    trunkCol.append(el("div", { class: "mini-dot", style: `top:${y(forkLane.forkFrom.t)}px; left:calc(50% + ${14 + i * 8}px)` }));
  });
}

function render() {
  const root = document.getElementById("bubble");
  const lanes = el("div", { class: "lanes" });
  const trunk = BUBBLE.lanes.find(l => l.isOrphaned !== true);
  const trunkCol = renderLane(trunk);
  lanes.append(trunkCol);
  const fork = BUBBLE.lanes.find(l => l.isOrphaned === true);
  if (fork) renderInlineBadge(trunkCol, fork);
  for (const lane of BUBBLE.lanes) {
    if (lane === trunk || lane === fork) continue;
    lanes.append(renderLane(lane));
  }
  root.append(lanes);
}

render();
