// Event handlers (except open-jsonl-btn and jsonl-file-input which stay inline in HTML).
document.getElementById('filter-bar').addEventListener('click', function(e) {
  var chip = e.target.closest('.filter-chip');
  if (!chip) return;
  jumpToField(chip.dataset.field);
});

document.getElementById('filter-search').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var field = this.value.trim();
    if (field) jumpToField(field);
  }
});

document.getElementById('show-all-btn').addEventListener('click', function() {
  if (!LAST_TEXT) return;
  SHOW_ALL = !SHOW_ALL;
  this.classList.toggle('active', SHOW_ALL);
  this.textContent = SHOW_ALL ? 'Showing All Nodes' : 'Show All Nodes';
  resetCompare();
  closeInspectPanel();
  loadJSONL(LAST_TEXT, LAST_FILE);
});

document.getElementById('tree').addEventListener('change', function(e) {
  var chk = e.target.closest('.cmp-chk');
  if (!chk) return;
  var uuid = chk.getAttribute('data-uuid');
  if (chk.checked) {
    if (cmpSel.length >= 2) { chk.checked = false; return; }
    cmpSel.push(uuid);
    if (cmpSel.length === 1) {
      cmpType = nodeTypeOf(chk.closest('.node'));
      applyTypeGate();
      revealMatching();
      showInspect(JSONL_UUIDS.indexOf(uuid));
    } else {
      showDiff(cmpSel[0], cmpSel[1]);
    }
  } else {
    var pos = cmpSel.indexOf(uuid);
    if (pos >= 0) cmpSel.splice(pos, 1);
    if (cmpSel.length === 1) {
      showInspect(JSONL_UUIDS.indexOf(cmpSel[0]));
    } else if (cmpSel.length === 0) {
      cmpType = null;
      clearTypeGate();
      closeInspectPanel();
    }
  }
});

document.getElementById('diff-mode-sxs').addEventListener('click', function() {
  if (cmpSel.length === 2) { diffMode = 'sxs'; showDiff(cmpSel[0], cmpSel[1]); }
});
document.getElementById('diff-mode-inline').addEventListener('click', function() {
  if (cmpSel.length === 2) { diffMode = 'inline'; showDiff(cmpSel[0], cmpSel[1]); }
});

document.getElementById('tree').addEventListener('click', function(e) {
  var cb = e.target.closest('.copy-btn');
  if (cb) {
    var text = 'Line: ' + cb.dataset.line + '  UUID: ' + cb.dataset.uuid;
    navigator.clipboard.writeText(text).then(function() { showToast('Copied: ' + text); });
    return;
  }

  var toggle = e.target.closest('.toggle');
  if (!toggle) return;

  var branch = toggle.closest('.branch');
  if (branch && toggle.classList.contains('branch-toggle')) {
    var ch = branch.querySelector('.branch-children');
    if (ch) { var open = ch.style.display !== 'none'; ch.style.display = open ? 'none' : 'block'; toggle.textContent = open ? '[+]' : '[-]'; }
    return;
  }

  var node = toggle.closest('.node');
  if (node) {
    var next = node.nextElementSibling;
    if (next && (next.classList.contains('tool-children') || next.classList.contains('diff-container'))) {
      var open = next.style.display !== 'none';
      next.style.display = open ? 'none' : 'block';
      toggle.textContent = open ? '[+]' : '[-]';
    } else {
      toggle.textContent = toggle.textContent.trim() === '[-]' ? '[+]' : '[-]';
    }
  }
});

document.getElementById('inspect-content').addEventListener('click', function(e) {
  var link = e.target.closest('.tool-link');
  if (link) {
    var targetUuid = link.dataset.targetUuid;
    var idx = JSONL_UUIDS.indexOf(targetUuid);
    if (idx >= 0) showInspect(idx);
    return;
  }
  var btn = e.target.closest('.trunc-btn');
  if (!btn) return;
  var id = btn.dataset.trunc;
  var short = document.getElementById('ts-' + id);
  var full = document.getElementById('tf-' + id);
  if (short && full) {
    var isShort = short.style.display !== 'none';
    short.style.display = isShort ? 'none' : '';
    full.style.display = isShort ? '' : 'none';
  }
});

document.getElementById('inspect-close').addEventListener('click', function() {
  resetCompare();
  closeInspectPanel();
});
document.getElementById('inspect-prev').addEventListener('click', function() {
  if (inspectIndex > 0) showInspect(inspectIndex - 1);
});
document.getElementById('inspect-next').addEventListener('click', function() {
  if (inspectIndex < JSONL_UUIDS.length - 1) showInspect(inspectIndex + 1);
});
document.addEventListener('keydown', function(e) {
  var panel = document.getElementById('inspect-panel');
  if (!panel.classList.contains('show')) return;
  if (e.key === 'Escape') { document.getElementById('inspect-close').click(); return; }
  if (document.getElementById('diff-controls').classList.contains('show')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); if (inspectIndex > 0) showInspect(inspectIndex - 1); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); if (inspectIndex < JSONL_UUIDS.length - 1) showInspect(inspectIndex + 1); }
});

document.body.addEventListener('dragover', function(e) { e.preventDefault(); });
document.body.addEventListener('drop', function(e) {
  e.preventDefault();
  var file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.jsonl')) {
    var reader = new FileReader();
    reader.onload = function(ev) { loadJSONL(ev.target.result, file.name); };
    reader.readAsText(file);
  }
});

(function autoLoadFromQuery() {
  var params = new URLSearchParams(window.location.search);
  var fileUrl = params.get('file');
  if (!fileUrl) return;
  document.getElementById('tree').innerHTML =
    '<div class="empty-state">Loading ' + esc(fileUrl) + '...</div>';
  fetch(fileUrl)
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText);
      return r.text();
    })
    .then(function(text) {
      var name = fileUrl.split('/').pop() || fileUrl;
      loadJSONL(text, name);
    })
    .catch(function(err) {
      document.getElementById('tree').innerHTML =
        '<div class="empty-state" style="color:#f44336;">' +
        'Failed to auto-load <code>' + esc(fileUrl) + '</code>:<br>' +
        esc(err.message) + '</div>';
    });
})();
