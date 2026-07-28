// Layer 1 + Layer 2 mockup — THE DATA. Split out of plans/layer1-mockup.html on 2026-07-27 so a
// fixture change touches ~200 lines instead of ~1,800 (user).
//
// Nothing here reads a clock. Every instant is a literal or arithmetic on one, because the visual
// checks compare one render against another.

export const ms = s => Date.parse(s);
export const basename = p => p.slice(p.lastIndexOf("/") + 1);

  // Fixed fixture, no clock reads. A commit carries BOTH stamps (OPEN #282): `at` is committer time,
  // `wrote` is author time. The last two commits deliberately share a committer instant while their
  // author instants are days apart — that is the rebase case from the user's screenshot, and it is
  // what makes the header's time toggle visibly change the layout.
export const COMMITS = [
    { hash: "a1b2c3d4", at: "2026-06-01T09:00:00Z", wrote: "2026-06-01T09:00:00Z",
      subject: "seed the demo app with an index and a readme", files: ["src/index.ts", "README.md"] },
    { hash: "e4f5a6b7", at: "2026-06-01T14:30:00Z", wrote: "2026-06-01T14:30:00Z",
      subject: "extract the shared trim helper into src/util.ts", files: ["src/index.ts", "src/util.ts"] },
    { hash: "c7d8e9f0", at: "2026-06-03T11:00:00Z", wrote: "2026-06-02T08:10:00Z",
      subject: "dispatch run-scenario cases through one table", files: ["src/util.ts",
        "src/components/interim-run-scenario/test_run_scenario_dispatcher.ts"] },
    { hash: "0a1b2c3d", at: "2026-06-03T18:20:00Z", wrote: "2026-06-03T18:20:00Z",
      subject: "lowercase the parsed input before dispatch", files: ["src/index.ts"] },
    { hash: "4d5e6f70", at: "2026-07-20T16:00:00Z", wrote: "2026-07-20T16:00:00Z",
      subject: "retire the old API notes", files: ["README.md", "docs/old-api.md"] },
    { hash: "8a9b0c1d", at: "2026-07-20T21:05:00Z", wrote: "2026-07-20T21:05:00Z",
      subject: "ship the deploy script", files: ["scripts/deploy.sh"] },
    { hash: "5636d8ec", at: "2026-07-20T21:20:00Z", wrote: "2026-07-19T13:45:00Z",
      subject: "cover the dispatcher's error branch", files: [
        "src/components/interim-run-scenario/test_run_scenario_dispatcher.ts"] },
  ];
export const DISK = [
    // created !== modified -> the created node is NOT clickable, only the latest one is (#257).
    { path: "src/index.ts", born: "2026-06-01T08:05:00Z", at: "2026-07-24T08:15:00Z" },
    // The mtime sits inside d4a06b8f's window because that session WROTE this file. At 07-22 it fell
    // BEFORE the file's own last snapshot, which is impossible (user, 2026-07-27).
    { path: "src/util.ts",  born: "2026-05-31T14:35:00Z", at: "2026-07-24T08:05:00Z" },
    { path: "src/components/interim-run-scenario/test_run_scenario_dispatcher.ts",
      born: "2026-05-31T11:05:00Z", at: "2026-07-24T09:30:00Z" },
    // created === modified -> the ONE node is the latest, so it IS clickable (#257's exception).
    // README.md's disk instant also equals commit 4d5e6f70's, which is task #259's tie group.
    { path: "README.md",    born: "2026-07-20T16:00:00Z", at: "2026-07-20T16:00:00Z" },
    { path: "notes.txt",    born: "2026-07-23T19:40:00Z", at: "2026-07-23T19:40:00Z" },
    { path: ".env.local",   born: "2026-05-28T07:00:00Z", at: "2026-05-28T07:00:00Z" }, // pre-dates commit 1
  ];
  // OPEN #286: what the branch/commit route would return once the repo is confirmed.
export const BRANCHES = ["main", "layer-1-milestone", "spike/author-timestamps"];

  // task #292: the project's JSONL transcripts. `started`/`ended` are the session's first and last
  // record — deliberately NOT the instants of the files it touched, because the band has to be able
  // to open before the first write and close after the last one. `paths` is what the session wrote,
  // which is all the filter needs; the timeline it draws for those paths still comes from the repo
  // and the disk, so a file keeps its whole history even when the session only touched it once.
  // task #300: `titles` is a LIST of line ranges — a session can be renamed part-way through, so its
  // title is a function of POSITION (b21d84c5 carries two). An unnamed session carries none.
export const SESSIONS = [
    { file: "0f3c9a7e.jsonl", titles: [{ title: "seed the demo app", from: 1, to: 120 }],
      started: "2026-06-01T08:44:00Z", ended: "2026-06-01T09:12:00Z",
      paths: ["src/index.ts", "README.md"] },
    { file: "b21d84c5.jsonl", titles: [
        { title: "extract the trim helper", from: 1, to: 210 },
        { title: "dispatch through one table", from: 211, to: 520 }],
      started: "2026-06-01T14:05:00Z", ended: "2026-06-03T18:40:00Z",
      paths: ["src/index.ts", "src/util.ts",
              "src/components/interim-run-scenario/test_run_scenario_dispatcher.ts"] },
    { file: "7ce50a19.jsonl", titles: [],
      started: "2026-07-20T15:38:00Z", ended: "2026-07-20T21:30:00Z",
      paths: ["README.md", "docs/old-api.md", "scripts/deploy.sh"] },
    { file: "d4a06b8f.jsonl", titles: [{ title: "cover the error branch, take notes", from: 1, to: 260 }],
      started: "2026-07-23T19:10:00Z", ended: "2026-07-24T09:45:00Z",
      paths: ["notes.txt", "src/index.ts", "src/util.ts",
              "src/components/interim-run-scenario/test_run_scenario_dispatcher.ts"] },
  ];

  // task #300: Layer 2's input. `version` is numbered PER SESSION, so `@v2` alone identifies nothing
  // — src/util.ts carries one from b21d84c5 and a different one from d4a06b8f.
  // `line` is where in that transcript it was taken, which selects the title in effect.
  //
  // EVERY instant obeys `born <= snapshot <= mtime`, and both bounds are physics: a snapshot is a
  // copy of bytes that were on disk. One after the mtime could only mean the file was later deleted,
  // and a deleted file must not show as present in the File Nav (user, 2026-07-27). No deletions are
  // modelled here, so the upper bound is absolute.
  //
  // src/index.ts @v1 pre-dates the first COMMIT, so a snapshot owns a ruler entry above every commit.
  // @v3 lands exactly ON its mtime — the ordinary case, the snapshot IS the write — inside a #259 tie.
export const SNAPSHOTS = [
    { path: "src/index.ts", version: "@v1", at: "2026-06-01T08:50:00Z", session: "0f3c9a7e.jsonl", line: 40 },
    { path: "src/index.ts", version: "@v2", at: "2026-06-01T09:05:00Z", session: "0f3c9a7e.jsonl", line: 95 },
    { path: "src/util.ts",  version: "@v1", at: "2026-06-01T14:20:00Z", session: "b21d84c5.jsonl", line: 60 },
    { path: "src/util.ts",  version: "@v2", at: "2026-06-03T10:30:00Z", session: "b21d84c5.jsonl", line: 300 },
    { path: "src/util.ts",  version: "@v2", at: "2026-07-24T08:00:00Z", session: "d4a06b8f.jsonl", line: 120 },
    // ON index.ts's mtime: the hand-made case of a snapshot sharing a tick with another event (#302).
    { path: "src/index.ts", version: "@v3", at: "2026-07-24T08:15:00Z", session: "d4a06b8f.jsonl", line: 200 },
    { path: "src/components/interim-run-scenario/test_run_scenario_dispatcher.ts",
      version: "@v1", at: "2026-07-23T19:55:00Z", session: "d4a06b8f.jsonl", line: 30 },
  ];
  const sessionBy = file => SESSIONS.find(s => s.file === file);
  // The title in effect AT a position — not the session's first and not its last (task #305).
export const titleAt = (file, line) =>
    sessionBy(file)?.titles.find(t => line >= t.from && line <= t.to)?.title ?? "untitled session";
  // task #306: what a nav row prints. Deduped, because two ranges may carry the same name.
export const titlesOf = session => [...new Set(session.titles.map(t => t.title))];

  // ---- bulk fixture (user, 2026-07-27) --------------------------------------------------------
  // ~90 bubbles and ~400 instants, so BOTH scroll axes are real. GENERATED: the literals above are
  // the crafted cases, and 300 more rows of the same shape would bury them.
  //
  // Deterministic arithmetic, no clock and no Math.random — the visual checks compare renders.
  //
  // Ordering is the point, not filler: every file gets `born < commits < mtime`, and its snapshots
  // land ON another event's instant wherever possible — every third file on a COMMIT, every fourth
  // on its MTIME. That is what gives #302 many mixed ruler rows instead of one hand-made case.
  const HOUR_MS = 3600000;
  const BULK_DIRS = ["src/api", "src/ui/panels", "src/ui/widgets", "lib/parse", "tests/unit",
                     "docs/guides", "scripts/ci"];
  const BULK_EXTS = ["ts", "ts", "tsx", "py", "sh", "md"];
  const BULK_FILES = 84;
  const BULK_BORN0 = ms("2026-06-05T09:00:00Z");
  const iso = t => new Date(t).toISOString();
  // Knuth's constant, so neighbouring indexes do not produce neighbouring-looking hashes.
  const fakeHash = n => ((n * 2654435761) % 4294967296).toString(16).padStart(8, "0").slice(0, 8);
  const bulkSessions = new Map();
  for (let i = 0; i < BULK_FILES; i += 1) {
    const path = `${BULK_DIRS[i % BULK_DIRS.length]}/module_${String(i).padStart(2, "0")}` +
                 `.${BULK_EXTS[i % BULK_EXTS.length]}`;
    const born = BULK_BORN0 + i * 7 * HOUR_MS;
    const commitAt = k => born + (5 + k * 23) * HOUR_MS;
    const commitCount = 2 + (i % 3);
    for (let k = 0; k < commitCount; k += 1)
      COMMITS.push({ hash: fakeHash(i * 17 + k), at: iso(commitAt(k)), wrote: iso(commitAt(k)),
                     subject: `bulk change ${k + 1} to ${basename(path)}`, files: [path] });
    const mtime = commitAt(commitCount - 1) + 4 * HOUR_MS;
    DISK.push({ path, born: iso(born), at: iso(mtime) });

    // `null` entries are skipped, so a file carries one, two, three — or none, which keeps Layer 2's
    // "a file with no snapshots looks exactly like Layer 1" case visible at scale.
    const wanted = [
      i % 3 === 2 ? null : born + 3 * HOUR_MS,          // between born and the first commit
      i % 3 === 0 ? commitAt(1) : null,                 // exactly ON a commit
      i % 4 === 0 ? mtime : null,                       // exactly ON the on-disk node
    ].filter(t => t !== null);
    const file = `bulk-${Math.floor(i / 12)}.jsonl`;
    wanted.forEach((t, v) => SNAPSHOTS.push(
      { path, version: `@v${v + 1}`, at: iso(t), session: file, line: 40 + v * 60 }));

    const group = bulkSessions.get(file) ?? { paths: [], from: born, to: mtime };
    group.paths.push(path);
    group.to = Math.max(group.to, mtime);
    bulkSessions.set(file, group);
  }
  for (const [file, group] of bulkSessions)
    SESSIONS.push({ file, titles: [{ title: `bulk pass over ${group.paths.length} modules`, from: 1, to: 400 }],
                    started: iso(group.from), ended: iso(group.to), paths: group.paths });


// ---- fixture self-check (user, 2026-07-27) ----------------------------------------------------
// The rules that were only in a comment, now enforced. A snapshot is a copy of bytes that WERE on
// disk, so `born <= snapshot <= mtime`; one after the mtime could only mean the file was deleted,
// and no deletions are modelled here. Throws on load, so the page says so before a screenshot does.
const bad = [];
for (const s of SNAPSHOTS) {
  const disk = DISK.find(d => d.path === s.path);
  const owner = SESSIONS.find(x => x.file === s.session);
  const where = `${s.path} ${s.version} (${s.session})`;
  if (!disk) bad.push(`${where}: no DISK entry`);
  else if (ms(s.at) < ms(disk.born)) bad.push(`${where}: before born ${disk.born}`);
  else if (ms(s.at) > ms(disk.at)) bad.push(`${where}: after mtime ${disk.at}`);
  if (!owner) bad.push(`${where}: owning session is missing`);
  else if (ms(s.at) < ms(owner.started) || ms(s.at) > ms(owner.ended))
    bad.push(`${where}: outside its session's window`);
  else if (owner.titles.length && !owner.titles.some(t => s.line >= t.from && s.line <= t.to))
    bad.push(`${where}: line ${s.line} is in no title range`);
}
if (bad.length) throw new Error(`fixture is out of order:\n  ${bad.join("\n  ")}`);
