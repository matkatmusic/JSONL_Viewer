// File loading, syntax highlighting, and filter bar.
function syntaxHighlight(json) {
  var tId = 0;
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(m) {
    var c = 'json-number';
    if (/^"/.test(m)) {
      if (/:$/.test(m)) {
        c = /^"type"\s*:/.test(m) ? 'json-type-key' : 'json-key';
      } else {
        c = 'json-string';
        if (m.length > 300) {
          var id = 'trunc-' + (tId++);
          var preview = esc(m.slice(0, 80)) + '…"';
          var full = esc(m);
          return '<span class="json-string json-truncated">' +
            '<span class="trunc-short" id="ts-' + id + '">' + preview +
            '<span class="trunc-btn" data-trunc="' + id + '"> [expand...]</span></span>' +
            '<span class="trunc-full" id="tf-' + id + '" style="display:none;">' + full +
            '<span class="trunc-btn" data-trunc="' + id + '"> [collapse]</span></span></span>';
        }
      }
    }
    else if (/true|false/.test(m)) c = 'json-boolean';
    else if (/null/.test(m)) c = 'json-null';
    return '<span class="' + c + '">' + m + '</span>';
  });
}

function showToast(msg, duration) {
  var t = document.getElementById('copy-toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, duration || 1500);
}

function loadJSONL(text, fileName) {
  LAST_TEXT = text; LAST_FILE = fileName;
  document.getElementById('show-all-btn').disabled = false;
  var lines = text.split('\n');
  var entries = []; JSONL_RAW = {}; JSONL_UUIDS = []; TOOL_ID_TO_UUIDS = {}; FIELD_INDEX = {};

  function collectKeys(val, uuid) {
    if (!val || typeof val !== 'object') return;
    if (Array.isArray(val)) {
      for (var ai = 0; ai < val.length; ai++) collectKeys(val[ai], uuid);
      return;
    }
    var ks = Object.keys(val);
    for (var ki = 0; ki < ks.length; ki++) {
      var k = ks[ki];
      if (!FIELD_INDEX[k]) FIELD_INDEX[k] = [];
      var arr = FIELD_INDEX[k];
      if (arr.length === 0 || arr[arr.length - 1] !== uuid) arr.push(uuid);
      collectKeys(val[k], uuid);
    }
  }

  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i].trim();
    if (!ln) continue;
    try {
      var obj = JSON.parse(ln);
      obj._rawLine = ln;
      entries.push(obj);
      if (obj.uuid) {
        JSONL_RAW[obj.uuid] = ln;
        JSONL_UUIDS.push(obj.uuid);
        collectKeys(obj, obj.uuid);
        var content = obj.message && obj.message.content;
        if (Array.isArray(content)) {
          for (var ci = 0; ci < content.length; ci++) {
            var block = content[ci];
            var tid = null;
            if (block.type === 'tool_use' && block.id) tid = block.id;
            else if (block.type === 'tool_result' && block.tool_use_id) tid = block.tool_use_id;
            if (tid) {
              if (!TOOL_ID_TO_UUIDS[tid]) TOOL_ID_TO_UUIDS[tid] = [];
              TOOL_ID_TO_UUIDS[tid].push(obj.uuid);
            }
          }
        }
      }
    } catch(e) {}
  }

  try {
    var tree = buildVisibleTree(entries);
    var html = renderTree(tree);

    document.getElementById('tree').innerHTML = html;
    cmpSel = []; cmpType = null;
    decorateCompareCheckboxes();
    document.getElementById('stats').innerHTML =
      'File: ' + esc(fileName) + ' | Raw: ' + tree.totalRawNodes +
      ' | Visible: ' + tree.totalVisNodes + ' | Branches: ' + tree.totalBranches +
      ' | Leaf: ' + (tree.activeLeafUuid ? tree.activeLeafUuid.slice(0,8) : 'none');

    showToast('Loaded ' + entries.length + ' entries from ' + fileName, 2000);
    buildFilterBar();
  } catch(err) {
    document.getElementById('tree').innerHTML = '<div class="empty-state" style="color:#f44336;">Error: ' + esc(err.message) + '<br><pre style="text-align:left;margin-top:10px;font-size:11px;color:#999;">' + esc(err.stack || '') + '</pre></div>';
  }
}

function buildFilterBar() {
  var bar = document.getElementById('filter-bar');
  var search = document.getElementById('filter-search');
  var chips = bar.querySelectorAll('.filter-chip');
  for (var i = chips.length - 1; i >= 0; i--) bar.removeChild(chips[i]);

  for (var p = 0; p < PRESET_FIELDS.length; p++) {
    var field = PRESET_FIELDS[p];
    var count = FIELD_INDEX[field] ? FIELD_INDEX[field].length : 0;
    var chip = document.createElement('button');
    chip.className = 'filter-chip';
    chip.dataset.field = field;
    chip.innerHTML = field + '<span class="chip-count' + (count > 0 ? ' has-matches' : '') + '">' + count + '</span>';
    if (count === 0) chip.style.opacity = '0.35';
    bar.insertBefore(chip, search);
  }

  activeFilter = null;
  activeFilterMatches = [];
  activeFilterPos = -1;
  document.getElementById('filter-pos').textContent = '';
  bar.classList.add('visible');
}

function jumpToField(field, direction) {
  var matches = FIELD_INDEX[field];
  if (!matches || matches.length === 0) { showToast('No entries with "' + field + '"', 1500); return; }

  if (field !== activeFilter) {
    activeFilter = field;
    activeFilterMatches = matches;
    activeFilterPos = -1;
    var chips = document.querySelectorAll('.filter-chip');
    for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('active', chips[i].dataset.field === field);
  }

  if (direction === 'prev') {
    activeFilterPos = activeFilterPos <= 0 ? matches.length - 1 : activeFilterPos - 1;
  } else {
    activeFilterPos = activeFilterPos >= matches.length - 1 ? 0 : activeFilterPos + 1;
  }

  var uuid = matches[activeFilterPos];
  var idx = JSONL_UUIDS.indexOf(uuid);
  document.getElementById('filter-pos').textContent = (activeFilterPos + 1) + '/' + matches.length;
  if (idx >= 0) showInspect(idx);
}
