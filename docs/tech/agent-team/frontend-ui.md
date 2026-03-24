# Agent Team — Frontend UI

## Entry Point: GuidPage

### Agent Pill Bar
- `AgentPillBar.tsx` has an "Agent Team" pill at the end (uses `Peoples` icon)
- Clicking it sets `selectedAgentKey = 'agent-team'`
- GuidPage conditionally renders `TeamBuilder` instead of `GuidInputCard`

### TeamBuilder (`src/renderer/pages/guid/components/TeamBuilder.tsx`)

Card-based team creation form:

- **Team Name** — plain Input
- **Workspace** — Input + folder picker button (`dialog.showOpen`)
  - Prefilled from `initialWorkspace` prop (passed from GuidPage's `guidInput.dir`)
- **Member Selection** — clickable cards with agent logo, name, type, selection indicator
  - Built from `availableAgents` (same list as agent pill bar)
  - Cards highlight on selection with primary border/background
- **Initial Brief** — `SendBox` component (IME-safe, with `FileAttachButton` for file upload)
  - Files shown via `FilePreview` + `HorizontalFileList` before creation
- **Create Button** — disabled until ≥2 members selected
- On create: calls `agentTeam.create.invoke()`, navigates to `/conversation/<teamId>`

## Chat Page: AgentTeamChat

`src/renderer/pages/conversation/platforms/agent-team/AgentTeamChat.tsx`

### Layout
```
┌──────────────────────────────┐
│  Timeline  |  Agents         │  ← custom tab bar (not Arco Tabs)
├──────────────────────────────┤
│                              │
│  [timeline entries or        │  ← flex:1, overflow-y:auto
│   member cards]              │
│                              │
├──────────────────────────────┤
│  [pending files preview]     │  ← FilePreview + HorizontalFileList
│  [SendBox]                   │  ← with FileAttachButton
└──────────────────────────────┘
```

**Why not Arco Tabs:** Arco Tabs uses absolute positioning for tab switching animation, which breaks flex height chain. Custom tab bar with conditional rendering avoids this.

### Timeline View

Each entry renders:
- **Agent logo** — resolved via `memberMap` (memberId → backend → `getAgentLogo()`)
- **Display name** — member name from team roster, "You" for user messages
- **Type badge** — claim, challenge, ack, decision, etc.
- **Dispatch label** — shows `→ target` for targeted messages, `(no wakeup)` for none
- **Timestamp** — `toLocaleTimeString()`
- **Summary** — one-line summary
- **Body** — rendered with `MarkdownView` (full GFM support)
- **Files** — rendered with `FilePreview` (readonly mode, base64 via IPC)

### Member Map Resolution

```typescript
// Load from team conversation's extra.members[] (not getMembers IPC)
ipcConversation.get.invoke({ id: conversation_id })
  → teamConv.extra.members[]
  → Map keyed by memberId, conversationId, name
  → { name, backend, type }
```

This ensures `entry.from` (which is a memberId) correctly maps to the right agent logo.

### Timeline Sorting

```typescript
// Sort by parsed Date, not string compare (handles UTC vs local tz)
new Date(a.ts).getTime() - new Date(b.ts).getTime()
```

### Agents View

- Lists all child conversations with logo, name, backend type
- Click navigates to child conversation (`/conversation/<childId>`)

### Message Sending

1. User types in SendBox → `handleSend(message)`
2. Pending files collected from `onFilesAdded`
3. `agentTeam.sendMessage.invoke({ conversation_id, input, files })`
4. Optimistic update: merge returned entry into timeline
5. `timelineStream.on` listener also merges (dedupe by ID)

### File Upload Flow

1. **Upload button**: `FileAttachButton` + `useOpenFileSelector`
2. **Drag/paste**: `SendBox` built-in via `onFilesAdded`
3. **Preview**: `FilePreview` + `HorizontalFileList` above SendBox
4. **Remove**: click × on each FilePreview chip
5. **Persist**: backend copies files to `<coordDir>/attachments/` on send
6. **Display**: timeline entries show `FilePreview` (readonly) for attached files

## Sidebar Integration

### Workspace Grouping (`GroupedHistory`)

- All conversations with `workspace` are grouped under workspace headers
- `groupingHelpers.ts` builds workspace tree with `WorkspaceNode` type:
  - `ConversationNode` — standalone conversation
  - `TeamNode` — agent-team parent with nested children
- Team children (conversations with `teamId`) excluded from top-level, nested under parent
- Workspace headers have `+` button (navigate to `/guid` with workspace prefilled) and hide button

### Hide/Unhide Workspaces

- `useConversations.ts` manages `hiddenWorkspaces` in localStorage
- Hidden workspaces filtered from both `timelineSections` and `pinnedConversations`
- "N hidden workspaces" recovery link at bottom of sidebar

### Pinned Team Conversations

- When agent-team is pinned, child conversations render nested underneath with `ml-16px` indent

## ChatConversation Routing

```typescript
// src/renderer/pages/conversation/components/ChatConversation.tsx
case 'agent-team':
  return <AgentTeamChat conversation_id={...} workspace={...} />;
```

- Model selector: skipped for agent-team
- CronJobManager: skipped for agent-team
- ChatSider (workspace panel): enabled for agent-team

## Key Components Used

| Component | From | Used For |
|-----------|------|----------|
| `SendBox` | `@/renderer/components/chat/sendbox` | IME-safe input with composition handling |
| `FileAttachButton` | `@/renderer/components/media/FileAttachButton` | File upload button |
| `FilePreview` | `@/renderer/components/media/FilePreview` | Image thumbnail / file card with remove |
| `HorizontalFileList` | `@/renderer/components/media/HorizontalFileList` | Horizontal scrollable file list |
| `MarkdownView` | `@/renderer/components/Markdown` | GFM markdown rendering for message body |
| `getAgentLogo` | `@/renderer/utils/model/agentLogo` | Agent icon resolution by backend name |
| `useOpenFileSelector` | `@/renderer/hooks/file/useOpenFileSelector` | Native file dialog via IPC |
| `ConversationProvider` | `@/renderer/hooks/context/ConversationContext` | Context for conversation ID/type |
