// L6 execution console mockup — THE DATA. Static only, no timers; every variant imports this one module.

// "Already streamed" stdout for a run still in progress — ends mid-line, no exit marker.
export const OUTPUT_LINES = [
  "$ python3 migrate_users.py --batch 200",
  "Loading schema v14...",
  "Connected to shard 3 of 6",
  "Processing batch 1/40 (200 rows)",
  "  200 rows OK, 0 skipped",
  "Processing batch 2/40 (200 rows)",
  "  200 rows OK, 0 skipped",
  "Processing batch 3/40 (200 rows)",
  "  198 rows OK, 2 skipped (duplicate key)",
  "Processing batch 4/40 (200 rows)",
  "Processing batch 5/40",
];

// The "what live streaming would look like" caption — a static-state-plus-caption stand-in for a timer.
export const STREAMING_CAPTION =
  "In the real console this block grows line by line as the script prints to stdout; here it is " +
  "a fixed snapshot of output already streamed, not an animation.";

// The three cancel-button states, named literally (task 347 plan, Step 2).
export const CANCEL_BUTTON_STATES = [
  { key: "idle", label: "Cancel", className: "btn-idle", disabled: true },
  { key: "running-cancelable", label: "Cancel", className: "btn-live", disabled: false },
  { key: "cancelled", label: "Cancelled", className: "btn-cancelled", disabled: true },
];

// Terminal states, names verbatim from DECISIONS.md:51-55; `cancelled` precedes any verdict, kept separate.
export const TERMINAL_STATES = [
  {
    key: "cancelled",
    label: "Cancelled",
    className: "term-cancelled",
    description: "Run stopped by the user before it produced a result.",
  },
  {
    key: "verified",
    label: "Verified",
    className: "term-verified",
    description: "Replay output matches the expected post-run state.",
  },
  {
    key: "mismatch",
    label: "Mismatch",
    className: "term-mismatch",
    description: "Replay output differs from the expected post-run state.",
  },
  {
    key: "original-failed",
    label: "Original run failed",
    className: "term-original-failed",
    description: "The recorded run itself errored; it was never replayed.",
  },
];
