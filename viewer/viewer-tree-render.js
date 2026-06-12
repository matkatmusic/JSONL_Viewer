// Renders the visible tree as HTML.
function renderTree(tree) {
  var bp = tree.branchPoints;
  var ap = tree.activePath;

  function label(node) {
    var t = node.entryType;
    var r = t === 'user' ? 'User' : t === 'assistant' ? 'Agent' : t === 'system' ? 'System'
          : (t.charAt(0).toUpperCase() + t.slice(1));  // e.g. attachment -> "Attachment"
    var side = node.isSidechain ? ' [sidechain]' : '';
    return r + side + ': ' + esc(node.contentSummary.slice(0,80));
  }

  function roleClass(node) {
    var isUP = node.entryType === 'user' && node.contentSummary.indexOf('tool_result') !== 0;
    var isTR = node.entryType === 'user' && node.contentSummary.indexOf('tool_result') === 0;
    var isTU = node.entryType === 'assistant' && node.contentSummary.indexOf('tool_use:') === 0;
    return isUP ? 'role-user-prompt' : isTR ? 'role-user-tool-result' : isTU ? 'role-tool-use' : 'role-' + node.entryType;
  }

  function isSubtreeActive(node) {
    if (ap[node.uuid]) return true;
    for (var i = 0; i < node.visibleChildren.length; i++) {
      if (isSubtreeActive(node.visibleChildren[i])) return true;
    }
    return false;
  }

  function btns(node) {
    return '<span class="node-actions">' +
           '<span class="copy-btn" data-line="'+node.lineIndex+'" data-uuid="'+node.uuid+'" title="Line '+node.lineIndex+' / '+node.uuid.slice(0,8)+'">&#x1f4cb;</span>' +
           '</span>';
  }

  function renderDiff(data) {
    var h = '<div class="diff-view"><div class="diff-header">' + esc(data.filePath.split('/').pop()) + ' (' + data.opType + ')</div>';
    if (data.opType === 'create' && data.content) {
      h += '<div class="diff-hunk">';
      var lines = data.content.split('\n');
      for (var i = 0; i < lines.length; i++) {
        h += '<div class="diff-line diff-add"><span class="diff-text">+' + esc(lines[i]) + '</span></div>';
      }
      h += '</div>';
    } else {
      for (var hi = 0; hi < data.hunks.length; hi++) {
        var hunk = data.hunks[hi];
        h += '<div class="diff-hunk"><div class="diff-line diff-range">@@ -' + hunk.oldStart + (hunk.oldLines !== undefined ? ','+hunk.oldLines : '') + ' +' + hunk.newStart + (hunk.newLines !== undefined ? ','+hunk.newLines : '') + ' @@</div>';
        for (var li = 0; li < hunk.lines.length; li++) {
          var ln = hunk.lines[li];
          var pfx = ln[0], txt = ln.slice(1);
          var cls = pfx === '+' ? 'diff-add' : pfx === '-' ? 'diff-del' : 'diff-ctx';
          h += '<div class="diff-line ' + cls + '"><span class="diff-text">' + esc(pfx + txt) + '</span></div>';
        }
        h += '</div>';
      }
    }
    h += '</div>';
    return h;
  }

  function attachFlat(node) {
    var out = [];
    function walk(n) { out.push(n); for (var i = 0; i < n.visibleChildren.length; i++) walk(n.visibleChildren[i]); }
    var ak = node.attachKids || [];
    for (var i = 0; i < ak.length; i++) walk(ak[i]);
    return out;
  }

  function renderPlumbing(node, depth) {
    var ac = ap[node.uuid] ? 'active' : 'orphaned';
    var rc = roleClass(node);
    var dc = node.hasDiff ? ' has-diff' : '';
    var fn = node.diffFile ? node.diffFile.split('/').pop() : '';
    var lb = node.hasDiff
      ? esc(node.contentSummary.slice(0,40)) + ' <span class="diff-badge">&Delta; ' + esc(fn) + '</span>'
      : label(node);
    var af = attachFlat(node);
    var hasTool = af.length > 0;
    var h = '<div class="node ' + ac + ' ' + rc + dc + (hasTool ? ' has-tool-children' : '') + '" style="margin-left:' + (depth*INDENT_PX) + 'px;" data-uuid="' + node.uuid + '"><span class="toggle">[+]</span> <span class="label">' + lb + '</span>' + btns(node) + '</div>\n';
    if (node.diffData) {
      h += '<div class="diff-container" style="display:none;margin-left:' + ((depth+1)*INDENT_PX) + 'px;">' + renderDiff(node.diffData) + '</div>\n';
    }
    if (hasTool) {
      h += '<div class="tool-children" style="display:none;margin-left:' + ((depth+1)*INDENT_PX) + 'px;">';
      for (var i = 0; i < af.length; i++) h += renderPlumbing(af[i], 0);
      h += '</div>\n';
    }
    return h;
  }

  function renderSingle(node, depth, plumbing) {
    plumbing = plumbing.concat(attachFlat(node));
    var ac = ap[node.uuid] ? 'active' : 'orphaned';
    var rc = roleClass(node);
    var hasTool = plumbing.length > 0;
    var containsDiff = false;
    var diffFiles = [];
    for (var i = 0; i < plumbing.length; i++) {
      if (plumbing[i].hasDiff) {
        containsDiff = true;
        diffFiles.push(plumbing[i].diffFile ? plumbing[i].diffFile.split('/').pop() : '');
      }
    }
    var di = containsDiff ? ' <span class="diff-badge">&Delta; ' + esc(diffFiles.join(', ')) + '</span>' : '';
    var h = '<div class="node ' + ac + ' ' + rc + (hasTool ? ' has-tool-children' : '') + (containsDiff ? ' contains-diff' : '') + '" style="margin-left:' + (depth*INDENT_PX) + 'px;" data-uuid="' + node.uuid + '">';
    h += '<span class="toggle">[+]</span> <span class="label">' + label(node) + '</span>' + di + btns(node) + '</div>\n';
    if (hasTool) {
      h += '<div class="tool-children" style="display:none;margin-left:' + ((depth+1)*INDENT_PX) + 'px;">';
      for (var i = 0; i < plumbing.length; i++) h += renderPlumbing(plumbing[i], 0);
      h += '</div>\n';
    }
    return h;
  }

  function flattenChain(start) {
    var list = [start], cur = start;
    while (cur.visibleChildren.length === 1) { cur = cur.visibleChildren[0]; list.push(cur); }
    return { list: list, tail: cur };
  }

  function renderChain(start, depth) {
    var fc = flattenChain(start);
    var list = fc.list, tail = fc.tail;
    var html = '', buf = [];
    var i = 0;
    while (i < list.length) {
      var node = list[i];
      if (isAgentText(node)) {
        var plumbing = buf.slice(); buf = [];
        var j = i + 1;
        while (j < list.length && isPlumbingNode(list[j])) { plumbing.push(list[j]); j++; }
        i = j;
        html += renderSingle(node, depth, plumbing);
      } else if (isPlumbingNode(node)) {
        buf.push(node); i++;
      } else {
        if (buf.length > 0) { for (var b = 0; b < buf.length; b++) html += renderPlumbing(buf[b], depth); buf = []; }
        html += renderSingle(node, depth, []); i++;
      }
    }
    for (var fb = 0; fb < buf.length; fb++) html += renderPlumbing(buf[fb], depth);
    buf = [];

    if (tail.visibleChildren.length > 1) {
      if (bp[tail.uuid]) {
        html += '<div class="branch-container" style="margin-left:' + ((depth+1)*INDENT_PX) + 'px;">';
        html += '<div class="branch-header">Branches</div>';
        for (var i = 0; i < tail.visibleChildren.length; i++) {
          var child = tail.visibleChildren[i];
          var ba = isSubtreeActive(child);
          html += '<div class="branch ' + (ba ? 'active' : 'orphaned') + '">';
          html += '<span class="toggle branch-toggle">' + (ba ? '[-]' : '[+]') + '</span>';
          html += '<span class="branch-label">&lt;branch ' + (i+1) + (ba ? ' : active' : '') + '&gt;</span>';
          html += '<div class="branch-children" style="display:' + (ba ? 'block' : 'none') + '">';
          html += renderChain(child, depth + 2);
          html += '</div></div>\n';
        }
        html += '</div>';
      } else {
        for (var i = 0; i < tail.visibleChildren.length; i++) {
          html += renderChain(tail.visibleChildren[i], depth);
        }
      }
    }
    return html;
  }

  var html = '';
  for (var i = 0; i < tree.visRoots.length; i++) {
    html += renderChain(tree.visRoots[i], 0);
  }
  return html;
}
