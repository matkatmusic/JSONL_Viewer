// JFReD Diff: Filter mode for JSON lines view — show all, file only, edits only.
// In edits-only mode, lines get toggle buttons for multi-select + patch export.

import { state } from '../web-shared/jfred-state.js';

var selectedEdits = {};

function fetchAllLineRows() {
  var container = document.getElementById('alllines-view');
  return container ? container.querySelectorAll('.al-row') : [];
}

function highlightFileRelevantRows() {
  var rows = fetchAllLineRows();
  for (var i = 0; i < rows.length; i++) {
    var lineIdx = parseInt(rows[i].dataset.alidx, 10);
    var relevant = !isNaN(lineIdx) && state.stepLines[lineIdx] !== undefined;
    rows[i].classList.toggle('al-file-relevant', relevant);
  }
}

function restoreSegsAndChildren() {
  var container = document.getElementById('alllines-view');
  if (!container) { return; }
  var segs = container.querySelectorAll('.al-seg, .al-branch-pt, .al-branch-hdr');
  for (var j = 0; j < segs.length; j++) { segs[j].style.display = ''; }
  // Restore children to collapsed (their original rendered state)
  var children = container.querySelectorAll('.al-children');
  for (var k = 0; k < children.length; k++) { children[k].style.display = 'none'; }
}

function hideNonRelevantRows() {
  // Restore segment headers and collapse children (undo edits-only changes)
  restoreSegsAndChildren();
  var rows = fetchAllLineRows();
  for (var i = 0; i < rows.length; i++) {
    var lineIdx = parseInt(rows[i].dataset.alidx, 10);
    var relevant = !isNaN(lineIdx) && state.stepLines[lineIdx] !== undefined;
    rows[i].style.display = relevant ? '' : 'none';
    rows[i].classList.remove('al-edit-selected');
    var chk = rows[i].querySelector('.al-edit-chk');
    if (chk) { chk.remove(); }
  }
}

function showAllRows() {
  restoreSegsAndChildren();
  var rows = fetchAllLineRows();
  for (var i = 0; i < rows.length; i++) {
    rows[i].style.display = '';
    rows[i].classList.remove('al-edit-selected');
    var chk = rows[i].querySelector('.al-edit-chk');
    if (chk) { chk.remove(); }
  }
}

function isKeptEditStep(stepIdx) {
  var step = state.steps[stepIdx];
  if (!step) { return false; }
  if (step._raw === null) { return false; }
  return step.type === 'create' || step.type === 'update' || step.type === 'edit';
}

function addEditToggle(row, lineIdx) {
  if (row.querySelector('.al-edit-chk')) { return; }
  var chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.className = 'al-edit-chk';
  chk.checked = !!selectedEdits[lineIdx];
  chk.addEventListener('change', function(e) {
    e.stopPropagation();
    toggleEditSelection(lineIdx, chk.checked, row);
  });
  row.insertBefore(chk, row.firstChild);
}

function toggleEditSelection(lineIdx, checked, row) {
  if (checked) { selectedEdits[lineIdx] = true; }
  else { delete selectedEdits[lineIdx]; }
  row.classList.toggle('al-edit-selected', checked);
  updateExportButtons();
}

function updateExportButtons() {
  var count = Object.keys(selectedEdits).length;
  document.getElementById('export-patch-btn').disabled = count === 0;
  document.getElementById('copy-patch-btn').disabled = count === 0;
}

function hideNonEditRows() {
  selectedEdits = {};
  var container = document.getElementById('alllines-view');
  if (!container) { return; }
  // Hide segment headers, force children open with explicit 'block'
  var segs = container.querySelectorAll('.al-seg, .al-branch-pt, .al-branch-hdr');
  for (var j = 0; j < segs.length; j++) { segs[j].style.display = 'none'; }
  var children = container.querySelectorAll('.al-children');
  for (var k = 0; k < children.length; k++) { children[k].style.display = 'block'; }
  // Show only kept edit-step rows with toggle checkboxes
  var rows = fetchAllLineRows();
  for (var i = 0; i < rows.length; i++) {
    var lineIdx = parseInt(rows[i].dataset.alidx, 10);
    var stepIdx = !isNaN(lineIdx) ? state.stepLines[lineIdx] : undefined;
    var isEdit = stepIdx !== undefined && isKeptEditStep(stepIdx);
    rows[i].style.display = isEdit ? '' : 'none';
    if (isEdit) { addEditToggle(rows[i], lineIdx); }
  }
  updateExportButtons();
}

export function applyFilterMode() {
  var exportBar = document.getElementById('edit-export-bar');
  if (state.filterMode === 'edits-only') {
    hideNonEditRows();
    exportBar.style.display = '';
  } else {
    exportBar.style.display = 'none';
    selectedEdits = {};
    if (state.filterMode === 'file-only') { hideNonRelevantRows(); }
    else { showAllRows(); highlightFileRelevantRows(); }
  }
  document.getElementById('filter-mode-select').value = state.filterMode;
}

export function onFilterModeChange(mode) {
  state.filterMode = mode;
  applyFilterMode();
}

function getSelectedStepIndices() {
  var lines = Object.keys(selectedEdits).map(Number).sort(function(a, b) { return a - b; });
  var indices = [];
  for (var i = 0; i < lines.length; i++) {
    var si = state.stepLines[lines[i]];
    if (si !== undefined) { indices.push(si); }
  }
  return indices.sort(function(a, b) { return a - b; });
}

function buildPatchText() {
  var indices = getSelectedStepIndices();
  if (indices.length === 0) { return ''; }
  var oldest = indices[0];
  var newest = indices[indices.length - 1];
  var beforeState = oldest > 0 ? (state.steps[oldest - 1].actualState || state.steps[oldest - 1].contents || '') : (state.baseState || '');
  var afterState = state.steps[newest].actualState || state.steps[newest].contents || '';
  var filename = state.selectedFile || 'file';
  var aLines = beforeState.split('\n');
  var bLines = afterState.split('\n');
  var ops = computeLineDiff(aLines, bLines);
  return formatUnifiedPatch(filename, ops);
}

function formatUnifiedPatch(filename, ops) {
  var header = '--- a/' + filename + '\n+++ b/' + filename + '\n';
  var hunks = buildHunks(ops);
  return header + hunks;
}

function buildHunks(ops) {
  var lines = [];
  var aLine = 1, bLine = 1;
  var hunkAStart = 0, hunkBStart = 0;
  var hunkLines = [];

  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    if (op.type === 'keep') {
      if (hunkLines.length > 0) { hunkLines.push(' ' + op.text); }
      aLine++; bLine++;
    } else {
      if (hunkLines.length === 0) { hunkAStart = aLine; hunkBStart = bLine; }
      if (op.type === 'del') { hunkLines.push('-' + op.text); aLine++; }
      else if (op.type === 'add') { hunkLines.push('+' + op.text); bLine++; }
    }
  }
  if (hunkLines.length === 0) { return ''; }
  var aCount = 0, bCount = 0;
  for (var h = 0; h < hunkLines.length; h++) {
    var ch = hunkLines[h][0];
    if (ch === '-' || ch === ' ') { aCount++; }
    if (ch === '+' || ch === ' ') { bCount++; }
  }
  lines.push('@@ -' + hunkAStart + ',' + aCount + ' +' + hunkBStart + ',' + bCount + ' @@');
  for (var h = 0; h < hunkLines.length; h++) { lines.push(hunkLines[h]); }
  return lines.join('\n') + '\n';
}

export function exportPatch() {
  var patch = buildPatchText();
  if (!patch) { return; }
  var blob = new Blob([patch], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var basename = (state.selectedFile || 'file').split('/').pop().replace(/\.[^.]+$/, '');
  a.href = url;
  a.download = basename + '.patch';
  a.click();
  URL.revokeObjectURL(url);
}

export function copyPatch() {
  var patch = buildPatchText();
  if (!patch) { return; }
  navigator.clipboard.writeText(patch);
}
