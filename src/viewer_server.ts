// Thin HTTP wiring over viewer_api.ts — the localhost app (`npm run app`). Binds 127.0.0.1
// ONLY: this is a debugging surface for the user's own machine, never exposed. All logic lives
// in viewer_api.ts; this file only parses requests, dispatches, and serializes responses.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, realpathSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import {
    scanProjects,
    buildDocumentWithConsent,
    decideDocumentResponse,
    loadProjectRecords,
    renderRevisionDiff,
    renderDiffVsBase,
    renderRangePatch,
    parseRangePatchQuery,
    readBlobSnapshot,
    resolveProjectFile,
    resolveStaticFilePath,
    getProjectsDir,
    setProjectsDir,
    setFileHistoryDir,
    getEffectiveFileHistoryDir,
    applyProjectOverrides,
} from "./viewer_api.ts";
import { setImpureExecutionAllowed } from "./reconstruction_exec_gate.ts";
import { configureSandboxMemoPersistence } from "./reconstruction_script_execution.ts";
import { DocumentResponseKind } from "./structures/vocabulary.ts";
import { Path, Uuid } from "./structures/domain.ts";

const DEFAULT_PORT = 7343;
const WEBAPP_DIR = resolve(import.meta.dirname, "..", "webapp");
const WEBAPP_DIST_DIR = resolve(import.meta.dirname, "..", "webapp", "dist");

const CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
};

// Parse `--port <n>`, `--projects-dir <path>`, and `--file-history-dir <path>` from argv
// (defaults: 7343, ~/.claude/projects, the item-46 derivation chain).
function parseServerArgs(argv: string[]): { port: number } {
    const portIndex = argv.indexOf("--port");
    const dirIndex = argv.indexOf("--projects-dir");
    if (dirIndex >= 0 && argv[dirIndex + 1] !== undefined) {
        setProjectsDir(argv[dirIndex + 1]!);
    }
    // item 46: after --projects-dir, so an explicit dir survives the folder switch's reset.
    const fileHistoryIndex = argv.indexOf("--file-history-dir");
    if (fileHistoryIndex >= 0 && argv[fileHistoryIndex + 1] !== undefined) {
        setFileHistoryDir(argv[fileHistoryIndex + 1]!);
    }
    const port = portIndex >= 0 ? Number(argv[portIndex + 1]) : DEFAULT_PORT;
    if (!Number.isInteger(port)) {
        // item 46: throw new Error("usage: tsx src/viewer_server.ts [--port <n>] [--projects-dir <path>]");
        throw new Error("usage: tsx src/viewer_server.ts [--port <n>] [--projects-dir <path>] [--file-history-dir <path>]");
    }
    return { port };
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(value));
}

function sendText(response: ServerResponse, status: number, text: string, contentType = "text/plain; charset=utf-8"): void {
    response.writeHead(status, { "Content-Type": contentType });
    response.end(text);
}

// Serve `/` (index.html) and `/app/*` from webapp/dist/ then webapp/, refusing any resolved
// path outside those roots.
function serveStaticFile(response: ServerResponse, urlPath: string): void {
    const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/app\//, "");
    const resolved = realpathSync(resolveStaticFilePath(relative, WEBAPP_DIST_DIR, WEBAPP_DIR));
    // dist lives inside webapp/, so the WEBAPP_DIR check covers both today; the explicit second
    // clause keeps a future dist relocation from silently opening a traversal hole.
    if (!resolved.startsWith(WEBAPP_DIR + sep) && !resolved.startsWith(WEBAPP_DIST_DIR + sep)) {
        sendText(response, 400, "path escapes webapp/");
        return;
    }
    const contentType = CONTENT_TYPES[extname(resolved)] ?? "application/octet-stream";
    sendText(response, 200, readFileSync(resolved, "utf8"), contentType);
}

// The resolved JSONL path(s) for a project: one named file, or every JSONL in the project
// (the unified project view) when no file name is given.
function resolveJsonlPaths(projectName: string, jsonlName: string | null): Path[] {
    if (jsonlName !== null) {
        return [resolveProjectFile(getProjectsDir(), projectName, jsonlName)];
    }
    const listing = scanProjects(getProjectsDir()).find((project) => project.name === projectName);
    if (listing === undefined) {
        throw new Error(`no project named ${projectName}`);
    }
    return listing.jsonlFiles.map((entry) =>
        resolveProjectFile(getProjectsDir(), projectName, entry.fileName.toString()),
    );
}

// GET /api/document — the built document, or a consent-required decision when scripts need a
// yes. With progress=1 the same result streams as NDJSON: one progress line per unit of work, the
// normal response object as the final line. The progress path opens the stream up front and then
// runs AND logs every stage the non-progress path does silently (file resolution, the
// consent-decision parse of every file, the script scan), so a gap in the console maps to a named
// stage rather than a blind wait before the first byte.
function handleDocumentRequest(response: ServerResponse, query: URLSearchParams): void {
    const projectName = requireParam(query, "project");   // a missing project still 400s (before any header)
    const jsonlName = query.get("jsonl");
    const allowScripts = query.get("allowScripts") === "1";
    const targetValue = query.get("target");
    const target = targetValue === null ? undefined : new Path(targetValue);
    // declined=1 is the client's remembered "Continue without running" — build degraded, no re-prompt.
    const declined = query.get("declined") === "1";
    // item 46: the project's path overrides apply to everything below (both branches). Runs
    // before any header goes out, so a malformed reveng-paths.json still 400s loudly.
    applyProjectOverrides(projectName);

    // Non-progress path: resolve + consent-decide + respond, all BEFORE any header, so a resolver
    // refusal (bad project, traversal) still becomes a 400 via the outer catch. Consent-required is
    // HTTP 200 with the kind discriminant (not 428) so browsers don't log the expected flow as an error.
    if (query.get("progress") !== "1") {
        const jsonlPaths = resolveJsonlPaths(projectName, jsonlName);
        const records = loadProjectRecords(jsonlPaths);
        const decision = decideDocumentResponse(records, allowScripts);
        if (decision.kind === DocumentResponseKind.consentRequired && !declined) {
            sendJson(response, 200, decision);
            return;
        }
        sendJson(response, 200, buildDocumentWithConsent(jsonlPaths, target, allowScripts));
        return;
    }

    // Progress stream: open it now so the pre-build work is visible. Headers are already out, so any
    // failure here is the terminal error line, not a 400 (a client-facing viewer request is always
    // progress=1; a bad project already 400'd above at requireParam). The final line is the same
    // object the non-progress path sends — the client keys off the `kind` discriminant.
    response.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8" });
    response.socket?.setNoDelay(true);   // sync build between writes — do not let Nagle batch the lines
    const writeNdjsonLine = (value: unknown): void => {
        // The synchronous build never yields to the event loop, so a client-abort 'close' event is
        // never delivered mid-build. Detection works anyway: the first write after the client's RST
        // fails synchronously inside net.Socket (uv_try_write EPIPE), which flips socket.writable to
        // false without needing the loop — `destroyed` stays false until the loop turns, so it is
        // the writable check that fires; the NEXT call here sees it and aborts the build.
        if (response.destroyed || response.socket === null || response.socket.destroyed || !response.socket.writable) {
            throw new Error("client disconnected — build cancelled");
        }
        response.write(JSON.stringify(value) + "\n");
        // res.write corks the socket and uncorks on nextTick — which never runs during the
        // synchronous build, so every line would sit buffered until the build ends. Uncork NOW
        // so each line flushes to the wire as it is written.
        response.socket?.uncork();
    };
    const reportStage = (label: string): void => {
        writeNdjsonLine({ kind: DocumentResponseKind.progress, label });
    };
    try {
        reportStage(`resolving transcript files for ${projectName}`);
        const jsonlPaths = resolveJsonlPaths(projectName, jsonlName);
        reportStage(`resolved ${jsonlPaths.length} transcript file(s)`);
        // This parse is the only one (the build below reuses these records from the cache), so
        // it streams the full per-record detail the console shows during a cold load.
        const records = loadProjectRecords(jsonlPaths, writeNdjsonLine);
        reportStage("scanning parsed records for recorded script executions");
        const decision = decideDocumentResponse(records, allowScripts);
        reportStage(decision.kind === DocumentResponseKind.consentRequired
            ? `consent required — ${decision.scripts.length} recorded script execution(s)`
            : "no script-execution consent needed");
        if (decision.kind === DocumentResponseKind.consentRequired && !declined) {
            response.end(JSON.stringify(decision) + "\n");
            return;
        }
        const document = buildDocumentWithConsent(jsonlPaths, target, allowScripts, writeNdjsonLine);
        response.end(JSON.stringify(document) + "\n");
    } catch (error) {
        response.end(JSON.stringify({ kind: DocumentResponseKind.error, label: String(error) }) + "\n");
    }
}

// GET /api/diff — the revision-timeline or vs-base diff text for one file.
function handleDiffRequest(response: ServerResponse, query: URLSearchParams): void {
    // item 46: const jsonlPaths = resolveJsonlPaths(requireParam(query, "project"), query.get("jsonl"));
    const projectName = requireParam(query, "project");
    applyProjectOverrides(projectName);
    const jsonlPaths = resolveJsonlPaths(projectName, query.get("jsonl"));
    const filePath = new Path(requireParam(query, "file"));
    const allowScripts = query.get("allowScripts") === "1";
    // Untargeted on purpose: both diff views send no jsonl param, so this reuses the very
    // project-wide artifact the views already built (equality certified by
    // test_revision_diff_from_untargeted_document_matches_targeted_build).
    const document = buildDocumentWithConsent(jsonlPaths, undefined, allowScripts);
    if (query.get("mode") === "vsbase") {
        sendText(response, 200, renderDiffVsBase(document, filePath, Number(query.get("rev") ?? "0")));
        return;
    }
    sendText(response, 200, renderRevisionDiff(document, filePath));
}

// GET /api/range-patch — one git-apply-able unified diff for a picked contiguous step range over
// the WHOLE project's unified document. Consent mirrors /api/document's non-progress contract:
// consent-required is HTTP 200 with the kind discriminant (never a non-2xx), declined=1 builds
// the degraded document the client is already looking at.
function handleRangePatchRequest(response: ServerResponse, query: URLSearchParams): void {
    const projectName = requireParam(query, "project");
    applyProjectOverrides(projectName);   // item 46
    const { fromStep, toStep } = parseRangePatchQuery(query);
    const allowScripts = query.get("allowScripts") === "1";
    const declined = query.get("declined") === "1";
    const jsonlPaths = resolveJsonlPaths(projectName, null);
    const records = loadProjectRecords(jsonlPaths);
    const decision = decideDocumentResponse(records, allowScripts);
    if (decision.kind === DocumentResponseKind.consentRequired && !declined) {
        sendJson(response, 200, decision);
        return;
    }
    const document = buildDocumentWithConsent(jsonlPaths, undefined, allowScripts);
    sendText(response, 200, renderRangePatch(document, fromStep, toStep));
}

// POST /api/config — switch the scan root and/or the file-history root at runtime. Existence
// validation only: these are typed/pasted paths from the UI of a localhost app on the user's
// own machine. Order matters: the projects switch clears the file-history override (item 46's
// re-derive-on-switch), so an explicit fileHistoryDir in the SAME body is applied after it.
function handleConfigUpdate(request: IncomingMessage, response: ServerResponse): void {
    let body = "";
    request.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    request.on("end", () => {
        try {
            const requested = JSON.parse(body) as { projectsDir?: string; fileHistoryDir?: string };
            if (requested.projectsDir === undefined && requested.fileHistoryDir === undefined) {
                sendJson(response, 400, { error: "body must carry projectsDir and/or fileHistoryDir" });
                return;
            }
            if (requested.projectsDir !== undefined) {
                setProjectsDir(requested.projectsDir);
            }
            if (requested.fileHistoryDir !== undefined) {
                setFileHistoryDir(requested.fileHistoryDir);
            }
            sendJson(response, 200, { projectsDir: getProjectsDir(), fileHistoryDir: getEffectiveFileHistoryDir() });
        } catch (error) {
            sendJson(response, 400, { error: String(error) });
        }
    });
}

function requireParam(query: URLSearchParams, name: string): string {
    const value = query.get(name);
    if (value === null) {
        throw new Error(`missing query param: ${name}`);
    }
    return value;
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
        if (request.method === "POST" && url.pathname === "/api/config") {
            handleConfigUpdate(request, response);
        } else if (url.pathname === "/api/config") {
            // item 46: sendJson(response, 200, { projectsDir: getProjectsDir() });
            sendJson(response, 200, { projectsDir: getProjectsDir(), fileHistoryDir: getEffectiveFileHistoryDir() });
        } else if (url.pathname === "/api/projects") {
            sendJson(response, 200, scanProjects(getProjectsDir()));
        } else if (url.pathname === "/api/document") {
            handleDocumentRequest(response, url.searchParams);
        } else if (url.pathname === "/api/raw") {
            const jsonlPath = resolveProjectFile(
                getProjectsDir(), requireParam(url.searchParams, "project"), requireParam(url.searchParams, "jsonl"));
            sendText(response, 200, readFileSync(jsonlPath.toString(), "utf8"));
        } else if (url.pathname === "/api/blob") {
            // Always 200 + { exists, content } — the client branches on `exists`; a malformed
            // name throws into the outer catch (400) like every other trust-boundary refusal.
            const session = new Uuid(requireParam(url.searchParams, "session"));
            const name = new Path(requireParam(url.searchParams, "name"));
            sendJson(response, 200, readBlobSnapshot(session, name));
        } else if (url.pathname === "/api/diff") {
            handleDiffRequest(response, url.searchParams);
        } else if (url.pathname === "/api/range-patch") {
            handleRangePatchRequest(response, url.searchParams);
        } else if (url.pathname === "/" || url.pathname.startsWith("/app/")) {
            serveStaticFile(response, url.pathname);
        } else {
            sendText(response, 404, `no route: ${url.pathname}`);
        }
    } catch (error) {
        sendText(response, 400, String(error));
    }
}

const { port } = parseServerArgs(process.argv.slice(2));
// App posture: impure stages OFF until a consented build turns them on for its own duration.
setImpureExecutionAllowed(false);
// Item 11: only the viewer app opts in to the disk-backed sandbox memo — restarts stop
// re-paying a spawn per distinct python run (CLI + tests stay memory-only).
configureSandboxMemoPersistence(new Path(join(import.meta.dirname, "..", ".cache", "sandbox-memo.json")));
createServer(handleRequest).listen(port, "127.0.0.1", () => {
    console.log(`viewer listening on http://127.0.0.1:${port} (projects: ${getProjectsDir()})`);
});
