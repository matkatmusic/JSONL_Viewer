# Task 331 — single-source the wire vocabulary — implementation notes

## 2026-07-29 setup
- Worktree branch pointed at an empty "Initial commit"; reset --hard to dev head
  f32c7db and cloned jfred (submodule commit 6e76db8 is not on the remote, so
  `git clone --shared` from the main tree's local jfred, then `checkout 6e76db8`).
- Baseline `npm run typecheck` + `npm run build:webapp` both exit 0 before edits.

## Decisions / deviations
- WireSnapshotOf needs THREE type params `<I, P, U>`: server snapshot carries
  `sessionId: Uuid` (U) AND `sessionFile: Path` (P) — two distinct domain types,
  neither widened to string (strict-typing rule). WirePairOf/WireOrphanOf/
  WireLayer1ViewOf therefore also carry `<I, P, U>`. Plan's Step-1 sketch showed
  `<I, P>`; the plan's CAREFUL note authorizes the third param. Test literals use
  `WirePairOf<string, string, string>`.
- app-paths-project.ts keeps its own local `WireRepoCommitRow` (classic Paths
  popover, not Layer 1) — outside the plan's stated re-point scope; left untouched.
