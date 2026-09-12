// L6 script-run node-states mockup — THE DATA. Static only, no timers; app.js renders these.  State names are the seven confidence states from plans/340-recon/DECISIONS.md:53-55, plus the unchanged pre-execution base. `mismatch` matches plans/l6-console-mockup/fixture.js's TERMINAL_STATES so the node and the console read as the same event.

export const NODE_STATES = [
  {
    key: "pre-execution",
    label: "Pre-execution",
    className: "",
    description: "The L4 script-run node before any (simulated) replay — the unchanged hollow ring.",
  },
  {
    key: "verified",
    label: "Verified",
    className: "state-verified",
    description: "Replay output matched the nearest beacon; the result is proven.",
  },
  {
    key: "derived",
    label: "Derived",
    className: "state-derived",
    description: "No beacon to check against; the replayed result is assumed, not proven.",
  },
  {
    key: "mismatch",
    label: "Mismatch",
    className: "n-mismatch",
    description: "Replay output differs from the nearest beacon — a visibly distinct failure, not a silent discard.",
  },
  {
    key: "reseeded",
    label: "Reseeded",
    className: "state-reseeded",
    description: "The revision was re-seeded from a backup rather than replayed forward.",
  },
  {
    key: "original-failed",
    label: "Original run failed",
    className: "state-original-failed",
    description: "The recorded run itself errored; it was never replayed.",
  },
  {
    key: "injected-unverified",
    label: "Injected (unverified)",
    className: "state-injected-unverified",
    description: "Content injected from the file-history sidecar, awaiting verification.",
  },
  {
    key: "never-provable",
    label: "Never provable",
    className: "state-never-provable",
    description: "A bash run whose effect leaves no beacon — provability does not apply (kind-pre-anchor-stub idiom).",
  },
];
