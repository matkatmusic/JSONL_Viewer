// App shell: hash router, shared fetch/cache/consent plumbing, header wiring, and the render
// dispatch. Views build their own DOM through the tiny el() helper; this file owns navigation.

import { renderProjectsView } from "./views/projects.ts";
// item 66: the fork sidebar (views/sidebar.ts, rendered by renderTimelineView) replaces the
// old project drawer:
// import { renderProjectDrawer } from "./views/project.ts";
import { openInspectorPane } from "./inspector.ts";
import { renderConversationView } from "./views/conversation.ts";
import { renderFileHistoryView } from "./views/file-history.ts";
import { renderRawLinesView } from "./views/raw-lines.ts";
import { renderDiffVsBaseView } from "./views/diff-vs-base.ts";
import { renderTimelineView } from "./views/timeline.ts";
import { renderCodeInto } from "./highlight.ts";
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

// One recorded script execution awaiting consent (wire shape: timestamp is an ISO string;
// readOnly is the server's item-68 verdict — absent means treat as modifying).
type WireConsentScript = { timestamp: string; cwd?: string; code: string; readOnly?: boolean };
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
const CONSOLE_ROWS = 15;

// The loading console is a persistent, full-width strip docked at the bottom of the window
// (#progress-console in index.html), exactly CONSOLE_ROWS text rows tall. It is created once and reused for
// every load, so it survives route re-renders (which wipe #view) — progress lines accumulate and
// the last load's output stays visible until the next. The theme reads the app's live CSS vars.
function ensureProgressTerminal(): void {
    if (progressTerminal !== null) return;
    const rootStyles = getComputedStyle(document.documentElement);
    progressTerminal = new Terminal({
        rows: CONSOLE_ROWS,
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
    // The window-resize listener misses width changes with no resize event — chiefly
    // dragging the sidebar↔rightcol splitter (#split-lr), which narrows the console.
    // A ResizeObserver on the console element re-fits `cols` on ANY box change, so
    // xterm always wraps at the visible width instead of overflowing (clipped) it (item 80).
    const consoleResizeObserver = new ResizeObserver(() => fitProgressColumns());
    consoleResizeObserver.observe(document.getElementById("progress-console")!);
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

// Fit the column count to the window width, holding the height fixed at CONSOLE_ROWS rows.
function fitProgressColumns(): void {
    const dimensions = progressFitAddon?.proposeDimensions();
    if (dimensions?.cols) progressTerminal!.resize(dimensions.cols, CONSOLE_ROWS);
}

// ─── console collapse (item 66): row ⇄ one-line status bar ──────────────────

// The last non-empty line of the xterm scrollback — the status the collapsed bar shows.
function findLastNonEmptyConsoleLine(): string {
    const buffer = progressTerminal!.buffer.active;
    for (let i = buffer.length - 1; i >= 0; i -= 1) {
        const lineText = buffer.getLine(i)?.translateToString(true).trim() ?? "";
        if (lineText.length > 0) {
            return lineText;
        }
    }
    return "";
}

// Swap the console row for the #console-bar status strip (#rightcol.console-collapsed CSS).
function collapseProgressConsole(): void {
    document.getElementById("rightcol")!.classList.add("console-collapsed");
    document.getElementById("console-last")!.textContent =
        progressTerminal === null ? "" : findLastNonEmptyConsoleLine();
}

function expandProgressConsole(): void {
    document.getElementById("rightcol")!.classList.remove("console-collapsed");
    // The row was display:none while collapsed — re-fit the column count to its width.
    fitProgressColumns();
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
    // writeln is async; scroll in its completion callback so the buffer reflects the new line
    progressTerminal!.writeln(`${formatConsoleTime()} ${tintSourceToken(text)}`, () => progressTerminal!.scrollToBottom());
}

// ─── centered loading-progress overlay ───────────────────────────────────────
// One reusable centered bar shown during the two long phases of opening a project: the server-side
// reconstruction stream (driven by fetchDocument's determinate progress lines) and the client-side
// timeline row build (item 78, driven from views/timeline.ts). Created once, appended on demand.
let loadingProgressElements: { overlay: HTMLElement; label: HTMLElement; fill: HTMLElement } | null = null;

// Show or update the overlay. `fraction` is the bar fill (0..1, clamped); a non-finite fraction
// (e.g. a zero total) fills the bar completely.
export function showLoadingProgress(text: string, fraction: number): void {
    if (loadingProgressElements === null) {
        const label = el("div", { class: "timeline-progress-label" });
        const fill = el("div", { class: "timeline-progress-fill" });
        const track = el("div", { class: "timeline-progress-track" }, [fill]);
        const box = el("div", { class: "timeline-progress-box" }, [label, track]);
        const overlay = el("div", { class: "timeline-progress-overlay" }, [box]);
        loadingProgressElements = { overlay, label, fill };
    }
    loadingProgressElements.label.textContent = text;
    const safeFraction = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 1;
    loadingProgressElements.fill.style.width = `${safeFraction * 100}%`;
    if (!loadingProgressElements.overlay.isConnected) {
        document.body.append(loadingProgressElements.overlay);
    }
}

export function hideLoadingProgress(): void {
    loadingProgressElements?.overlay.remove();
}

// One streamed progress line: always echoed to the console, and — when it carries a determinate
// current/total (chiefly the "reconstructing <file>" branch pass) — also driving the centered bar.
function reportStreamProgress(parsed: WireDocumentStreamLine): void {
    logProgress(parsed.current !== undefined ? `${parsed.current}/${parsed.total} ${parsed.label}` : parsed.label!);
    if (parsed.current !== undefined && parsed.total !== undefined && parsed.total > 0) {
        showLoadingProgress(`${parsed.label} — ${parsed.current} / ${parsed.total}`, parsed.current / parsed.total);
    }
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

// The one in-flight document load. renderRoute aborts it on every navigation (previously two
// hashchanges raced duplicate stream reads); the console Cancel button aborts it on demand.
let inflightLoadController: AbortController | undefined;

function setCancelButtonVisible(visible: boolean): void {
    const button = document.getElementById("console-cancel") as HTMLButtonElement;
    button.hidden = !visible;
    button.disabled = false; // any visibility change ends a pending cancel
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
    const controller = new AbortController();
    inflightLoadController = controller;
    setCancelButtonVisible(true);
    try {
        // The server does its consent-decision parse (and, for a project view, a full projects scan)
        // BEFORE it writes headers — that work is silent until the stream opens. Time to first byte
        // exposes it, so a gap before the first "loading …" line is attributable to the server.
        logProgress(`GET /api/document jsonl=${jsonl ?? "(all)"}`);
        const requestStartMs = Date.now();
        const response = await fetch(`/api/document?${params}`, { signal: controller.signal });
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
                    reportStreamProgress(parsed);
                } else {
                    finalPayload = parsed;
                }
            }
        }
        // A real document has no `kind` field; consent/error ride the kind discriminant.
        if (finalPayload.kind === "error") throw new Error(finalPayload.label);
        if (finalPayload.kind === "consent-required") return { consentRequired: finalPayload.scripts };
        documentCache.set(cacheKey, finalPayload);
        // item 66: this load actually streamed (cache miss) and completed — auto-collapse the
        // console shortly after so the timeline gets the vertical space back.
        setTimeout(collapseProgressConsole, 400);
        return { document: finalPayload as DocumentType };
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") logProgress("load cancelled");
        throw error;
    } finally {
        // The reconstruction bar belongs to THIS stream; drop it when the stream ends (success,
        // consent, error, or abort). The timeline row build (item 78) re-shows its own bar after.
        hideLoadingProgress();
        if (inflightLoadController === controller) {
            inflightLoadController = undefined;
            setCancelButtonVisible(false);
        }
    }
}

// How one stretch of the consent list renders: a full modifying row, or a collapsed
// run of consecutive read-only scripts behind one expandable summary line (item 69).
export enum ConsentBlockKind {
    modifying = "modifying",
    readOnlyRun = "read-only-run",
}
export type ConsentDisplayBlock =
    | { kind: ConsentBlockKind.modifying; script: WireConsentScript }
    | { kind: ConsentBlockKind.readOnlyRun; scripts: WireConsentScript[] };

// Group the chronological script list into display blocks: each maximal run of consecutive
// read-only scripts becomes one collapsed block; every other script is its own row.
export function groupConsentScriptsIntoBlocks(scripts: WireConsentScript[]): ConsentDisplayBlock[] {
    const blocks: ConsentDisplayBlock[] = [];
    for (const script of scripts) {
        const lastBlock = blocks[blocks.length - 1];
        if (script.readOnly !== true) {
            blocks.push({ kind: ConsentBlockKind.modifying, script });
        } else if (lastBlock !== undefined && lastBlock.kind === ConsentBlockKind.readOnlyRun) {
            lastBlock.scripts.push(script);
        } else {
            blocks.push({ kind: ConsentBlockKind.readOnlyRun, scripts: [script] });
        }
    }
    return blocks;
}

// Preview capacity of a consent-script <pre> in code lines. styles.css clips the pre at
// max-height 200px; at 12px font / ~1.4 line-height plus 8px paddings that is ~12 lines.
// ponytail: line-count heuristic, not a scrollHeight measurement — switch to measuring the
// rendered element if wrapped/oversized lines ever make this misjudge real previews.
const CONSENT_PREVIEW_MAX_LINES = 12;

// True when a consent script's code has more lines than the clipped preview can show,
// i.e. the row needs an Expand button (item 70).
export function checkConsentScriptOverflowsPreview(code: string): boolean {
    return code.split("\n").length > CONSENT_PREVIEW_MAX_LINES;
}

// Pseudo-path handed to renderCodeInto so consent code highlights as Python — every
// recorded run executes as `python3 __script__.py` (reconstruction_script_execution.ts).
const CONSENT_SCRIPT_LANGUAGE_PATH = "__script__.py";

// One script's row in the consent dialog: local timestamp (+ cwd when recorded) over its
// python-highlighted code; scripts taller than the preview clip get an Expand toggle (item 70).
function buildConsentScriptRow(script: WireConsentScript): HTMLElement {
    const pre = el("pre");
    renderCodeInto(pre, script.code, CONSENT_SCRIPT_LANGUAGE_PATH);
    const row = el("div", { class: "consent-script" }, [
        el("div", { class: "muted", text: new Date(script.timestamp).toLocaleString() + (script.cwd ? `  ·  cwd ${script.cwd}` : "") }),
        pre,
    ]);
    if (checkConsentScriptOverflowsPreview(script.code)) {
        const expandButton = el("button", { class: "toolbar-btn", text: "Expand" });
        expandButton.onclick = () => {
            const nowExpanded = pre.classList.toggle("expanded");
            expandButton.textContent = nowExpanded ? "Collapse" : "Expand";
        };
        row.append(expandButton);
    }
    return row;
}

// Default consent-header selection (item 73): the first modifying script, matching the
// missing-flag rule used by groupConsentScriptsIntoBlocks. undefined when every script is
// read-only — read-only rows start hidden inside closed <details>, so nothing is selectable.
export function findDefaultConsentSelectionIndex(scripts: WireConsentScript[]): number | undefined {
    const firstModifyingIndex = scripts.findIndex((script) => script.readOnly !== true);
    return firstModifyingIndex === -1 ? undefined : firstModifyingIndex;
}

// Prev/Next stepping over the currently visible consent rows (item 73): clamps at both ends
// instead of wrapping; a currentIndex of -1 (no selection yet) enters the list at row 0.
export function clampConsentSelectionStep(currentIndex: number, delta: number, visibleRowCount: number): number {
    return Math.min(visibleRowCount - 1, Math.max(0, currentIndex + delta));
}

// The consent dialog (plan 3.2): every script's code shown verbatim; running is opt-in;
// declining still yields a (degraded) document. The choice is remembered per project for
// this browser session only. Read-only scripts (item 69) collapse into per-run <details>
// blocks; the Show/hide button opens/closes all of them at once.
export function renderConsentDialog(container: HTMLElement, project: string, scripts: WireConsentScript[]): void {
    const readOnlyCount = scripts.filter((script) => script.readOnly === true).length;
    const modifyingCount = scripts.length - readOnlyCount;
    const countSplit = readOnlyCount > 0 ? ` — ${modifyingCount} modifying, ${readOnlyCount} read-only` : "";
    // item 73: decide moved above the header build — the decision buttons now live in the
    // sticky header instead of a bottom .consent-actions row.
    const decide = (choice: string) => {
        storeConsentChoice(project, choice);
        renderRoute();
    };
    const runButton = el("button", { class: "toolbar-btn consent-run", text: "Run scripts for this reconstruction", onclick: () => decide("1") }) as HTMLButtonElement;
    const continueButton = el("button", { class: "toolbar-btn", text: "Continue without running", onclick: () => decide("0") }) as HTMLButtonElement;
    const jumpToTopButton = el("button", { class: "toolbar-btn consent-jump-top", text: "Jump to top", onclick: () => container.scrollTo({ top: 0, behavior: "smooth" }) }) as HTMLButtonElement;
    const prevButton = el("button", { class: "toolbar-btn", text: "< Prev" }) as HTMLButtonElement;
    const nextButton = el("button", { class: "toolbar-btn", text: "Next >" }) as HTMLButtonElement;
    const navCounter = el("span", { class: "muted consent-nav-counter" });
    const expandAllButton = el("button", { class: "toolbar-btn", text: "Expand All" }) as HTMLButtonElement;
    // item 73: sticky header — the message, decision buttons, and script navigation stay
    // visible while the previews scroll (styles.css .consent-header).
    const header = el("div", { class: "consent-header" }, [
        el("h2", { text: `This reconstruction contains ${scripts.length} recorded script execution(s)${countSplit}` }),
        el("div", { class: "consent-header-row" }, [
            runButton, continueButton, jumpToTopButton, prevButton, nextButton, navCounter, expandAllButton,
        ]),
    ]);
    const box = el("div", { class: "consent-box" }, [
        header,
        // item 73: was — the message rendered as a plain first child and scrolled away with
        // the previews; it now lives in the sticky header above:
        // el("h2", { text: `This reconstruction contains ${scripts.length} recorded script execution(s)${countSplit}` }),
        el("div", { class: "muted", text: "Re-running them reproduces script-made file states. Nothing runs without your say-so." }),
    ]);
    if (readOnlyCount > 0) {
        // Expand-all/collapse-all over the SAME per-block <details> state the triangles use:
        // if any block is closed the click opens all, otherwise it closes all.
        box.append(el("button", {
            class: "toolbar-btn",
            text: "Show/hide Read-only scripts",
            onclick: () => {
                const detailsBlocks = [...box.querySelectorAll<HTMLDetailsElement>("details.consent-readonly-block")];
                const shouldOpen = detailsBlocks.some((block) => !block.open);
                for (const block of detailsBlocks) block.open = shouldOpen;
            },
        }));
    }
    for (const block of groupConsentScriptsIntoBlocks(scripts)) {
        if (block.kind === ConsentBlockKind.modifying) {
            box.append(buildConsentScriptRow(block.script));
        } else {
            const firstTimestamp = new Date(block.scripts[0]!.timestamp).toLocaleString();
            box.append(el("details", { class: "consent-readonly-block" }, [
                el("summary", { class: "muted", text: `----- ${firstTimestamp} ${block.scripts.length} readonly script(s) -----` }),
                ...block.scripts.map(buildConsentScriptRow),
            ]));
        }
    }
    // item 73: was — decide + the decision buttons rendered at the BOTTOM of the script list
    // and scrolled out of reach; both buttons now live in the sticky header above:
    // const decide = (choice: string) => {
    //     storeConsentChoice(project, choice);
    //     renderRoute();
    // };
    // box.append(el("div", { class: "consent-actions" }, [
    //     el("button", { class: "toolbar-btn consent-run", text: "Run scripts for this reconstruction", onclick: () => decide("1") }),
    //     el("button", { class: "toolbar-btn", text: "Continue without running", onclick: () => decide("0") }),
    // ]));
    // item 73: Prev/Next walk the VISIBLE script rows — modifying rows always, read-only rows
    // only while their <details> block is open. Rows sit in scripts[] order (grouping is
    // contiguous and order-preserving), so allConsentRows()[i] corresponds to scripts[i].
    const allConsentRows = () => [...box.querySelectorAll<HTMLElement>(".consent-script")];
    const collectVisibleConsentRows = () => allConsentRows()
        .filter((row) => row.closest("details:not([open])") === null);
    const defaultIndex = findDefaultConsentSelectionIndex(scripts);
    let selectedRow: HTMLElement | undefined = defaultIndex === undefined ? undefined : allConsentRows()[defaultIndex];
    const updateScriptNavState = () => {
        const visibleRows = collectVisibleConsentRows();
        if (selectedRow === undefined || !visibleRows.includes(selectedRow)) {
            // The selected row's block closed (or nothing was selectable yet): fall back to
            // the first visible row so the rectangle never sits on a hidden script.
            selectedRow = visibleRows[0];
        }
        for (const row of allConsentRows()) {
            row.classList.toggle("consent-selected", row === selectedRow);
        }
        const nothingNavigable = visibleRows.length === 0;
        prevButton.hidden = nothingNavigable;
        nextButton.hidden = nothingNavigable;
        navCounter.hidden = nothingNavigable;
        if (selectedRow !== undefined) {
            const selectedIndex = visibleRows.indexOf(selectedRow);
            prevButton.disabled = selectedIndex <= 0;
            nextButton.disabled = selectedIndex >= visibleRows.length - 1;
            navCounter.textContent = `Script ${selectedIndex + 1} of ${visibleRows.length}`;
        }
    };
    const navigateConsentScript = (delta: number) => {
        const visibleRows = collectVisibleConsentRows();
        if (visibleRows.length === 0) {
            return;
        }
        const currentIndex = selectedRow === undefined ? -1 : visibleRows.indexOf(selectedRow);
        selectedRow = visibleRows[clampConsentSelectionStep(currentIndex, delta, visibleRows.length)];
        updateScriptNavState();
        selectedRow?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    prevButton.onclick = () => navigateConsentScript(-1);
    nextButton.onclick = () => navigateConsentScript(1);
    // <details> toggle events don't bubble but ARE observable in the capture phase, and they
    // fire for programmatic open changes too — one listener covers the per-block triangles,
    // the Show/hide button, and Expand All.
    box.addEventListener("toggle", () => updateScriptNavState(), true);
    updateScriptNavState();
    // item 72/73: Expand All expands or collapses every script preview and read-only <details>
    // block at once. item 73 moved the button into the sticky consent header (the static
    // #toggle-all skeleton is hidden while consent shows — see below). onclick property
    // assignment (not addEventListener) so re-renders never stack handlers. Re-query the DOM
    // on every click — the per-row Expand buttons and the read-only Show/hide button mutate
    // the same expanded state between clicks.
    // const toggleAllButton = document.getElementById("toggle-all") as HTMLButtonElement;
    const toggleAllButton = expandAllButton;
    const collectExpandables = () => ({
        previews: [...box.querySelectorAll<HTMLPreElement>(".consent-script pre")]
            .filter((pre) => checkConsentScriptOverflowsPreview(pre.textContent ?? "")),
        readOnlyBlocks: [...box.querySelectorAll<HTMLDetailsElement>("details.consent-readonly-block")],
    });
    const updateToggleAllLabel = () => {
        const { previews, readOnlyBlocks } = collectExpandables();
        const anyCollapsed = previews.some((pre) => !pre.classList.contains("expanded"))
            || readOnlyBlocks.some((block) => !block.open);
        const nothingExpandable = previews.length === 0 && readOnlyBlocks.length === 0;
        // With nothing expandable the button is inert; "Expand All" is the least-misleading label.
        toggleAllButton.textContent = anyCollapsed || nothingExpandable ? "Expand All" : "Collapse All";
    };
    toggleAllButton.onclick = () => {
        const { previews, readOnlyBlocks } = collectExpandables();
        const shouldExpand = previews.some((pre) => !pre.classList.contains("expanded"))
            || readOnlyBlocks.some((block) => !block.open);
        for (const pre of previews) pre.classList.toggle("expanded", shouldExpand);
        for (const block of readOnlyBlocks) block.open = shouldExpand;
        for (const pre of previews) {
            // Keep each row's own Expand/Collapse button label in step with the global toggle.
            const row = pre.parentElement;
            if (row !== null) {
                const rowButton = row.querySelector("button");
                if (rowButton !== null) {
                    rowButton.textContent = shouldExpand ? "Collapse" : "Expand";
                }
            }
        }
        updateToggleAllLabel();
    };
    updateToggleAllLabel();
    // item 73: the header row owns Expand All during consent; hide the skeleton button so two
    // Expand All buttons never show at once. renderRoute un-hides it on every navigation.
    (document.getElementById("toggle-all") as HTMLButtonElement).hidden = true;
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
    // item 66: the Details pane header names the sub-route the drawer shows.
    let headerText: string | undefined;
    if (segments[2] === "jsonl") {
        const jsonl = segments[3]!;
        if (segments[4] === "lines") {
            headerText = `Raw lines — ${jsonl}`;
            renderContent = (content: HTMLElement) => renderRawLinesView(content, project, jsonl);
        } else {
            headerText = `Conversation — ${jsonl}`;
            renderContent = (content: HTMLElement) => renderConversationView(content, project, jsonl, segments[4] === "at" ? segments[5] : undefined);
        }
    } else if (segments[2] === "file") {
        const target = segments[3]!;
        if (segments[4] === "vsbase") {
            headerText = `Diff vs base — ${target}`;
            renderContent = (content: HTMLElement) => renderDiffVsBaseView(content, project, target, segments[5]);
        } else {
            headerText = `File history — ${target}`;
            renderContent = (content: HTMLElement) => renderFileHistoryView(content, project, target, segments[4] === "rev" ? segments[5] : undefined);
        }
    }
    if (renderContent === undefined) {
        return;
    }
    const content = openInspectorPane();
    document.getElementById("details-header")!.textContent = headerText!;
    await renderContent(content);
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

// item 66: the details pane (#inspector) is now a STATIC skeleton (index.html) — a route
// change hides it and clears only its content columns instead of wiping it wholesale.
// Null-safe on the inner ids because the pre-phase-5 openInspectorPane still rebuilds the
// pane's children wholesale in the interim.
function resetDetailsPane(): void {
    document.getElementById("inspector")!.classList.add("hidden");
    document.getElementById("details-left")?.replaceChildren();
    document.getElementById("details-right-body")?.replaceChildren();
    const header = document.getElementById("details-header");
    if (header !== null) {
        header.textContent = "No selection";
    }
}

async function renderRoute(): Promise<void> {
    inflightLoadController?.abort();   // navigation tears down any in-flight load
    const view = document.getElementById("view")!;
    view.replaceChildren();
    view.onclick = null;
    // item 73: the consent dialog hides #toggle-all while its header owns Expand All; every
    // navigation restores the skeleton button before the next view wires or ignores it.
    (document.getElementById("toggle-all") as HTMLButtonElement).hidden = false;
    // item 66: was — emptied the whole inspector pane on every route change:
    // const inspector = document.getElementById("inspector")!;
    // inspector.classList.add("hidden");
    // // A route change invalidates the inspected line; an empty closed pane renders no reopen rail.
    // inspector.replaceChildren();
    resetDetailsPane();
    const drawer = document.getElementById("drawer")!;
    const segments = parseRouteSegments();
    const nextProject = segments[0] === "project" ? segments[1] : undefined;
    if (checkNavigationStartsNewProjectLoad(lastLoadedProject, nextProject)) {
        // A different project's load is starting: the retained output belongs to the previous
        // project, so clear before the first line of this load lands (TASKS item 22).
        ensureProgressTerminal();
        progressTerminal!.clear();
        // item 66: a fresh load re-opens a collapsed console so its progress is visible.
        expandProgressConsole();
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
    // item 66: the fork layout keys off #rightcol.project-route (absent on #/, the timeline
    // chrome + details pane hide so #view and the console fill the column):
    // document.querySelector(".layout")!.classList.toggle("timeline-route", checkRouteIsTimeline(segments));
    document.getElementById("rightcol")!.classList.toggle("project-route", checkRouteIsTimeline(segments));
    // item 66: the fork sidebar (webapp/views/sidebar.ts) is rendered by renderTimelineView
    // itself — the old per-route project drawer is retired:
    // const refreshDrawer = () => renderProjectDrawer(drawer, segments[1]!, {
    //     activeJsonl: segments[2] === "jsonl" ? segments[3]
    //         : segments[2] === "timeline" && segments[3] === "session" ? segments[4] : undefined,
    //     activeTarget: segments[2] === "file" ? segments[3] : undefined,
    // });
    try {
        if (segments[0] === "project") {
            drawer.classList.remove("hidden");
            // item 66: was — await refreshDrawer();
        } else {
            drawer.classList.add("hidden");
            drawer.replaceChildren();   // item 66: the projects-list route leaves the drawer empty
        }
        if (segments.length === 0) {
            setToolbarTitle(undefined);   // item 66: was setBreadcrumb("")
            await renderProjectsView(view);
        } else if (segments[0] === "project") {
            const project = segments[1]!;
            setToolbarTitle(project);   // item 66: was setBreadcrumb(project)
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
        if (error instanceof DOMException && error.name === "AbortError") return;   // cancelled — console already logged it
        view.append(el("div", { class: "error-box", text: String(error) }));
    }
    // item 66: was — a post-render refreshDrawer() so the old drawer's "Files touched" section
    // appeared without another navigation; renderTimelineView now builds the fork sidebar from
    // the freshly cached document in the same pass:
    // if (segments[0] === "project") {
    //     await refreshDrawer();
    // }
}

// The breadcrumb span now only carries the config-switch error (item 66); the current
// project shows in the toolbar title instead.
function setBreadcrumb(text: string): void {
    document.getElementById("breadcrumb")!.textContent = text;
}

// item 66: mockup toolbar title — "JFRED — project: <b>name</b>" on project routes, plain
// "JFRED" (still a home link) otherwise. Replaces the per-route breadcrumb, so any stale
// config-error text clears with it.
function setToolbarTitle(project: string | undefined): void {
    const title = document.getElementById("toolbar-title")!;
    title.replaceChildren(el("a", { href: "#/", text: "JFRED", title: "JSONL File Reverse Engineer Debugger" }));
    if (project !== undefined) {
        title.append(" — project: ", el("b", { text: project }));
    }
    setBreadcrumb("");
}

// ─── header: toolbar popovers (item 66) + the runtime-switchable folders (item 46) ──────

// The /api/config payload (wire shape: paths as plain strings).
type WireConfig = { projectsDir: string; fileHistoryDir: string };

// The /api/projects payload rows, as far as the Projects menu reads them.
type WireProjectListing = { name: string };

// Both toolbar popovers close together — opening one, picking a project, applying a folder
// change, or any document-level click funnels through here (the mockup's pattern).
function hideToolbarPopovers(): void {
    document.getElementById("projects-menu")!.hidden = true;
    document.getElementById("paths-popover")!.hidden = true;
}

// Fill the Projects dropdown with one navigating row per project in the active folder.
async function populateProjectsMenu(menu: HTMLElement): Promise<void> {
    const projects = await fetchJson<WireProjectListing[]>("/api/projects");
    menu.replaceChildren(...projects.map((project) => el("div", {
        class: "menu-item",
        text: project.name,
        onclick: () => {
            hideToolbarPopovers();
            location.hash = routeToProject(project.name);
        },
    })));
}

async function initializeHeader(): Promise<void> {
    // item 66: popover model — the two toolbar buttons toggle their popovers; a document-level
    // click closes both (in-popover clicks stopPropagation to stay open).
    const projectsMenu = document.getElementById("projects-menu")!;
    const pathsPopover = document.getElementById("paths-popover")!;
    document.getElementById("projects-btn")!.addEventListener("click", (event) => {
        event.stopPropagation();
        const wasHidden = projectsMenu.hidden;
        hideToolbarPopovers();
        projectsMenu.hidden = !wasHidden;
        if (!projectsMenu.hidden) {
            void populateProjectsMenu(projectsMenu);
        }
    });
    document.getElementById("paths-btn")!.addEventListener("click", (event) => {
        event.stopPropagation();
        const wasHidden = pathsPopover.hidden;
        hideToolbarPopovers();
        pathsPopover.hidden = !wasHidden;
    });
    // Clicks inside the paths popover (typing in the inputs) must not reach the document-level
    // closer — EXCEPT the apply button, whose click closes the popover on its way up.
    pathsPopover.addEventListener("click", (event) => {
        if ((event.target as HTMLElement).id !== "projects-dir-change") {
            event.stopPropagation();
        }
    });
    document.addEventListener("click", hideToolbarPopovers);
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
    // Native macOS folder picker — fills the input; "Change folder…" still applies it.
    // Empty path = user cancelled; leave the field alone.
    const pickFolderInto = async (target: HTMLInputElement): Promise<void> => {
        const response = await fetch(`/api/pick-folder?current=${encodeURIComponent(target.value)}`);
        if (!response.ok) {
            // No alert(): native dialogs block headless automation. The breadcrumb carries the error.
            setBreadcrumb(`folder picker failed: ${await response.text()}`);
            return;
        }
        const { path } = await response.json() as { path: string };
        if (path !== "") {
            target.value = path;
        }
    };
    document.getElementById("projects-dir-open")!.addEventListener("click", () => void pickFolderInto(input));
    document.getElementById("file-history-dir-open")!.addEventListener("click", () => void pickFolderInto(fileHistoryInput));
}

// ─── splitters (item 66, ported from the mockup) ─────────────────────────────

// Dragging the splitter pins the pane's flex-basis to its pointer-tracked pixel size
// (invert=true for a pane sitting AFTER its splitter, e.g. the console row).
function makeSplitter(splitterId: string, paneId: string, axis: "x" | "y", invert: boolean, minPx: number): void {
    const splitter = document.getElementById(splitterId)!;
    const pane = document.getElementById(paneId)!;
    let startPos = 0;
    let startSize = 0;
    splitter.addEventListener("pointerdown", (event) => {
        startPos = axis === "y" ? event.clientY : event.clientX;
        const rect = pane.getBoundingClientRect();
        startSize = axis === "y" ? rect.height : rect.width;
        splitter.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    splitter.addEventListener("pointermove", (event) => {
        if (!splitter.hasPointerCapture(event.pointerId)) {
            return;
        }
        const pos = axis === "y" ? event.clientY : event.clientX;
        let delta = pos - startPos;
        if (invert) {
            delta = -delta;
        }
        const size = Math.max(minPx, startSize + delta);
        pane.style.flexGrow = "0";
        pane.style.flexShrink = "0";
        pane.style.flexBasis = `${size}px`;
    });
    splitter.addEventListener("pointerup", (event) => {
        splitter.releasePointerCapture(event.pointerId);
    });
}

// Bootstrap only in a real browser: the node test suite imports the view modules (for their
// DOM-free view-model functions), which transitively loads this module without a window.
if (typeof window !== "undefined") {
    ensureProgressTerminal();   // show the empty 10-row console immediately, before any load
    window.addEventListener("hashchange", renderRoute);
    // Item 10a: rail-click reopen retired with handleInspectorRailClick above.
    // document.getElementById("inspector").addEventListener("click", handleInspectorRailClick);
    // item 66: fork-layout chrome — the three splitters + the console hide/show pair.
    makeSplitter("split-td", "timeline-pane", "y", false, 80);
    makeSplitter("split-lr", "details-left", "x", false, 140);
    makeSplitter("split-dc", "console-row", "y", true, 60);
    document.getElementById("console-hide")!.addEventListener("click", collapseProgressConsole);
    document.getElementById("console-show")!.addEventListener("click", expandProgressConsole);
    document.getElementById("console-cancel")!.addEventListener("click", () => {
        (document.getElementById("console-cancel") as HTMLButtonElement).disabled = true; // re-enabled by setCancelButtonVisible when the cancel lands
        inflightLoadController?.abort();
    });
    initializeHeader().then(renderRoute);
}
