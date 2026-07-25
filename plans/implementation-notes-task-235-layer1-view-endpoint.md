## 2026-07-25:14:20:00 — Task 235: `GET /api/layer1-view?dir=&repo=&ref=`
Chat title: tackle-tasks 235 valid — Layer 1 View endpoint (S18)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/9124f14d-4f6c-468d-bc0d-404ae9ff2d70.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-235-layer1-view-endpoint-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/from-scratch-SPEC.md (S18)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/layer1-mockup.html
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/src/viewer_api_layer1.ts (new)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/viewer_api_layer1.test.ts (new)

### Design decisions

- **Wire shape.** `{ pairs, gitOrphans, diskOrphans, ruler }`. The first three are task 232's
  property names passed through unchanged, per S18's output contract; `ruler` is new — the view's
  distinct instants ascending, each with its `axisPx`, which is what the page needs for tick marks.
- **One placed-instant type, reused three ways.** `Layer1WireInstant { instant, axisPx }` is
  extended by the commit node (adds `hash`) and the bucket row (adds `path`), and used as-is for a
  pair's `onDisk` node. No parallel shapes to keep in sync.
- **Git-orphan placement = its LAST touching commit.** A repo path with no on-disk counterpart has
  no mtime, so its most recent commit is the moment it last existed in the repo. This matches
  `plans/layer1-mockup.html`, which places a repo-only row with `.at(-1).at`.
- **Bucket rows are sorted ascending by instant** so a bucket's placement is simply its first row's
  `axisPx` and the page needs no `Math.min`. Re-ordering rows neither renames nor inverts a bucket,
  so the S18 contract is untouched. Pair order is left as the disk walk's path order.
- **Axis resolved once, keyed by epoch ms.** `resolveInstantOffsets` runs over every instant the
  view draws (pair commits, pair mtimes, git-orphan commit instants, disk-orphan mtimes), and the
  lookup map is keyed on `getTime()` — the same identity the resolver de-duplicates on. A lookup
  miss throws rather than defaulting to 0, since every instant handed out was in the resolve input.
- **Validation at the trust boundary.** `dir` and `repo` are each checked for existence and
  is-a-directory in `requireExistingFolderParam`; a missing param already 400s via `requireParam`.
  A non-repo `repo` and a bad `ref` need no check of their own — `listRepoTreeAtRef` throws naming
  the ref. Everything throws before any header is written, so `viewer_server.ts`'s outer catch
  produces `400` + `"Error: <message>"` with no stack.
- **Empty `?ref=` is treated as absent** — a blank header box still submits the param.

### Deviations

- **The plan's scope grew by one deliberate step (Step 1): `ref` now threads through the shared
  git-log reader.** `listCommitsTouchingFile` ran `git log` with no ref, i.e. always from `HEAD`.
  With `?ref=<older-commit-or-branch>` the repo tree came from that ref while the ladders came from
  `HEAD`, so a path tracked at the ref but absent from `HEAD` got an empty history — and a
  git-orphan row with no instant has nowhere to be placed. Fixed in the one shared reader
  (`layered_git_beacons.ts`) rather than at the two call sites; `listPairCommitHistory` passes the
  ref through. Both default to the newly `export`ed `ACTIVE_BRANCH_REF` from
  `layer1_repo_tree.ts`, so every existing Layer-2 caller and every existing test is unaffected.
- **`listCommitsTouchingFile` converted from `execSync` template to `spawnSync` argument array.**
  Required, not cosmetic: `ref` is now user input from a URL, and inside `execSync`'s double quotes
  `$(…)` and backticks still execute. The array form removes the shell entirely, drops the
  `JSON.stringify` quoting, and let `maxBuffer` rise to 64 MB (`execSync`'s 1 MB default would
  surface a long history as a false "no commits" through the old `catch`).
- **`ACTIVE_BRANCH_REF` lives in `layer1_repo_tree.ts`, not `structures/vocabulary.ts`.** It is a
  git ref, not wire vocabulary, and that module already owned it; a Layer-2 module importing one
  constant beat inventing a third home for the string `"HEAD"`.

### Tradeoffs

- **`ruler` ships alongside per-node `axisPx`** — mild duplication. The alternative (ship only the
  ruler and have the page look each node's instant up) puts a lookup in the browser for every node;
  the alternative in reverse (per-node only) leaves the page unable to draw ticks. Both are needed,
  so both travel.
- **Git-orphan ladders cost one `git log` per orphan path.** A repo with thousands of deleted-from-
  disk files means thousands of git invocations. Not optimized: the milestone's inputs are one
  project folder against one repo, and a single `git log --name-only` sweep would trade a small
  win for a parser. Revisit if a real repo makes the endpoint slow.
- **A shallow clone can truncate a git orphan's history to nothing**; such a row is dropped (with a
  `ponytail:` comment) rather than invented at a fake instant.

### Open questions

- **None blocking.** One thing worth confirming when task 237 (the webapp page) lands: whether the
  page wants the bucket rows pre-sorted (as shipped) or in the engine's disk/git order. Changing it
  later is a one-line move.
