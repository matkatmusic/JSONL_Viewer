# Source hits for fog-of-war structures

Searched: /Users/matkatmusicllc/Desktop/claude code src (excluding RevEng/)

## anchor: file-history-snapshot
./types/logs.ts:189:  type: 'file-history-snapshot'
./utils/stats.ts:984: * `file-history-snapshot`, `attribution-snapshot`) before the first transcript
./utils/stats.ts:986: * — naive string search is unsafe here because `file-history-snapshot` entries
./utils/sessionStorage.ts:1092:        type: 'file-history-snapshot',
./utils/sessionStorage.ts:1186:    } else if (entry.type === 'file-history-snapshot') {
./utils/sessionStorage.ts:3321:  // Metadata lines (summary, mode, file-history-snapshot, etc.) go in metaRanges
./utils/sessionStorage.ts:3678:      } else if (entry.type === 'file-history-snapshot') {

## anchor: isSnapshotUpdate
./types/logs.ts:192:  isSnapshotUpdate: boolean
./utils/fileHistory.ts:175:        true, // isSnapshotUpdate
./utils/fileHistory.ts:322:        false, // isSnapshotUpdate
./utils/fileHistory.ts:1025:            false, // isSnapshotUpdate
./utils/sessionStorage.ts:1088:    isSnapshotUpdate: boolean,
./utils/sessionStorage.ts:1095:        isSnapshotUpdate,
./utils/sessionStorage.ts:1479:  isSnapshotUpdate: boolean,
./utils/sessionStorage.ts:1484:    isSnapshotUpdate,
./utils/sessionStorage.ts:2260:    const { snapshot, isSnapshotUpdate } = snapshotMessage
./utils/sessionStorage.ts:2261:    const existingIndex = isSnapshotUpdate

## anchor: bridge-session
./bridge/sessionRunner.ts:265:        debugFile = join(tmpdir(), 'claude', `bridge-session-${safeId}.log`)
./bridge/bridgeMain.ts:352:      debugGlob = join(tmpdir(), 'claude', 'bridge-session-*.log')
./bridge/bridgeMain.ts:1139:              `bridge-session-${safeId}.log`,

## anchor: bridgeSessionId
./bridge/replBridgeHandle.ts:35:  return h ? toCompatSessionId(h.bridgeSessionId) : undefined
./bridge/remoteBridgeCore.ts:764:    bridgeSessionId: sessionId,
./bridge/replBridge.ts:71:  bridgeSessionId: string
./bridge/replBridge.ts:794:    // there's a window where handle.bridgeSessionId already returns session B
./bridge/replBridge.ts:796:    // persistState() in that window writes {bridgeSessionId: B, seq: OLD_A},
./bridge/replBridge.ts:1679:    get bridgeSessionId() {
./bridge/initReplBridge.ts:316:    bridgeSessionId: string,
./bridge/initReplBridge.ts:324:    void updateBridgeSessionTitle(bridgeSessionId, derived, {
./bridge/initReplBridge.ts:333:  const generateAndPatch = (input: string, bridgeSessionId: string): void => {
./bridge/initReplBridge.ts:341:          lastBridgeSessionId === bridgeSessionId &&
./bridge/initReplBridge.ts:344:          patch(generated, bridgeSessionId, atCount)
./bridge/initReplBridge.ts:349:  const onUserMessage = (text: string, bridgeSessionId: string): boolean => {
./bridge/initReplBridge.ts:359:      lastBridgeSessionId !== bridgeSessionId
./bridge/initReplBridge.ts:363:    lastBridgeSessionId = bridgeSessionId
./bridge/initReplBridge.ts:367:      if (placeholder) patch(placeholder, bridgeSessionId, userMessageCount)
./bridge/initReplBridge.ts:368:      generateAndPatch(text, bridgeSessionId)
./bridge/initReplBridge.ts:374:      generateAndPatch(input, bridgeSessionId)
./utils/concurrentSessions.ts:145:  bridgeSessionId: string | null,
./utils/concurrentSessions.ts:147:  await updatePidFile({ bridgeSessionId })
./cli/print.ts:3898:                  bridgeHandle.bridgeSessionId,
./cli/print.ts:3997:                      handle.bridgeSessionId,
./hooks/useReplBridge.tsx:254:                  const sessionUrl = handle ? getRemoteSessionUrl(handle.bridgeSessionId, handle.sessionIngressUrl) : prev_9.replBridgeSessionUrl;
./hooks/useReplBridge.tsx:256:                  const sessionId = handle?.bridgeSessionId;
./hooks/useReplBridge.tsx:526:              if (prev_15.replBridgeConnected && prev_15.replBridgeSessionId === handle_0.bridgeSessionId) return prev_15;
./hooks/useReplBridge.tsx:530:                replBridgeSessionId: handle_0.bridgeSessionId,

## anchor: last-prompt
./types/logs.ts:82:  type: 'last-prompt'
./utils/listSessionsImpl.ts:112:  // last-prompt tail entry (captured by extractFirstPrompt at write
./utils/listSessionsImpl.ts:114:  // Head scan is fallback for sessions without a last-prompt entry.
./utils/sessionStorage.ts:718:   * the SDK cannot touch (last-prompt, agent-*, mode, pr-link) have no
./utils/sessionStorage.ts:769:        type: 'last-prompt',
./utils/sessionStorage.ts:1167:    } else if (entry.type === 'last-prompt') {
./utils/sessionStorage.ts:4755:  // Prefer the last-prompt tail entry — captured by extractFirstPrompt at
./utils/sessionStorage.ts:4758:  // last-prompt entries existed. Raw string scrapes of head are last resort

## anchor: lastPrompt
./types/logs.ts:84:  lastPrompt: string
./utils/listSessionsImpl.ts:117:    extractLastJsonStringField(tail, 'lastPrompt') ||
./utils/sessionStorage.ts:764:    // lastPrompt is re-appended so readLiteMetadata can show what the
./utils/sessionStorage.ts:770:        lastPrompt: this.currentSessionLastPrompt,
./utils/sessionStorage.ts:4761:    extractLastJsonStringField(tail, 'lastPrompt') ||

## anchor: permission-mode
./main.tsx:709:    // `ssh --permission-mode auto host /tmp` — standard POSIX flags-before-
./main.tsx:711:    // given, so `claude ssh --permission-mode auto host` and `claude ssh host
./main.tsx:712:    // --permission-mode auto` are equivalent. The host check below only needs
./main.tsx:725:      const pmIdx = rawCliArgs.indexOf('--permission-mode');
./main.tsx:730:      const pmEqIdx = rawCliArgs.findIndex(a => a.startsWith('--permission-mode='));
./main.tsx:988:  }).hideHelp()).option('--replay-user-messages', 'Re-emit user messages from stdin back on stdout for acknowledgment (only works with --input-format=stream-json and --output-format=stream-json)', () => true).addOption(new Option('--enable-auth-status', 'Enable auth status messages in SDK mode').default(false).hideHelp()).option('--allowedTools, --allowed-tools <tools...>', 'Comma or space-separated list of tool names to allow (e.g. "Bash(git:*) Edit")').option('--tools <tools...>', 'Specify the list of available tools from the built-in set. Use "" to disable all tools, "default" to use all tools, or specify tool names (e.g. "Bash,Edit,Read").').option('--disallowedTools, --disallowed-tools <tools...>', 'Comma or space-separated list of tool names to deny (e.g. "Bash(git:*) Edit")').option('--mcp-config <configs...>', 'Load MCP servers from JSON files or strings (space-separated)').addOption(new Option('--permission-prompt-tool <tool>', 'MCP tool to use for permission prompts (only works with --print)').argParser(String).hideHelp()).addOption(new Option('--system-prompt <prompt>', 'System prompt to use for the session').argParser(String)).addOption(new Option('--system-prompt-file <file>', 'Read system prompt from a file').argParser(String).hideHelp()).addOption(new Option('--append-system-prompt <prompt>', 'Append a system prompt to the default system prompt').argParser(String)).addOption(new Option('--append-system-prompt-file <file>', 'Read system prompt from a file and append to the default system prompt').argParser(String).hideHelp()).addOption(new Option('--permission-mode <mode>', 'Permission mode to use for the session').argParser(String).choices(PERMISSION_MODES)).option('-c, --continue', 'Continue the most recent conversation in the current directory', () => true).option('-r, --resume [value]', 'Resume a conversation by session ID, or open interactive picker with optional search term', value => value || true).option('--fork-session', 'When resuming, create a new session ID instead of reusing the original (use with --resume or --continue)', () => true).addOption(new Option('--prefill <text>', 'Pre-fill the prompt input with text without submitting it').hideHelp()).addOption(new Option('--deep-link-origin', 'Signal that this session was launched from a deep link').hideHelp()).addOption(new Option('--deep-link-repo <slug>', 'Repo slug the deep link ?repo= parameter resolved to the current cwd').hideHelp()).addOption(new Option('--deep-link-last-fetch <ms>', 'FETCH_HEAD mtime in epoch ms, precomputed by the deep link trampoline').argParser(v => {
./main.tsx:1035:    // mode is left to the user — settings defaultMode or --permission-mode
./main.tsx:1401:      // Set when: --enable-auto-mode, --permission-mode auto, resolved mode
./main.tsx:2884:        key: 'permission-mode-notification',
./main.tsx:3817:    program.addOption(new Option('--delegate-permissions', '[ANT-ONLY] Alias for --permission-mode auto.').implies({
./main.tsx:3820:    program.addOption(new Option('--dangerously-skip-permissions-with-classifiers', '[ANT-ONLY] Deprecated alias for --permission-mode auto.').hideHelp().implies({
./main.tsx:3823:    program.addOption(new Option('--afk', '[ANT-ONLY] Deprecated alias for --permission-mode auto.').hideHelp().implies({
./main.tsx:4046:    program.command('ssh <host> [dir]').description('Run Claude Code on a remote host over SSH. Deploys the binary and ' + 'tunnels API auth back through your local machine — no remote setup needed.').option('--permission-mode <mode>', 'Permission mode for the remote session').option('--dangerously-skip-permissions', 'Skip all permission prompts on the remote (dangerous)').option('--local', 'e2e test mode — spawn the child CLI locally (skip ssh/deploy). ' + 'Exercises the auth proxy and unix-socket plumbing without a remote host.').action(async () => {
./tasks/RemoteAgentTask/RemoteAgentTask.tsx:692:      // side effects (notification, permission-mode flip).
./tools/shared/spawnMultiAgent.ts:225:    flags.push('--permission-mode acceptEdits')
./tools/shared/spawnMultiAgent.ts:230:    flags.push('--permission-mode auto')
./tools/AgentTool/prompt.ts:54: * connect, /reload-plugins, or permission-mode changes mutate the list →
./types/permissions.ts:32:// defaultMode, --permission-mode CLI flag, conversation recovery).
./bridge/sessionRunner.ts:302:          ? ['--permission-mode', deps.permissionMode]
./bridge/bridgeMain.ts:1770:    } else if (arg === '--permission-mode' && i + 1 < args.length) {
./bridge/bridgeMain.ts:1772:    } else if (arg.startsWith('--permission-mode=')) {
./bridge/bridgeMain.ts:1773:      permissionMode = arg.slice('--permission-mode='.length)
./bridge/bridgeMain.ts:1934:}  --permission-mode <mode>         Permission mode for spawned sessions
./utils/settings/validationTips.ts:35:      docLink: `${DOCUMENTATION_BASE}/iam#permission-modes`,
./utils/swarm/spawnUtils.ts:55:    flags.push('--permission-mode acceptEdits')

## anchor: ai-title
./types/logs.ts:76:  type: 'ai-title'
./utils/sessionStorage.ts:1164:    } else if (entry.type === 'ai-title') {
./utils/sessionStorage.ts:2641: * Persist an AI-generated title to the JSONL as a distinct `ai-title` entry.
./utils/sessionStorage.ts:2669:    type: 'ai-title',
./utils/sessionStorage.ts:2676: * Append a periodic task summary for `claude ps`. Unlike ai-title this is
./utils/sessionStorage.ts:4769:  // AI titles (aiTitle field, from ai-title entries). The distinct field

## anchor: aiTitle
./types/logs.ts:78:  aiTitle: string
./utils/listSessionsImpl.ts:95:  // User title (customTitle) wins over AI title (aiTitle); distinct
./utils/listSessionsImpl.ts:100:    extractLastJsonStringField(tail, 'aiTitle') ||
./utils/listSessionsImpl.ts:101:    extractLastJsonStringField(head, 'aiTitle') ||
./utils/sessionStorage.ts:2644: * - Read preference: readers prefer `customTitle` field over `aiTitle`, so
./utils/sessionStorage.ts:2659: * head buffer for `aiTitle` in that case. Both head and tail reads are
./utils/sessionStorage.ts:2667:export function saveAiGeneratedTitle(sessionId: UUID, aiTitle: string): void {
./utils/sessionStorage.ts:2670:    aiTitle,
./utils/sessionStorage.ts:4769:  // AI titles (aiTitle field, from ai-title entries). The distinct field
./utils/sessionStorage.ts:4774:    extractLastJsonStringField(tail, 'aiTitle') ??
./utils/sessionStorage.ts:4775:    extractLastJsonStringField(head, 'aiTitle')

## anchor: queue-operation
./utils/messageQueueManager.ts:31:    type: 'queue-operation',
./utils/sessionStorage.ts:1218:      if (entry.type === 'queue-operation') {
./QueryEngine.ts:441:    // queue-operation entries; getLastSessionLog filters those out, returns

## anchor: sourceToolAssistantUUID
./utils/messages.ts:472:  sourceToolAssistantUUID,
./utils/messages.ts:491:  sourceToolAssistantUUID?: UUID
./utils/messages.ts:518:    sourceToolAssistantUUID,
./utils/sessionStorage.ts:1033:          'sourceToolAssistantUUID' in message &&
./utils/sessionStorage.ts:1034:          message.sourceToolAssistantUUID
./utils/sessionStorage.ts:1036:          effectiveParentUuid = message.sourceToolAssistantUUID
./utils/sessionStorage.ts:2102: * tool_result's sourceToolAssistantUUID points to its own one-block assistant,
./query.ts:145:        sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/StreamingToolExecutor.ts:97:            sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/StreamingToolExecutor.ts:171:        sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/StreamingToolExecutor.ts:186:        sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/StreamingToolExecutor.ts:203:      sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/toolExecution.ts:407:        sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/toolExecution.ts:449:          sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/toolExecution.ts:486:        sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/toolExecution.ts:676:          sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/toolExecution.ts:729:          sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/toolExecution.ts:857:            sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/toolExecution.ts:1069:        sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/toolExecution.ts:1465:          sourceToolAssistantUUID: assistantMessage.uuid,
./services/tools/toolExecution.ts:1733:          sourceToolAssistantUUID: assistantMessage.uuid,

## anchor: leafUuid
./types/logs.ts:37:  leafUuid?: UUID // If given, this uuid must appear in the DB
./types/logs.ts:57:  leafUuid: UUID
./utils/sessionStorage.ts:2307:      leafUuids,
./utils/sessionStorage.ts:2318:      leafUuids.has(msg.uuid),
./utils/sessionStorage.ts:2514:    leafUuid: lastMessage.uuid,
./utils/sessionStorage.ts:2980:      leafUuids,
./utils/sessionStorage.ts:2991:        leafUuids.has(msg.uuid) &&
./utils/sessionStorage.ts:3029:      leafUuid: mostRecentLeaf?.uuid ?? log.leafUuid,
./utils/sessionStorage.ts:3494:  leafUuids: Set<UUID>
./utils/sessionStorage.ts:3590:        if (entry.type === 'summary' && entry.leafUuid) {
./utils/sessionStorage.ts:3591:          summaries.set(entry.leafUuid, entry.summary)
./utils/sessionStorage.ts:3658:      } else if (entry.type === 'summary' && entry.leafUuid) {
./utils/sessionStorage.ts:3659:        summaries.set(entry.leafUuid, entry.summary)
./utils/sessionStorage.ts:3728:  const leafUuids = new Set<UUID>()
./utils/sessionStorage.ts:3756:            leafUuids.add(current.uuid)
./utils/sessionStorage.ts:3778:          leafUuids.add(current.uuid)
./utils/sessionStorage.ts:3811:    leafUuids,
./utils/sessionStorage.ts:4000:  // This path creates one LogOption per leaf, so use sessionId+leafUuid key.
./utils/sessionStorage.ts:4003:    const key = `${log.sessionId ?? ''}:${log.leafUuid ?? ''}`
./utils/sessionStorage.ts:4617:    leafUuids,
./utils/sessionStorage.ts:4626:    if (leafUuids.has(msg.uuid)) {
./utils/sessionStorage.ts:4668:      leafUuid: leafMessage.uuid,
./utils/conversationRecovery.ts:411: * leafUuids is populated by loadTranscriptFile as "uuids that no
./utils/conversationRecovery.ts:420:  const { messages: byUuid, leafUuids } = await loadTranscriptFile(path)
./utils/conversationRecovery.ts:424:    if (m.isSidechain || !leafUuids.has(m.uuid)) continue

## anchor: lastSequenceNum
./bridge/replBridge.ts:800:    // over leaves the transport's lastSequenceNum stuck high (seq only
./cli/transports/SSETransport.ts:174:  private lastSequenceNum = 0
./cli/transports/SSETransport.ts:214:      this.lastSequenceNum = initialSequenceNum
./cli/transports/SSETransport.ts:228:    return this.lastSequenceNum
./cli/transports/SSETransport.ts:246:    if (this.lastSequenceNum > 0) {
./cli/transports/SSETransport.ts:247:      sseUrl.searchParams.set('from_sequence_num', String(this.lastSequenceNum))
./cli/transports/SSETransport.ts:264:    if (this.lastSequenceNum > 0) {
./cli/transports/SSETransport.ts:265:      headers['Last-Event-ID'] = String(this.lastSequenceNum)
./cli/transports/SSETransport.ts:362:                  `SSETransport: DUPLICATE frame seq=${seqNum} (lastSequenceNum=${this.lastSequenceNum}, seenCount=${this.seenSequenceNums.size})`,
./cli/transports/SSETransport.ts:370:                // Only sequence numbers near lastSequenceNum matter for dedup.
./cli/transports/SSETransport.ts:372:                  const threshold = this.lastSequenceNum - 200
./cli/transports/SSETransport.ts:380:              if (seqNum > this.lastSequenceNum) {
./cli/transports/SSETransport.ts:381:                this.lastSequenceNum = seqNum

## anchor: isCompactSummary
./bridge/initReplBridge.ts:286:          msg.isCompactSummary ||
./bridge/bridgeMessaging.ts:104:  if (m.type !== 'user' || m.isMeta || m.toolUseResult || m.isCompactSummary)
./utils/messages.ts:465:  isCompactSummary,
./utils/messages.ts:480:  isCompactSummary?: true
./utils/messages.ts:511:    isCompactSummary,
./utils/sessionStoragePortable.ts:131: * Skips tool_result messages, isMeta, isCompactSummary, command-name messages,
./utils/sessionStoragePortable.ts:150:      line.includes('"isCompactSummary":true') ||
./utils/sessionStoragePortable.ts:151:      line.includes('"isCompactSummary": true')
./utils/sessionStorage.ts:1752:    if ('isCompactSummary' in msg && msg.isCompactSummary) continue
./utils/conversationRecovery.ts:307:    if (lastMessage.isMeta || lastMessage.isCompactSummary) {
./QueryEngine.ts:566:            msg.isCompactSummary)
./QueryEngine.ts:578:            isReplay: !msg.isCompactSummary,
./components/messageActions.tsx:29:        if (msg.isMeta || msg.isCompactSummary) return false;
./components/MessageSelector.tsx:780:  if (message.isCompactSummary || message.isVisibleInTranscriptOnly) {
./components/Message.tsx:159:        if (message.isCompactSummary) {
./hooks/useAwaySummary.ts:19:    if (m.type === 'user' && !m.isMeta && !m.isCompactSummary) return false
./services/compact/sessionMemoryCompact.ts:479:      isCompactSummary: true,
./services/compact/compact.ts:621:        isCompactSummary: true,
./services/compact/compact.ts:798:                !(m.type === 'user' && m.isCompactSummary),
./services/compact/compact.ts:1034:        isCompactSummary: true,

## anchor: isMeta
./tools/AgentTool/runAgent.ts:642:          isMeta: true,
./tools/SkillTool/SkillTool.ts:1104:      [createUserMessage({ content: finalContent, isMeta: true })],
./tools/FileReadTool/FileReadTool.ts:887:          createUserMessage({ content: metadataText, isMeta: true }),
./tools/FileReadTool/FileReadTool.ts:942:            createUserMessage({ content: imageBlocks, isMeta: true }),
./tools/FileReadTool/FileReadTool.ts:1013:          isMeta: true,
./types/textInputTypes.ts:330:   * When true, the resulting UserMessage gets `isMeta: true` — hidden in the
./types/textInputTypes.ts:335:  isMeta?: boolean
./types/command.ts:115: * @param options.metaMessages - Additional messages to insert as isMeta (model-visible but hidden)
./bridge/initReplBridge.ts:284:          msg.isMeta ||
./bridge/bridgeMessaging.ts:104:  if (m.type !== 'user' || m.isMeta || m.toolUseResult || m.isCompactSummary)
./utils/teleport.tsx:69:    isMeta: true
./utils/processUserInput/processTextPrompt.ts:26:  isMeta?: boolean,
./utils/processUserInput/processTextPrompt.ts:80:      isMeta: isMeta || undefined,
./utils/processUserInput/processTextPrompt.ts:93:    isMeta: isMeta || undefined,
./utils/processUserInput/processSlashCommand.tsx:91:  // immediately, re-enqueue the result as an isMeta prompt when done.
./utils/processUserInput/processSlashCommand.tsx:99:  // isMeta prompts are hidden. Outside assistant mode, context:fork commands
./utils/processUserInput/processSlashCommand.tsx:120:    // Re-enter the queue as a hidden prompt. isMeta: hides from queue
./utils/processUserInput/processSlashCommand.tsx:130:      isMeta: true,
./utils/processUserInput/processSlashCommand.tsx:578:                isMeta: true
./utils/processUserInput/processSlashCommand.tsx:861:        isMeta: true
./utils/processUserInput/processSlashCommand.tsx:907:    isMeta: true
./utils/processUserInput/processUserInput.ts:101:  isMeta,
./utils/processUserInput/processUserInput.ts:134:   * When true, the resulting UserMessage gets `isMeta: true` (user-hidden,
./utils/processUserInput/processUserInput.ts:135:   * model-visible). Propagated from `QueuedCommand.isMeta` for queued
./utils/processUserInput/processUserInput.ts:138:  isMeta?: boolean

## anchor: originalFile
./tools/FileWriteTool/FileWriteTool.ts:80:    originalFile: z
./tools/FileWriteTool/FileWriteTool.ts:377:        originalFile: oldContent,
./tools/FileWriteTool/FileWriteTool.ts:400:      originalFile: null,
./tools/FileWriteTool/UI.tsx:367:  originalFile
./tools/FileWriteTool/UI.tsx:401:        return <FileEditToolUpdatedMessage filePath={filePath} structuredPatch={structuredPatch} firstLine={content.split('\n')[0] ?? null} fileContent={originalFile ?? undefined} style={style} verbose={verbose} previewHint={isPlanFile ? '/plan to preview' : undefined} />;
./tools/FileEditTool/utils.ts:412: * @param originalFile The original file content before applying the patch
./tools/FileEditTool/utils.ts:462: * @param originalFile The original file content
./tools/FileEditTool/utils.ts:469:  originalFile: string,
./tools/FileEditTool/utils.ts:475:  const before = originalFile.split(oldString)[0] ?? ''
./tools/FileEditTool/utils.ts:478:    originalFile,
./tools/FileEditTool/types.ts:68:    originalFile: z
./tools/FileEditTool/FileEditTool.ts:445:      content: originalFileContents,
./tools/FileEditTool/FileEditTool.ts:463:          isFullRead && originalFileContents === lastRead.content
./tools/FileEditTool/FileEditTool.ts:472:      findActualString(originalFileContents, old_string) || old_string
./tools/FileEditTool/FileEditTool.ts:484:      fileContents: originalFileContents,
./tools/FileEditTool/FileEditTool.ts:517:    notifyVscodeFileUpdated(absoluteFilePath, originalFileContents, updatedFile)
./tools/FileEditTool/FileEditTool.ts:565:      originalFile: originalFileContents,
./tools/FileEditTool/UI.tsx:80:  originalFile
./tools/FileEditTool/UI.tsx:90:  return <FileEditToolUpdatedMessage filePath={filePath} structuredPatch={structuredPatch} firstLine={originalFile.split('\n')[0] ?? null} fileContent={originalFile} style={style} verbose={verbose} previewHint={isPlanFile ? '/plan to preview' : undefined} />;
./utils/fileHistory.ts:601:  originalFile: string,
./utils/fileHistory.ts:610:      originalStats = await stat(originalFile)
./utils/fileHistory.ts:625:        readFile(originalFile, 'utf-8'),
./utils/fileHistory.ts:678:  originalFile: string,
./utils/fileHistory.ts:690:      readFileAsyncOrNull(originalFile),
./utils/fileHistory.ts:702:    filesChanged.push(originalFile)

## anchor: structuredPatch
./tools/FileWriteTool/FileWriteTool.ts:77:    structuredPatch: z
./tools/FileWriteTool/FileWriteTool.ts:376:        structuredPatch: patch,
./tools/FileWriteTool/FileWriteTool.ts:399:      structuredPatch: [],
./tools/FileWriteTool/UI.tsx:365:  structuredPatch,
./tools/FileWriteTool/UI.tsx:401:        return <FileEditToolUpdatedMessage filePath={filePath} structuredPatch={structuredPatch} firstLine={content.split('\n')[0] ?? null} fileContent={originalFile ?? undefined} style={style} verbose={verbose} previewHint={isPlanFile ? '/plan to preview' : undefined} />;
./tools/FileEditTool/utils.ts:1:import { type StructuredPatchHunk, structuredPatch } from 'diff'
./tools/FileEditTool/utils.ts:366:  const patch = structuredPatch(
./tools/FileEditTool/types.ts:71:    structuredPatch: z
./tools/FileEditTool/FileEditTool.ts:566:      structuredPatch: patch,
./tools/FileEditTool/UI.tsx:79:  structuredPatch,
./tools/FileEditTool/UI.tsx:90:  return <FileEditToolUpdatedMessage filePath={filePath} structuredPatch={structuredPatch} firstLine={originalFile.split('\n')[0] ?? null} fileContent={originalFile} style={style} verbose={verbose} previewHint={isPlanFile ? '/plan to preview' : undefined} />;
./utils/diff.ts:1:import { type StructuredPatchHunk, structuredPatch } from 'diff'
./utils/diff.ts:94:  const result = structuredPatch(
./utils/diff.ts:142:  const result = structuredPatch(
./components/FileEditToolDiff.tsx:121:      // replacements — structuredPatch needs before/after strings. replace_all
./components/MessageSelector.tsx:740:    if (!result || !result.filePath || !result.structuredPatch) {
./components/MessageSelector.tsx:750:        for (const hunk of result.structuredPatch) {
./components/FileEditToolUpdatedMessage.tsx:11:  structuredPatch: StructuredPatchHunk[];
./components/FileEditToolUpdatedMessage.tsx:22:    structuredPatch,
./components/FileEditToolUpdatedMessage.tsx:32:  const numAdditions = structuredPatch.reduce(_temp2, 0);
./components/FileEditToolUpdatedMessage.tsx:33:  const numRemovals = structuredPatch.reduce(_temp4, 0);
./components/FileEditToolUpdatedMessage.tsx:90:  if ($[13] !== fileContent || $[14] !== filePath || $[15] !== firstLine || $[16] !== structuredPatch || $[17] !== t6) {
./components/FileEditToolUpdatedMessage.tsx:91:    t7 = <StructuredDiffList hunks={structuredPatch} dim={false} width={t6} filePath={filePath} firstLine={firstLine} fileContent={fileContent} />;
./components/FileEditToolUpdatedMessage.tsx:95:    $[16] = structuredPatch;
./hooks/useTurnDiffs.ts:39:  // FileEditTool: has structuredPatch with content

## anchor: userModified
./Tool.ts:226:  userModified?: boolean
./tools/FileEditTool/types.ts:74:    userModified: z
./tools/FileEditTool/FileEditTool.ts:391:      userModified,
./tools/FileEditTool/FileEditTool.ts:567:      userModified: userModified ?? false,
./tools/FileEditTool/FileEditTool.ts:576:    const { filePath, userModified, replaceAll } = data
./tools/FileEditTool/FileEditTool.ts:577:    const modifiedNote = userModified
./types/permissions.ts:179:  userModified?: boolean
./utils/swarm/inProcessRunner.ts:286:                userModified: false,
./utils/swarm/inProcessRunner.ts:327:                  userModified: false,
./utils/swarm/inProcessRunner.ts:369:            userModified: false,
./utils/commitAttribution.ts:407:  _userModified: boolean,
./utils/forkedAgent.ts:457:    userModified: parentContext.userModified,
./cli/structuredIO.ts:837:          userModified: false,
./hooks/toolPermission/PermissionContext.ts:210:              userModified: false,
./hooks/toolPermission/PermissionContext.ts:267:        userModified?: boolean
./hooks/toolPermission/PermissionContext.ts:276:        userModified: opts?.userModified ?? false,
./hooks/toolPermission/PermissionContext.ts:308:      const userModified = tool.inputsEquivalent
./hooks/toolPermission/PermissionContext.ts:313:        userModified,
./services/tools/toolExecution.ts:1212:        userModified: permissionDecision.userModified ?? false,

## anchor: noOutputExpected
./tools/BashTool/BashTool.tsx:290:  noOutputExpected: z.boolean().optional().describe('Whether the command is expected to produce no output on success'),
./tools/BashTool/BashTool.tsx:809:      noOutputExpected: isSilentBashCommand(input.command),
./tools/BashTool/BashToolResultMessage.tsx:78:    noOutputExpected,
./tools/BashTool/BashToolResultMessage.tsx:155:  if ($[17] !== backgroundTaskId || $[18] !== cwdResetWarning || $[19] !== noOutputExpected || $[20] !== returnCodeInterpretation || $[21] !== stderr || $[22] !== stdout) {
./tools/BashTool/BashToolResultMessage.tsx:156:    t9 = stdout === "" && stderr.trim() === "" && !cwdResetWarning ? <MessageResponse height={1}><Text dimColor={true}>{backgroundTaskId ? <>Running in the background{" "}<KeyboardShortcutHint shortcut={"\u2193"} action="manage" parens={true} /></> : returnCodeInterpretation || (noOutputExpected ? "Done" : "(No output)")}</Text></MessageResponse> : null;
./tools/BashTool/BashToolResultMessage.tsx:159:    $[19] = noOutputExpected;

## anchor: isSidechain
./types/logs.ts:29:  isSidechain: boolean
./types/logs.ts:224:  isSidechain: boolean
./utils/teleport.tsx:589:    const messages = logs.filter(entry => isTranscriptMessage(entry) && !entry.isSidechain) as Message[];
./utils/listSessionsImpl.ts:90:    firstLine.includes('"isSidechain":true') ||
./utils/listSessionsImpl.ts:91:    firstLine.includes('"isSidechain": true')
./utils/stats.ts:235:        : messages.filter(m => !m.isSidechain)
./utils/stats.ts:969:// where mainMessages = entries.filter(isTranscriptMessage).filter(!isSidechain).
./utils/stats.ts:1014:          isSidechain?: unknown
./utils/stats.ts:1023:        if (entry.isSidechain === true) continue
./utils/attribution.ts:174:      entry.type === 'user' && !('isSidechain' in entry && entry.isSidechain),
./utils/logoV2Utils.ts:200:          if (log.isSidechain) return false
./utils/sessionStorage.ts:995:    isSidechain: boolean = false,
./utils/sessionStorage.ts:1042:          isSidechain,
./utils/sessionStorage.ts:1052:          // and isSidechain). If sessionId isn't re-stamped, FRESH.jsonl ends up
./utils/sessionStorage.ts:1074:      if (!isSidechain) {
./utils/sessionStorage.ts:1225:          entry.isSidechain && entry.agentId !== undefined
./utils/sessionStorage.ts:1818:    const { isSidechain, parentUuid, ...serializedMessage } = m
./utils/sessionStorage.ts:2510:    isSidechain: firstMessage.isSidechain,
./utils/sessionStorage.ts:3027:      isSidechain: transcript[0]?.isSidechain ?? log.isSidechain,
./utils/sessionStorage.ts:3312:  const SIDECHAIN_TRUE = Buffer.from('"isSidechain":true')
./utils/sessionStorage.ts:3399:  // Leaf = last non-sidechain entry. isSidechain is the 2nd or 3rd key
./utils/sessionStorage.ts:3900:  const lastMessage = findLatestMessage(messages.values(), m => !m.isSidechain)
./utils/sessionStorage.ts:4202:      msg => msg.agentId === agentId && msg.isSidechain,
./utils/sessionStorage.ts:4229:        ({ isSidechain, parentUuid, ...msg }) => msg,
./utils/sessionStorage.ts:4582:  isSidechain: boolean

## anchor: parentUuid
./types/logs.ts:222:  parentUuid: UUID | null
./types/logs.ts:223:  logicalParentUuid?: UUID | null // Preserves logical parent when parentUuid is nullified for session breaks
./utils/sessionStorage.ts:135: * and must not be persisted to the JSONL or participate in the parentUuid
./utils/sessionStorage.ts:149: * Entries that participate in the parentUuid chain. Used on the write path
./utils/sessionStorage.ts:151: * parentUuid. Old transcripts with progress already in the chain are handled
./utils/sessionStorage.ts:161:  parentUuid: UUID | null
./utils/sessionStorage.ts:167: * parentUuid fields. loadTranscriptFile bridges the chain across them.
./utils/sessionStorage.ts:891:          // in `parentUuid` of a child entry. UUIDs are pure ASCII so a
./utils/sessionStorage.ts:1001:      let parentUuid: UUID | null = startingParentUuid ?? null
./utils/sessionStorage.ts:1030:        let effectiveParentUuid = parentUuid
./utils/sessionStorage.ts:1040:          parentUuid: isCompactBoundary ? null : effectiveParentUuid,
./utils/sessionStorage.ts:1041:          logicalParentUuid: isCompactBoundary ? parentUuid : undefined,
./utils/sessionStorage.ts:1051:          // sessionId/cwd/etc. because removeExtraFields only strips parentUuid
./utils/sessionStorage.ts:1067:          parentUuid = message.uuid
./utils/sessionStorage.ts:1252:            // chains its parentUuid to a UUID that only exists in the agent file,
./utils/sessionStorage.ts:1393:// messages) are dedup-skipped by appendEntry but still advance the parentUuid
./utils/sessionStorage.ts:1406://    messagesToKeep → not a prefix → not tracked → CB gets parentUuid=null
./utils/sessionStorage.ts:1818:    const { isSidechain, parentUuid, ...serializedMessage } = m
./utils/sessionStorage.ts:1827: * parentUuids (recordTranscript dedup-skipped them — can't rewrite).
./utils/sessionStorage.ts:1886:      cur = cur.parentUuid ? messages.get(cur.parentUuid) : undefined
./utils/sessionStorage.ts:1910:        parentUuid: lastSeg.anchorUuid,
./utils/sessionStorage.ts:1916:      if (msg.parentUuid === lastSeg.anchorUuid && uuid !== lastSeg.headUuid) {
./utils/sessionStorage.ts:1917:        messages.set(uuid, { ...msg, parentUuid: lastSeg.tailUuid })
./utils/sessionStorage.ts:1960: * and relink parentUuid across the gaps.
./utils/sessionStorage.ts:1964: * and the surviving messages' parentUuid chains walk through them. Without

