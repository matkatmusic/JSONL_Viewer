// Node inspection panel: type detection, reveal, checkboxes, single-line inspect.
function detectNodeType(el) {
  if (!el) return null;
  var m = el.className.match(/\brole-[\w-]+/);
  return m ? m[0] : null;
}

function revealNode(uuid) {
  var target = document.querySelector('.node[data-uuid="' + uuid + '"]');
  if (!target) return null;
  var el = target.parentElement;
  while (el && el.id !== 'tree') {
    if (el.style.display === 'none') {
      el.style.display = 'block';
      var toggle = el.previousElementSibling && el.previousElementSibling.querySelector('.toggle, .branch-toggle');
      if (toggle) toggle.textContent = '[-]';
    }
    el = el.parentElement;
  }
  return target;
}

function decorateCompareCheckboxes() {
  var nodes = document.querySelectorAll('#tree .node[data-uuid]');
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var uuid = n.getAttribute('data-uuid');
    if (!JSONL_RAW[uuid] || n.querySelector('.cmp-chk')) continue;
    var wrap = document.createElement('span');
    wrap.className = 'cmp-chk-wrap';
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'cmp-chk';
    chk.setAttribute('data-uuid', uuid);
    chk.title = 'Select to inspect; select a 2nd same-type row to diff';
    wrap.appendChild(chk);
    n.insertBefore(wrap, n.firstChild);
  }
}

function showInspect(idx) {
  if (idx < 0 || idx >= JSONL_UUIDS.length) return;
  inspectIndex = idx;
  var uuid = JSONL_UUIDS[idx];
  var content = document.getElementById('inspect-content');
  if (JSONL_RAW[uuid]) {
    try {
      var highlighted = highlightJsonSyntax(JSON.stringify(JSON.parse(JSONL_RAW[uuid]), null, 4));
      highlighted = highlighted.replace(/"(toolu_[A-Za-z0-9_]+)"/g, function(full, toolId) {
        var targets = TOOL_ID_TO_UUIDS[toolId];
        if (!targets) return full;
        var otherUuid = null;
        for (var t = 0; t < targets.length; t++) {
          if (targets[t] !== uuid) { otherUuid = targets[t]; break; }
        }
        if (!otherUuid) return full;
        return '"<span class="tool-link" data-target-uuid="' + otherUuid + '" title="Jump to paired entry">' + toolId + '</span>"';
      });
      highlighted = highlighted.replace(/("parentUuid":\s*<\/span>\s*<span class="json-string">)"([0-9a-f-]{36})"/g, function(full, prefix, uid) {
        if (!JSONL_RAW[uid]) return full;
        return prefix + '"<span class="tool-link" data-target-uuid="' + uid + '" title="Jump to parent">' + uid + '</span>"';
      });
      highlighted = highlighted.replace(/<span class="json-key">"originalFile":/g, '<span class="json-type-key">"originalFile":');
      highlighted = highlighted.replace(/<span class="json-key">"(old_string|new_string)":/g, function(full, key) {
        var cls = key === 'old_string' ? 'json-key-old' : 'json-key-new';
        return '<span class="json-key ' + cls + '">"' + key + '":';
      });
      highlighted = highlighted.replace(/<span class="json-string">"([+-])/g, function(full, pfx) {
        var cls = pfx === '-' ? 'json-string-del' : 'json-string-add';
        return '<span class="json-string ' + cls + '">"' + pfx;
      });
      content.innerHTML = highlighted;
    }
    catch(ex) { content.textContent = JSONL_RAW[uuid]; }
  } else { content.textContent = '(not found)'; }
  document.getElementById('inspect-title').textContent = 'UUID: ' + uuid.slice(0,8);
  document.getElementById('inspect-pos').textContent = (idx + 1) + ' / ' + JSONL_UUIDS.length;
  document.getElementById('inspect-prev').disabled = idx === 0;
  document.getElementById('inspect-next').disabled = idx === JSONL_UUIDS.length - 1;
  document.getElementById('diff-controls').classList.remove('show');
  document.getElementById('inspect-pos').style.display = '';
  document.getElementById('inspect-prev').style.display = '';
  document.getElementById('inspect-next').style.display = '';

  var prev = document.querySelector('.node.inspected');
  if (prev) prev.classList.remove('inspected');
  var target = revealNode(uuid);
  if (target) {
    target.classList.add('inspected');
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  var panel = document.getElementById('inspect-panel');
  if (!panel.classList.contains('show')) {
    panel.classList.add('show');
    document.getElementById('tree').style.paddingBottom = '38vh';
  }
}
