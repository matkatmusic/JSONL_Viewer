// App shell: hash router, shared fetch/cache/consent plumbing, header wiring, and the render
// dispatch. Views build their own DOM through the tiny el() helper; this file owns navigation.

import { renderProjectsView } from "./views/projects.ts";
import { renderProjectDrawer } from "./views/project.ts";
import { openInspectorPane } from "./inspector.ts";
import { renderConversationView } from "./views/conversation.ts";
import { renderFileHistoryView } from "./views/file-history.ts";
import { renderRawLinesView } from "./views/raw-lines.ts";
import { renderDiffVsBaseView } from "./views/diff-vs-base.ts";
import { renderTimelineView } from "./views/timeline.ts";
import type { Terminal as XtermTerminal } from "@xterm/xterm";
import type { FitAddon as XtermFitAddon } from "@xterm/addon-fit";

// xterm.js is loaded as browser globals via <script> tags (webapp/vendor) — type those globals
// here instead of value-importing the packages (a bundler-less build cannot resolve bare
// module specifiers; the type-only imports above are erased at emit).
declare global {
    const Terminal: typeof XtermTerminal;
    const FitAddon: { FitAddon: typeof XtermFitAddon };
    interface Window {
        progressTerminal: XtermTerminal;
    }
}

// ─── tiny DOM builder (textContent everywhere — no innerHTML, no injection) ──

type ElAttrs = Record<string, string | EventListener>;

export function el(tag: string, attrs: ElAttrs = {}, children: (Node | string)[] = []): HTMLElement {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === "class") node.className = value as string;
        else if (key === "text") node.textContent = value as string;
        else if (key.startsWith("on")) node.addEventListener(key.slice(2), value as EventListener);
        else node.setAttribute(key, value as string);
    }
    for (const child of children) node.append(child);
    return node;
}

// ─── shared fetch + caches ───────────────────────────────────────────────────

// One recorded script execution awaiting consent (wire shape: timestamp is an ISO string).
type WireConsentScript = { timestamp: string; cwd?: string; code: string };
// The unified document payload is carried opaquely here; views type their own slices.
type WireDocument = Record<string, unknown>;
// One NDJSON line of the /api/document stream: progress lines, the error/consent terminals,
// or the document itself (which has no `kind`).
type WireDocumentStreamLine = WireDocument & {
    kind?: "progress" | "error" | "consent-required";
    label?: string;
    current?: number;
    total?: number;
    scripts?: WireConsentScript[];
};

const documentCache = new Map<string, WireDocument>();
const rawLinesCache = new Map<string, string[]>();

// ─── loading console (xterm.js, lazily created) ──────────────────────────────

let progressTerminal: XtermTerminal | null = null;
let progressFitAddon: XtermFitAddon | null = null;

// The loading console is a persistent, full-width strip docked at the bottom of the window
// (#progress-console in index.html), exactly 10 text rows tall. It is created once and reused for
// every load, so it survives route re-renders (which wipe #view) — progress lines accumulate and
// the last load's output stays visible until the next. The theme reads the app's live CSS vars.
function ensureProgressTerminal(): void {
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
        const selection = progressTerminal!.getSelection();
        if (selection) navigator.clipboard.writeText(selection).catch(() => {});
    });
    progressTerminal.open(document.getElementById("progress-console")!);
    // Progress labels ending in "[<file>.jsonl:<line>]" become clickable links to the timeline,
    // anchored at that raw line. The project comes from the current hash: the console outlives
    // route changes, so a stale line clicked from a different project routes into the CURRENT
    // project and fails into the existing error box.
    // ponytail: not worth guarding — xterm draws hover underline + pointer itself.
    progressTerminal.registerLinkProvider({
        provideLinks(bufferLineNumber, callback) {
            const lineText = progressTerminal!.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true) ?? "";
            const sourceLink = matchJsonlSourceLink(lineText);
            if (sourceLink === undefined) {
                callback(undefined);
                return;
            }
            callback([{
                text: sourceLink.tokenText,
                range: {
                    // xterm buffer coordinates are 1-based; the end cell is inclusive.
                    start: { x: sourceLink.tokenStartIndex + 1, y: bufferLineNumber },
                    end: { x: sourceLink.tokenStartIndex + sourceLink.tokenText.length, y: bufferLineNumber },
                },
                activate: () => {
                    const segments = parseRouteSegments();
                    if (segments[0] !== "project") {
                        return;
                    }
                    location.hash = routeToTimeline(segments[1]!, sourceLink.jsonlFileName, String(sourceLink.rawLineIndex));
                },
            }]);
        },
    });
    document.getElementById("progress-copy")!.onclick = copyConsoleText;
    fitProgressColumns();
    window.addEventListener("resize", fitProgressColumns);
}

// The console's full scrollback as plain text — what the copy button puts on the clipboard.
function collectConsoleText(): string {
    const buffer = progressTerminal!.buffer.active;
    const lines = [];
    for (let i = 0; i < buffer.length; i += 1) {
        lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
    }
    return lines.join("\n").trimEnd();
}

function copyConsoleText(): void {
    const button = document.getElementById("progress-copy")!;
    navigator.clipboard.writeText(collectConsoleText()).then(() => {
        button.textContent = "copied";
        setTimeout(() => { button.textContent = "copy"; }, 1200);
    }).catch(() => {});
}

// Fit the column count to the window width, holding the height fixed at 10 rows.
function fitProgressColumns(): void {
    const dimensions = progressFitAddon?.proposeDimensions();
    if (dimensions?.cols) progressTerminal!.resize(dimensions.cols, 10);
}

// Local wall-clock HH:MM:SS.mmm — ms precision because most loading work is sub-second.
function formatConsoleTime(): string {
    const now = new Date();
    const pad = (value: number, width = 2) => String(value).padStart(width, "0");
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

// The console line with its "[<jsonl>:<line>]" source token tinted cyan, so the clickable jump
// stands out from the timestamp and the action description. ANSI colors become xterm cell
// attributes, not buffer text, so matchJsonlSourceLink and the link provider still see the
// plain token.
function tintSourceToken(text: string): string {
    const link = matchJsonlSourceLink(text);
    if (link === undefined) {
        return text;
    }
    const before = text.slice(0, link.tokenStartIndex);
    const after = text.slice(link.tokenStartIndex + link.tokenText.length);
    return `${before}\x1b[36m${link.tokenText}\x1b[0m${after}`;
}

export function logProgress(text: string): void {
    ensureProgressTerminal();
    progressTerminal!.writeln(`${formatConsoleTime()} ${tintSourceToken(text)}`);
}

// Split buffered NDJSON text into complete lines plus the trailing partial line.
export function splitNdjsonChunk(bufferedText: string, chunkText: string): { remainder: string; lines: string[] } {
    const combinedText = bufferedText + chunkText;
    const splitLines = combinedText.split("\n");
    const remainder = splitLines.pop()!;
    const lines = splitLines.filter((line) => line.length > 0);
    return { remainder, lines };
}

// The "[<file>.jsonl:<line>]" source token of a console line (formatRunSource emits at most one
// per label), or undefined when the line has none. Labels carry 1-based transcript line numbers;
// rawLineIndex converts to the 0-based index used by /at/ anchors and rawLines arrays.
export function matchJsonlSourceLink(lineText: string): { jsonlFileName: string; rawLineIndex: number; tokenStartIndex: number; tokenText: string } | undefined {
    const match = /\[([\w.-]+\.jsonl):(\d+)\]/.exec(lineText);
    if (match === null) {
        return undefined;
    }
    return {
        jsonlFileName: match[1]!,
        rawLineIndex: Number(match[2]) - 1,
        tokenStartIndex: match.index,
        tokenText: match[0]!,
    };
}

// Every server request announces itself in the loading console — its start AND its timed
// completion — so a silent stretch in the console points at the exact endpoint that stalled
// (e.g. a slow /api/projects scan over a huge projects dir). The streamed /api/document endpoint
// goes through fetchDocument instead and logs its own detail.
async function fetchLogged<BodyType>(url: string, readBody: (response: Response) => Promise<BodyType>): Promise<BodyType> {
    const path = new URL(url, location.origin).pathname;
    logProgress(`GET ${path}`);
    const startMs = Date.now();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} -> ${response.status}: ${await response.text()}`);
    const body = await readBody(response);
    logProgress(`  ↳ ${path} ${response.status} (${Date.now() - startMs}ms)`);
    return body;
}

export async function fetchJson<PayloadType = unknown>(url: string): Promise<PayloadType> {
    return fetchLogged<PayloadType>(url, (response) => response.json());
}

export async function fetchText(url: string): Promise<string> {
    return fetchLogged(url, (response) => response.text());
}

// The raw JSONL lines of one transcript, parsed, cached per (project, jsonl).
export async function fetchRawRecords(project: string, jsonl: string): Promise<string[]> {
    const cacheKey = `${project}|${jsonl}`;
    if (!rawLinesCache.has(cacheKey)) {
        const text = await fetchText(`/api/raw?project=${encodeURIComponent(project)}&jsonl=${encodeURIComponent(jsonl)}`);
        rawLinesCache.set(cacheKey, text.split("\n").filter((line) => line.trim().length > 0));
    }
    return rawLinesCache.get(cacheKey)!;
}

// ─── script-execution consent (per-browser-SESSION memory only, by design) ──

function computeConsentKey(project: string): string {
    return `consent:${project}`;
}

export function storeConsentChoice(project: string, choice: string): void {
    sessionStorage.setItem(computeConsentKey(project), choice);
}

// "1" (run), "0" (declined), or null (not asked yet this session).
export function getConsentChoice(project: string): string | null {
    return sessionStorage.getItem(computeConsentKey(project));
}

// Fetch a document under the consent protocol. Resolves to { document } or
// { consentRequired: scripts[] } — the caller renders the dialog for the latter.
// The already-fetched unified document for a project, or undefined — never triggers a build.
// The drawer uses this so navigating to a conversation doesn't force a whole-project build.
export function peekCachedDocument<DocumentType = WireDocument>(project: string): DocumentType | undefined {
    return documentCache.get(`${project}|*`) as DocumentType | undefined;
}

// DocumentType lets each view name the wire fields it reads (its own Wire* type); the cache and
// stream handling below stay shape-agnostic.
export async function fetchDocument<DocumentType = WireDocument>(project: string, jsonl?: string): Promise<{ document?: DocumentType; consentRequired?: WireConsentScript[] }> {
    const cacheKey = `${project}|${jsonl ?? "*"}`;
    if (documentCache.has(cacheKey)) return { document: documentCache.get(cacheKey)! as DocumentType };
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
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let remainder = "";
    let finalPayload!: WireDocumentStreamLine;
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        let lines: string[];
        ({ remainder, lines } = splitNdjsonChunk(remainder, decoder.decode(value, { stream: true })));
        for (const line of lines) {
            const parsed = JSON.parse(line) as WireDocumentStreamLine;
            if (parsed.kind === "progress") {
                logProgress(parsed.current !== undefined ? `${parsed.current}/${parsed.total} ${parsed.label}` : parsed.label!);
            } else {
                finalPayload = parsed;
            }
        }
    }
    // A real document has no `kind` field; consent/error ride the kind discriminant.
    if (finalPayload.kind === "error") throw new Error(finalPayload.label);
    if (finalPayload.kind === "consent-required") return { consentRequired: finalPayload.scripts };
    documentCache.set(cacheKey, finalPayload);
    return { document: finalPayload as DocumentType };
}

// The consent dialog (plan 3.2): every script's code shown verbatim; running is opt-in;
// declining still yields a (degraded) document. The choice is remembered per project for
// this browser session only.
export function renderConsentDialog(container: HTMLElement, project: string, scripts: WireConsentScript[]): void {
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
    const decide = (choice: string) => {
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

export function routeToProject(project: string): string {
    return `#/project/${encodeURIComponent(project)}`;
}
// anchorLine: 0-based raw JSONL line index to scroll to and highlight.
export function routeToConversation(project: string, jsonl: string, anchorLine?: string | number): string {
    const base = `${routeToProject(project)}/jsonl/${encodeURIComponent(jsonl)}`;
    return anchorLine === undefined ? base : `${base}/at/${encodeURIComponent(anchorLine)}`;
}
export function routeToFileHistory(project: string, target: string): string {
    return `${routeToProject(project)}/file/${encodeURIComponent(target)}`;
}
// anchorJsonl (optional): scroll the timeline to that session's first node.
// anchorLine (optional, 0-based raw JSONL line, requires anchorJsonl): scroll to the step owning
// that line and open the JSON inspector on it.
export function routeToTimeline(project: string, anchorJsonl?: string, anchorLine?: string | number): string {
    const base = `${routeToProject(project)}/timeline`;
    if (anchorJsonl === undefined) {
        return base;
    }
    const sessionRoute = `${base}/session/${encodeURIComponent(anchorJsonl)}`;
    if (anchorLine === undefined) {
        return sessionRoute;
    }
    return `${sessionRoute}/at/${encodeURIComponent(anchorLine)}`;
}

export function parseRouteSegments(): string[] {
    return location.hash.replace(/^#\/?/, "").split("/").filter((segment) => segment.length > 0)
        .map(decodeURIComponent);
}

// True when the parsed hash segments carry the revision timeline underneath: EVERY project
// route does (user decision 2026-07-06) — the timeline is a loaded project's base view, and
// jsonl/file sub-routes render as drawers over it.
export function checkRouteIsTimeline(segments: string[]): boolean {
    return segments[0] === "project";
}

// Item 10a: dead code, commented out — a hidden inspector is display:none on EVERY route
// (styles.css has no .inspector-pane.hidden rail override), so this handler could never fire.
// Collapse/expand is now the inspector's own » / « toggle button (inspector.js).
// function handleInspectorRailClick(event) {
//     const pane = event.currentTarget;
//     if (event.target !== pane) {
//         return;
//     }
//     if (!pane.classList.contains("hidden")) {
//         return;
//     }
//     pane.classList.remove("hidden");
// }

// The drawer overlay for a project's jsonl/file sub-routes: the route's view renders into the
// inspector pane over the timeline. No drawer while the consent dialog or a build error still
// owns the view (no document is cached yet — the sub-views would only re-show the dialog).
async function renderSubRouteDrawer(project: string, segments: string[]): Promise<void> {
    if (peekCachedDocument(project) === undefined) {
        return;
    }
    let renderContent: ((content: HTMLElement) => unknown) | undefined;
    if (segments[2] === "jsonl") {
        const jsonl = segments[3]!;
        if (segments[4] === "lines") renderContent = (content: HTMLElement) => renderRawLinesView(content, project, jsonl);
        else renderContent = (content: HTMLElement) => renderConversationView(content, project, jsonl, segments[4] === "at" ? segments[5] : undefined);
    } else if (segments[2] === "file") {
        const target = segments[3]!;
        if (segments[4] === "vsbase") renderContent = (content: HTMLElement) => renderDiffVsBaseView(content, project, target, segments[5]);
        else renderContent = (content: HTMLElement) => renderFileHistoryView(content, project, target, segments[4] === "rev" ? segments[5] : undefined);
    }
    if (renderContent === undefined) {
        return;
    }
    await renderContent(openInspectorPane());
}

// The project whose load output currently fills the progress console; undefined before any
// project load. Set by renderRoute, reset by the projects-folder switch.
let lastLoadedProject: string | undefined;

// True only when a navigation starts loading a project DIFFERENT from the one whose output
// fills the console. Same-project sub-route hops and non-project routes keep the console
// (TASKS item 22: clear on new project/session load, not on every navigation).
export function checkNavigationStartsNewProjectLoad(previousProject: string | undefined, nextProject: string | undefined): boolean {
    if (nextProject === undefined) {
        return false;
    }
    return nextProject !== previousProject;
}

async function renderRoute(): Promise<void> {
    const view = document.getElementById("view")!;
    view.replaceChildren();
    view.onclick = null;
    const inspector = document.getElementById("inspector")!;
    inspector.classList.add("hidden");
    // A route change invalidates the inspected line; an empty closed pane renders no reopen rail.
    inspector.replaceChildren();
    const drawer = document.getElementById("drawer")!;
    const segments = parseRouteSegments();
    const nextProject = segments[0] === "project" ? segments[1] : undefined;
    if (checkNavigationStartsNewProjectLoad(lastLoadedProject, nextProject)) {
        // A different project's load is starting: the retained output belongs to the previous
        // project, so clear before the first line of this load lands (TASKS item 22).
        ensureProgressTerminal();
        progressTerminal!.clear();
    }
    if (nextProject !== undefined) {
        lastLoadedProject = nextProject;
    }
    // The project's default view is the revision timeline, not the summary landing pane. The
    // bare route is rewritten (replaceState: no history entry, no hashchange re-render) so the
    // consent dialog's re-render and reloads both land on the timeline route.
    if (segments[0] === "project") {
        if (segments.length === 2) {
            history.replaceState(null, "", routeToTimeline(segments[1]!));
            segments.push("timeline");
        }
    }
    document.querySelector(".layout")!.classList.toggle("timeline-route", checkRouteIsTimeline(segments));
    const refreshDrawer = () => renderProjectDrawer(drawer, segments[1]!, {
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
            const project = segments[1]!;
            setBreadcrumb(project);
            // The timeline is ALWAYS a loaded project's base view (user decision 2026-07-06):
            // jsonl and file sub-routes keep their URLs but render as a drawer over it.
            const anchorJsonl = segments[2] === "timeline" && segments[3] === "session" ? segments[4]
                : segments[2] === "jsonl" ? segments[3] : undefined;
            const anchorLine = segments[2] === "timeline" && segments[5] === "at" ? segments[6] : undefined;
            await renderTimelineView(view, project, anchorJsonl, anchorLine);
            await renderSubRouteDrawer(project, segments);
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

function setBreadcrumb(text: string): void {
    document.getElementById("breadcrumb")!.textContent = text;
}

// ─── header: the runtime-switchable projects + file-history folders (plan 3.1, item 46) ──────

// The /api/config payload (wire shape: paths as plain strings).
type WireConfig = { projectsDir: string; fileHistoryDir: string };

async function initializeHeader(): Promise<void> {
    const input = document.getElementById("projects-dir-input") as HTMLInputElement;
    const fileHistoryInput = document.getElementById("file-history-dir-input") as HTMLInputElement;
    // The last server-reported effective file-history dir. An UNEDITED field posts "" so the
    // server re-derives from the (possibly new) projects folder — otherwise the old derived
    // value would pin itself as an explicit override across folder switches (item 46).
    let reportedFileHistoryDir = "";
    const applyConfig = (config: WireConfig): void => {
        input.value = config.projectsDir;
        fileHistoryInput.value = config.fileHistoryDir;
        reportedFileHistoryDir = config.fileHistoryDir;
    };
    applyConfig(await fetchJson<WireConfig>("/api/config"));
    document.getElementById("projects-dir-change")!.addEventListener("click", async () => {
        const fileHistoryDir = fileHistoryInput.value === reportedFileHistoryDir ? "" : fileHistoryInput.value;
        const response = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectsDir: input.value, fileHistoryDir }),
        });
        if (!response.ok) {
            // No alert(): native dialogs block headless automation. The breadcrumb carries the error.
            setBreadcrumb(`could not switch folder: ${(await response.json()).error}`);
            return;
        }
        // The server echoes the effective dirs — the file-history field prepopulates with the
        // value derived from the newly selected projects folder.
        applyConfig(await response.json() as WireConfig);
        documentCache.clear();
        rawLinesCache.clear();
        // Every project is a fresh load from the new folder, even under an identical name.
        lastLoadedProject = undefined;
        location.hash = "#/";
        renderRoute();
    });
}

// Bootstrap only in a real browser: the node test suite imports the view modules (for their
// DOM-free view-model functions), which transitively loads this module without a window.
if (typeof window !== "undefined") {
    ensureProgressTerminal();   // show the empty 10-row console immediately, before any load
    window.addEventListener("hashchange", renderRoute);
    // Item 10a: rail-click reopen retired with handleInspectorRailClick above.
    // document.getElementById("inspector").addEventListener("click", handleInspectorRailClick);
    initializeHeader().then(renderRoute);
}
