# Task 313 — serve snapshot bytes from /api/layer1-file by owning session

Spec S19. `/api/layer1-file` gains a THIRD form (commit `?repo&path&hash`, on-disk `?dir&path`
already exist): the snapshot form returns one @vN's bytes from its OWNING session's file-history
sidecar. `abc123@v2` recurs across sessions with different bytes, so the owning session is
load-bearing — a lookup by blob name alone silently serves the wrong file.

## Wire shape (task 312, unchanged)

`WireSnapshot` carries `version`, `sessionId`, `sessionFile`, `line` — it OMITS `backupFileName`.
So the server re-derives the blob name from the owning session's placements.

## Params (all already known to the client from the wire + page)

- `snapshotSession` — absolute owning-session transcript path (form selector; presence picks this form)
- `sessionId` — owning session uuid
- `version` — the @vN integer
- `path` — the file's path as it appears in the wire pair (relative to the project folder)
- `dir` — project folder, to relativize placement paths for the match

## Server flow (new module `viewer_api_layer1_snapshot.ts`)

1. Validate `sessionId` shape (`/^[0-9a-fA-F-]+$/`) — rejects `..` / separators before it reaches the FS.
2. Parse `version` as a non-negative integer, else refuse.
3. `collectSnapshotPlacements([snapshotSession])` (reuse task 310), find the placement whose
   relativized path === `path` AND sessionId === `sessionId` AND version === `version`
   (version is PER-FILE within a session, so path disambiguates).
4. Miss → throw (unknown session/version → clean 4xx via the server's outer catch).
5. `resolveFileHistoryRoot(records)` (explicit override wins — S1) + `createSidecarReader(sessionId, root)`.
6. Defense-in-depth: confirm the resolved read path stays under `root/sessionId` + sep.
7. Return `{ content }` (utf8, same as /api/blob) — snapshots are text file-history blobs.

Wire into `handleLayer1FileRequest`: if `snapshotSession` present, take the snapshot branch first.

## Verify (new `tests/viewer_api_layer1_snapshot.test.ts`, temp-tree via loadTranscript)

- Same `@vN` blob name under two different session ids returns two DIFFERENT bodies.
- A `..` session id is refused.
- An unknown session id / missing placement throws (server maps to 4xx), not a stack trace.

Reuse the fixture builders from `tests/layer1_snapshots.test.ts` (buildSnapshotRecord, writeBlob, …).
