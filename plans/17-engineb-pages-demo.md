# Task 17 — Engine-B GitHub Pages demo tier (plan)

Task 17's own description defers it to "its own plan when reached". This is that plan.
The existing `jfred/docs/` Pages site (task 63) runs the FROZEN legacy `api/` engine;
its README explicitly names this Engine-B demo as the separate later tier.

## Goal

A zero-server GitHub Pages tier that serves the CURRENT webapp (the Engine-B viewer,
now preserved as `webapp/webapp_old.html` per task 204) over a canned
`ReconstructionDocument` JSON of the s87 demo bundle — a static-data shim replacing
`/api/*`.

## Timing decision (recommendation)

Build it against `webapp_old.html` now, not the future layered page: the old page is
feature-complete and frozen (task 204 preserves it exactly for comparison), so the
canned demo cannot rot under it. A layered-page demo becomes a cheap second data
point later — same shim, different page.

## Steps

1. **Canned data generator** — `jfred/scripts/generate_pages_demo_data.ts`: run the
   existing consented build (`buildDocumentWithConsent`) over
   `demo/projects/s87-demo-composite` (extract `repo.git.tar` first, exactly like the
   pretest does) and write the responses the webapp actually requests:
   - `document.json` (the consented full build — the demo skips the consent dialog by
     shipping `allowScripts=1` results),
   - `projects.json` (`/api/projects`), `config.json` (`/api/config`, fixed bootId),
   - `raw/<jsonl>.txt` per session (`/api/raw`),
   - `blobs/<session>/<name>.json` for every sidecar snapshot the document references
     (`/api/blob` is name-enumerable from the document, so it CAN be canned).
   Interactive endpoints that take arbitrary parameters (`/api/range-patch`,
   `/api/diff`, `/api/step-files`, POST `/api/config`, `/api/pick-folder`) are NOT
   canned — the shim answers them with a marked "not available in the static demo"
   error and the UI's existing error paths surface it.

2. **Fetch shim** — `docs/engineb/static-shim.js`: a page-level `window.fetch`
   monkey-patch loaded BEFORE `app.js`, mapping each `/api/*` URL (path + the params
   that select a canned variant) onto the bundled JSON files. No webapp code fork:
   the shim is the only new runtime code, and the real localhost app stays untouched.

3. **Static assembly** — copy `webapp_old.html` + compiled `webapp/dist` output +
   `vendor/` into `docs/engineb/`, rewriting the page's absolute `/app/...` asset
   URLs to relative `app/...` (GitHub Pages serves under `/jfred/`, so absolute
   paths 404 — this rewrite is the one required page edit, done by the generator,
   never by hand).

4. **Landing + publish** — add the Engine-B demo link to `docs/index.html` with the
   same honest labeling the README uses for the legacy tier; the user publishes
   (`git push`; Pages is already configured from task 63).

## Verify

`python3 -m http.server` in `docs/` → `/engineb/webapp_old.html` renders the s87
timeline with the network tab showing zero non-static requests; range-patch and
diff actions surface the static-demo notice instead of breaking the page.

## Open question for the user

Split into three tasks (generator / shim+assembly / landing+publish) or keep as one
task-17 implementation pass? Default if unanswered: one pass, it is one deliverable.
