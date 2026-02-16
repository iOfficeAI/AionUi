# Integration Proposal: AionUi + claude-devtools

## Context

**[claude-devtools](https://github.com/matt1398/claude-devtools)** is a standalone Electron app that reads raw Claude Code session logs from `~/.claude/` and provides:

- **Context window reconstruction** — token attribution across 7 categories (CLAUDE.md, skills, @-mentions, tool I/O, thinking, team coordination, user text)
- **Compaction detection** — visualizes when Claude hits context limits and compresses conversations
- **Rich tool inspection** — syntax-highlighted reads, inline diffs for edits, command output for bash
- **Multi-agent visibility** — untangles subagent/team coordination trees
- **Custom notifications** — regex-based alerts for sensitive file access, errors, token thresholds
- **SSH remote session** support — SFTP streaming from remote `~/.claude/` directories

**AionUi** already manages Claude Code through the ACP protocol (`@zed-industries/claude-code-acp`), storing session IDs and streaming tool calls through a unified pipeline. It reads `~/.claude/settings.json` for model detection and persists conversations in SQLite.

The goal: bring claude-devtools' analytical capabilities into AionUi so users get session insight without switching apps.

---

## Architecture Comparison

| Aspect | claude-devtools | AionUi |
|--------|----------------|--------|
| **Data source** | Reads `~/.claude/projects/*/` JSONL logs post-hoc | Receives live ACP JSON-RPC stream |
| **Stack** | Electron + Vite + React + Tailwind | Electron + Webpack + React + Arco Design + UnoCSS |
| **Session model** | Offline log parsing | Live session management with resume |
| **Storage** | IndexedDB (browser) | SQLite (better-sqlite3) |
| **Tool rendering** | Custom diff/code viewers | Monaco + DiffContentView + Preview Panel |

---

## Integration Strategy

There are three viable approaches, listed from least to most invasive. **We recommend a phased approach starting with Option A, then layering B and C.**

### Option A: Embedded Session Log Viewer (Low effort, High value)

**Concept:** Import claude-devtools' parsing and analysis services as a library and render session insights in a new AionUi panel/tab.

**How it works:**

1. **Extract core parsing logic** from claude-devtools into a reusable module:
   - `SessionParser` — reads JSONL from `~/.claude/projects/`
   - `MessageClassifier` — categorizes message types
   - `ClaudeMdReader` — extracts CLAUDE.md injections
   - `ChunkBuilder` / `ChunkFactory` — builds context chunks
   - `ToolExecutionBuilder` / `ToolResultExtractor` — structures tool data
   - `SubagentDetailBuilder` — handles multi-agent trees
   - `SemanticStepExtractor` / `SemanticStepGrouper` — high-level step grouping
   - `ProcessLinker` — links related operations
   - `ConversationGroupBuilder` — groups conversation turns

2. **Add a "Session Insights" tab** to the conversation preview panel (`PreviewContentType` already supports extensible types):
   ```
   src/renderer/pages/conversation/preview/
   ├── components/
   │   └── DevToolsPanel/
   │       ├── DevToolsPanel.tsx          # Main container
   │       ├── ContextVisualization.tsx    # Token attribution chart
   │       ├── CompactionTimeline.tsx      # Compaction events
   │       ├── ToolCallInspector.tsx       # Enhanced tool inspection
   │       └── SubagentTree.tsx           # Multi-agent tree view
   ```

3. **Wire parsing to session ID**: AionUi already stores `acpSessionId` in the conversation's `extra` data. Use this to locate the corresponding JSONL log under `~/.claude/projects/<project-hash>/`.

**Integration points:**
- `src/renderer/pages/conversation/preview/context/PreviewContext.tsx` — add `'devtools'` as a new `PreviewContentType`
- `src/process/bridge/conversationBridge.ts` — add IPC handler to parse session logs on demand
- `src/process/database/types.ts` — optionally cache parsed analysis results

**Pros:** Minimal changes to existing code. Users get insights for any Claude session (including past ones).
**Cons:** Post-hoc analysis only — there's a slight delay between live activity and parsed data.

---

### Option B: Live Stream Instrumentation (Medium effort, High value)

**Concept:** Tap into the live ACP message stream to provide real-time devtools metrics alongside the chat.

**How it works:**

1. **Add a message interceptor** in the ACP pipeline. The stream already flows through:
   ```
   AcpConnection → AcpAgent → AcpAdapter → AcpAgentManager → IPC → React
   ```
   Insert a `DevToolsCollector` between `AcpAgent` and `AcpAgentManager`:

   ```typescript
   // src/process/services/devtools/DevToolsCollector.ts
   export class DevToolsCollector {
     private tokenBudget: TokenBudget;
     private toolCalls: ToolExecution[];
     private compactionEvents: CompactionEvent[];
     private subagentTrees: SubagentNode[];

     onStreamEvent(event: IResponseMessage): void {
       // Classify and accumulate metrics in real-time
       this.classifyMessage(event);
       this.updateTokenAttribution(event);
       this.detectCompaction(event);
       this.trackSubagents(event);
     }

     getSnapshot(): DevToolsSnapshot {
       return {
         tokenBudget: this.tokenBudget,
         toolCalls: this.toolCalls,
         compactionEvents: this.compactionEvents,
         subagentTrees: this.subagentTrees,
       };
     }
   }
   ```

2. **Emit devtools events** through a new IPC channel:
   ```typescript
   // src/common/ipcBridge.ts
   devtools: {
     snapshot: bridge.buildEmitter<DevToolsSnapshot>('devtools-snapshot'),
     alert: bridge.buildEmitter<DevToolsAlert>('devtools-alert'),
   }
   ```

3. **Render live metrics** in a collapsible panel below the chat or as a sidebar tab, reusing Arco Design's `Statistic`, `Progress`, and `Timeline` components.

**Integration points:**
- `src/process/task/AcpAgentManager.ts` — hook into `onStreamEvent` pipeline
- `src/common/ipcBridge.ts` — new devtools channel
- `src/renderer/pages/conversation/` — new DevTools panel component

**Pros:** Real-time visibility. No dependency on log file parsing. Works for all ACP backends (not just Claude).
**Cons:** Requires understanding the ACP message format deeply. Token counting needs estimation since ACP doesn't expose raw token counts.

---

### Option C: Notification & Alert System (Low effort, Medium value)

**Concept:** Port claude-devtools' custom notification rules engine to AionUi.

**How it works:**

1. **Implement a rules engine** that evaluates regex patterns against live stream events:
   ```typescript
   // src/process/services/devtools/NotificationRules.ts
   interface NotificationRule {
     id: string;
     name: string;
     field: 'file_path' | 'command' | 'prompt' | 'content' | 'thinking' | 'text';
     pattern: RegExp;
     severity: 'info' | 'warning' | 'critical';
     enabled: boolean;
   }
   ```

2. **Built-in default rules** (matching claude-devtools):
   - `.env` file access detection
   - Tool execution errors
   - High token usage thresholds
   - Sensitive path access (`~/.ssh/`, credentials files)

3. **Surface alerts** via Arco Design's `Notification` component and optionally OS-native notifications via Electron's `Notification` API.

4. **Settings page** for rule management:
   ```
   src/renderer/pages/settings/DevToolsSettings.tsx
   ```

**Integration points:**
- `src/process/task/AcpAgentManager.ts` — evaluate rules on each stream event
- `src/renderer/pages/settings/` — new settings page
- `src/common/storage.ts` — persist notification rules

---

## Recommended Implementation Plan

### Phase 1: Foundation

1. **Fork/vendor claude-devtools' parsing services** as a dependency or internal module:
   - `src/process/services/devtools/parsing/` — ported from `claude-devtools/src/main/services/parsing/`
   - `src/process/services/devtools/analysis/` — ported from `claude-devtools/src/main/services/analysis/`
   - Adapt types to work with AionUi's existing `TMessage` / `IMessageRow` types

2. **Add "Session Insights" IPC bridge**:
   ```typescript
   // src/common/ipcBridge.ts
   devtools: {
     parseSession: bridge.buildProvider<{ conversationId: string }, SessionAnalysis>('devtools-parse-session'),
     getNotificationRules: bridge.buildProvider<void, NotificationRule[]>('devtools-get-rules'),
     setNotificationRules: bridge.buildProvider<NotificationRule[], void>('devtools-set-rules'),
   }
   ```

3. **Implement session log discovery**: Map `acpSessionId` → `~/.claude/projects/<hash>/<session>.jsonl`

### Phase 2: UI Components

4. **Context Visualization panel** — Arco `Progress` bars or a lightweight chart (e.g., recharts) showing token attribution across categories

5. **Compaction Timeline** — Arco `Timeline` component showing compaction events with token deltas

6. **Enhanced Tool Inspector** — Extend existing `MessageAcpToolCall.tsx` with:
   - Expandable raw input/output
   - Execution duration
   - Token cost per tool call

7. **Subagent Tree View** — Arco `Tree` component for multi-agent visualization

### Phase 3: Live Instrumentation

8. **DevToolsCollector** middleware in the ACP pipeline for real-time metrics

9. **Live token counter** in the conversation header showing context usage

10. **Notification rules engine** with settings page

### Phase 4: Polish

11. **Settings page** for devtools configuration (enable/disable panels, notification rules)

12. **Keyboard shortcut** to toggle devtools panel (e.g., `Cmd+Shift+D`)

13. **Export session analysis** to JSON/HTML for sharing

---

## File Structure

```
src/
├── process/
│   ├── services/
│   │   └── devtools/                    # NEW: Core devtools services
│   │       ├── index.ts
│   │       ├── DevToolsCollector.ts     # Live stream instrumentation
│   │       ├── NotificationRules.ts     # Alert rules engine
│   │       ├── SessionLogDiscovery.ts   # Maps sessions to log files
│   │       ├── parsing/                 # Ported from claude-devtools
│   │       │   ├── SessionParser.ts
│   │       │   ├── MessageClassifier.ts
│   │       │   └── ClaudeMdReader.ts
│   │       └── analysis/                # Ported from claude-devtools
│   │           ├── ChunkBuilder.ts
│   │           ├── ToolExecutionBuilder.ts
│   │           ├── SubagentDetailBuilder.ts
│   │           └── SemanticStepExtractor.ts
│   └── bridge/
│       └── devtoolsBridge.ts            # NEW: IPC handlers
├── renderer/
│   ├── pages/
│   │   ├── conversation/
│   │   │   └── preview/
│   │   │       └── components/
│   │   │           └── DevToolsPanel/   # NEW: Devtools UI
│   │   │               ├── DevToolsPanel.tsx
│   │   │               ├── ContextVisualization.tsx
│   │   │               ├── CompactionTimeline.tsx
│   │   │               ├── ToolCallInspector.tsx
│   │   │               ├── SubagentTree.tsx
│   │   │               └── LiveTokenCounter.tsx
│   │   └── settings/
│   │       └── DevToolsSettings.tsx     # NEW: Devtools settings
│   └── messages/
│       └── acp/
│           └── MessageAcpToolCall.tsx    # MODIFY: Enhanced tool views
└── common/
    └── ipcBridge.ts                     # MODIFY: Add devtools channels
```

---

## Key Design Decisions

### Why not embed claude-devtools as a webview?
- Electron-in-Electron is wasteful and fragile
- claude-devtools uses Vite + Tailwind while AionUi uses Webpack + UnoCSS — style conflicts are inevitable
- Porting the parsing/analysis logic is more maintainable than embedding the full app

### Why vendor the code instead of using it as an npm package?
- claude-devtools is not published as a library — it's a standalone app
- The parsing services have no clean API boundary yet
- Vendoring allows us to adapt types and strip UI dependencies
- We can contribute back upstream once the API stabilizes

### Why start with log parsing (Option A) instead of live instrumentation (Option B)?
- Log parsing works immediately for all existing sessions
- It's a safer integration point — no risk of affecting live chat performance
- Live instrumentation can be layered on top once the UI components exist
- Users get value from day one by analyzing past sessions

### Token counting accuracy
- claude-devtools counts tokens by walking JSONL logs which contain actual API payloads
- Live ACP stream doesn't expose raw token counts — we'd need to estimate via tiktoken or similar
- For Phase 1-2, log-based counting is accurate; Phase 3 live counting will be approximate

---

## Dependencies to Add

```json
{
  "dependencies": {
    "recharts": "^2.x"      // Lightweight charting for token visualization
  }
}
```

No other new dependencies needed — Arco Design's `Timeline`, `Tree`, `Statistic`, `Progress`, and `Tag` components cover the remaining UI needs.

---

## License Compatibility

- claude-devtools: **MIT** license
- AionUi: **Apache-2.0** license
- MIT is compatible with Apache-2.0 — we can vendor MIT code into an Apache-2.0 project with proper attribution

---

## Open Questions

1. **Upstream collaboration**: Should we propose extracting claude-devtools' parsing layer into a standalone `@claude-devtools/parser` npm package? This would benefit both projects.

2. **Scope for non-Claude agents**: The live instrumentation (Option B) could work for Gemini/Codex too. Should we generalize the devtools interface, or keep it Claude-specific?

3. **Performance budget**: Session logs can be large (10k+ turns). Should we parse lazily (on-demand per section) or eagerly (full session on open)?

4. **Remote sessions**: claude-devtools supports SFTP for remote `~/.claude/`. AionUi has WebUI mode. Should we support analyzing remote Claude sessions through the WebUI?
