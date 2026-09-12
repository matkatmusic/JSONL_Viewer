// L6 node-states mockup renderer; data in fixture.js. Static DOM only, no timers, no fetch.
import { NODE_STATES } from "./fixture.js";

const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

// One framed .n-script node per confidence state, laid on a short fake stage line.
function renderNodeState(state) {
  const frame = el("div", "state-frame");
  const stage = el("div", "state-stage");
  const node = el("div", state.className ? `n-script ${state.className}` : "n-script");
  stage.append(node);
  frame.append(stage);
  frame.append(el("span", "state-name", state.label));
  frame.append(el("p", "state-desc", state.description));
  return frame;
}

function renderNodeStateRow() {
  const row = el("div", "node-state-row");
  for (const state of NODE_STATES) {
    row.append(renderNodeState(state));
  }
  return row;
}

const root = document.getElementById("node-states-mount");
if (root) {
  root.append(renderNodeStateRow());
}
