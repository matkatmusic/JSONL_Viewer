// Projects tree (#/): every project in the active folder, most recently active first
// (the server's scan order).

import { el, fetchJson, routeToProject } from "../app.js";

export async function renderProjectsView(container) {
    const projects = await fetchJson("/api/projects");
    container.append(el("div", { class: "pane-title", text: `${projects.length} project(s)` }));
    for (const project of projects) {
        const latest = project.jsonlFiles[0];
        container.append(el("div", {
            class: "project-row",
            onclick: () => { location.hash = routeToProject(project.name); },
        }, [
            el("a", { href: routeToProject(project.name), text: project.name }),
            el("span", { class: "project-count", text: `${project.jsonlFiles.length} jsonl` }),
            el("span", { class: "muted", text: latest === undefined ? "" : new Date(latest.modifiedAt).toLocaleString() }),
        ]));
    }
}
