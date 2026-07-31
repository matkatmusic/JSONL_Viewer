// Variant 3 — reuses the Detail drawer chrome (S19/#257, layer1-styles.css:466-494): shrinks the pane, not an overlay.
import { el, renderOutputBlock, renderCancelStateRow, renderTerminalStateRow } from "./app.js";

export function mountDrawerVariant(root) {
  root.append(el("p", "variant-citation",
    "Reuses the Detail drawer chrome opened by appendJsonRecordButton (S19/#257): " +
    "a flex panel that shrinks the timeline pane from the right, with a .dhead header bar " +
    "(path + close button) — see layer1-styles.css:466-494."));

  const stage = el("div", "drawer-stage");
  const timeline = el("div", "fake-timeline fake-timeline-narrow");
  for (let i = 0; i < 8; i += 1) {
    timeline.append(el("span", "fake-dot"));
  }
  stage.append(timeline);

  const drawer = el("div", "mock-drawer");
  const head = el("div", "mock-drawer-head");
  head.append(el("span", "mock-drawer-path", "migrate_users.py — run output"));
  head.append(el("button", "mock-drawer-close", "×"));
  drawer.append(head);

  const body = el("div", "mock-drawer-body");
  body.append(renderOutputBlock());
  body.append(el("p", "state-caption", "Cancel button, all three states:"));
  body.append(renderCancelStateRow());
  drawer.append(body);
  stage.append(drawer);
  root.append(stage);

  root.append(el("p", "state-caption", "Terminal states, shown as discrete static frames:"));
  root.append(renderTerminalStateRow());
}
