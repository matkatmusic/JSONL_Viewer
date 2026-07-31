// Variant 1 — dim-in-place. Ported classes from plans/mvp-app-mockup.html: .lane (line 101), .lrail/.sname (102-104), .blink/.bline (107-109), .node.dim (116).
import { BUBBLE } from "./fixture.js";

const TOP = 24, PXM = 4;
const y = t => TOP + t * PXM;

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

function renderNode(n) {
  const dot = el("div", { class: `node n-${n.kind}${n.abandonedTip ? " dim" : ""}`, style: `top:${y(n.t)}px` });
  dot.title = `${n.label}${n.abandonedTip ? " — IGNORED (rewound branch)" : ""}`;
  return dot;
}

function renderLane(lane) {
  const col = el("div", { class: "lane" },
    el("div", { class: "lrail" }),
    el("div", { class: "sname" }, document.createTextNode(lane.session)));
  for (const n of lane.nodes) col.append(renderNode(n));
  return col;
}

function renderForkConnectors(container, lanes) {
  const trunkIndex = lanes.findIndex(l => l.isOrphaned !== true);
  lanes.forEach((lane, i) => {
    if (lane.isOrphaned !== true || !lane.forkFrom) return;
    const dx = (i - trunkIndex) * 64;
    const elbow = el("div", { class: "blink",
      style: `top:${y(lane.forkFrom.t)}px; left:calc(50% + ${trunkIndex * 64 - i * 64 + 32}px); width:${Math.abs(dx) - 32}px; height:14px` });
    container.append(elbow);
    const tipT = Math.max(...lane.nodes.map(n => n.t));
    const bline = el("div", { class: "bline",
      style: `top:${y(lane.forkFrom.t) + 14}px; left:50%; height:${y(tipT) - y(lane.forkFrom.t) - 14}px` });
    lane._blineHost = bline;
  });
}

function render() {
  const root = document.getElementById("bubble");
  const lanes = el("div", { class: "lanes" });
  for (const lane of BUBBLE.lanes) {
    const col = renderLane(lane);
    lanes.append(col);
  }
  renderForkConnectors(lanes, BUBBLE.lanes);
  BUBBLE.lanes.forEach((lane, i) => {
    if (lane._blineHost) lanes.children[i].append(lane._blineHost);
  });
  root.append(lanes);
}

render();
