# Investigation: Team Mode Thinking Block Rendering Issues

## Problem Summary
In team mode, thinking blocks show two instances:
1. One labeled "思考中" (thinking) - appearing expanded by default
2. One labeled "思考完成" (thinking complete) - appearing as a collapsed duplicate

In single-chat mode, only one thinking block appears and is properly collapsed by default.

## Root Cause Analysis

### 1. Single-Chat Thinking Rendering Path (WORKS CORRECTLY)

**Flow:**
- User sends message → `useAcpMessage` hook (line 29 in useAcpMessage.ts)
- Backend streams `thinking` events
- `handleResponseMessage` at line 115-306 in useAcpMessage.ts processes the message
- Thinking events are converted to TMessage via `transformMessage` (chatLib.ts:545-564)
- `addOrUpdateMessage` accumulates thinking content via message index (hooks.ts:196-229)
- MessageThinking component renders with state based on `status` field
- **Default behavior**: `expanded = !isDone` (line 44 in MessageThinking.tsx)
  - When status='done': expanded=false (collapsed) ✓
  - When status='thinking': expanded=true (expanded) but only ONE message

### 2. Team Mode Thinking Rendering Path (BROKEN)

**Flow:**
- User sends message via team chat → AcpSendBox with `team_id` prop (line 90 in AcpSendBox.tsx)
- Message routes through `team.sendMessage` IPC (line 202 in AcpSendBox.tsx)
- Backend processes message via team MCP protocol
- Backend streams responses back to team leader's conversation

**THE PROBLEM - Dual Thinking Message Emission:**

Looking at AcpAgentManager.ts:1138-1147, `emitThinkingMessage` emits:
```typescript
ipcBridge.acpConversation.responseStream.emit({
  type: 'thinking',
  conversation_id: this.conversation_id,
  msg_id: this.thinkingMsgId,
  data: { content, duration, status }
})
```

**Critical Issue at line 710-717 in AcpAgentManager.ts:**
```typescript
ipcBridge.acpConversation.responseStream.emit(processedMessage);  // Line 710
// Only emit terminal events to team bus for agent lifecycle management
if (processedMessage.type === 'finish' || processedMessage.type === 'error') {
  teamEventBus.emit('responseStream', { ... });  // Line 713
}
```

**The bug:** Thinking messages are only emitted to `ipcBridge.acpConversation.responseStream`, NOT to `teamEventBus`. This means in team mode:

1. **Stream thinking event (immediate)** → emitted via ipcBridge only
   - Received by single-chat useAcpMessage
   - Creates first thinking message in message list
   
2. **Persisted thinking message (DB flush)** → persisted to database via `flushThinkingToDb` (line 1159)
   - When team members load conversation history, they get the persisted DB message
   - This creates a SECOND thinking message
   - The persisted one has `status='done'` (collapsed)

3. **Result in team mode:** Both messages appear in the list because:
   - The stream event creates one instance
   - The persisted DB message creates another instance
   - Message deduplication logic in `composeMessageWithIndex` (hooks.ts:196-229) only merges messages with same `msg_id`
   - Both have the same `msg_id`, but they come from different sources (stream vs DB)

### 3. Why Single-Chat Doesn't Have This Problem

In single-chat mode:
- Same messages are emitted via ipcBridge
- MessageLstCache (hooks.ts:365-422) loads DB messages but intelligently merges them
- The `useMessageLstCache` logic (lines 385-409) compares stream vs DB content:
  - If stream version has MORE content, keeps the stream version
  - If DB version has MORE or equal content, uses DB version
  - This prevents duplicate thinking messages because only the latest version survives

**BUT in team mode, the thinking message stream event is NOT being routed to team participants**, so they only see the DB version (collapsed, complete) while the leader sees both.

### 4. How MessageThinking Handles Status

File: `src/renderer/pages/conversation/Messages/components/MessageThinking.tsx:42-54`
```typescript
const { content: text, status, duration, subject } = message.content;
const isDone = status === 'done';
const [expanded, setExpanded] = useState(!isDone);  // Line 44

// Auto-collapse when status changes to done
useEffect(() => {
  if (isDone) {
    setExpanded(false);
  }
}, [isDone]);
```

**Issue:** There are TWO thinking messages:
1. One with `status='thinking'` (expanded by default)
2. One with `status='done'` (collapsed by default)

## Key Files and Line Numbers

| File | Lines | Issue |
|------|-------|-------|
| `src/process/task/AcpAgentManager.ts` | 1138-1147 | `emitThinkingMessage` only emits to `ipcBridge.acpConversation.responseStream` |
| `src/process/task/AcpAgentManager.ts` | 710-717 | Only `finish` and `error` events emitted to `teamEventBus`; thinking should be included |
| `src/process/task/AcpAgentManager.ts` | 1159-1179 | `flushThinkingToDb` persists thinking with status; creates duplicate in team mode |
| `src/renderer/pages/conversation/Messages/hooks.ts` | 196-229 | Message deduplication works correctly but receives duplicate messages |
| `src/renderer/pages/conversation/Messages/components/MessageThinking.tsx` | 42-54 | Default expansion state logic is correct but applied to duplicate messages |

## Why Two Thinking Messages Appear

1. **Stream Event (running):** `status='thinking'`, emitted to ipcBridge
   - Goes to single-chat useAcpMessage immediately
   - NOT sent to team event bus
   
2. **Persisted Message (done):** `status='done'`, saved to DB and loaded on team member view
   - Loaded via `useMessageLstCache` → `ipcBridge.database.getConversationMessages`
   - Seen by all participants (team members + leader)

3. **Message list sees BOTH:**
   - addOrUpdateMessage uses same `msg_id` for merging
   - But stream event adds it before DB finishes
   - When DB message loads, it has different timestamps/versions
   - Both get rendered due to timing of DB load vs stream events

## Comparison: Single-Chat vs Team Mode

| Aspect | Single-Chat | Team Mode |
|--------|-------------|-----------|
| Stream thinking events | Emitted via ipcBridge | Emitted via ipcBridge only |
| Team event bus relay | N/A | NOT relayed for thinking (only finish/error) |
| DB persistence | Normal | Same as single-chat |
| Message deduplication | Works (stream + DB merged intelligently) | Fails (duplicate thinking messages) |
| Expansion state | Correct (one message) | Wrong (duplicate messages with different states) |

## Solution Approach

**Option A (Minimal):** Relay thinking messages to team event bus
- File: `src/process/task/AcpAgentManager.ts`
- Location: Line 710-717
- Change: Add thinking events to the condition for teamEventBus emission

**Option B (Comprehensive):** Improve team-mode-specific handling
- Ensure thinking messages are properly deduplicated in team context
- Verify message composition logic handles stream + DB merge correctly

**Option C (Correct):** Fix root cause in message emission
- Only emit ONE version of thinking (either stream OR persisted, not both)
- Coordinate which version team participants see
