## 2026-07-17:22:30:00 — Tasks 60 + 62: s87 demo bundle + README screenshots/GIF
Chat title: tasks 60+62 demo bundle
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/81b1a5cf-617a-4bd1-9b53-e8765b587548.jsonl

### References

- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks60-62-demo-bundle-plan.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/s87/handoff-develop-20260717-1905.md (s87 engine-gaps handoff; its open item 2 — tmpdir durability — is addressed by this bundle)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/demo/ (the new committed bundle)

### Design decisions

- Demo scenario = s87-demo-composite (user's choice via AskUserQuestion). All 16 JSONLs ship
  together — cross-session blob reads are owner-keyed, dropping any session would corrupt them.
- Sanitization = post-processing (`sed 's/matkatmusicllc/demo/g'`), NOT a fresh capture: the
  ~62 personal-path hits come from the machine's installed hook commands, so a re-run would
  record the identical personal paths. Hook strings are never parsed by the engine, so the
  rewrite is provably inert; a throwaway coverage run (`s87-demo-verify`) confirmed PASS
  118/118 on the sanitized copies, then was deleted.
- The preserved repo ships as `demo/repo.git.tar` (git cannot track files under a nested
  `.git/`); `npm run demo` untars it next to the JSONLs, where `findPreservedRepoDir`
  already discovers it. Zero engine changes.
- The baseline commit's author (`Matkat Music LLC <matkatmusic@gmail.com>`) was intentionally
  KEPT: it is the same public identity as every commit in the JFRED repo, and rewriting it
  would change commit hashes for no privacy gain. All other bundle content scanned clean
  (username + hostname blocklist).
- Screenshot surface = the webapp (timeline/inspector/revisions), not "jfred.html" — task
  62's text predates the webapp landing in the public repo; the README's own asset names
  (timeline, filter bar, inspector, revision stepper) are the current ground truth.
- GIF = 12 frames (revisions #1–#12 of core_inventory.py, 24 total), 1 fps, 1200px wide,
  ffmpeg palettegen/paletteuse (gifski not installed). Frame 5 shows the `# reviewed by ops`
  USER-EDIT — visible proof the staged-blob evidence channel works from the bundle.

### Deviations

- Plan Phase 4 said port 7343; the capture ran the server on 7344 because a long-running
  viewer already occupied 7343 (left untouched). The committed `npm run demo` script uses the
  default port, matching `npm run app`.
- Phase 0's "verify scenario-folder .git" happened during planning rather than
  implementation: `scenarios/executed/s87-demo-composite/.git` was found already
  byte-identical to the live tmpdir repo (HEAD fbe1a38, staged reporting_core.py blob
  present), so the handoff's durability copy step was a no-op.

### Tradeoffs

- Bundle size ~3.3 MB committed (2.8 MB JSONLs + 340 KB file-history + 164 KB git tar) vs. a
  smaller single-session demo: chosen for richness (16 sessions, 144 steps, 11 files, git
  ops, renames, external edits) — it is the scenario literally named "demo-composite".
- `sed` username → `demo` keeps paths structurally real (`/Users/demo/...`) instead of
  synthetic placeholders, so the inspector view stays believable.

### Open questions

- The demo GIF/stills show the tmpdir cwd `/private/var/folders/.../run-scenario.7y52smqe`
  (neutral, hashed, no username). If you'd rather not show any real-looking macOS temp path,
  the JSONLs could be re-sanitized with a prettier fake cwd — but that string is keyed into
  sandbox memoization and cwd state, so it would need another full coverage re-verify. Left
  as-is.
- `npm test` was NOT run (per your instruction); the only verification run was the scenario
  coverage checker. Run the suite when you're ready.
