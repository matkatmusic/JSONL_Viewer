// JFReD Unified: Loading, file selection, engine toggle, event wiring.

import { state } from '../web-shared/jfred-state.js';
import { renderAllLines, bindBranchViewEvents } from '../web-shared/jfred-alllines.js';
import { clearPanes, updatePanes } from '../web-shared/jfred-panes.js';
import { adaptUnifiedSteps } from '../web-shared/jfred-adapter.js';
import { updateCurrentState, updateStepInspector, showNonStepLine } from '../web-shared/jfred-viewer-panes.js';
import { onJsonlLoaded, bindFilterEvents } from '../web-shared/jfred-filter.js';
import { parseAllLines, groupEditsByFile, buildStepLineMap, openFilePicker, loadFromPath } from '../web-shared/jfred-load-helpers.js';

function populateFileSelect(fileMap) {
  var sel = document.getElementById('file-select');
  var paths = Object.keys(fileMap).sort();
  sel.innerHTML = '<option value="">-- select file (' + paths.length + ' files) --</option>';
  for (var i = 0; i < paths.length; i++) {
    var opt = document.createElement('option');
    opt.value = paths[i];
    var basename = paths[i].split('/').pop();
    opt.textContent = basename + ' (' + fileMap[paths[i]].length + ' edits)';
    opt.title = paths[i];
    sel.appendChild(opt);
  }
  sel.disabled = false;
}

function onLoad(text, filePath) {
  state.jsonlText = text;
  state.allEdits = extractEditsFromJSONL(text);
  state.fileMap = groupEditsByFile(state.allEdits);
  state.parsedLines = parseAllLines(text);
  state.rewinds = analyzeJSONL(text).rewinds;
  state.branchViewId = 'branch-view';
  populateFileSelect(state.fileMap);
  document.getElementById('path-input').value = filePath || '';
  document.getElementById('step-info').textContent = 'Loaded: ' + (filePath || '').split('/').pop();
  document.getElementById('branch-view').innerHTML = '<div class="empty-state">Select a file from the dropdown.</div>';
  document.getElementById('engine-toggle').disabled = false;
  onJsonlLoaded();
  clearPanes();
}

export function showStep(idx) {
  if (idx < 0 || idx >= state.steps.length) { return; }
  state.currentStep = idx;
  var step = state.steps[idx];
  updateCurrentState(step);
  updateStepInspector(step);
  updatePanes();
  var info = document.getElementById('step-info');
  info.textContent = 'Step ' + (idx + 1) + ' / ' + state.steps.length;
  updateNavButtons();
}

function updateNavButtons() {
  document.getElementById('prev-btn').disabled = state.currentStep <= 0;
  document.getElementById('next-btn').disabled = state.currentStep >= state.steps.length - 1;
}

function selectFileOldEngine(filePath) {
  state.steps = buildFileStateHistory(state.fileMap[filePath]);
  state.stepLines = buildStepLineMap(state.steps);
}

function selectFileUnifiedEngine(filePath) {
  var result = adaptUnifiedSteps(state.jsonlText, filePath);
  state.steps = result.steps;
  state.stepLines = result.stepLines;
}

function selectFile(filePath) {
  if (!filePath || !state.fileMap[filePath]) { return; }
  state.selectedFile = filePath;
  if (state.engine === 'unified') { selectFileUnifiedEngine(filePath); }
  else { selectFileOldEngine(filePath); }
  state.currentStep = state.steps.length > 0 ? 0 : -1;
  renderAllLines();
  if (state.currentStep >= 0) { showStep(0); }
}

function toggleEngine() {
  state.engine = state.engine === 'old' ? 'unified' : 'old';
  var btn = document.getElementById('engine-toggle');
  btn.textContent = 'Engine: ' + (state.engine === 'unified' ? 'Unified' : 'Old');
  btn.classList.toggle('engine-toggle-unified', state.engine === 'unified');
  if (state.selectedFile) { selectFile(state.selectedFile); }
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

document.getElementById('open-btn').addEventListener('click', function() {
  openFilePicker(onLoad, 'jfred-unified-picker');
});

document.getElementById('load-path-btn').addEventListener('click', function() {
  loadFromPath(document.getElementById('path-input').value.trim(), onLoad);
});

document.getElementById('path-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { loadFromPath(this.value.trim(), onLoad); }
});

document.getElementById('file-select').addEventListener('change', function() {
  selectFile(this.value);
});

document.getElementById('engine-toggle').addEventListener('click', toggleEngine);

document.getElementById('prev-btn').addEventListener('click', function() {
  if (state.currentStep > 0) { showStep(state.currentStep - 1); }
});

document.getElementById('next-btn').addEventListener('click', function() {
  if (state.currentStep < state.steps.length - 1) { showStep(state.currentStep + 1); }
});

document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT') { return; }
  if (e.key === 'ArrowLeft') { if (state.currentStep > 0) { showStep(state.currentStep - 1); } }
  if (e.key === 'ArrowRight') { if (state.currentStep < state.steps.length - 1) { showStep(state.currentStep + 1); } }
});

bindBranchViewEvents('branch-view', showStep, showNonStepLine);
bindFilterEvents();

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
