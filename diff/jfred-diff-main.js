// JFReD Diff: Main wiring — load, file select, step nav, diff panes.

import { state } from '../web-shared/jfred-state.js';
import { parseAllLines, groupEditsByFile, buildStepLineMap, openFilePicker, loadFromPath } from '../web-shared/jfred-load-helpers.js';
import { adaptUnifiedSteps } from '../web-shared/jfred-adapter.js';
import { updateCurrentState, findNearestPrevStep, findNearestNextStep } from '../web-shared/jfred-viewer-panes.js';
import { renderFileContent } from '../web-shared/jfred-panes.js';
import { onJsonlLoaded, bindFilterEvents } from '../web-shared/jfred-filter.js';
import { renderAllLines, bindBranchViewEvents } from '../web-shared/jfred-alllines.js';
import { renderFileTree, highlightTreeFile } from './jfred-diff-tree.js';
import { resolveBaseState } from './jfred-diff-base.js';
import { applyFilterMode, onFilterModeChange, exportPatch, copyPatch } from './jfred-diff-filter-mode.js';

function onLoad(text, filePath) {
  state.jsonlText = text;
  state.allEdits = extractEditsFromJSONL(text);
  state.fileMap = groupEditsByFile(state.allEdits);
  state.parsedLines = parseAllLines(text);
  state.rewinds = analyzeJSONL(text).rewinds;
  state.branchViewId = 'alllines-view';

  renderFileTree(state.fileMap, 'file-tree-body', onFileSelected);

  document.getElementById('step-info').textContent = 'Loaded: ' + (filePath || '').split('/').pop();
  document.getElementById('alllines-view').innerHTML = '<div class="empty-state">Select a file from the tree.</div>';
  document.getElementById('filter-mode-select').disabled = false;
  onJsonlLoaded();
  clearAllPanes();

  var filePaths = Object.keys(state.fileMap);
  if (filePaths.length === 1) { onFileSelected(filePaths[0]); }
  else if (filePaths.length === 0) { renderAllLines(); }
}

function clearAllPanes() {
  document.getElementById('current-state-body').innerHTML = '<div class="no-data">(no file selected)</div>';
  document.getElementById('json-inspector-content').innerHTML = '';
  document.getElementById('base-state-body').innerHTML = '<div class="no-data">(no file selected)</div>';
  document.getElementById('diff-vs-base-body').innerHTML = '';
  document.getElementById('diff-vs-prev-body').innerHTML = '';
  document.getElementById('base-source-badge').textContent = '';
}

function onFileSelected(filePath) {
  if (!filePath || !state.fileMap[filePath]) { return; }
  state.selectedFile = filePath;
  highlightTreeFile(filePath, 'file-tree-body');

  var result = adaptUnifiedSteps(state.jsonlText, filePath);
  state.steps = result.steps;
  state.stepLines = result.stepLines;
  state.currentStep = state.steps.length > 0 ? 0 : -1;

  resolveAndSetBaseState(filePath);
  renderAllLines();
  applyFilterMode();
  renderBasePane();

  if (state.currentStep >= 0) { showStep(0); }
  else { clearAllPanes(); }
}

function resolveAndSetBaseState(filePath) {
  var base = resolveBaseState(state.parsedLines, filePath);
  state.baseState = base.content;
  state.baseSource = base.source;
  var badge = document.getElementById('base-source-badge');
  if (base.source !== 'empty') {
    badge.className = 'pane-badge badge-match';
    badge.textContent = base.source;
  } else {
    badge.className = 'pane-badge';
    badge.textContent = '';
  }
}

function renderBasePane() {
  var baseBody = document.getElementById('base-state-body');
  if (state.baseState) {
    baseBody.innerHTML = '<pre>' + renderFileContent(state.baseState) + '</pre>';
  } else {
    baseBody.innerHTML = '<div class="no-data">(no base state)</div>';
  }
}

function showNumberedJson(lineIdx) {
  var el = document.getElementById('json-inspector-content');
  if (!el) { return; }
  var obj = state.parsedLines[lineIdx];
  var pretty = obj ? JSON.stringify(obj, null, 4) : '(parse error)';
  var highlighted = syntaxHighlight(pretty);
  var lines = highlighted.split('\n');
  var html = '';
  for (var i = 0; i < lines.length; i++) {
    html += '<div class="pane-line"><span class="pane-line-num">' + (i + 1) + '</span>' + lines[i] + '</div>';
  }
  el.innerHTML = html;
}

export function showStep(idx) {
  if (idx < 0 || idx >= state.steps.length) { return; }
  state.currentStep = idx;
  var step = state.steps[idx];

  updateCurrentState(step, 'current-state-body');
  showNumberedJson(step.jsonl.line);
  updateNavButtons();
  updateDiffPanes(step, idx);

  document.getElementById('step-info').textContent =
    'Step ' + (idx + 1) + ' / ' + state.steps.length;

  highlightStepInAlllines(step);
}

function updateDiffPanes(step, idx) {
  var currentContent = step.actualState || step.contents || '';
  var baseContent = state.baseState || '';

  // Diff vs base
  var vsBaseEl = document.getElementById('diff-vs-base-body');
  var baseLines = baseContent.split('\n');
  var curLines = currentContent.split('\n');
  vsBaseEl.innerHTML = renderInlineDiff(lineDiff(baseLines, curLines));

  // Diff vs previous step
  var vsPrevEl = document.getElementById('diff-vs-prev-body');
  var prevContent = idx > 0
    ? (state.steps[idx - 1].actualState || state.steps[idx - 1].contents || '')
    : baseContent;
  var prevLines = prevContent.split('\n');
  vsPrevEl.innerHTML = renderInlineDiff(lineDiff(prevLines, curLines));
  var firstDiff = vsPrevEl.querySelector('.diff-add, .diff-del');
  if (firstDiff) { firstDiff.scrollIntoView({ block: 'nearest' }); }
}

function hasDivergence(step) {
  if (step.actualState === null || step.actualState === undefined) { return false; }
  return step.actualState !== step.expectedState;
}

function findNextStep(type, direction) {
  for (var i = state.currentStep + direction; i >= 0 && i < state.steps.length; i += direction) {
    if (type === 'divergence' && hasDivergence(state.steps[i])) { return i; }
    if (type === 'user' && state.steps[i].isUserEdit) { return i; }
  }
  return -1;
}

function updateNavButtons() {
  document.getElementById('prev-btn').disabled = state.currentStep <= 0;
  document.getElementById('next-btn').disabled = state.currentStep >= state.steps.length - 1;
  document.getElementById('jump-div-btn').disabled = findNextStep('divergence', 1) < 0;
  document.getElementById('jump-user-btn').disabled = findNextStep('user', 1) < 0;
}

function highlightStepInAlllines(step) {
  if (!step || !step.jsonl) { return; }
  var row = document.querySelector('[data-alidx="' + step.jsonl.line + '"]');
  if (!row) { return; }
  var container = document.getElementById('alllines-view');
  var rows = container.querySelectorAll('.al-row');
  for (var i = 0; i < rows.length; i++) { rows[i].classList.remove('al-active'); }
  row.classList.add('al-active');
  row.scrollIntoView({ block: 'nearest' });
}

function onNonStepLineClick(lineIdx) {
  var prevIdx = findNearestPrevStep(lineIdx);
  var nextIdx = findNearestNextStep(lineIdx);
  var nearestIdx = prevIdx >= 0 ? prevIdx : nextIdx;

  if (nearestIdx >= 0) {
    var step = state.steps[nearestIdx];
    updateCurrentState(step, 'current-state-body');
    state.currentStep = nearestIdx;
    updateDiffPanes(step, nearestIdx);
    appendJumpButton(nearestIdx);
  }

  showNumberedJson(lineIdx);
  document.getElementById('step-info').textContent =
    'Line ' + (lineIdx + 1) + ' / ' + state.parsedLines.length;
}

function appendJumpButton(stepIdx) {
  var body = document.getElementById('current-state-body');
  if (!body) { return; }
  var existing = body.querySelector('.jump-to-step-btn');
  if (existing) { existing.remove(); }
  var btn = document.createElement('button');
  btn.className = 'toolbar-btn jump-to-step-btn';
  btn.textContent = 'Jump to Step ' + (stepIdx + 1);
  btn.addEventListener('click', function() { showStep(stepIdx); });
  body.insertBefore(btn, body.firstChild);
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

document.getElementById('open-btn').addEventListener('click', function() {
  openFilePicker(onLoad, 'jfred-diff-picker');
});

document.getElementById('load-path-btn').addEventListener('click', function() {
  loadFromPath(document.getElementById('path-input').value.trim(), onLoad);
});

document.getElementById('path-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { loadFromPath(this.value.trim(), onLoad); }
});

document.getElementById('prev-btn').addEventListener('click', function() {
  if (state.currentStep > 0) { showStep(state.currentStep - 1); }
});

document.getElementById('next-btn').addEventListener('click', function() {
  if (state.currentStep < state.steps.length - 1) { showStep(state.currentStep + 1); }
});

document.getElementById('jump-div-btn').addEventListener('click', function() {
  var target = findNextStep('divergence', 1);
  if (target >= 0) { showStep(target); }
});

document.getElementById('jump-user-btn').addEventListener('click', function() {
  var target = findNextStep('user', 1);
  if (target >= 0) { showStep(target); }
});

document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT') { return; }
  if (e.key === 'ArrowLeft' && state.currentStep > 0) { showStep(state.currentStep - 1); }
  if (e.key === 'ArrowRight' && state.currentStep < state.steps.length - 1) { showStep(state.currentStep + 1); }
});

bindBranchViewEvents('alllines-view', showStep, onNonStepLineClick);
bindFilterEvents();

// After [+] expands in a filtered mode, reveal all child rows so user sees full context.
// handleToggle (in jfred-alllines.js) runs first via bindBranchViewEvents; this runs second.
document.getElementById('alllines-view').addEventListener('click', function(e) {
  if (!e.target.closest('.al-toggle') || state.filterMode === 'all') { return; }
  var parent = e.target.closest('.al-seg, .al-branch-hdr');
  if (!parent) { return; }
  var children = parent.nextElementSibling;
  if (!children || !children.classList.contains('al-children')) { return; }
  if (children.style.display === 'none') { return; }
  var rows = children.querySelectorAll('.al-row');
  for (var i = 0; i < rows.length; i++) { rows[i].style.display = ''; }
});

document.getElementById('filter-mode-select').addEventListener('change', function() {
  onFilterModeChange(this.value);
});
document.getElementById('export-patch-btn').addEventListener('click', exportPatch);
document.getElementById('copy-patch-btn').addEventListener('click', copyPatch);

// ─── Hint bar ─────────────────────────────────────────────────────────────────

var PANE_HINTS = {
  'alllines-pane': 'Select edits in Edits Only mode to show a combined diff and export as a single patch.',
  'file-tree-pane': 'Click a file to see its reconstruction steps and diffs.',
  'current-state-body': 'File content at the selected step. Use arrow keys or nav buttons to step through.',
  'json-inspector-content': 'Raw JSON for the selected line. Click jump links to navigate to related lines.',
  'diff-vs-base-body': 'Cumulative diff from the conversation start state to the current step.',
  'diff-vs-prev-body': 'Incremental diff from the previous step to the current step.'
};

var hintBar = document.getElementById('hint-bar');
Object.keys(PANE_HINTS).forEach(function(id) {
  var el = document.getElementById(id);
  if (!el) { return; }
  el.addEventListener('mouseenter', function() { hintBar.textContent = PANE_HINTS[id]; });
  el.addEventListener('mouseleave', function() { hintBar.textContent = ''; });
});

// Auto-load from ?file= URL param
(function() {
  var params = new URLSearchParams(window.location.search);
  var fileUrl = params.get('file');
  if (!fileUrl) { return; }
  fileUrl = fileUrl.replace(/^["']|["']$/g, '');
  if (!fileUrl) { return; }
  document.getElementById('path-input').value = fileUrl;
  document.getElementById('path-bar').classList.add('visible');
  loadFromPath(fileUrl, onLoad);
})();
