// Values copied verbatim from jfred/webapp/layered-styles.css@ee4603f .node-type-* rules — do not re-pick.

export const ms = s => Date.parse(s);

export const NODE_KINDS = [
  { cls: "node-type-user-prompt", glyph: "u", color: "#a6408a", label: "user prompt" },
  { cls: "node-type-tool-call", glyph: "t", color: "#0d6e6e", label: "tool call" },
  { cls: "node-type-tool-result", glyph: "r", color: "#1b8f8f", label: "tool result" },
  { cls: "node-type-extracted-edit", glyph: "e", color: "#4d8c1f", label: "extracted edit" },
  { cls: "node-type-script-execution", glyph: "x", color: "#b8860b", label: "script execution" },
  { cls: "node-type-script-execution-result", glyph: "x", color: "#d9a441", label: "script execution result" },
  { cls: "node-type-branch-split", glyph: "y", color: "#4f46c7", label: "conversation branch split" },
  { cls: "node-type-commit", glyph: "c", color: "#7a3fe0", label: "commit" },
  { cls: "node-type-snapshot", glyph: "\u{1F4F7}", color: "#0fa36b", label: "snapshot" },
  { cls: "node-type-agent-response", glyph: "a", color: "#47607a", label: "agent response" },
  { cls: "node-type-system-info", glyph: "s", color: "#6b4a2f", label: "system info" },
  { cls: "node-type-unknown", glyph: "?", color: "#d92b2b", label: "unknown record type (catch-all)" },
];

// One plausible run through a file's lifetime, in timeline order.
export const TIMELINE = [
  { at: ms("2026-07-30T09:00:00Z"), kind: "node-type-user-prompt" },
  { at: ms("2026-07-30T09:00:05Z"), kind: "node-type-tool-call" },
  { at: ms("2026-07-30T09:00:06Z"), kind: "node-type-tool-result" },
  { at: ms("2026-07-30T09:00:07Z"), kind: "node-type-extracted-edit" },
  { at: ms("2026-07-30T09:01:00Z"), kind: "node-type-agent-response" },
  { at: ms("2026-07-30T09:02:00Z"), kind: "node-type-script-execution" },
  { at: ms("2026-07-30T09:02:04Z"), kind: "node-type-script-execution-result" },
  { at: ms("2026-07-30T09:05:00Z"), kind: "node-type-branch-split" },
  { at: ms("2026-07-30T09:06:00Z"), kind: "node-type-commit" },
  { at: ms("2026-07-30T09:06:01Z"), kind: "node-type-snapshot" },
  { at: ms("2026-07-30T09:10:00Z"), kind: "node-type-system-info" },
  { at: ms("2026-07-30T09:12:00Z"), kind: "node-type-unknown" },
];

// Confidence axis demo, reusing layered-styles.css's dashed-ring idiom; see DECISIONS.md "Seven confidence states".
export const CONFIDENCE_DEMO = [
  { kind: "node-type-tool-result", state: "verified (no ring)", ring: false },
  { kind: "node-type-tool-result", state: "derived (dashed ring)", ring: true },
  { kind: "node-type-extracted-edit", state: "verified (no ring)", ring: false },
  { kind: "node-type-extracted-edit", state: "mismatch (dashed ring)", ring: true },
];
