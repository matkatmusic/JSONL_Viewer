// App shell: hash router, shared fetch/cache/consent plumbing, header wiring, and the render
// dispatch. Views build their own DOM through the tiny el() helper; this file owns navigation.

import { renderProjectsView } from "./views/projects.js";
import { renderProjectView, renderProjectDrawer } from "./views/project.js";
import { renderConversationView } from "./views/conversation.js";
import { renderFileHistoryView } from "./views/file-history.js";
import { renderRawLinesView } from "./views/raw-lines.js";
import { renderDiffVsBaseView } from "./views/diff-vs-base.js";
import { renderTimelineView } from "./views/timeline.js";

// ─── tiny DOM builder (textContent everywhere — no innerHTML, no injection) ──

export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value);
    }
    for (const child of children) node.append(child);
    return node;
}

// ─── shared fetch + caches ───────────────────────────────────────────────────

const documentCache = new Map();
const rawLinesCache = new Map();

// ─── loading console (xterm.js, lazily created) ──────────────────────────────

let progressTerminal = null;
let progressFitAddon = null;

// The loading console is a persistent, full-width strip docked at the bottom of the window
// (#progress-console in index.html), exactly 10 text rows tall. It is created once and reused for
// every load, so it survives route re-renders (which wipe #view) — progress lines accumulate and
// the last load's output stays visible until the next. The theme reads the app's live CSS vars.
function ensureProgressTerminal() {
    if (progressTerminal !== null) return;
    const rootStyles = getComputedStyle(document.documentElement);
    progressTerminal = new Terminal({
        rows: 10,
        disableStdin: true,
        convertEol: true,
        scrollback: 10000,
        // Right-click selects the word under the cursor; xterm then mirrors the selection into
        // its hidden textarea, so the browser's NATIVE context menu (Copy etc.) works on it.
        rightClickSelectsWord: true,
        theme: {
            background: rootStyles.getPropertyValue("--code-bg").trim(),
            foreground: rootStyles.getPropertyValue("--muted").trim(),
            // xterm's DEFAULT selection overlay is translucent white — invisible on the light
            // palette's white --code-bg, so selecting "didn't work" visually. Accent at ~35%
            // alpha (hex AA suffix) is visible on both palettes.
            selectionBackground: rootStyles.getPropertyValue("--accent").trim() + "59",
        },
    });
    // Debug handle: lets devtools (and headless tests) drive the selection API directly,
    // e.g. progressTerminal.select(0, 0, 20) — this app is itself a debugging surface.
    window.progressTerminal = progressTerminal;
    progressFitAddon = new FitAddon.FitAddon();
    progressTerminal.loadAddon(progressFitAddon);
    // Copy-on-select, like a real terminal: xterm draws its own selection layer instead of the
    // browser's, so mirror every selection straight to the clipboard via the selection API
    // (getSelection/onSelectionChange — xtermjs.org/docs/api/terminal/classes/terminal/#select).
    // ponytail: clipboard failure is silently ignored — a copy convenience, not a data path.
    progressTerminal.onSelectionChange(() => {
        const selection = progressTerminal.getSelection();
        if (selection) navigator.clipboard.writeText(selection).catch(() => {});
    });
    progressTerminal.open(document.getElementById("progress-console"));
    document.getElementById("progress-copy").onclick = copyConsoleText;
    fitProgressColumns();
    window.addEventListener("resize", fitProgressColumns);
}

// The console's full scrollback as plain text — what the copy button puts on the clipboard.
function collectConsoleText() {
    const buffer = progressTerminal.buffer.active;
    const lines = [];
    for (let i = 0; i < buffer.length; i += 1) {
        lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
    }
    return lines.join("\n").trimEnd();
}

function copyConsoleText() {
    const button = document.getElementById("progress-copy");
    navigator.clipboard.writeText(collectConsoleText()).then(() => {
        button.textContent = "copied";
        setTimeout(() => { button.textContent = "copy"; }, 1200);
    }).catch(() => {});
}

// Fit the column count to the window width, holding the height fixed at 10 rows.
function fitProgressColumns() {
    const dimensions = progressFitAddon?.proposeDimensions();
    if (dimensions?.cols) progressTerminal.resize(dimensions.cols, 10);
}

// Local wall-clock HH:MM:SS.mmm — ms precision because most loading work is sub-second.
function formatConsoleTime() {
    const now = new Date();
    const pad = (value, width = 2) => String(value).padStart(width, "0");
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

export function logProgress(text) {
    ensureProgressTerminal();
    progressTerminal.writeln(`${formatConsoleTime()} ${text}`);
}

// Split buffered NDJSON text into complete lines plus the trailing partial line.
export function splitNdjsonChunk(bufferedText, chunkText) {
    const combinedText = bufferedText + chunkText;
    const splitLines = combinedText.split("\n");
    const remainder = splitLines.pop();
    const lines = splitLines.filter((line) => line.length > 0);
    return { remainder, lines };
}

// Every server request announces itself in the loading console — its start AND its timed
// completion — so a silent stretch in the console points at the exact endpoint that stalled
// (e.g. a slow /api/projects scan over a huge projects dir). The streamed /api/document endpoint
// goes through fetchDocument instead and logs its own detail.
async function fetchLogged(url, readBody) {
    const path = new URL(url, location.origin).pathname;
    logProgress(`GET ${path}`);
    const startMs = Date.now();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} -> ${response.status}: ${await response.text()}`);
    const body = await readBody(response);
    logProgress(`  ↳ ${path} ${response.status} (${Date.now() - startMs}ms)`);
    return body;
}

export async function fetchJson(url) {
    return fetchLogged(url, (response) => response.json());
}

export async function fetchText(url) {
    return fetchLogged(url, (response) => response.text());
}

// The raw JSONL lines of one transcript, parsed, cached per (project, jsonl).
export async function fetchRawRecords(project, jsonl) {
    const cacheKey = `${project}|${jsonl}`;
    if (!rawLinesCache.has(cacheKey)) {
        const text = await fetchText(`/api/raw?project=${encodeURIComponent(project)}&jsonl=${encodeURIComponent(jsonl)}`);
        rawLinesCache.set(cacheKey, text.split("\n").filter((line) => line.trim().length > 0));
    }
    return rawLinesCache.get(cacheKey);
}

// ─── script-execution consent (per-browser-SESSION memory only, by design) ──

function computeConsentKey(project) {
    return `consent:${project}`;
}

export function storeConsentChoice(project, choice) {
    sessionStorage.setItem(computeConsentKey(project), choice);
}

// "1" (run), "0" (declined), or null (not asked yet this session).
export function getConsentChoice(project) {
    return sessionStorage.getItem(computeConsentKey(project));
}

// Fetch a document under the consent protocol. Resolves to { document } or
// { consentRequired: scripts[] } — the caller renders the dialog for the latter.
// The already-fetched unified document for a project, or undefined — never triggers a build.
// The drawer uses this so navigating to a conversation doesn't force a whole-project build.
export function peekCachedDocument(project) {
    return documentCache.get(`${project}|*`);
}

export async function fetchDocument(project, jsonl) {
    const cacheKey = `${project}|${jsonl ?? "*"}`;
    if (documentCache.has(cacheKey)) return { document: documentCache.get(cacheKey) };
    const params = new URLSearchParams({ project, progress: "1" });
    if (jsonl !== undefined) params.set("jsonl", jsonl);
    const choice = sessionStorage.getItem(computeConsentKey(project));
    params.set("allowScripts", choice === "1" ? "1" : "0");
    if (choice === "0") params.set("declined", "1");
    // The server does its consent-decision parse (and, for a project view, a full projects scan)
    // BEFORE it writes headers — that work is silent until the stream opens. Time to first byte
    // exposes it, so a gap before the first "loading …" line is attributable to the server.
    logProgress(`GET /api/document jsonl=${jsonl ?? "(all)"}`);
    const requestStartMs = Date.now();
    const response = await fetch(`/api/document?${params}`);
    if (!response.ok) throw new Error(`document ${response.status}: ${await response.text()}`);
    logProgress(`  ↳ /api/document responding (${Date.now() - requestStartMs}ms to first byte)`);
    // NDJSON stream: each progress line lands in the console; the last non-progress line is the
    // terminal payload — a document, a consent decision, or a build error.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let remainder = "";
    let finalPayload;
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        let lines;
        ({ remainder, lines } = splitNdjsonChunk(remainder, decoder.decode(value, { stream: true })));
        for (const line of lines) {
            const parsed = JSON.parse(line);
            if (parsed.kind === "progress") {
                logProgress(parsed.current !== undefined ? `${parsed.current}/${parsed.total} ${parsed.label}` : parsed.label);
            } else {
                finalPayload = parsed;
            }
        }
    }
    // A real document has no `kind` field; consent/error ride the kind discriminant.
    if (finalPayload.kind === "error") throw new Error(finalPayload.label);
    if (finalPayload.kind === "consent-required") return { consentRequired: finalPayload.scripts };
    documentCache.set(cacheKey, finalPayload);
    return { document: finalPayload };
}

// The consent dialog (plan 3.2): every script's code shown verbatim; running is opt-in;
// declining still yields a (degraded) document. The choice is remembered per project for
// this browser session only.
export function renderConsentDialog(container, project, scripts) {
    const box = el("div", { class: "consent-box" }, [
        el("h2", { text: `This reconstruction contains ${scripts.length} recorded script execution(s)` }),
        el("div", { class: "muted", text: "Re-running them reproduces script-made file states. Nothing runs without your say-so." }),
    ]);
    for (const script of scripts) {
        box.append(el("div", { class: "consent-script" }, [
            el("div", { class: "muted", text: new Date(script.timestamp).toLocaleString() + (script.cwd ? `  ·  cwd ${script.cwd}` : "") }),
            el("pre", { text: script.code }),
        ]));
    }
    const decide = (choice) => {
        storeConsentChoice(project, choice);
        renderRoute();
    };
    box.append(el("div", { class: "consent-actions" }, [
        el("button", { class: "toolbar-btn consent-run", text: "Run scripts for this reconstruction", onclick: () => decide("1") }),
        el("button", { class: "toolbar-btn", text: "Continue without running", onclick: () => decide("0") }),
    ]));
    container.append(box);
}

// ─── routes ──────────────────────────────────────────────────────────────────

export function routeToProject(project) {
    return `#/project/${encodeURIComponent(project)}`;
}
// anchorLine: 0-based raw JSONL line index to scroll to and highlight.
export function routeToConversation(project, jsonl, anchorLine) {
    const base = `${routeToProject(project)}/jsonl/${encodeURIComponent(jsonl)}`;
    return anchorLine === undefined ? base : `${base}/at/${encodeURIComponent(anchorLine)}`;
}
export function routeToFileHistory(project, target) {
    return `${routeToProject(project)}/file/${encodeURIComponent(target)}`;
}
// anchorJsonl (optional): scroll the timeline to that session's first node.
export function routeToTimeline(project, anchorJsonl) {
    const base = `${routeToProject(project)}/timeline`;
    return anchorJsonl === undefined ? base : `${base}/session/${encodeURIComponent(anchorJsonl)}`;
}

function parseRouteSegments() {
    return location.hash.replace(/^#\/?/, "").split("/").filter((segment) => segment.length > 0)
        .map(decodeURIComponent);
}

// True when the parsed hash segments name the project revision-timeline view.
export function checkRouteIsTimeline(segments) {
    if (segments[0] !== "project") {
        return false;
    }
    return segments[2] === "timeline";
}

// Reopen the timeline inspector when its collapsed 24px rail is clicked. On other routes a
// hidden inspector is display:none and can never receive this click.
function handleInspectorRailClick(event) {
    const pane = event.currentTarget;
    // Only a click on the pane itself is a rail click. A click on the » collapse button
    // bubbles here AFTER adding .hidden — without this guard it would instantly reopen.
    if (event.target !== pane) {
        return;
    }
    if (!pane.classList.contains("hidden")) {
        return;
    }
    pane.classList.remove("hidden");
}

async function renderRoute() {
    const view = document.getElementById("view");
    view.replaceChildren();
    view.onclick = null;
    const inspector = document.getElementById("inspector");
    inspector.classList.add("hidden");
    // A route change invalidates the inspected line; an empty closed pane renders no reopen rail.
    inspector.replaceChildren();
    const drawer = document.getElementById("drawer");
    const segments = parseRouteSegments();
    document.querySelector(".layout").classList.toggle("timeline-route", checkRouteIsTimeline(segments));
    const refreshDrawer = () => renderProjectDrawer(drawer, segments[1], {
        activeJsonl: segments[2] === "jsonl" ? segments[3]
            : segments[2] === "timeline" && segments[3] === "session" ? segments[4] : undefined,
        activeTarget: segments[2] === "file" ? segments[3] : undefined,
    });
    try {
        if (segments[0] === "project") {
            drawer.classList.remove("hidden");
            await refreshDrawer();
        } else {
            drawer.classList.add("hidden");
        }
        if (segments.length === 0) {
            setBreadcrumb("");
            await renderProjectsView(view);
        } else if (segments[0] === "project") {
            const project = segments[1];
            setBreadcrumb(project);
            if (segments.length === 2) {
                await renderProjectView(view, project);
            } else if (segments[2] === "timeline") {
                await renderTimelineView(view, project, segments[3] === "session" ? segments[4] : undefined);
            } else if (segments[2] === "jsonl") {
                const jsonl = segments[3];
                if (segments[4] === "lines") await renderRawLinesView(view, project, jsonl);
                else await renderConversationView(view, project, jsonl, segments[4] === "at" ? segments[5] : undefined);
            } else if (segments[2] === "file") {
                const target = segments[3];
                if (segments[4] === "vsbase") await renderDiffVsBaseView(view, project, target);
                else await renderFileHistoryView(view, project, target);
            }
        } else {
            view.append(el("div", { class: "error-box", text: `unknown route: ${location.hash}` }));
        }
    } catch (error) {
        view.append(el("div", { class: "error-box", text: String(error) }));
    }
    // The view render may have just built and cached the unified document — refresh the
    // drawer so its "Files touched" section appears without another navigation.
    if (segments[0] === "project") {
        await refreshDrawer();
    }
}

function setBreadcrumb(text) {
    document.getElementById("breadcrumb").textContent = text;
}

// ─── header: the runtime-switchable projects folder (plan 3.1) ───────────────

async function initializeHeader() {
    const input = document.getElementById("projects-dir-input");
    const config = await fetchJson("/api/config");
    input.value = config.projectsDir;
    document.getElementById("projects-dir-change").addEventListener("click", async () => {
        const response = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectsDir: input.value }),
        });
        if (!response.ok) {
            // No alert(): native dialogs block headless automation. The breadcrumb carries the error.
            setBreadcrumb(`could not switch folder: ${(await response.json()).error}`);
            return;
        }
        documentCache.clear();
        rawLinesCache.clear();
        location.hash = "#/";
        renderRoute();
    });
}

// Bootstrap only in a real browser: the node test suite imports the view modules (for their
// DOM-free view-model functions), which transitively loads this module without a window.
if (typeof window !== "undefined") {
    ensureProgressTerminal();   // show the empty 10-row console immediately, before any load
    window.addEventListener("hashchange", renderRoute);
    document.getElementById("inspector").addEventListener("click", handleInspectorRailClick);
    initializeHeader().then(renderRoute);
}
