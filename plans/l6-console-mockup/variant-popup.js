// Variant 1 — popup over timeline; panel chrome from mvp-app-mockup.html:126-157 `.details`/`.dpane` styling.
import { el, renderOutputBlock, renderCancelStateRow, renderTerminalStateRow } from "./app.js";

function renderFakeTimeline() {
  const strip = el("div", "fake-timeline");
  for (let i = 0; i < 14; i += 1) {
    strip.append(el("span", "fake-dot"));
  }
  return strip;
}

export function mountPopupVariant(root) {
  root.append(el("p", "variant-citation",
    "Panel chrome: plans/mvp-app-mockup.html:126-157's .details/.dpane panel styling."));

  const stage = el("div", "popup-stage");
  stage.append(renderFakeTimeline());

  const popup = el("div", "mock-popup");
  popup.append(el("div", "mock-popup-head", "Run output — script still executing"));
  const body = el("div", "mock-popup-body");
  body.append(renderOutputBlock());
  body.append(el("p", "state-caption", "Cancel button, all three states:"));
  body.append(renderCancelStateRow());
  popup.append(body);
  stage.append(popup);
  root.append(stage);

  root.append(el("p", "state-caption", "Terminal states, shown as discrete static frames:"));
  root.append(renderTerminalStateRow());
}
