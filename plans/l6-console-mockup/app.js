// L6 console mockup shared renderers; per-variant chrome in variant-*.js, data in fixture.js. Static DOM only.
import { OUTPUT_LINES, STREAMING_CAPTION, CANCEL_BUTTON_STATES, TERMINAL_STATES } from "./fixture.js";
import { mountPopupVariant } from "./variant-popup.js";
import { mountAnchoredVariant } from "./variant-anchored.js";
import { mountDrawerVariant } from "./variant-drawer.js";

export const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

// The static output block + streaming caption (plan Step 2/3): same fixture, every variant.
export function renderOutputBlock() {
  const wrap = el("div", "console-output");
  wrap.append(el("pre", "console-pre", OUTPUT_LINES.join("\n")));
  wrap.append(el("p", "console-caption", STREAMING_CAPTION));
  return wrap;
}

function renderCancelButton(state) {
  const btn = el("button", `cancel-btn ${state.className}`, state.label);
  btn.disabled = state.disabled;
  return btn;
}

// Three cancel-button states, side by side; `cancelled` rendered once here so every variant shares it.
export function renderCancelStateRow() {
  const row = el("div", "cancel-state-row");
  for (const state of CANCEL_BUTTON_STATES) {
    const frame = el("div", "state-frame");
    frame.append(el("span", "state-label", state.key));
    frame.append(renderCancelButton(state));
    row.append(frame);
  }
  return row;
}

function renderTerminalBlock(state) {
  const block = el("div", `terminal-block ${state.className}`);
  block.append(el("strong", "terminal-title", state.label));
  block.append(el("p", "terminal-desc", state.description));
  return block;
}

// All four terminal states as visually distinct static blocks (plan Step 4, requirement c).
export function renderTerminalStateRow() {
  const row = el("div", "terminal-state-row");
  for (const state of TERMINAL_STATES) {
    row.append(renderTerminalBlock(state));
  }
  return row;
}

function mount(id, render) {
  const root = document.getElementById(id);
  if (root) {
    render(root);
  }
}

mount("popup-mount", mountPopupVariant);
mount("anchored-mount", mountAnchoredVariant);
mount("drawer-mount", mountDrawerVariant);
