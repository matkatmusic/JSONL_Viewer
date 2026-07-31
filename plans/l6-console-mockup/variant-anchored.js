// Variant 2 — anchored panel docked to a screen edge; same .dpane chrome as Variant 1, edge not centered.
import { el, renderOutputBlock, renderCancelStateRow, renderTerminalStateRow } from "./app.js";

export function mountAnchoredVariant(root) {
  root.append(el("p", "variant-citation",
    "Panel chrome: same .dpane precedent as Variant 1 (mvp-app-mockup.html:126-157), " +
    "docked to a screen edge instead of centered."));

  const stage = el("div", "anchored-stage");
  const timeline = el("div", "fake-timeline fake-timeline-wide");
  for (let i = 0; i < 20; i += 1) {
    timeline.append(el("span", "fake-dot"));
  }
  stage.append(timeline);

  const panel = el("div", "anchored-panel");
  panel.append(el("div", "mock-popup-head", "Run output — script still executing"));
  const body = el("div", "mock-popup-body");
  body.append(renderOutputBlock());
  body.append(el("p", "state-caption", "Cancel button, all three states:"));
  body.append(renderCancelStateRow());
  panel.append(body);
  stage.append(panel);
  root.append(stage);

  root.append(el("p", "state-caption", "Terminal states, shown as discrete static frames:"));
  root.append(renderTerminalStateRow());
}
