## 2026-07-25:16:32:00 — Layer 1 View feedback fixes (S18 follow-up)
Chat title: feedback-on-the-app-layer1-html-sorted-shore
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/e4ebe2e1-c3ad-40ce-b250-8491d77e6736.jsonl

### References

/Users/matkatmusicllc/.claude/plans/feedback-on-the-app-layer1-html-sorted-shore.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/plans/coding-requirements.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/from-scratch-SPEC.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/plans/layer1-mockup.html

### Design decisions

**Step 1 — the disk walk now ASKS GIT instead of threading a submodule exclusion list.**
The plan's Step 1b widened `walkCurrentFileState` with an `excludedRelativeFolders: Path[]`
parameter fed from the repo tree's gitlinks. Mid-implementation the user pointed out that git
itself can produce the file list, which would exclude submodule content for free. That is
strictly better, so Step 1b was rewritten around
`git ls-files -z --cached --others --exclude-standard`, run in the project folder.

Verified empirically before committing to it (temp fixtures + the real jfred repo):

- `ls-files` stops at a gitlink exactly as `ls-tree -r` does — a submodule's contents are never
  listed. jfred's four submodules hold 10,884 files, every one of which used to land in
  "No repository match".
- `--others --exclude-standard` honors NESTED `.gitignore` files, `.git/info/exclude` and
  `core.excludesFile` — none of which the hand-rolled matcher in this module understands.
- It fails cleanly (`fatal: not a git repository`) in a plain folder AND in a folder holding a
  fake `.git/` directory, which is what the four pre-existing fixtures use. So the hand-rolled
  walk survives untouched as the fallback for a project folder that is in no repository — a
  legitimate Layer 1 input, since the two roots are independent.

**The gitlink falls out on the stat, not on a filter.** `ls-files` DOES name the gitlink itself
(`external/tmux_lib`) as one entry. Rather than filtering it against a second list, the new
`statWorkingTreePaths` keeps only entries whose disk stat says `isFile()`. One stat answers two
questions at once: a gitlink is a directory, and a tracked-but-deleted file has no disk entry.

**`ALWAYS_EXCLUDED_NAMES` is still enforced on the git path.** Git's own answer already omits
`.git`, but a project that neither tracks nor ignores `node_modules` would flood the view with its
contents as untracked files — the same defect submodules produced. S18 requires both exclusions
unconditionally, so `checkPathIsAlwaysExcluded` re-applies them to git's output.

**Step 1a is unchanged and still load-bearing.** `readRepoTreeAtRef` still splits the tree into
`trackedFiles` / `submodulePaths`, because the REPO side of the pairing needs it independently: a
gitlink is not a file, so pairing one invents a phantom repo-only row per submodule (that was the
"4 phantom directory rows" half of defect 5).

### Deviations

**Dropped the `excludedRelativeFolders` parameter entirely** (plan Step 1b). With the git-backed
listing it has no live caller in any real configuration: if the project folder is inside a repo,
git already stopped at the gitlink; if it is not, there are no gitlinks on disk to exclude, and the
repo's `submodulePaths` are repo-root-relative anyway (a coordinate mismatch the plan itself
flagged as matching nothing). A parameter that is dead in every configuration is exactly the
speculative flexibility the project's ponytail rules forbid, so it was removed rather than kept.
`walkCurrentFileState(projectFolder)` keeps its original one-argument signature.

**`buildLayer1View` keeps its original statement ORDER** (plan Step 1c asked for repo-tree-first).
The reorder existed only so the gitlink list could feed the walk; with that dependency gone the
walk runs first again, and the bad-ref throw still happens before any history read, which is all
the original comment claimed. The comment above the repo-tree line was rewritten to explain the
`trackedFiles`-only pairing instead.

**Step 1's acceptance bar was beaten, not merely met — but `pairs` MOVED.** The plan's risk note
said "`pairs` should be unchanged at 832 — if it moves, the exclusion is over-reaching into tracked
files." Measured against the real repo:

| | before (screenshot) | after |
|---|---|---|
| pairs | 832 | **833** |
| repo-only | 4 | **0** |
| disk-only | **6415** | **1** |
| walk + tree | ~10 s (whole endpoint) | 31 ms (walk + tree only) |

The move to 833 is NOT over-reach in the direction the plan feared — it is the opposite. The repo
tracks 837 paths, four of which are gitlinks, leaving exactly 833 real tracked files, and all 833
now pair. The old hand-rolled matcher applied `.gitignore` patterns blindly, which git does not do
for TRACKED files, so it was dropping a tracked file from the disk state. The single remaining
disk-only row is `webapp/app-ndjson.ts`, a genuinely untracked file created during this same
session — which is the correct answer.

### Tradeoffs

**One `git ls-files` subprocess per view, versus a pure-Node walk.** The subprocess costs ~30 ms
against jfred and buys correct submodule, nested-gitignore, exclude-file and tracked/untracked
semantics that would each be a bug to re-implement. Considered and rejected: keeping the pure walk
and threading a submodule list (the plan's original) — smaller diff, but it fixes only the
submodule symptom and leaves nested `.gitignore` handling wrong.

**Failure is swallowed here, unlike `layer1_repo_tree.ts`'s loud throw.** A `ref` is something the
user typed, so a bad one must 400. "This folder is not in a repo" is an ordinary input the fallback
handles, so it must not. The two postures are deliberately opposite and both are commented.

---

## 2026-07-25:18:10:00 — Tasks 241-244 (the test coverage and the verification)

Continuation session. Production code was already written; this closes the missing tests,
runs the whole verification ladder, and updates the S18 spec.

### Design decisions

**Three test FILES, not one, and named after the modules they cover.** Tasks 241/242 offered
`tests/layer1-page.test.ts` or one new sibling. `layer1-page.test.ts` was already at 205 lines
and six more tests would have pushed it past the 250-line cap, so the split follows the
project's `tests/<module>.test.ts` convention instead of bundling by plan step:
`tests/layer1-progress.test.ts` (webapp/layer1-progress.ts), `tests/layer1-zoom.test.ts`
(webapp/layer1-zoom.ts), and only task 243's hover-title test in `layer1-page.test.ts`, which
lands at 222 lines.

**The counted-progress test drives `readLayer1ViewStream` DIRECTLY, not the page.**
`loadLayer1View`'s `finally` block calls `hideLayer1Progress`, which resets the fill to 0 and
blanks the label. Routing task 241's test 2 through the page could therefore only ever assert
the reset — the 50% fill it is meant to prove is gone by the time the load settles.

**Both new files absorb the module-scope boot before their first test.** `webapp/layer1-page.ts`
calls `bootLayer1Page()` at module scope, so the first `import` in a process boots a SECOND
time. `layer1-page.test.ts` tolerates this (its tests only assert renders), but a doubled
`wireZoomControls` attaches two click listeners and ONE zoom-out click would apply two steps —
the zoom test would fail for a reason having nothing to do with the zoom. Each new file does a
throwaway `setupLayer1Dom()` + `await import(...)` at module scope first; the empty query makes
that boot's `loadLayer1View` return before it fetches anything.

### Verification results (task 244)

1. **Typecheck** — both tsconfigs clean.
2. **Full suite** — `npm test`: **1223 pass, 0 fail**. TRAP A did not fire: the streamed
   response through `forwardFetchToOrigin` works on node's undici as predicted, so the
   acceptance test needed no fallback to the plain path.
3. **Webapp build** — clean; `app-ndjson.js`, `layer1-progress.js` and `layer1-zoom.js` all
   landed in `webapp/dist/`.
4. **Live smoke** — endpoint measured directly plus a headless-Chrome CDP driver for the
   browser-only bullets. See below.

### Deviations

**The live smoke ran on port 7355, not 7343.** A viewer left running by an earlier session
still holds 7343, so `npm run app` died with EADDRINUSE while the OLD server kept answering —
its 1.5 MB single-line reply (no progress lines, pre-fix walk) looked exactly like a
`?progress=1` regression. This is TRAP B's shape at the app port rather than at a test port:
**a stale viewer presents as the feature being broken, never as a port problem.** That process
(PID 92085 at the time) was left alone; it is the user's.

**Disk-only is 8, not the 1 the task predicted.** Every extra row is a file created by this
same work (`src/viewer_api_layer1_route.ts`, `webapp/app-ndjson.ts`, `webapp/layer1-progress.ts`,
`webapp/layer1-zoom.ts` and the four new test files) and genuinely untracked. Pairs 833 and
repo-only 0 are exactly as predicted.

### Smoke findings

Measured against the live jfred repo through the real endpoint:

| | value |
|---|---|
| pairs / repo-only / disk-only | 833 / 0 / 8 |
| submodule paths in any bucket | **0** |
| progress lines | 836, counting `reading file history — N / 833` |
| ruler gap min / max | **16** / **120** — the floor and the cap, both live |
| smallest node-to-node gap in one widget | **16 px** |
| overlapping node labels | **0 of 2,141** |

**RISK #1 IS CLEARED — `position: sticky` DOES survive the native CSS `zoom` context.** Driven
in real Chrome: after scrolling the pane fully right the gutter measured **0.00 px** from the
pane's left edge at 51%, 100% and 195% zoom (160,705 / 81,591 / 315,199 px scrolled). The
plan's documented fallback — moving `zoom` from `.canvas` up to `main.timelines` — is **not
needed**, and `.canvas` keeps the scroll container's own padding unscaled as intended.

### Open questions

**NEW: a ruler tick sits 32 px above the node it marks.** Found by the CDP alignment check and
NOT fixed here, because it is pre-existing and outside these four tasks. The delta is constant
in canvas space at every zoom (−32.00 / −32.02 / −31.53 px at 100% / 51% / 195%), so sticky and
zoom are not involved. The cause is plain: `.filebox` anchors at `margin-top: var(--axis-px)`
but carries a 2 px border plus 30 px top padding to house the filename/sub header, and `.lane`
— which its nodes are placed inside — starts after that inset. `git diff` confirms none of
those rules were touched by this work. Either shift the lane up by the header inset or accept
it as the header's cost; it is a design call, not a bug fix.

Carried forward from the first session, still worth the user's eye:

1. **`node_modules` is now excluded by BOTH git and the explicit name check.** If a project
   genuinely tracks `node_modules`, Layer 1 will hide it. That matches S18's stated contract
   ("excluded unconditionally"), but it is now the only place where Layer 1 disagrees with git
   about what the repository contains. Say the word and the name check can be dropped on the git
   path, letting the repo's own ignore rules govern.
2. **`pairs` moving 832 → 833** is explained above and believed correct, but it is a number the
   user has seen on screen, so it is called out rather than buried.
