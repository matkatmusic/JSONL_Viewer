// Variant 2 — forked track. Borrows g-rail/g-l1/g-l2/g-fork naming from timeline-render-row-cells.ts:53-72.  Fork/rejoin concept from timeline-sessions.ts:60,79; dim opacity precedent from styles.css:396.
import { BUBBLE } from "./fixture.js";

const TOP = 24, PXM = 4, DIM_OPACITY = 0.45;
const y = t => TOP + t * PXM;

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

function renderPlainLane(lane) {
  const col = el("div", { class: "lane" },
    el("div", { class: "g-rail g-l1" }),
    el("div", { class: "sname" }, document.createTextNode(lane.session)));
  for (const n of lane.nodes) {
    col.append(el("div", { class: `node n-${n.kind}`, style: `top:${y(n.t)}px` }));
  }
  return col;
}

function renderForkGutter(trunkLane, forkLane) {
  const startT = forkLane.forkFrom.t;
  const endT = Math.max(...forkLane.nodes.map(n => n.t));
  const gutter = el("div", { class: "lane fork-gutter" },
    el("div", { class: "g-rail g-l1" }),
    el("div", { class: "sname" }, document.createTextNode(forkLane.session)));
  const track = el("div", { class: "g-rail g-l2 g-start g-end",
    style: `top:${y(startT)}px; height:${y(endT) - y(startT)}px; opacity:${DIM_OPACITY}` });
  gutter.append(el("div", { class: "g-fork", style: `top:${y(startT)}px` }));
  gutter.append(track);
  for (const n of forkLane.nodes) {
    const dot = el("div", { class: `node n-${n.kind} g-dot`, style: `top:${y(n.t)}px; opacity:${DIM_OPACITY}` });
    dot.title = `${n.label}${n.abandonedTip ? " — abandoned tip (fork does not rejoin)" : ""}`;
    gutter.append(dot);
  }
  return gutter;
}

function render() {
  const root = document.getElementById("bubble");
  const lanes = el("div", { class: "lanes" });
  const trunk = BUBBLE.lanes.find(l => l.isOrphaned !== true);
  lanes.append(renderPlainLane(trunk));
  const fork = BUBBLE.lanes.find(l => l.isOrphaned === true);
  if (fork) lanes.append(renderForkGutter(trunk, fork));
  for (const lane of BUBBLE.lanes) {
    if (lane === trunk || lane === fork) continue;
    lanes.append(renderPlainLane(lane));
  }
  root.append(lanes);
}

render();
