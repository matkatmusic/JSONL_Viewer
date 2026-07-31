import { NODE_KINDS, TIMELINE, CONFIDENCE_DEMO } from "./fixture.js";

const kindByClass = new Map(NODE_KINDS.map(k => [k.cls, k]));

function nodeEl(kind, top) {
  const k = kindByClass.get(kind);
  const el = document.createElement("div");
  el.className = `layered-node node-type-${k.cls.replace("node-type-", "")}`;
  el.style.setProperty("--top", `${top}px`);
  el.style.background = k.color;
  el.textContent = k.glyph;
  el.title = k.label;
  return el;
}

function renderTrunk() {
  const lane = document.getElementById("trunk-lane");
  const first = TIMELINE[0].at;
  const pxPerMs = 90 / 60000;
  TIMELINE.forEach(ev => {
    const top = 10 + (ev.at - first) * pxPerMs;
    lane.appendChild(nodeEl(ev.kind, top));
  });
  lane.style.minHeight = `${10 + (TIMELINE.at(-1).at - first) * pxPerMs + 20}px`;
}

function renderLegend() {
  const legend = document.getElementById("legend");
  NODE_KINDS.forEach(k => {
    const row = document.createElement("div");
    row.className = "legend-row";
    const swatch = document.createElement("i");
    swatch.style.background = k.color;
    swatch.textContent = k.glyph;
    row.append(swatch, document.createTextNode(`${k.label}  (.${k.cls})`));
    legend.appendChild(row);
  });
}

function renderConfidenceDemo() {
  const row = document.getElementById("confidence-row");
  CONFIDENCE_DEMO.forEach(d => {
    const k = kindByClass.get(d.kind);
    const el = document.createElement("div");
    el.className = `confidence-demo-node node-type-${k.cls.replace("node-type-", "")}`;
    if (d.ring) el.classList.add("ring-demo");
    el.style.background = k.color;
    el.textContent = k.glyph;
    const label = document.createElement("span");
    label.textContent = `${k.label} — ${d.state}`;
    const wrap = document.createElement("div");
    wrap.className = "confidence-demo-item";
    wrap.append(el, label);
    row.appendChild(wrap);
  });
}

renderTrunk();
renderLegend();
renderConfidenceDemo();
