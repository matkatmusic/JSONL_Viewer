## 2026-06-19:12:06:00 — Conform `flickering-marinating-pike.md` to planning.md
Chat title: Plan 'make engine B the main engine'
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/8769e62c-33d3-4885-8f13-f8c53d377e8d.jsonl

### References

/Users/matkatmusicllc/.claude/plans/read-users-matkatmusicllc-desktop-claude-structured-island.md  (the conformance spec being implemented)
/Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md  (the target plan being rewritten)
/Users/matkatmusicllc/.claude/guides/planning.md  (conformance target)
/Users/matkatmusicllc/.claude/guides/tdd.md
/Users/matkatmusicllc/.claude/guides/coding-standards.md
/Users/matkatmusicllc/.claude/guides/single-condition-branching.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260619-1157.md  (originating handoff)

### Design decisions

- **Single-author rewrite, no parallel subagents.** The deliverable is one cross-referenced Markdown document
  (Build order → Phase 1 blocks → Phases 2–4 blocks, with internal references between them). The skill suggests
  subagents "where possible," but splitting a single cohesive plan doc across agents would fragment voice/structure
  and force conflicting edits on one file. Authored coherently in one pass instead.
- **Per-item block template = `Behavior → RED test → GREEN implementation`.** This is the structural change that
  satisfies tdd.md's strict red-green ordering; applied uniformly to every work item in every phase.
- **Context section preserved verbatim** per the user's explicit decision (overrides planning.md's "less rationale"
  lean for the Context block only).

### Deviations

- Did not use parallel subagents despite the skill's suggestion — see design decision above. No deviation from the
  conformance spec itself.

### Tradeoffs

- **Keep vs trim Context:** planning.md prefers less rationale, but the user chose to keep the detailed Context for
  cold-implementer orientation. Followed the user's choice.
- **Phases 2–4 detail level:** the user asked to make all phases TDD-conformant, but Phases 2–4 depend on unresolved
  Open items. Resolved by giving 2–4 the same test-first block shape (named `test_<behavior>` + Behavior/GREEN notes)
  while retaining their "(sketch — detail later)" labels and the Open-items cross-references — TDD shape without
  inventing detail that needs user input.

### Open questions

- None blocking. Phases 2–4 still carry the three pre-existing Open items (bulk auto-seed algorithm, category-(b)
  deleted/moved target, Engine A retirement timing); the rewrite preserves those flags rather than resolving them.

---

## 2026-06-19:12:40:00 — Execute Phase 1 (git-seed beacon, Items 1–8)
Chat title: Plan 'make engine B the main engine' (execution session)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/18508605-dcf5-4fe9-93e7-17541a3bbac4.jsonl

### References

/Users/matkatmusicllc/.claude/plans/flickering-marinating-pike.md  (the plan being executed)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260619-1210.md  (originating handoff)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/api/git-seed.js  (NEW — Items 2–5)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/api/git-file-state.js  (Item 1: readGitCommitTimestamp)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/api/track-line-states.js  (Item 6: opts.gitSeed wiring)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tools/track-line-states.js  (Item 7: --seed-commit)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/test-git-seed.js  (NEW — Items 1–5, 7 tests)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/test-track-line-states-git-seed.js  (NEW — Item 6, 3 tests)

### Design decisions

- **Indentation reconciliation (hook-driven).** The repo's PostToolUse nesting hook keys "deep nesting (>3x indent
  unit)" on each file's *dominant* indent. So new code added to the existing **2-space** files (`api/git-file-state.js`,
  `api/track-line-states.js`, `tools/track-line-states.js`) is written **2-space** (matching siblings like
  `resolveGitFollowHistory`); the **new** file `api/git-seed.js` is **4-space** throughout (its own dominant unit).
  The plan's 4-space `readGitCommitTimestamp` snippet was illustrative — a 4-space try/catch in the 2-space file trips
  the hook (8-space body reads as 4 units). This honors the global-4-space-for-new-code rule (new file) while
  satisfying the hard hook gate (existing files).
- **Strict red-green, one item per cycle.** Each `test_<behavior>` was watched FAIL before its minimum GREEN. To keep
  Item 3 a genuine RED, Item 2 first used a minimal inline ref (`{ gitCommit: sha }`); Item 3 then introduced
  `buildGitSeedRef` with the full `{ source, gitCommit, line }` shape and refactored Item 2 to call it.
- **Item 6 hermetic tests** reuse the existing `trackFixture` extraction pattern (write JSONL → `extractFileEvents`
  → `trackLineStates` with `opts.gitSeed`); the seed content/seedMs/sha are stubbed directly, no git calls.
- **Item 8 proof strategy = synthetic-deterministic + delegated-real.** Built a self-contained E2E (`/tmp/gitseed-e2e.js`,
  not committed) that drives the REAL CLI and faithfully reproduces the util_lib.py gap (V1 baseline predates an
  inserted line; the JSONL corpus is missing that insertion; V2 contains it). Result: negative control
  (seed V1) → `mismatched 2, neverObserved 1` (still broken); positive (seed V2) →
  `{matchedObserved:1, matchedPresumed:4, mismatched:0, neverObserved:0}` (perfect); no-seed → `neverObserved:5`.
  The real util_lib.py run against the fixture corpus was delegated to a subagent (see its report).

### Deviations

- **Item 6, "seeded line 1 reports matchedObserved" → matchedPresumed.** The plan's prose expected the seeded line to
  end `matchedObserved`. The engine's normal `degradeUntouchedToPresumed` degrades any line not re-confirmed at the
  post-seed edit instant to `presumed`, so an untouched seeded line is reported `matchedPresumed`. Both are matches;
  the verdict is still perfect (`mismatched 0, neverObserved 0`). The test asserts the correct, honest behavior
  (`matchedObserved:1` for the post-seed-edited line, `matchedPresumed:1` for the carried-forward seed line).
- **Item 7, `computeRepoRelativePath` argument order.** The plan snippet wrote `computeRepoRelativePath(repoRoot, args.path)`,
  but the actual signature is `computeRepoRelativePath(filePath, repoRoot)`. Implemented with the correct order
  (`computeRepoRelativePath(target, repoRoot)`) and added a `null`-repoRoot guard the plan omitted (`resolveRepoRootWalkingUp`
  can return null; `computeRepoRelativePath` would throw on a null root).
- **`resolveSeedFromCommit` empty-file edge.** Followed the plan's `if (!content) return null`, which treats an EMPTY
  committed file (`''`) as missing → won't seed. (The CLI's `chooseReference` uses `!== null` to allow empty files;
  this primitive does not.) Acceptable for Phase 1 (util_lib.py is non-empty); see Open questions.

### Tradeoffs

- **Hook compliance vs the global-4-space memory rule.** For edits to existing 2-space files I chose hook-compliant
  2-space over global-4-space, because the hook is a hard blocking gate and the repo already mixes (4-space functions
  exist but stay flat). New-file 4-space (git-seed.js) keeps the spirit of the rule.
- **Synthetic E2E vs wrestling the real corpus.** A deterministic synthetic reproduction proves the mechanism without
  depending on the jot repo's uncommitted util_lib.py state; the real-corpus run is validated separately (subagent).

### Item 8 result — RESOLVED via option C (real-data proof passed; durable-seed deferred to option B)

**Resolution (user chose option C — "re-pick the proof target"):** temporarily committed util_lib.py's 8-line
uncommitted edit (path-scoped commit `e41f32e`, then fully reverted with `git reset --soft HEAD~1` + unstage — the
jot repo was left byte-identical, 229 uncommitted changes restored, HEAD back at `c201b63`). With the edit in a
commit, the real-data proof on `~/Programming/jot/common/scripts/util_lib.py` vs the fixture corpus PASSED Item 8's
stated criteria:
- **POSITIVE** `--seed-commit e41f32e` → `{matchedObserved:470, matchedPresumed:0, mismatched:0, neverObserved:0}`
  (Seeded from e41f32e @ 2026-06-19T20:09Z; **replaying 0 post-seed events**).
- **NEGATIVE control** `--seed-commit 625e1b5` (old) → `{1, 342, 120, 7}` (replaying 65 post-seed events; gap NOT repaired).
- **BASELINE** no seed → `{1, 342, 120, 7}` (identical to negative).

**Honesty caveat — the positive is DEGENERATE.** It replays 0 post-seed events: because no commit both predates a
post-seed beacon AND contains the edit, the only clean positive available is one whose commit postdates ALL corpus
events, so the seed alone IS the full file. It proves the real-data plumbing (repo resolve → git content → seed →
verdict honors 470 seeded lines) and that seed timing/content matters (negative still broken), but it does NOT
exercise post-seed replay-on-seed. Genuine replay-on-seed is proven only by the synthetic E2E (`/tmp/gitseed-e2e.js`),
which is non-degenerate. The general "repair a gap that sits AFTER a post-seed beacon" case remains blocked by the
clobber limitation below — that is the deferred **option B** (durable seed), to be decided separately.

The two root causes that made the NON-degenerate util_lib.py proof impossible (both verified) were:

1. **DATA: the target edit was never committed.** `git diff --stat 551cfd9 -- common/scripts/util_lib.py` = **8
   uncommitted insertions** (the Finder→Terminal "tall" Terminal block ~lines 340–346 + a blank at 386). No commit
   contains that edit, so the plan's "positive: seed from a commit AT/AFTER that edit" is **unachievable** — seeding
   from the newest commit (551cfd9, 462 lines) supplies content that is *itself still missing* those 8 lines. Result:
   seeded `1,342,120,7` === no-seed `1,342,120,7` (subagent run). The fresh `claude-data` corpus reaches `470,0,0,0`
   **without** any seed, because it carries that edit as a JSONL event.
2. **MECHANISM: a post-seed Tier-1 beacon clobbers the seed.** Proven by `/tmp/gitseed-clobber.js`: when the
   post-seed event stream contains a `Write`/`create`/`snapshot` beacon (which calls `applyWrite`/`applySnapshotVerify`
   → `belief.entries = {}`), the seeded baseline is discarded. SEEDED === NO-SEED in that test. The seed's repair only
   covers the window BEFORE the first post-seed Tier-1 beacon. util_lib.py's 42 post-551cfd9 events almost certainly
   include such a beacon, so even a commit that *did* contain the edit would be wiped. (My earlier synthetic E2E
   "passed" only because it deliberately had no post-seed beacon — it did not exercise this failure mode.)

Note: mechanism (2) is arguably the engine behaving *as designed* — a later Tier-1 beacon is ground truth at its
instant and rightly overrides prior belief. But it means the locked design ("seed as Tier-1 observed beacon, replay
only post-commit events") cannot, by itself, repair a gap that sits AFTER a post-seed beacon. **User decision (chosen):
option C** (re-pick the proof — done above). **Deferred: option B** (make the seed a DURABLE baseline that post-seed
beacons reconcile/verify against instead of wiping `belief.entries={}`) — this is the real fix for the general
gap-after-beacon case and a design change beyond the plan; decide separately before relying on git-seed for bulk 100%.

### Open questions

1. **Durable seed vs post-seed Tier-1 beacons (deferred option B).** For git-seed to repair a gap that sits AFTER a
   post-seed `Write`/`snapshot` in the corpus, the seed must survive/reconcile rather than be clobbered by
   `applyWrite`/`applySnapshotVerify`. Needed before Phase 3 bulk auto-seed can claim 100% on beacon-heavy files.
2. **Empty-git-file seeding.** Should `resolveSeedFromCommit` seed an empty committed file (`''`)? Today it returns
   null (won't seed). If yes, switch to `content === null` checks and carry the empty content through. Low priority.
3. **Symlinked-path robustness.** `computeRepoRelativePath` returns null when the target path and `git rev-parse
   --show-toplevel` differ only by a symlink (e.g. macOS `/var` vs `/private/var`), which makes `--seed-commit`
   silently fall back to no-seed. Real `/Users/...` paths are unaffected; flagged for hardening if symlinked repos
   matter. (Discovered via the synthetic E2E harness, fixed there with `realpathSync`.)
4. **Pre-existing, still open (do NOT start Phases 2–4 without answers):** bulk auto-seed algorithm, category-(b)
   deleted/moved target, Engine A retirement timing.
