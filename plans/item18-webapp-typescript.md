# Plan — TASKS.md item 18: webapp → TypeScript via tsc transpile (no bundler)

## Behavior being built (plain English)

The 10 plain-`.js` webapp files become TypeScript source. A `tsc` build (already
installed — zero new dependencies, user-approved approach) emits browser-ready JS into
`webapp/dist/`. The node server serves emitted JS from `webapp/dist/` and everything
else (index.html, styles.css, vendor/) from `webapp/` as today. Behavior of the app is
IDENTICAL — this is a type-annotation + build-plumbing change, no logic changes.

## Key mechanics (why this exact shape)

- Webapp files currently import each other with `.js` specifiers
  (`import { el } from "../app.js"`). Rename source files to `.ts` and switch every
  relative specifier to `.ts` — the same convention `src/` uses. The build config sets
  `rewriteRelativeImportExtensions: true` (TypeScript 5.7, already the installed major)
  which rewrites `.ts` → `.js` in emitted output, so the browser loads working module
  URLs. Tests then import `../webapp/app.ts` exactly like they import `../src/*.ts`.
- The root `tsconfig.json` keeps `noEmit` + `allowImportingTsExtensions` and gains the
  webapp for typechecking. Tests already pull webapp modules into the root program, so
  the root `lib` must add DOM.
- `webapp/vendor/*.js` (xterm, addon-fit) stays plain JS, untouched, served from
  `webapp/` as today.
- Wire-shape types: where a webapp file handles engine JSON (documents, steps,
  revisions), prefer `import type { … } from "../src/reconstruction_json.ts"` (or the
  owning src module) — type-only imports are fully erased at emit, so no runtime
  coupling and no duplicate shape definitions (project rule: single-source wire
  vocabulary). NOTE: the wire JSON carries `Uuid`/`Path`/`Date` as plain strings after
  JSON round-trip — where a src type doesn't match the serialized shape, define a
  minimal local `type` for the serialized form instead; do not cast.

## Out of scope

- No bundling, no minification, no new dependencies.
- No logic changes, no renames of functions/exports, no refactors of adjacent code.
- No `any` escape hatches except where a value is genuinely dynamic (prefer `unknown`
  + narrowing at the boundary).
- Running tests/suites — the user runs them. `npx tsc` compile checks are allowed and
  required.

## Files touched

| File | Change |
|---|---|
| `webapp/*.js`, `webapp/views/*.js` (10 files) | `git mv` to `.ts`, add types, `.js` → `.ts` relative specifiers |
| `tsconfig.json` | add `"webapp"` to include (vendor excluded), add DOM libs |
| `tsconfig.webapp.json` (new) | emit config: outDir `webapp/dist`, `rewriteRelativeImportExtensions` |
| `package.json` | `build:webapp` script; `app` script builds first |
| `src/viewer_server.ts` | static handler prefers `webapp/dist/` when the file exists there |
| `.gitignore` | add `webapp/dist/` |
| `tests/*.test.ts` (5 files) | `../webapp/x.js` import specifiers → `.ts` |
| `TASKS.md` | mark item 18 done |

## Steps

### Step 1: build plumbing first (so every later step is verifiable by compile)

1. Create `tsconfig.webapp.json`:

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "Bundler",
        "lib": ["ES2022", "DOM", "DOM.Iterable"],
        "strict": true,
        "noUncheckedIndexedAccess": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "rewriteRelativeImportExtensions": true,
        "outDir": "webapp/dist",
        "rootDir": "webapp"
    },
    "include": ["webapp"],
    "exclude": ["webapp/vendor", "webapp/dist"]
}
```

2. Root `tsconfig.json`: add `"DOM", "DOM.Iterable"` to `lib`, add `"webapp"` to
   `include`, add `"webapp/vendor", "webapp/dist"` to `exclude`. (Tests import webapp
   modules, so the root typecheck program contains them either way — this makes it
   explicit and DOM-aware.)

3. `package.json` scripts:

```json
"build:webapp": "tsc -p tsconfig.webapp.json",
"app": "npm run build:webapp && tsx src/viewer_server.ts"
```

4. `.gitignore`: add `webapp/dist/`.

### Step 2 (RED): server test for dist-first static lookup

The server change is the only new LOGIC in this item, so it gets the test
(TDD; conversion steps below are covered by the existing suite the user runs).
Extract the lookup decision as a pure exported function in `src/viewer_server.ts`:

```ts
// The on-disk file for a static request: the compiled webapp/dist copy when the build
// emitted one, else the webapp/ source (index.html, styles.css, vendor/*.js).
export function resolveStaticFilePath(relative: string, distDir: string, webappDir: string): string {
    const compiledCandidate = resolve(distDir, relative);
    if (existsSync(compiledCandidate)) {
        return compiledCandidate;
    }
    return resolve(webappDir, relative);
}
```

Write the test FIRST in `tests/viewer-api.test.ts` (or a small new
`tests/viewer-static.test.ts` if viewer-api's fixtures don't fit — implementer's call,
match existing style):

```ts
test("test_resolveStaticFilePath_prefers_the_compiled_dist_copy", () => {
    // Scenario: a .js request resolves to webapp/dist when the build emitted that file.
    // Steps: make tmp dirs distDir and webappDir; write distDir/app.js;
    // assert resolveStaticFilePath("app.js", distDir, webappDir) === distDir/app.js.
});

test("test_resolveStaticFilePath_falls_back_to_the_webapp_source", () => {
    // Scenario: index.html / styles.css / vendor files have no dist copy.
    // Steps: same tmp dirs, write only webappDir/styles.css;
    // assert resolveStaticFilePath("styles.css", distDir, webappDir) === webappDir/styles.css.
});
```

### Step 3 (GREEN): wire the server

In `src/viewer_server.ts`:

1. Next to `WEBAPP_DIR` (line 28): `const WEBAPP_DIST_DIR = resolve(import.meta.dirname, "..", "webapp", "dist");`
2. In `serveStaticFile`, replace the single `resolve(WEBAPP_DIR, relative)` with
   `resolveStaticFilePath(relative, WEBAPP_DIST_DIR, WEBAPP_DIR)`, keeping the
   `realpathSync` + escape check — the escape check must now accept EITHER root:
   `resolved.startsWith(WEBAPP_DIR + sep) || resolved.startsWith(WEBAPP_DIST_DIR + sep)`
   (dist lives inside webapp/, so the existing check already passes; add the explicit
   second clause anyway so a future dist relocation cannot silently open a hole).

### Step 4: convert files smallest-first, compiling after each

Conversion order (by size, so type patterns are established on easy files first):

1. `webapp/views/download.js` (479B)
2. `webapp/views/projects.js` (2.1K)
3. `webapp/views/raw-lines.js` (4.1K)
4. `webapp/views/project.js` (4.8K)
5. `webapp/views/conversation.js` (6.0K)
6. `webapp/views/diff-vs-base.js` (9.1K)
7. `webapp/views/file-history.js` (10.7K)
8. `webapp/app.js` (23.9K)
9. `webapp/inspector.js` (24.2K)
10. `webapp/views/timeline.js` (53.8K)

For EACH file:

1. `git mv webapp/<file>.js webapp/<file>.ts` (preserves history).
2. Change its relative import specifiers `.js` → `.ts`. Importers still naming the old
   `.js` path keep resolving via moduleResolution until they are themselves converted —
   but convert specifiers in ALL files pointing at the moved file in the same pass to
   keep the graph consistent.
3. Add parameter/return types and local types. Rules:
   - DOM elements: precise types (`HTMLElement`, `HTMLButtonElement`, `Event`), not `any`.
   - Wire data: `import type` from src where the serialized shape matches; otherwise a
     minimal local `type` for the serialized form (ids/paths/dates are strings on the
     wire). Name serialized-form types with a `Wire` suffix (e.g. `WireStepSnapshot`)
     when they shadow a src name.
   - `localStorage`/`window` feature guards stay exactly as written (test-runner
     compatibility) — type them, don't restructure them.
   - NO behavior edits. If a latent bug surfaces while typing (e.g. an impossible
     branch), leave the behavior intact, add a one-line `// item18:` comment, and list
     it in the implementation notes for the user.
4. `npx tsc --noEmit` (root config) — fix errors in the file just converted only.

### Step 5: update test imports

In `tests/inspector-viewmodels.test.ts`, `tests/route-predicates.test.ts`,
`tests/timeline-viewmodels.test.ts`, `tests/viewer-progress.test.ts`,
`tests/viewer-viewmodels.test.ts`: change every `../webapp/<x>.js` specifier to
`../webapp/<x>.ts`. Do not run the tests.

### Step 6: build + serve verification (compile-level only)

1. `npm run build:webapp` — must emit `webapp/dist/app.js`, `webapp/dist/views/*.js`
   with `.js` relative specifiers inside (spot-check one emitted file's import lines
   with grep).
2. `npx tsc --noEmit` — clean.
3. `webapp/index.html` needs NO change: `/app/app.js`, `/app/vendor/xterm.js` resolve
   through the new dist-first lookup (app.js from dist, vendor from source).
4. Do NOT start the server or run tests — the user verifies live behavior.

### Step 7: close TASKS.md item 18

Mark `[x]` with a summary: tsc-only build (`build:webapp`), dist-first static serving,
10 files converted, vendor untouched, zero new dependencies.

## Risks checked

- `rewriteRelativeImportExtensions` requires TS 5.7+ — `package.json` pins `^5.7.0`.
  Verify the installed version with `npx tsc --version` before starting; if it prints
  < 5.7, run `npm install` first.
- `allowImportingTsExtensions` (root config) is legal because root keeps `noEmit`;
  the emit config uses `rewriteRelativeImportExtensions` instead — the two configs
  never conflict because they are separate programs.
- Adding DOM to the root `lib` exposes browser globals to src/tests typechecking.
  Accepted: `skipLibCheck` is on and src code referencing a DOM global by accident
  would already fail at runtime under node.
- `strict` + `noUncheckedIndexedAccess` on 160KB of untyped JS is the bulk of the
  work, concentrated in `timeline.js`. The smallest-first order front-loads the
  pattern-setting. If a file is genuinely blocked on a deep dynamic structure, a
  file-local `type` with `unknown` leaves and narrowing helpers is the approved
  fallback — never `as any`.
