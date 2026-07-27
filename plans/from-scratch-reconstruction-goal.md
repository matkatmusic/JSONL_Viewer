# From-scratch reconstruction — goal distillation (input for /goal-tasks)

Product of the 2026-07-23 design interview. The full decision ledger (with
question numbers and the C++ data-model sketch) is
[`../from-scratch-reconstruction.hpp`](../from-scratch-reconstruction.hpp);
visual contracts are [`timeline-versions.html`](timeline-versions.html) (the
layer ladder) and [`mvp-app-mockup.html`](mvp-app-mockup.html) (the decided
app layout). This file is the condensed input for producing a spec + task list.

## Goal

A layered, lazy reconstruction timeline: render the cheap evidence (commits,
file-history snapshots, on-disk state) instantly, fill in deeper evidence
layers only when the user asks, and let the user cut ranges of verified
states into git-diff patches. "Fill in the gaps, but only when you want the
gaps filled in."

## Core model (settled)

- Every diff between adjacent timeline points is a **presumed user edit**
  until a layer explains it; the engine may leave a gap but may never invent
  an attribution — only evidence convicts.
- Layer ladder — **REVISED 2026-07-25, revised again 2026-07-27**; the
  user-facing ladder is now:
  - **Layer 1 = Current File State vs Git State (SHIPPED).** The on-disk file
    walk paired against the repo tree at a ref, each pair's commit history as
    nodes on a shared capped-gap ruler, two orphan buckets for the unpaired
    paths — plus the JSONL surface (session list, multi-folder JSONL source
    paths, selected-session time-range wash). Specified in `specs/from-scratch-SPEC.md`
    S18; mockup `layer1-mockup.html`.
  - **Layer 2 = adds file-history snapshots (NEXT — mockup stage).** One node
    per snapshot version on the owning file, resolved through the owning
    session's sidecar. Specified in S19.
  - **Layers 3+ = UNASSIGNED.** User direction 2026-07-27 was "just do
    snapshots", so nothing above Layer 2 is specified and no task exists.
  - Superseded numbering, kept only because the deeper work below still
    describes real evidence classes: the original ladder ran 1 start/end →
    2 commits → 3 snapshots → 5 derived edits → 7 script runs located →
    8/9 branches (kept vs reverted by snapshot comparison) → 10 speculative
    script replay verified against the next beacon → repeat to fixed point →
    12 non-modifying decoration. Layers 1 and 2 of that list are now both
    inside the new Layer 1, and the old "JSONL-derived start points" layer
    from the 2026-07-25 pass was DROPPED entirely — the Layer 1 mockup
    already carries it, and a layer that adds nothing is not a layer.
    `timeline-versions.html` still draws the old ladder.
- One machine, one clock: all sources merge onto a single UTC ms axis
  (git committer time, seconds, widened; same-second ties broken by content
  order). Multi-session evidence merges by instant; snapshot references
  resolve through the owning session's sidecar.
- Identity: one `ReconstructionEntity` per file; typed directed edges
  (rename / copy / script-dependency) — lineage is derived by walking rename
  edges, never stored as a group.
- Partial-content records are content-verified at their recorded line
  position; a context mismatch means the base below is wrong → repair the
  base from evidence (backup, originalFile, reverse-application).
- Performance = layered laziness: the assigned layers (1 and 2) are parse-only
  and instant; any computed layer added later runs on demand scoped to the
  viewed file/region; layer outputs persist keyed by input hashes; verified
  beacon states double as replay seeds so scripts never need full-history
  reconstruction.

## MVP scope (build this first)

1. **Load**: `load project(project folder, [opt] repo path, [opt] jsonl
   paths, [opt] snapshot paths)` → merged per-file Layer 1 + Layer 2 timelines
   (anchors, presumed-user-edit gaps, commits, snapshots, on-disk end).
   Anchor = first full-content evidence; byteless first mentions are
   pre-anchor stubs (display only).
2. **Render** (vertical, decided layout — see mvp-app-mockup.html):
   - Left half: per-file "reconstruction timeline widgets" (rounded boxes)
     on one shared vertical time axis, offset to each file's start; per-
     session lanes inside; dashed cross-lane corroboration lines where
     multiple sessions observed the same bytes.
   - Global left **ruler**; "Create segments for patch extraction" arms it,
     and the user adds cut **marks** (triangles). The entire ruler length is
     partitioned into segments P1..Pn spanning every file's lanes — patch
     overlap is impossible by construction. Marks snap to verified states.
   - **Layer switcher** above the timeline, one button per ASSIGNED layer
     (today `[1]` and `[2]`, no placeholders): controls which layer renders
     AND when it computes; switching to an uncomputed layer runs it with a
     progress bar (lower layers are prerequisites).
   - **Condense** button: squash per-session lanes into a single all-nodes
     column per file (like the current webapp timeline).
   - Left collapsing drawer: JSONL session list + file nav; clicking a file
     scrolls to its widget.
   - Right half split top/bottom: top = the current renderer's Details view,
     filled on node click; bottom = the **existing webapp Changes view**
     (Fork-style file tree + diff — reuse, don't reinvent) showing the
     selected segment's patch, visible only while a segment is selected.
   - Kept/ignored row classification reused for dimming; branches whose
     content did not carry forward visually end, branches whose content
     carried forward visually rejoin.
3. **Patch generation**: selections partition the timeline; cuts allowed on
   verified states only; per file,
   `patch = diff(endStateOfPreviousSelection, rightmostStateInThisSelection)`;
   emit as git-diff.

## Reuse from the current engine (do not rebuild)

- Merged sorted file-touching row list; kept/ignored row classification.
- Script-run identification chain (command parse, transcript script-body
  recovery, static write-gate, sandbox replay as ground truth).
- Hunk application discipline (`firstHunkMatchesBase` + reseed-from-evidence).
- Rewind kept-vs-reverted detection via rewind-moment snapshots.
- The webapp Details view.

## Explicitly deferred (not in MVP)

- Layers 4+ on-demand computation (derived edits, script replay, fixed-point
  loop) — MVP ships layer 1–3 with presumption nodes shown honestly.
- Commit creation from selections (Q17 parked — patch generation only).
- Horizontal orientation (rejected for MVP; vertical decided).
- `edited_text_file` positive user-edit beacons (upgrade path; elimination
  backbone works on all JSONL vintages).
