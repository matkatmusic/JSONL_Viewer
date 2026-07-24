// From-scratch reconstruction engine — data model under interview.
// Evolves as design questions get answered; each shape cites the question
// that settled it. C++ is the sketch language only.
#pragma once
#include <chrono>
#include <memory>
#include <string>
#include <vector>

struct Path { std::string value; };  // filename string on disk (not TS Path objects)
struct TimelineNode;                 // beacon, patch, script run, or user-edit
                                     // presumption node (mockup layers 1-12).
// Q14: a timeline's reconstruction begins at its ANCHOR — the first
// full-content evidence (commit blob, snapshot, Write body, complete Read
// echo, populated originalFile). Byteless earlier mentions are PRE-ANCHOR
// STUBS: position + evidence known, content unknown. Reverse-applying an
// Edit (new_string -> old_string) from the anchor can promote a stub to
// bytes; anything that consumes bytes (diff, replay, patch) refuses to run
// against an unpromoted stub — stubs are display/placement only. An
// underivable stub renders as "existed, content unrecovered", never as a
// fabricated empty file.
struct Timeline {                    // one file's ordered nodes
    std::vector<std::unique_ptr<TimelineNode>> nodes;  // ordered by Instant
};

// Q: "define Instant" — a point on the shared UTC axis; meaning comes from the
// field it sits in. Hydrated only from recorded evidence, never now().
// JSONL = ms (master clock). Git committer time = seconds, widened ×1000;
// equal-second comparisons vs JSONL instants need the content-order tiebreak.
using Instant = std::chrono::time_point<std::chrono::system_clock,
                                        std::chrono::milliseconds>;

// Evidence pointer: "<jsonl>:L67". Also the provenance namespace — snapshot
// references (abc123@v3) resolve through the OWNING session's sidecar,
// never a global name lookup (Q12).
struct JsonlRef {
    Path sessionFile;
    size_t line;
};

// One file as seen by ONE session (Q12 diagram: "Timeline 1, from a35.jsonl").
struct SessionTimeline {
    Path sessionFile;
    Timeline timeline;
};

// The unit that owns a file's history. One per distinct file.
// Identity = absolute path after per-session cwd resolution (Q12, pending).
struct ReconstructionEntity {
    Path filename;
    // Evidence containers: each session's records + snapshot sidecar stay
    // scoped to their owner. The layers operate on a DERIVED merged view —
    // all sessions' nodes flattened onto one axis by Instant (Q13; same
    // structure the current engine builds: all file-touching JSONL rows,
    // sorted by timestamp). Concatenation end-to-start is just what the
    // merged view looks like when sessions didn't overlap.
    std::vector<SessionTimeline> sessionTimelines;
};

// ---- Typed, directed edges (Q11: these REPLACE LinkedReconstructionEntities;
// untyped connectivity is transitive and collapses the project into one blob).

// 1. Sequential identity. renamedFrom's timeline ends here; renamedTo's begins.
struct RenameEdge {
    ReconstructionEntity* renamedFrom;
    ReconstructionEntity* renamedTo;
    Instant timestampOfRename;
    JsonlRef evidence;
};

// 2. Fork, not sequence: both entities alive after the copy.
//    bornCopy's first content = copiedFrom's reconstructed state at the copy.
struct CopyEdge {
    ReconstructionEntity* copiedFrom;
    Instant timestampOfCopy;
    ReconstructionEntity* bornCopy;
    JsonlRef evidence;
};

// 3. Evidence dependency, NOT identity. Consulted only by the layer-10
//    executor; a verified replay confirms nodes on every filesWritten timeline.
struct ScriptDependsOn {
    TimelineNode* scriptRun;
    std::vector<ReconstructionEntity*> filesRead;
    std::vector<ReconstructionEntity*> filesWritten;
    JsonlRef evidence;
};

struct ReconstructionGraph {
    std::vector<std::unique_ptr<ReconstructionEntity>> entities;
    std::vector<RenameEdge> renames;
    std::vector<CopyEdge> copies;
    std::vector<ScriptDependsOn> scriptLinks;
};

// Derived on demand, never stored: the viewer's "one continuous file history"
// = walk RenameEdges end-to-end. Provenance adds CopyEdges. Script links are
// scheduling input only.
std::vector<const ReconstructionEntity*> lineageOf(const ReconstructionGraph&,
                                                   const ReconstructionEntity&);

// Q15: partial-content records are CONTENT-verified, line-positioned. Apply
// the hunk at its recorded oldStart; verify every context/removed line
// equals the base at that position (engine: firstHunkMatchesBase). Mismatch
// means the BASE below is wrong, not the hunk: repair the base from evidence
// (backup, originalFile, reverse-application from a later beacon) and
// re-apply. Content-search relocation is the LAST resort — unique whole-file
// match only; ambiguous match stays a gap. No confidence score.

// Q16: two user-edit classes, one backbone. Backbone (works on every JSONL
// vintage): elimination — every diff is a User Edit until ruled out.
// Upgrade (newer vintages only): a disk re-observation echo
// (edited_text_file) whose bytes differ from the reconstructed prior state
// becomes a positive UserEdit BEACON — exact instant, exact content,
// affirmative attribution. Residuals keep interval + presumption. Both
// convert to commits equally well (closing bracket is a verified beacon);
// only the attribution metadata differs. A residual behind a non-clean
// script replay keeps a recorded suspect, never silent promotion (feeds Q8).

// Q18 (commit-selection patch extraction): selections PARTITION the merged
// timeline — the user picks CUT POINTS (right edges); each selection's patch
// = diff(endStateOfPreviousSelection, rightmostStateInThisSelection); the
// first region's base is the anchor (Q14). Every event lands in exactly one
// patch; the series composes by construction. Both cut states must be
// VERIFIED states — the UI must not allow a cut mid-residual or on an
// unverified node. Cross-timeline agreement (same bytes observed by
// multiple sessions at a dashed vertical) raises beacon trust.

// Q19 (branch rendering vs patch content): patches are STATE-based (Q18 cut
// to cut on the surviving merged view) — no per-node inclusion logic. Nodes
// reuse the engine's kept/ignored row classification: ignored nodes dimmed,
// kept nodes full. Rendering rule: a branch whose file content did NOT
// carry forward visually ENDS; a branch whose content DID carry forward
// (conversation rewound, code kept) visually REJOINS the continued branch —
// so a selection rectangle visually contains exactly what its patch contains.
//
// MVP (user-declared): Layer-1..3 timeline as an HTML page over a project's
// JSONLs + FHS + git hashes; range selection over timeline nodes emits a
// git-diff patch (Q18 cut rules); node click opens the current renderer's
// Details view — right half SPLIT top/bottom: top = Details view; bottom =
// diff of the selected segment, REUSING the existing webapp Changes view
// (Fork-style file tree + diff — do not reinvent), shown only while a
// segment is selected. Patch extraction: "Create segments" button arms the
// ruler; the user adds cut MARKS (triangles); the ENTIRE ruler length is
// partitioned into segments — patch overlap impossible by construction
// (Q18 partitioning surfaced as UI). Layer switcher above the timeline
// (Layer: [1]..[12]) controls WHICH layer renders and WHEN it computes;
// switching to an uncomputed layer shows a progress bar (lower layers are
// prerequisites). Orientation: VERTICAL (decided) — per-session/per-file
// vertical lanes side by side; dashed cross-lane alignment lines mark
// same-content corroboration; a selection RULER runs along the left edge
// with start/end handles, and the selection band spans ALL lanes (the
// rotated commit-A/B/C picture). A "condense" button squashes the lanes
// into a single all-nodes column like the current timeline view.
// End goal: distill this header into input for /goal-tasks (spec + tasks).

// Q20 (script-run identification): REUSE the existing engine's approach —
// command-target parse, script-body recovery from the transcript (the body
// is itself a reconstructed entity => ScriptDependsOn.filesRead), static
// write-gate to skip read-only runs, compound-command splitting, and
// sandbox replay as the only trustworthy answer to "what did it touch".
//
// Multi-file view (mockup, decided): per-file boxes placed on ONE shared
// vertical time axis, offset to each file's history start; per-session
// lanes inside each box; one global left ruler; the selection band spans
// every file's lanes (Q18 cuts apply per file at the band edges).

// Q21 (performance = layered laziness): the layer ladder IS the perf
// architecture. "Fill in the gaps, but only when you want the gaps filled
// in." Layers 1-3 are parse-only (JSONLs + git + FHS lists — no replay, no
// diffing) and render immediately; layers 4+ compute on demand, scoped to
// the file/region the user is looking at; each layer's output is a pure
// function of (inputs, lower layers) and persists keyed by input hashes.
// Extra win over the current all-or-nothing engine: verified lower-layer
// states double as REPLAY SEEDS — a script run starts from the nearest
// verified beacon state, never from a full re-reconstruction back to the
// anchor. A layer-3-only selection (FHS + commits as cut states) needs
// none of the expensive layers at all.

// Q17 (CLOSED — commit creation from segments): one commit per segment,
// whole-tree honest, exported by APPLY-AND-COMMIT: start at the baseline
// commit (or an anchor-built root), git-apply each segment's patch in
// order, commit each — untouched files carry forward by git's own
// semantics, so no tree assembly and no untouched-file question.
//   (a) cut marks snap PER FILE to verified states at slightly different
//       instants; accepted — the generated commit message manifests each
//       file's snapped instant.
//   (b) snap is AT-OR-BEFORE only (never pull future content backward);
//       files born after the cut are absent; a file included across an
//       unresolved gap gets a manifest line saying so.
//   (c) two true dates: author date = the cut's snapped instant (recorded
//       evidence, via git commit --date), committer date = export wall
//       clock. Nothing artificial — this is git's rebase/am split.

// ---- Decided so far -------------------------------------------------------
// Q3:  kept-vs-reverted at a rewind fork = compare rewind-moment snapshots.
// Q6:  scripts run SPECULATIVELY on best-effort pre-state; the next beacon
//      accepts or rejects. Match also retro-confirms the inputs it read.
// Q7/Q9: one machine, one clock. Commits placed by committer time (never
//      author time); same-second ties broken by content order.
// Q8 (CLOSED, derived from Q6+Q14+Q15+Q16):
//      (a) no bracket-gate on script replay — speculation (Q6) with the real
//          precondition from Q14: every filesRead state MATERIALIZABLE (no
//          unpromoted stubs) at the run's instant; beacon match retro-confirms.
//      (b) replay mismatch resolves in order: 1) suspect the BASE — repair
//          from evidence (Q15) and re-run once; 2) still mismatched -> Q16
//          weaker class: residual delta with recorded suspect; 3) promotion
//          to "presumed user edit" needs a CLEAN replay (determinism check:
//          no time/random/network/env reads; inputs verified; exit 0);
//          "evidenced user edit" needs an edited_text_file-style echo.
//      INVARIANT: the engine may leave a gap, but it may never invent an
//      attribution — elimination narrows suspects, only evidence convicts.
// Beacon disagreement (commit blob vs nearby snapshot): not special — the
//      diff between them is presumed User Edit like any adjacent pair, and
//      the layers try to explain it. Same-second ties fall back to the Q9
//      content-order tiebreak before any diff is classified.
// Layers: presumption-of-user-edit between every adjacent pair; fixed-point
//      loop until every user-edit node is confirmed or removed.
