# Plan — task 64: public-repo CI workflow (jfred)

One new file in `RevEng/jfred` (the working copy of the public repo
`github.com/matkatmusic/jfred`): `.github/workflows/ci.yml`. Nothing else — no matrix, no
release automation (task text), no README badge (not requested). Stage, do not commit; the
push (and therefore the only real verification of the workflow) is the user's.

Verified preconditions (2026-07-21): `package-lock.json` is committed (`npm ci` viable);
`test`/`typecheck`/`build:webapp` scripts exist; the scenarios submodule is optional to the
suite (task 59, closed) — so CI checks out WITHOUT submodules on purpose, exercising exactly
the bare-clone path task 59 enabled.

## The workflow file

Create `.github/workflows/ci.yml` with exactly:

```yaml
# Task 64: the public repo's only CI — typecheck, suite, and webapp build on every push/PR.
# No submodules on checkout (deliberate): the suite is scenario-submodule-optional (task 59),
# so CI proves the bare-clone path a fresh contributor hits. Free on public repos
# (standard GitHub-hosted runners); no matrix or release automation until the repo has users.
name: CI

on:
    push:
        branches: [master, develop]
    pull_request:

jobs:
    ci:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: 22          # matches devDependencies' @types/node ^22
                  cache: npm
            - run: npm ci
            - run: npm run typecheck
            - run: npm test
            - run: npm run build:webapp     # catches webapp tsconfig breakage (task text)
```

Line-by-line rationale (the "why" the user may ask for):
- `push: branches: [master, develop]` — the two long-lived branches (user merges
  develop → master); `pull_request` unfiltered so contributor PRs against either get checked.
- `node-version: 22` — the version the repo's types target (`@types/node ^22`); current LTS.
  Local dev on 26 works, but CI pins what the types promise.
- `cache: npm` — setup-node's built-in lockfile-keyed cache; one line, no custom cache steps.
- Step order mirrors the task text: install → typecheck → test → webapp build; each step
  fails the job on non-zero exit with no extra scripting.
- 4-space indentation to match the project's convention (YAML is indentation-agnostic
  beyond consistency).

## TDD note

A workflow file has no locally runnable test — its only oracle is a real Actions run, which
happens on the user's push. No test is added (YAGNI applies to tests, and none is possible
here); local sanity = the YAML parses, which staging plus the user's review covers.

## Wrap-up

1. Stage `.github/workflows/ci.yml` in jfred (no commit).
2. Append a task-64 section to
   `plans/implementation-notes-tackle-tasks-156-154-160.md` (same conversation) and restage it.
3. Task 64 stays OPEN until the user pushes and a green run confirms the workflow — the
   closure gate is the real Actions run, not the file's existence.
4. Subagent (Sonnet 5) writes the ≤40-word commit-message sentence.
