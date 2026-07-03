// Thin HTTP wiring over viewer_api.ts — the localhost app (`npm run app`). Binds 127.0.0.1
// ONLY: this is a debugging surface for the user's own machine, never exposed. All logic lives
// in viewer_api.ts; this file only parses requests, dispatches, and serializes responses.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, realpathSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import {
    scanProjects,
    buildDocumentWithConsent,
    decideDocumentResponse,
    renderRevisionDiff,
    renderDiffVsBase,
    resolveProjectFile,
    getProjectsDir,
    setProjectsDir,
} from "./viewer_api.ts";
import { setImpureExecutionAllowed } from "./reconstruction_exec_gate.ts";
import { loadTranscript } from "./parse/loadTranscript.ts";
import { DocumentResponseKind } from "./structures/vocabulary.ts";
import { Path } from "./structures/domain.ts";

const DEFAULT_PORT = 7343;
const WEBAPP_DIR = resolve(import.meta.dirname, "..", "webapp");

const CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
};

// Parse `--port <n>` and `--projects-dir <path>` from argv (defaults: 7343, ~/.claude/projects).
function parseServerArgs(argv: string[]): { port: number } {
    const portIndex = argv.indexOf("--port");
    const dirIndex = argv.indexOf("--projects-dir");
    if (dirIndex >= 0 && argv[dirIndex + 1] !== undefined) {
        setProjectsDir(argv[dirIndex + 1]!);
    }
    const port = portIndex >= 0 ? Number(argv[portIndex + 1]) : DEFAULT_PORT;
    if (!Number.isInteger(port)) {
        throw new Error("usage: tsx src/viewer_server.ts [--port <n>] [--projects-dir <path>]");
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

// Serve `/` (index.html) and `/app/*` from webapp/, refusing any resolved path outside it.
function serveStaticFile(response: ServerResponse, urlPath: string): void {
    const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/app\//, "");
    const resolved = realpathSync(resolve(WEBAPP_DIR, relative));
    if (!resolved.startsWith(WEBAPP_DIR + sep)) {
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

// GET /api/document — 428 + scripts when consent is needed, else the built document.
function handleDocumentRequest(response: ServerResponse, query: URLSearchParams): void {
    const jsonlPaths = resolveJsonlPaths(requireParam(query, "project"), query.get("jsonl"));
    const allowScripts = query.get("allowScripts") === "1";
    const targetValue = query.get("target");
    const target = targetValue === null ? undefined : new Path(targetValue);
    const records = jsonlPaths.flatMap((path) => loadTranscript(path.toString()));
    const decision = decideDocumentResponse(records, allowScripts);
    // declined=1 is the client's remembered "Continue without running" — build degraded, no re-prompt.
    // Consent-required is HTTP 200 with the kind discriminant (not 428): browsers log every non-2xx
    // fetch as a console error, and the smoke gate requires a clean console on this expected flow.
    if (decision.kind === DocumentResponseKind.consentRequired && query.get("declined") !== "1") {
        sendJson(response, 200, decision);
        return;
    }
    sendJson(response, 200, buildDocumentWithConsent(jsonlPaths, target, allowScripts));
}

// GET /api/diff — the revision-timeline or vs-base diff text for one file.
function handleDiffRequest(response: ServerResponse, query: URLSearchParams): void {
    const jsonlPaths = resolveJsonlPaths(requireParam(query, "project"), query.get("jsonl"));
    const filePath = new Path(requireParam(query, "file"));
    const allowScripts = query.get("allowScripts") === "1";
    const document = buildDocumentWithConsent(jsonlPaths, filePath, allowScripts);
    if (query.get("mode") === "vsbase") {
        sendText(response, 200, renderDiffVsBase(document, filePath, Number(query.get("rev") ?? "0")));
        return;
    }
    sendText(response, 200, renderRevisionDiff(document, filePath));
}

// POST /api/config — switch the scan root at runtime. Existence validation only: this is a
// typed/pasted path from the UI of a localhost app on the user's own machine.
function handleConfigUpdate(request: IncomingMessage, response: ServerResponse): void {
    let body = "";
    request.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    request.on("end", () => {
        try {
            const requested = (JSON.parse(body) as { projectsDir?: string }).projectsDir;
            if (requested === undefined) {
                sendJson(response, 400, { error: "body must be { projectsDir }" });
                return;
            }
            sendJson(response, 200, { projectsDir: setProjectsDir(requested) });
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
            sendJson(response, 200, { projectsDir: getProjectsDir() });
        } else if (url.pathname === "/api/projects") {
            sendJson(response, 200, scanProjects(getProjectsDir()));
        } else if (url.pathname === "/api/document") {
            handleDocumentRequest(response, url.searchParams);
        } else if (url.pathname === "/api/raw") {
            const jsonlPath = resolveProjectFile(
                getProjectsDir(), requireParam(url.searchParams, "project"), requireParam(url.searchParams, "jsonl"));
            sendText(response, 200, readFileSync(jsonlPath.toString(), "utf8"));
        } else if (url.pathname === "/api/diff") {
            handleDiffRequest(response, url.searchParams);
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
createServer(handleRequest).listen(port, "127.0.0.1", () => {
    console.log(`viewer listening on http://127.0.0.1:${port} (projects: ${getProjectsDir()})`);
});
