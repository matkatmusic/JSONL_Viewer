#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";

// ── Types ──────────────────────────────────────────────────────────────────

interface RawEntry {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  message?: {
    id?: string;
    role?: string;
    content?: string | ContentBlock[];
  };
  toolUseResult?: Record<string, unknown>;
  subtype?: string;
  timestamp?: string;
  _rawLine?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  tool_use_id?: string;
}

interface DiffHunk {
  oldStart: number;
  newStart: number;
  oldLines?: number;
  newLines?: number;
  lines: string[];
}

interface DiffData {
  filePath: string;
  opType: string; // "create", "update", or "edit"
  hunks: DiffHunk[];
  content: string | null; // full content for creates
}

interface VisNode {
  uuid: string;
  entryType: string;
  role: string;
  messageId: string | null;
  isSidechain: boolean;
  contentSummary: string;
  timestamp: string;
  lineIndex: number;
  visibleChildren: VisNode[];
  toolChildren: VisNode[];
  hasDiff: boolean;
  diffFile: string | null;
  diffData: DiffData | null;
}

// ── Parse JSONL ────────────────────────────────────────────────────────────

function parseJSONL(filePath: string): RawEntry[] {
  const raw = readFileSync(filePath, "utf-8");
  const entries: RawEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      parsed._rawLine = trimmed;
      entries.push(parsed);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

// ── Summarize content for display ──────────────────────────────────────────

function summarizeContent(entry: RawEntry): string {
  const content = entry.message?.content;
  if (!content) return entry.subtype ?? "(empty)";

  if (typeof content === "string") {
    return content.slice(0, 100).replace(/\n/g, " ");
  }

  const types: string[] = [];
  for (const block of content) {
    if (block.type === "text" && block.text) {
      return block.text.slice(0, 100).replace(/\n/g, " ");
    }
    if (block.type === "tool_use") {
      types.push(`tool_use:${block.name ?? "?"}`);
    } else if (block.type === "tool_result") {
      types.push("tool_result");
    } else if (block.type === "thinking") {
      types.push("thinking");
    } else {
      types.push(block.type);
    }
  }
  return types.join(", ");
}

// ── Build visible tree ─────────────────────────────────────────────────────

const DISPLAYABLE_TYPES = new Set(["user", "assistant", "system"]);

function isPlumbing(node: VisNode): boolean {
  if (node.entryType === "assistant" && node.contentSummary.startsWith("tool_use:")) return true;
  if (node.entryType === "assistant" && node.contentSummary === "thinking") return true;
  if (node.entryType === "user" && node.contentSummary.startsWith("tool_result")) return true;
  if (node.entryType === "system") return true;
  return false;
}

function isAgentTextResponse(node: VisNode): boolean {
  return node.entryType === "assistant" && !isPlumbing(node);
}

interface BuildResult {
  visRoots: VisNode[];
  branchPoints: Set<string>;
  activePath: Set<string>;
  activeLeafUuid: string | null;
  totalRawNodes: number;
  totalVisNodes: number;
  totalBranches: number;
}

function buildVisibleTree(entries: RawEntry[]): BuildResult {
  // Step 1: Build raw tree from all linked entries
  interface RawNode {
    uuid: string;
    parentUuid: string | null;
    entry: RawEntry;
    lineIndex: number;
    children: RawNode[];
    displayable: boolean;
  }

  const rawMap = new Map<string, RawNode>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.uuid === undefined || e.parentUuid === undefined) continue;
    rawMap.set(e.uuid, {
      uuid: e.uuid,
      parentUuid: e.parentUuid ?? null,
      entry: e,
      lineIndex: i,
      children: [],
      displayable: DISPLAYABLE_TYPES.has(e.type),
    });
  }

  const rawRoots: RawNode[] = [];
  for (const node of rawMap.values()) {
    if (node.parentUuid && rawMap.has(node.parentUuid)) {
      rawMap.get(node.parentUuid)!.children.push(node);
    } else {
      rawRoots.push(node);
    }
  }

  // Step 2: Flatten into visible tree — hidden nodes are collapsed out,
  // their children promoted to the nearest visible ancestor.
  function toVisNode(raw: RawNode): VisNode {
    const tr = raw.entry.toolUseResult as Record<string, unknown> | undefined;
    const hasDiff = tr !== undefined && "originalFile" in tr;
    const diffFile = hasDiff ? (tr?.filePath as string ?? null) : null;
    let diffData: DiffData | null = null;
    if (hasDiff && tr) {
      const sp = tr.structuredPatch as DiffHunk[] | undefined;
      const opType = (tr.type as string) ?? (tr.oldString !== undefined ? "edit" : "unknown");
      diffData = {
        filePath: (tr.filePath as string) ?? "",
        opType,
        hunks: Array.isArray(sp) ? sp : [],
        content: opType === "create" ? (tr.content as string ?? null) : null,
      };
    }
    return {
      uuid: raw.uuid,
      entryType: raw.entry.type,
      role: raw.entry.message?.role ?? raw.entry.type,
      messageId: raw.entry.message?.id ?? null,
      isSidechain: raw.entry.isSidechain ?? false,
      contentSummary: summarizeContent(raw.entry),
      timestamp: raw.entry.timestamp ?? "",
      lineIndex: raw.lineIndex,
      visibleChildren: [],
      toolChildren: [],
      hasDiff,
      diffFile,
      diffData,
    };
  }

  function collectVisibleChildren(raw: RawNode): VisNode[] {
    const result: VisNode[] = [];
    for (const child of raw.children) {
      if (child.displayable) {
        const vis = toVisNode(child);
        vis.visibleChildren = collectVisibleChildren(child);
        result.push(vis);
      } else {
        result.push(...collectVisibleChildren(child));
      }
    }
    return result;
  }

  const visRoots: VisNode[] = [];
  for (const raw of rawRoots) {
    if (raw.displayable) {
      const vis = toVisNode(raw);
      vis.visibleChildren = collectVisibleChildren(raw);
      visRoots.push(vis);
    } else {
      visRoots.push(...collectVisibleChildren(raw));
    }
  }

  // Step 3: Build a flat map of all visible nodes for lookups
  const visMap = new Map<string, VisNode>();
  function indexVis(node: VisNode) {
    visMap.set(node.uuid, node);
    for (const child of node.visibleChildren) indexVis(child);
  }
  for (const root of visRoots) indexVis(root);

  // Re-index
  visMap.clear();
  for (const root of visRoots) indexVis(root);

  // Step 4: Detect branch points (rewind events) vs parallel tool_use
  const branchPoints = new Set<string>();

  function detectBranches(node: VisNode) {
    if (node.visibleChildren.length > 1) {
      if (!isParallelToolUse(node.visibleChildren)) {
        branchPoints.add(node.uuid);
      }
    }
    for (const child of node.visibleChildren) detectBranches(child);
  }

  function isParallelToolUse(children: VisNode[]): boolean {
    const msgIds = new Set(
      children.map((c) => c.messageId).filter((id) => id !== null)
    );
    if (msgIds.size === 1) {
      const hasAssistant = children.some((c) => c.entryType === "assistant");
      const hasUser = children.some((c) => c.entryType === "user");
      if (hasAssistant && hasUser) return true;
      if (hasAssistant && !hasUser) return true;
    }
    return false;
  }

  for (const root of visRoots) detectBranches(root);

  // Step 5: Find active leaf. Raw leaves are often attachment/system nodes.
  // Walk back from each raw leaf to find its nearest displayable ancestor.
  const rawLeafNodes = [...rawMap.values()].filter((n) => n.children.length === 0);
  rawLeafNodes.sort((a, b) => ((a.entry.timestamp ?? "") > (b.entry.timestamp ?? "") ? -1 : 1));

  let activeLeafUuid: string | null = null;
  for (const leaf of rawLeafNodes) {
    let current: RawNode | undefined = leaf;
    while (current) {
      if (
        current.displayable &&
        !current.entry.isSidechain &&
        (current.entry.type === "user" || current.entry.type === "assistant")
      ) {
        activeLeafUuid = current.uuid;
        break;
      }
      current = current.parentUuid ? rawMap.get(current.parentUuid) : undefined;
    }
    if (activeLeafUuid) break;
  }

  // Step 6: Walk active path from leaf to root through the RAW tree.
  // Also recover parallel tool_use siblings: nodes sharing the same
  // message.id as an active node are part of the same turn.
  const activePath = new Set<string>();
  if (activeLeafUuid) {
    let rawCurrent = rawMap.get(activeLeafUuid);
    while (rawCurrent) {
      activePath.add(rawCurrent.uuid);
      rawCurrent = rawCurrent.parentUuid
        ? rawMap.get(rawCurrent.parentUuid)
        : undefined;
    }
  }

  // Expand active path to include parallel siblings (same message.id)
  // and their entire descendant chains
  const msgIdToNodes = new Map<string, RawNode[]>();
  for (const node of rawMap.values()) {
    const mid = node.entry.message?.id;
    if (mid) {
      const list = msgIdToNodes.get(mid);
      if (list) list.push(node);
      else msgIdToNodes.set(mid, [node]);
    }
  }

  function markDescendantsActive(node: RawNode) {
    activePath.add(node.uuid);
    for (const child of node.children) {
      if (!activePath.has(child.uuid)) markDescendantsActive(child);
    }
  }

  for (const [, siblings] of msgIdToNodes) {
    const anyActive = siblings.some((n) => activePath.has(n.uuid));
    if (anyActive) {
      for (const sib of siblings) {
        if (!activePath.has(sib.uuid)) {
          markDescendantsActive(sib);
        }
      }
    }
  }

  return {
    visRoots,
    branchPoints,
    activePath,
    activeLeafUuid,
    totalRawNodes: rawMap.size,
    totalVisNodes: visMap.size,
    totalBranches: branchPoints.size,
  };
}

// ── Generate HTML ──────────────────────────────────────────────────────────

const INDENT_PX = 3;

function generateHTML(tree: BuildResult, inputFile: string, outputFile: string): string {
  const { visRoots, branchPoints, activePath } = tree;

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function labelForNode(node: VisNode): string {
    const roleLabel =
      node.entryType === "user"
        ? "User"
        : node.entryType === "assistant"
          ? "Agent"
          : "System";
    const sideTag = node.isSidechain ? " [sidechain]" : "";
    const preview = escapeHtml(node.contentSummary.slice(0, 80));
    return `${roleLabel}${sideTag}: ${preview}`;
  }

  function isSubtreeActive(node: VisNode): boolean {
    if (activePath.has(node.uuid)) return true;
    for (const child of node.visibleChildren) {
      if (isSubtreeActive(child)) return true;
    }
    return false;
  }

  // Flatten a chain of single-child nodes into a list, stopping at
  // branch points (>1 children) or leaves (0 children).
  function flattenChain(start: VisNode): { list: VisNode[]; tail: VisNode } {
    const list: VisNode[] = [start];
    let current = start;
    while (current.visibleChildren.length === 1) {
      current = current.visibleChildren[0];
      list.push(current);
    }
    return { list, tail: current };
  }

  function roleClassFor(node: VisNode): string {
    const isUserPrompt = node.entryType === "user" && !node.contentSummary.startsWith("tool_result");
    const isToolResult = node.entryType === "user" && node.contentSummary.startsWith("tool_result");
    const isToolUse = node.entryType === "assistant" && node.contentSummary.startsWith("tool_use:");
    return isUserPrompt ? "role-user-prompt" : isToolResult ? "role-user-tool-result" : isToolUse ? "role-tool-use" : `role-${node.entryType}`;
  }

  function renderSingleNode(node: VisNode, depth: number, plumbingNodes: VisNode[]): string {
    const isActive = activePath.has(node.uuid);
    const activeClass = isActive ? "active" : "orphaned";
    const roleClass = roleClassFor(node);
    const hasTool = plumbingNodes.length > 0;
    const containsDiff = plumbingNodes.some((p) => p.hasDiff);
    const diffFiles = plumbingNodes.filter((p) => p.hasDiff).map((p) => p.diffFile?.split("/").pop() ?? "");
    const diffIndicator = containsDiff ? ` <span class="diff-badge">Δ ${escapeHtml(diffFiles.join(", "))}</span>` : "";
    const label = labelForNode(node);
    const copyBtn = `<span class="copy-btn" data-line="${node.lineIndex}" data-uuid="${node.uuid}" title="Copy line ${node.lineIndex} / ${node.uuid.slice(0, 8)}">&#x1f4cb;</span>`;

    const inspectBtn = `<span class="inspect-btn" data-uuid="${node.uuid}" title="Inspect raw JSON">{ }</span>`;

    let html = `<div class="node ${activeClass} ${roleClass}${hasTool ? ' has-tool-children' : ''}${containsDiff ? ' contains-diff' : ''}" style="margin-left:${depth * INDENT_PX}px;" data-uuid="${node.uuid}">`;
    html += `<span class="toggle">[+]</span> <span class="label">${label}</span>${diffIndicator} ${copyBtn} ${inspectBtn}`;
    html += `</div>\n`;

    if (hasTool) {
      let toolHtml = "";
      for (const p of plumbingNodes) {
        toolHtml += renderPlumbingNode(p, 0);
      }
      html += `<div class="tool-children" style="display:none;margin-left:${(depth + 1) * INDENT_PX}px;">`;
      html += toolHtml;
      html += `</div>\n`;
    }
    return html;
  }

  function renderDiffView(data: DiffData): string {
    let html = `<div class="diff-view">`;
    html += `<div class="diff-header">${escapeHtml(data.filePath.split("/").pop()!)} (${data.opType})</div>`;

    if (data.opType === "create" && data.content) {
      html += `<div class="diff-hunk">`;
      const lines = data.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        html += `<div class="diff-line diff-add"><span class="diff-ln">${i + 1}</span><span class="diff-text">+${escapeHtml(lines[i])}</span></div>`;
      }
      html += `</div>`;
    } else if (data.hunks.length > 0) {
      for (const hunk of data.hunks) {
        html += `<div class="diff-hunk">`;
        html += `<div class="diff-line diff-range">@@ -${hunk.oldStart}${hunk.oldLines !== undefined ? "," + hunk.oldLines : ""} +${hunk.newStart}${hunk.newLines !== undefined ? "," + hunk.newLines : ""} @@</div>`;
        for (const line of hunk.lines) {
          const prefix = line[0];
          const text = line.slice(1);
          const cls = prefix === "+" ? "diff-add" : prefix === "-" ? "diff-del" : "diff-ctx";
          const lnHtml = `<span class="diff-text">${escapeHtml(prefix + text)}</span>`;
          html += `<div class="diff-line ${cls}">${lnHtml}</div>`;
        }
        html += `</div>`;
      }
    }

    html += `</div>`;
    return html;
  }

  function renderPlumbingNode(node: VisNode, depth: number): string {
    const isActive = activePath.has(node.uuid);
    const activeClass = isActive ? "active" : "orphaned";
    const roleClass = roleClassFor(node);
    const copyBtn = `<span class="copy-btn" data-line="${node.lineIndex}" data-uuid="${node.uuid}" title="Copy line ${node.lineIndex} / ${node.uuid.slice(0, 8)}">&#x1f4cb;</span>`;
    const diffClass = node.hasDiff ? " has-diff" : "";
    const fileName = node.diffFile ? node.diffFile.split("/").pop() : "";
    const label = node.hasDiff
      ? `${escapeHtml(node.contentSummary.slice(0, 40))} <span class="diff-badge">Δ ${escapeHtml(fileName!)}</span>`
      : labelForNode(node);

    const inspectBtn = `<span class="inspect-btn" data-uuid="${node.uuid}" title="Inspect raw JSON">{ }</span>`;

    let html = `<div class="node ${activeClass} ${roleClass}${diffClass}" style="margin-left:${depth * INDENT_PX}px;" data-uuid="${node.uuid}"><span class="toggle">[+]</span> <span class="label">${label}</span> ${copyBtn} ${inspectBtn}</div>\n`;

    if (node.diffData) {
      html += `<div class="diff-container" style="display:none;margin-left:${(depth + 1) * INDENT_PX}px;">`;
      html += renderDiffView(node.diffData);
      html += `</div>\n`;
    }

    return html;
  }

  // Render a chain of nodes: flatten, group plumbing into agent text
  // nodes, render the primary nodes with plumbing hidden inside.
  function renderChain(start: VisNode, depth: number): string {
    const { list, tail } = flattenChain(start);

    // Group: walk the flat list, collect plumbing into agent text nodes
    let html = "";
    let plumbingBuffer: VisNode[] = [];
    let lastAgentHtml = { ref: "" };
    let lastAgentHadTools = false;

    let i = 0;
    while (i < list.length) {
      const node = list[i];
      if (isAgentTextResponse(node)) {
        const myPlumbing = [...plumbingBuffer];
        plumbingBuffer = [];

        let j = i + 1;
        while (j < list.length && isPlumbing(list[j])) {
          myPlumbing.push(list[j]);
          j++;
        }
        i = j;

        html += renderSingleNode(node, depth, myPlumbing);
        lastAgentHadTools = myPlumbing.length > 0;
      } else if (isPlumbing(node)) {
        plumbingBuffer.push(node);
        i++;
      } else {
        if (plumbingBuffer.length > 0) {
          for (const p of plumbingBuffer) {
            html += renderPlumbingNode(p, depth);
          }
          plumbingBuffer = [];
        }
        html += renderSingleNode(node, depth, []);
        i++;
      }
    }
    // Remaining plumbing at end of chain — attach to last agent text
    // by re-rendering that agent with the extra plumbing, or render inline
    if (plumbingBuffer.length > 0) {
      // Render as dimmed inline — they're tail plumbing before branches
      for (const p of plumbingBuffer) {
        // Absorb into last agent text if possible: re-insert into HTML
        // Simpler: just don't render tail plumbing — its children
        // (branches or continuations) will be rendered below
      }
      plumbingBuffer = [];
    }

    // Render tail's children
    if (tail.visibleChildren.length > 1) {
      const isBranch = branchPoints.has(tail.uuid);
      if (isBranch) {
        html += `<div class="branch-container" style="margin-left:${(depth + 1) * INDENT_PX}px;">`;
        html += `<div class="branch-header">Branches</div>`;
        for (let i = 0; i < tail.visibleChildren.length; i++) {
          const child = tail.visibleChildren[i];
          const branchActive = isSubtreeActive(child);
          const branchClass = branchActive ? "active" : "orphaned";
          const defaultOpen = branchActive;
          html += `<div class="branch ${branchClass}">`;
          html += `<span class="toggle branch-toggle">${defaultOpen ? "[-]" : "[+]"}</span>`;
          html += `<span class="branch-label">&lt;branch ${i + 1}${branchActive ? " : active" : ""}&gt;</span>`;
          html += `<div class="branch-children" style="display:${defaultOpen ? "block" : "none"}">`;
          html += renderChain(child, depth + 2);
          html += `</div></div>\n`;
        }
        html += `</div>`;
      } else {
        // Not a branch point (e.g. parallel tool_use) — render all children
        for (const child of tail.visibleChildren) {
          html += renderChain(child, depth);
        }
      }
    }

    return html;
  }

  let bodyHtml = "";
  for (const root of visRoots) {
    bodyHtml += renderChain(root, 0);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>JSONL Tree: ${escapeHtml(basename(inputFile))}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 13px;
    background: #1a1a2e;
    color: #e0e0e0;
    padding: 20px;
    line-height: 1.6;
  }
  h1 {
    color: #7ecfff;
    font-size: 16px;
    margin-bottom: 8px;
  }
  .stats {
    color: #888;
    font-size: 12px;
    margin-bottom: 20px;
    border-bottom: 1px solid #333;
    padding-bottom: 10px;
  }
  .node {
    padding: 2px 4px;
    cursor: pointer;
    white-space: nowrap;
    border-radius: 3px;
  }
  .node:hover {
    background: #2a2a4e;
  }
  .node.orphaned {
    opacity: 0.5;
  }
  .node.orphaned:hover {
    opacity: 0.8;
  }
  .toggle {
    color: #7ecfff;
    font-weight: bold;
    user-select: none;
    display: inline-block;
    width: 24px;
  }
  .label {
    color: #e0e0e0;
  }
  .node.active > .label {
    color: #c8e6c9;
  }
  .node.orphaned > .label {
    color: #999;
  }
  .node.has-diff {
    opacity: 0.9 !important;
    background: rgba(255, 152, 0, 0.08);
    border-left: 3px solid #ff9800;
    padding-left: 8px;
  }
  .diff-badge {
    display: inline-block;
    background: #ff9800;
    color: #1a1a2e;
    font-size: 11px;
    font-weight: bold;
    padding: 0 6px;
    border-radius: 3px;
    margin-left: 8px;
  }
  .diff-container {
    margin: 4px 0;
  }
  .diff-view {
    background: #0d1117;
    border: 1px solid #333;
    border-radius: 4px;
    overflow-x: auto;
    margin: 4px 0;
    max-height: 500px;
    overflow-y: auto;
  }
  .diff-header {
    background: #161b22;
    color: #8b949e;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: bold;
    border-bottom: 1px solid #333;
  }
  .diff-hunk {
    border-bottom: 1px solid #21262d;
  }
  .diff-hunk:last-child {
    border-bottom: none;
  }
  .diff-line {
    font-size: 12px;
    line-height: 1.5;
    padding: 0 12px;
    white-space: pre;
  }
  .diff-line.diff-add {
    background: rgba(63, 185, 80, 0.15);
    color: #7ee787;
  }
  .diff-line.diff-del {
    background: rgba(248, 81, 73, 0.15);
    color: #ffa198;
  }
  .diff-line.diff-ctx {
    color: #8b949e;
  }
  .diff-line.diff-range {
    color: #6e7681;
    background: rgba(56, 139, 253, 0.1);
    padding: 4px 12px;
  }
  .diff-ln {
    display: inline-block;
    width: 40px;
    color: #484f58;
    text-align: right;
    margin-right: 8px;
    user-select: none;
  }
  .diff-text {
    white-space: pre;
  }
  .node.contains-diff {
    border-left: 3px solid #ff9800;
    padding-left: 8px;
  }
  .node.role-user-prompt {
    background: rgba(66, 165, 245, 0.1);
    border-left: 3px solid #42a5f5;
    padding-left: 8px;
  }
  .node.role-user-prompt > .label {
    color: #90caf9;
    font-weight: bold;
  }
  .node.role-user-prompt.orphaned > .label {
    color: #5a8ab5;
  }
  .node.role-assistant > .label {
    color: #b0bec5;
  }
  .node.role-assistant.active > .label {
    color: #cfd8dc;
  }
  .node.role-assistant.orphaned > .label {
    color: #78909c;
  }
  .node.role-tool-use,
  .node.role-user-tool-result {
    opacity: 0.45;
  }
  .node.role-tool-use:hover,
  .node.role-user-tool-result:hover {
    opacity: 0.75;
  }
  .node.role-tool-use > .label,
  .node.role-user-tool-result > .label {
    color: #90a4ae;
  }
  .node.role-tool-use.orphaned,
  .node.role-user-tool-result.orphaned {
    opacity: 0.25;
  }
  .node.role-system > .label {
    color: #616161;
    font-style: italic;
  }
  .node.role-system.active > .label {
    color: #757575;
  }
  .branch-container {
    border-left: 2px solid #444;
    padding-left: 8px;
    margin-top: 2px;
    margin-bottom: 2px;
  }
  .branch-header {
    color: #ff9800;
    font-weight: bold;
    font-size: 12px;
    margin: 4px 0 2px 0;
  }
  .branch {
    margin: 2px 0;
  }
  .branch-toggle {
    color: #ff9800;
    cursor: pointer;
    font-weight: bold;
    user-select: none;
    display: inline-block;
    width: 24px;
  }
  .branch-label {
    color: #ff9800;
    font-weight: bold;
  }
  .branch.active > .branch-label {
    color: #4caf50;
  }
  .branch.orphaned > .branch-label {
    color: #f44336;
  }
  .branch-children {
    margin-left: 20px;
  }
  .copy-btn {
    display: none;
    font-size: 11px;
    cursor: pointer;
    opacity: 0.4;
    margin-left: 4px;
    vertical-align: middle;
  }
  .copy-btn:hover {
    opacity: 1.0;
  }
  .node:hover .copy-btn {
    display: inline;
  }
  .copy-toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #4caf50;
    color: #fff;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 12px;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  }
  .copy-toast.show {
    opacity: 1;
  }
  .inspect-btn {
    display: none;
    font-size: 11px;
    cursor: pointer;
    opacity: 0.4;
    margin-left: 2px;
    color: #7ecfff;
    vertical-align: middle;
  }
  .inspect-btn:hover {
    opacity: 1.0;
  }
  .node:hover .inspect-btn {
    display: inline;
  }
  .inspect-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1000;
    display: none;
    justify-content: center;
    align-items: center;
  }
  .inspect-overlay.show {
    display: flex;
  }
  .inspect-panel {
    background: #0d1117;
    border: 1px solid #444;
    border-radius: 8px;
    max-width: 80vw;
    max-height: 80vh;
    overflow: auto;
    padding: 16px;
    position: relative;
  }
  .inspect-panel pre {
    color: #c9d1d9;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .inspect-close {
    position: absolute;
    top: 8px;
    right: 12px;
    color: #8b949e;
    cursor: pointer;
    font-size: 18px;
    font-weight: bold;
  }
  .inspect-close:hover {
    color: #fff;
  }
  .inspect-title {
    color: #7ecfff;
    font-size: 12px;
    margin-bottom: 8px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid #333;
  }
  .toolbar-btn {
    background: #2a2a4e;
    color: #7ecfff;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 12px;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .toolbar-btn:hover {
    background: #3a3a5e;
    border-color: #7ecfff;
  }
  .json-key { color: #79c0ff; }
  .json-string { color: #a5d6ff; }
  .json-number { color: #79c0ff; }
  .json-boolean { color: #ff7b72; }
  .json-null { color: #8b949e; }
</style>
</head>
<body>
<h1>JSONL Conversation Tree</h1>
<div class="toolbar">
  <button id="open-jsonl-btn" class="toolbar-btn">Open JSONL...</button>
  <span class="stats">
    File: <span id="stats-file">${escapeHtml(basename(inputFile))}</span> |
    Raw entries: ${tree.totalRawNodes} |
    Visible nodes: ${tree.totalVisNodes} |
    Branch points: ${tree.totalBranches} |
    Active leaf: ${tree.activeLeafUuid?.slice(0, 8) ?? "none"}
  </span>
</div>
<input type="file" id="jsonl-file-input" accept=".jsonl" style="display:none">
<div id="copy-toast" class="copy-toast"></div>
<div id="inspect-overlay" class="inspect-overlay">
  <div class="inspect-panel">
    <span class="inspect-close" id="inspect-close">&times;</span>
    <div class="inspect-title" id="inspect-title"></div>
    <pre id="inspect-content"></pre>
  </div>
</div>
<script src="${escapeHtml(basename(outputFile).replace(/\.html$/, "-data.js"))}"></script>
<div id="tree">
${bodyHtml}
</div>
<script>
function syntaxHighlight(json) {
  return json.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(match) {
    var cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

document.getElementById('tree').addEventListener('click', function(e) {
  const inspectBtn = e.target.closest('.inspect-btn');
  if (inspectBtn) {
    const uuid = inspectBtn.dataset.uuid;
    const overlay = document.getElementById('inspect-overlay');
    const title = document.getElementById('inspect-title');
    const content = document.getElementById('inspect-content');
    if (window.JSONL_RAW && window.JSONL_RAW[uuid]) {
      try {
        const parsed = JSON.parse(window.JSONL_RAW[uuid]);
        content.innerHTML = syntaxHighlight(JSON.stringify(parsed, null, 4));
      } catch(ex) {
        content.textContent = window.JSONL_RAW[uuid];
      }
    } else {
      content.textContent = '(not found in data file)';
    }
    title.textContent = 'UUID: ' + uuid;
    overlay.classList.add('show');
    return;
  }

  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) {
    const line = copyBtn.dataset.line;
    const uuid = copyBtn.dataset.uuid;
    const text = 'Line: ' + line + '  UUID: ' + uuid;
    navigator.clipboard.writeText(text).then(function() {
      const toast = document.getElementById('copy-toast');
      toast.textContent = 'Copied: ' + text;
      toast.classList.add('show');
      setTimeout(function() { toast.classList.remove('show'); }, 1500);
    });
    return;
  }

  const toggle = e.target.closest('.toggle');
  if (!toggle) return;

  const branch = toggle.closest('.branch');
  if (branch && toggle.classList.contains('branch-toggle')) {
    const children = branch.querySelector('.branch-children');
    if (children) {
      const isOpen = children.style.display !== 'none';
      children.style.display = isOpen ? 'none' : 'block';
      toggle.textContent = isOpen ? '[+]' : '[-]';
    }
    return;
  }

  const node = toggle.closest('.node');
  if (node) {
    const next = node.nextElementSibling;
    if (next && next.classList.contains('tool-children')) {
      const isOpen = next.style.display !== 'none';
      next.style.display = isOpen ? 'none' : 'block';
      toggle.textContent = isOpen ? '[+]' : '[-]';
    } else if (next && next.classList.contains('diff-container')) {
      const isOpen = next.style.display !== 'none';
      next.style.display = isOpen ? 'none' : 'block';
      toggle.textContent = isOpen ? '[+]' : '[-]';
    } else {
      const isOpen = toggle.textContent.trim() === '[-]';
      toggle.textContent = isOpen ? '[+]' : '[-]';
    }
  }
});
document.getElementById('inspect-close').addEventListener('click', function() {
  document.getElementById('inspect-overlay').classList.remove('show');
});
document.getElementById('inspect-overlay').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('show');
});
document.getElementById('open-jsonl-btn').addEventListener('click', function() {
  document.getElementById('jsonl-file-input').click();
});
document.getElementById('jsonl-file-input').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var text = ev.target.result;
    var lines = text.split('\\n');
    var newRaw = {};
    var count = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      try {
        var obj = JSON.parse(line);
        if (obj.uuid) {
          newRaw[obj.uuid] = line;
          count++;
        }
      } catch(ex) {}
    }
    window.JSONL_RAW = newRaw;
    document.getElementById('stats-file').textContent = file.name;
    var toast = document.getElementById('copy-toast');
    toast.textContent = 'Loaded ' + count + ' entries from ' + file.name + ' (inspect data updated, re-run generator for tree view)';
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 3000);
  };
  reader.readAsText(file);
});
</script>
</body>
</html>`;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(
      "Usage: npx tsx jsonl-tree-viewer.ts <input.jsonl> [output.html]"
    );
    process.exit(1);
  }

  const inputFile = args[0];
  const outputFile = args[1] ?? inputFile.replace(/\.jsonl$/, "-tree.html");

  console.log(`Parsing ${inputFile}...`);
  const entries = parseJSONL(inputFile);
  console.log(`  ${entries.length} total JSONL lines`);

  const tree = buildVisibleTree(entries);
  console.log(`  ${tree.totalRawNodes} linked entries`);
  console.log(`  ${tree.totalVisNodes} visible nodes`);
  console.log(`  ${tree.totalBranches} branch points (rewind events)`);
  console.log(`  Active leaf: ${tree.activeLeafUuid?.slice(0, 8) ?? "none"}`);

  const html = generateHTML(tree, inputFile, outputFile);
  writeFileSync(outputFile, html, "utf-8");

  // Generate sidecar data file with raw JSONL lines keyed by uuid
  const dataFile = outputFile.replace(/\.html$/, "-data.js");
  const rawMap: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.uuid && entry._rawLine) {
      rawMap[entry.uuid] = entry._rawLine;
    }
  }
  writeFileSync(
    dataFile,
    `window.JSONL_RAW = ${JSON.stringify(rawMap)};\n`,
    "utf-8"
  );

  console.log(`\nWrote ${outputFile}`);
  console.log(`Wrote ${dataFile} (${Object.keys(rawMap).length} entries)`);
}

main();
