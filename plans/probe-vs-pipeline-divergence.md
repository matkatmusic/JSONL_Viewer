# Why the probe's reconstruction-verification diverges from the actual pipeline

**Prerequisite for the probe-defect fix plan (task #9).**

The reconstruction *engine* is the same in both paths — `replay.extractEditsFromJSONL` +
`classify.analyzeJSONL` + `replay.replayEdits`. It reconstructs file content correctly in
every case we audited (0 of 11 failures were engine bugs). The difference in *success rate*
comes entirely from the **verification harness around the engine** — specifically the three
hard inputs that must be chosen before you can replay-and-compare:

1. **Which transcripts feed the replay?**
2. **What is the file's identity / which path?**
3. **What reference content do we compare the replay against?**

The production pipeline lets a caller (or the lineage CLIs) answer all three correctly. The
probe tries to answer all three *autonomously from a single session*, and that automation is
where fidelity is lost.

---

## The actual pipeline (`tools/reconstruct.js` + the CLI lineage tools)

`reconstruct.js` (see `collectEditsFromTranscripts`, `extractKeptEditsForFile`, `main`):

- **Transcript set is caller-supplied and lineage-complete.** It takes `--jsonl a --jsonl b
  …` — a *list* of every transcript that touched the file — and concatenates their **kept**
  edits in order, then replays once (`reconstruct.js:90-104,176-177`). The caller obtains
  that list from `find-jsonls-for-file.js` / `collect-touches.js`, which **follow
  rename/copy lineage** (`collect-touches.js resolveAliases:172`) across renames **and across
  project directories**. So multi-session and cross-project authorship is fully assembled.
- **Edits are classified.** `classify.analyzeJSONL` marks superseded/reverted edits
  `ignored`; only `kept` edits are replayed (`reconstruct.js:64-87`). The final content is
  the clean end state.
- **Reference content is the real current file.** `--verify <path>` (or `--output`) compares
  the replay against an **explicit on-disk path the caller points at** — the file's *current*
  location, resolved by the human/CLI via lineage (`reconstruct.js:109-125`). No reliance on
  recorded paths, no snapshots.

Net: the two genuinely hard problems — *which transcripts?* and *which reference file?* — are
solved **outside** the engine, with full lineage and human/tool knowledge of where the file
lives now. Given correct inputs, the engine succeeds.

---

## The probe (`tools/probe-projects.js`)

The probe has **no caller** to supply those inputs — it must infer them for hundreds of files
automatically, and each inference is weaker than the pipeline's supplied input:

| Hard input | Pipeline | Probe | Resulting defect |
|---|---|---|---|
| **Transcript set** | Caller passes the full lineage-resolved list across all dirs | Verifies **one session at a time** (`probeSingleJsonl:342`); cumulative is a bolt-on fallback gated on on-disk content and limited to **one project dir's** texts (`tryCumulativeVerify:365`, `probeProject:376`, `collectSessionsForFile:251`) | Multi-session / cross-project files can't be assembled (defect #4) |
| **File identity / path** | Caller knows the file; CLI follows renames | Targets keyed by **basename** (`collectProbeTargets:149`); path is **first-seen** (`buildFilePathIndex:135`), which for moved files is the **stale starting path** | Basename collisions merge distinct files (defect #3); moved files miss on disk (defect #1) |
| **Reference content** | Caller points `--verify` at the **current** on-disk file | A guess-chain: on-disk at the *first-seen* path → cumulative → **last file-history-snapshot** → git (`verifyTarget:271`, `trySnapshotVerify:186`) | When on-disk lookup fails (stale path), it falls to a snapshot that may **predate the final edits** → false MISMATCH (defect #2); when nothing resolves → NOT_FOUND |

### The mechanics of each divergence

- **Stale-path / rename not followed (defect #1).** `verifyTarget` only does
  `fs.existsSync(fullPath)` at the first-seen path; it never relocates to the file's current
  location via lineage. The pipeline's caller always points at the current path. So files
  moved into `unified/`, `jfred/`, `viewer/` exist on disk but the probe can't see them.
- **Snapshot-predates-final-edit (defect #2).** `trySnapshotVerify` replays **all** edits
  (final state) and compares to the **last** snapshot. The pipeline never uses snapshots — it
  compares to the real file. Whenever an edit follows the last snapshot, the probe's
  comparison is point-mismatched.
- **Basename collision (defect #3).** The probe dedupes targets by basename, so three
  different `launch.json` files collapse into one replay stream. The pipeline targets a
  single concrete file the caller named.
- **Cross-project / multi-session (defect #4).** `probeProject` loads `allTexts` for **one**
  directory; `collectSessionsForFile` only searches those. The pipeline's caller hands in
  transcripts from *every* directory the file was touched in.

---

## Bottom line

> The engine reconstructs correctly in both paths. The pipeline succeeds more often because a
> caller (via the lineage CLIs) supplies the **complete transcript set** and the **true current
> reference file**. The probe must infer both from a single session's recorded paths plus a
> snapshot fallback, and those inferences are the four defects. Fixing the probe means making
> its harness reuse the same lineage/assembly the pipeline relies on — not changing the engine.

This directly shapes the task #9 plan: the fixes are (1) follow lineage to the current path,
(2) drop snapshot-point-mismatch in favor of the real/relocated file (or replay-to-snapshot-
point), (3) key targets by full path, (4) assemble all touching sessions across dirs — i.e.
give the probe the same inputs the pipeline's caller already provides.
