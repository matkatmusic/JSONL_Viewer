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
                                     // presumption node (mockup layers 1-12)
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
    // Ordered by each timeline's start Instant. Sequential sessions
    // concatenate end-to-start (the dotted divider in the lineage diagram).
    // OPEN (Q13): concurrent sessions overlap in wall-clock — concatenation
    // undefined there.
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

// ---- Decided so far -------------------------------------------------------
// Q3:  kept-vs-reverted at a rewind fork = compare rewind-moment snapshots.
// Q6:  scripts run SPECULATIVELY on best-effort pre-state; the next beacon
//      accepts or rejects. Match also retro-confirms the inputs it read.
// Q7/Q9: one machine, one clock. Commits placed by committer time (never
//      author time); same-second ties broken by content order.
// Q8:  OPEN (revisit): residual-after-replay attribution — "user edit" vs
//      "replay diverged". Rule so far: every diff is a user edit until ruled
//      out as something else.
// Layers: presumption-of-user-edit between every adjacent pair; fixed-point
//      loop until every user-edit node is confirmed or removed.
