// Builds the visible tree structure from parsed JSONL entries.
function buildVisibleConversationTree(entries) {
  var rawMap = {};
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.uuid === undefined || e.parentUuid === undefined) continue;
    rawMap[e.uuid] = {
      uuid: e.uuid, parentUuid: e.parentUuid || null,
      entry: e, lineIndex: i, children: [],
      displayable: SHOW_ALL || !!DISPLAYABLE_TYPES[e.type]
    };
  }

  // Thread orphan nodes (null or unresolved parentUuid) into file order by
  // attaching each to its immediate predecessor. Without this, a disconnected
  // subtree renders as a separate root *after* the entire conversation, stranding
  // early-sequence nodes (e.g. session-init attachments) at the bottom of the
  // tree. The earliest entry by line stays the sole genuine root.
  var ordered = Object.keys(rawMap).map(function(k){ return rawMap[k]; })
                      .sort(function(a, b){ return a.lineIndex - b.lineIndex; });
  for (var oi = 1; oi < ordered.length; oi++) {
    var nd = ordered[oi];
    if (!nd.parentUuid || !rawMap[nd.parentUuid]) {
      nd.parentUuid = ordered[oi - 1].uuid;
    }
  }

  var rawRoots = [];
  var keys = Object.keys(rawMap);
  for (var k = 0; k < keys.length; k++) {
    var n = rawMap[keys[k]];
    if (n.parentUuid && rawMap[n.parentUuid]) {
      rawMap[n.parentUuid].children.push(n);
    } else {
      rawRoots.push(n);
    }
  }

  function convertToVisibleNode(raw) {
    var tr = raw.entry.toolUseResult;
    var trIsObj = tr && typeof tr === 'object' && !Array.isArray(tr);
    var hasDiff = trIsObj && ('originalFile' in tr);
    var diffFile = hasDiff ? (tr.filePath || null) : null;
    var diffData = null;
    if (hasDiff) {
      var sp = tr.structuredPatch;
      var opType = tr.type || (tr.oldString !== undefined ? 'edit' : 'unknown');
      diffData = {
        filePath: tr.filePath || '', opType: opType,
        hunks: Array.isArray(sp) ? sp : [],
        content: opType === 'create' ? (tr.content || null) : null
      };
    }
    return {
      uuid: raw.uuid, entryType: raw.entry.type,
      role: (raw.entry.message && raw.entry.message.role) || raw.entry.type,
      messageId: (raw.entry.message && raw.entry.message.id) || null,
      isSidechain: raw.entry.isSidechain || false,
      contentSummary: summarizeContent(raw.entry),
      timestamp: raw.entry.timestamp || '',
      lineIndex: raw.lineIndex,
      visibleChildren: [], toolChildren: [], attachKids: [],
      hasDiff: !!hasDiff, diffFile: diffFile, diffData: diffData
    };
  }

  function collectVisibleChildren(raw) {
    var result = [];
    for (var i = 0; i < raw.children.length; i++) {
      var child = raw.children[i];
      if (child.displayable) {
        var vis = convertToVisibleNode(child);
        vis.visibleChildren = collectVisibleChildren(child);
        result.push(vis);
      } else {
        var sub = collectVisibleChildren(child);
        for (var j = 0; j < sub.length; j++) result.push(sub[j]);
      }
    }
    return result;
  }

  var visRoots = [];
  for (var r = 0; r < rawRoots.length; r++) {
    var raw = rawRoots[r];
    if (raw.displayable) {
      var vis = convertToVisibleNode(raw);
      vis.visibleChildren = collectVisibleChildren(raw);
      visRoots.push(vis);
    } else {
      var sub = collectVisibleChildren(raw);
      for (var j = 0; j < sub.length; j++) visRoots.push(sub[j]);
    }
  }

  // Pure-attachment side-children (an attachment whose entire subtree is attachments)
  // are context notes, not conversational forks. Move them out of visibleChildren into
  // attachKids so they render as collapsed children instead of forcing a branch.
  function isSubtreeAllAttachments(n) {
    if (n.entryType !== 'attachment') return false;
    for (var i = 0; i < n.visibleChildren.length; i++) {
      if (!isSubtreeAllAttachments(n.visibleChildren[i])) return false;
    }
    return true;
  }
  function partitionAttachments(n) {
    var main = [], side = [];
    for (var i = 0; i < n.visibleChildren.length; i++) {
      if (isSubtreeAllAttachments(n.visibleChildren[i])) side.push(n.visibleChildren[i]);
      else main.push(n.visibleChildren[i]);
    }
    n.attachKids = side;
    n.visibleChildren = main;
    for (var i = 0; i < main.length; i++) partitionAttachments(main[i]);
  }
  for (var i = 0; i < visRoots.length; i++) partitionAttachments(visRoots[i]);

  var visMap = {};
  function addVisibleNodeToUuidNodeMap(node) {
    visMap[node.uuid] = node;
    for (var i = 0; i < node.visibleChildren.length; i++) addVisibleNodeToUuidNodeMap(node.visibleChildren[i]);
    for (var i = 0; i < node.attachKids.length; i++) addVisibleNodeToUuidNodeMap(node.attachKids[i]);
  }
  for (var i = 0; i < visRoots.length; i++) addVisibleNodeToUuidNodeMap(visRoots[i]);

  var branchPoints = {};
  function isParallelToolUse(children) {
    var ids = {};
    for (var i = 0; i < children.length; i++) {
      if (children[i].messageId) ids[children[i].messageId] = true;
    }
    var uniqueCount = Object.keys(ids).length;
    if (uniqueCount === 1) {
      var hasA = false, hasU = false;
      for (var i = 0; i < children.length; i++) {
        if (children[i].entryType === 'assistant') hasA = true;
        if (children[i].entryType === 'user') hasU = true;
      }
      if (hasA) return true;
    }
    return false;
  }
  function detectBranches(node) {
    if (node.visibleChildren.length > 1 && !isParallelToolUse(node.visibleChildren)) {
      branchPoints[node.uuid] = true;
    }
    for (var i = 0; i < node.visibleChildren.length; i++) detectBranches(node.visibleChildren[i]);
  }
  for (var i = 0; i < visRoots.length; i++) detectBranches(visRoots[i]);

  var rawLeaves = [];
  var rk = Object.keys(rawMap);
  for (var i = 0; i < rk.length; i++) {
    if (rawMap[rk[i]].children.length === 0) rawLeaves.push(rawMap[rk[i]]);
  }
  rawLeaves.sort(function(a,b) { return (a.entry.timestamp||'') > (b.entry.timestamp||'') ? -1 : 1; });

  var activeLeafUuid = null;
  for (var i = 0; i < rawLeaves.length; i++) {
    var cur = rawLeaves[i];
    while (cur) {
      if (cur.displayable && !cur.entry.isSidechain && (cur.entry.type === 'user' || cur.entry.type === 'assistant')) {
        activeLeafUuid = cur.uuid;
        break;
      }
      cur = cur.parentUuid ? rawMap[cur.parentUuid] : null;
    }
    if (activeLeafUuid) break;
  }

  var activePath = {};
  if (activeLeafUuid) {
    var cur = rawMap[activeLeafUuid];
    while (cur) {
      activePath[cur.uuid] = true;
      cur = cur.parentUuid ? rawMap[cur.parentUuid] : null;
    }
  }

  var msgIdToNodes = {};
  for (var i = 0; i < rk.length; i++) {
    var nd = rawMap[rk[i]];
    var mid = nd.entry.message && nd.entry.message.id;
    if (mid) {
      if (!msgIdToNodes[mid]) msgIdToNodes[mid] = [];
      msgIdToNodes[mid].push(nd);
    }
  }
  function markActive(nd) {
    activePath[nd.uuid] = true;
    for (var i = 0; i < nd.children.length; i++) {
      if (!activePath[nd.children[i].uuid]) markActive(nd.children[i]);
    }
  }
  var mk = Object.keys(msgIdToNodes);
  for (var i = 0; i < mk.length; i++) {
    var sibs = msgIdToNodes[mk[i]];
    var any = false;
    for (var j = 0; j < sibs.length; j++) { if (activePath[sibs[j].uuid]) { any = true; break; } }
    if (any) {
      for (var j = 0; j < sibs.length; j++) {
        if (!activePath[sibs[j].uuid]) markActive(sibs[j]);
      }
    }
  }

  return {
    visRoots: visRoots, branchPoints: branchPoints, activePath: activePath,
    activeLeafUuid: activeLeafUuid,
    totalRawNodes: rk.length, totalVisNodes: Object.keys(visMap).length,
    totalBranches: Object.keys(branchPoints).length
  };
}
