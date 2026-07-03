// App shell: hash router, shared fetch/cache/consent plumbing, header wiring, and the render
// dispatch. Views build their own DOM through the tiny el() helper; this file owns navigation.

import { renderProjectsView } from "./views/projects.js";
import { renderProjectView, renderProjectDrawer } from "./views/project.js";
import { renderConversationView } from "./views/conversation.js";
import { renderFileHistoryView } from "./views/file-history.js";
import { renderRawLinesView } from "./views/raw-lines.js";
import { renderDiffVsBaseView } from "./views/diff-vs-base.js";

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

export async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} -> ${response.status}: ${await response.text()}`);
    return response.json();
}

export async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} -> ${response.status}: ${await response.text()}`);
    return response.text();
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
    const params = new URLSearchParams({ project });
    if (jsonl !== undefined) params.set("jsonl", jsonl);
    const choice = sessionStorage.getItem(computeConsentKey(project));
    params.set("allowScripts", choice === "1" ? "1" : "0");
    if (choice === "0") params.set("declined", "1");
    const response = await fetch(`/api/document?${params}`);
    if (!response.ok) throw new Error(`document ${response.status}: ${await response.text()}`);
    const payload = await response.json();
    // A real document has no `kind` field; the consent decision rides the kind discriminant.
    if (payload.kind === "consent-required") {
        return { consentRequired: payload.scripts };
    }
    documentCache.set(cacheKey, payload);
    return { document: payload };
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

function parseRouteSegments() {
    return location.hash.replace(/^#\/?/, "").split("/").filter((segment) => segment.length > 0)
        .map(decodeURIComponent);
}

async function renderRoute() {
    const view = document.getElementById("view");
    view.replaceChildren();
    document.getElementById("inspector").classList.add("hidden");
    const drawer = document.getElementById("drawer");
    const segments = parseRouteSegments();
    const refreshDrawer = () => renderProjectDrawer(drawer, segments[1], {
        activeJsonl: segments[2] === "jsonl" ? segments[3] : undefined,
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
    window.addEventListener("hashchange", renderRoute);
    initializeHeader().then(renderRoute);
}
