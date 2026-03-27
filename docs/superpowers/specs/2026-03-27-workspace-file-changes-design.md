# Workspace File Changes Panel

Track and display AI-generated file changes within the Workspace panel, giving users visibility into what files were modified, added, or deleted during a conversation.

## Context

When AI agents (Codex, Gemini, ACP) modify code in the workspace, users have no centralized view of what changed. Individual message tool results show per-turn changes, but there is no cumulative summary. Users need to see the full picture of modifications before reviewing or committing.

## Design Decisions

- **Snapshot at fsBridge layer** — intercept all file writes in `fsBridge.ts` writeFile provider, capturing before/after content. This is a single interception point that covers all agent types.
- **Cumulative per-conversation** — changes accumulate across all AI turns within a conversation, merging multiple edits to the same file.
- **Tab in Workspace panel** — new "Changes" tab alongside existing "Files" tab, not a separate panel.
- **Diff on demand** — diff is computed in renderer only when user clicks a file, not on every write.

## Architecture

### Three Layers

```
┌─────────────────────────────────────────────────┐
│  1. Snapshot Layer (Main Process)                │
│  fsBridge.ts writeFile provider                  │
│  - Read before content → execute write →         │
│    emit fileSnapshot.change via IPC              │
├─────────────────────────────────────────────────┤
│  2. State Management Layer (Renderer)            │
│  useFileChanges hook                             │
│  - Listen to fileSnapshot.change events          │
│  - Maintain Map<filePath, FileChangeRecord>      │
│  - Merge logic for repeated edits                │
│  - Clear on conversation switch                  │
├─────────────────────────────────────────────────┤
│  3. UI Layer (Renderer)                          │
│  Workspace "Changes" Tab                         │
│  - File list with status markers (M/A/D)         │
│  - Insertions/deletions stats per file           │
│  - Click to open DiffViewer in Preview panel     │
│  - Bottom summary bar                            │
└─────────────────────────────────────────────────┘
```

### Snapshot Interception

In `fsBridge.ts`, the `writeFile` provider is modified:

1. Before writing: read existing file content via `fs.readFile()` (returns `null` if file does not exist)
2. Execute the write: `fs.writeFile()` as before
3. After writing: emit a `fileSnapshot.change` event with the before/after data

For delete operations, the same pattern applies: capture content before deletion, then emit with `after: null`.

### IPC Channel

New emitter on `ipcBridge`:

```typescript
fileSnapshot: {
  change: bridge.buildEmitter<FileChangeEvent>('file-snapshot-change');
}
```

```typescript
type FileChangeEvent = {
  workspace: string;
  filePath: string;
  relativePath: string;
  operation: 'create' | 'modify' | 'delete';
  before: string | null;
  after: string | null;
  timestamp: number;
};
```

Note: `conversationId` is not included in the IPC event because `fsBridge.writeFile` provider only receives `{ path, data }` — it has no conversation context. The renderer-side `useFileChanges` hook associates events with the current conversation by matching the `workspace` field against the active conversation's workspace. When the conversation switches, the hook clears its state.

### State Management — useFileChanges Hook

Maintains a `Map<filePath, FileChangeRecord>` scoped to the current conversation + workspace.

```typescript
type FileChangeRecord = {
  filePath: string;
  relativePath: string;
  operation: 'create' | 'modify' | 'delete';
  before: string | null;
  after: string | null;
  timestamp: number;
};
```

**Merge rules for repeated edits to the same file:**

| Existing state | New event | Result                                                      |
| -------------- | --------- | ----------------------------------------------------------- |
| (none)         | create    | `create` (before=null)                                      |
| (none)         | modify    | `modify` (before=old content)                               |
| (none)         | delete    | `delete` (before=old content, after=null)                   |
| create         | modify    | `create` (before stays null, after updated)                 |
| create         | delete    | Remove from map (net effect: nothing happened)              |
| modify         | modify    | `modify` (keep original before, update after)               |
| modify         | delete    | `delete` (keep original before, after=null)                 |
| delete         | create    | `modify` (before=original before delete, after=new content) |

**Scope control:**

- Each record is keyed by `filePath` within the map
- The hook filters incoming events by matching `workspace` against the active conversation's workspace
- Conversation switch clears the entire map
- Only files within the current workspace directory are tracked

### UI — Changes Tab

**Tab bar** placed above WorkspaceToolbar:

- "Files" tab — renders existing ChatWorkspace content
- "Changes" tab — renders the change list, with a badge showing the count of changed files

**Change list item layout:**

```
[M] src/index.ts                    +12 -3
[A] src/utils.ts                    +45
[D] src/old-helper.ts               -28
```

- **Status marker**: `M` (yellow) for modify, `A` (green) for create, `D` (red) for delete
- **File path**: relative to workspace root
- **Stats**: green for insertions, red for deletions (computed lazily from before/after diff)
- **Click action**: opens DiffViewer in Preview panel using existing `openPreview({ type: 'diff', ... })`
- **Deleted files**: path shown with strikethrough and muted color

**Bottom summary bar:**

- Total insertions and deletions across all files

**Empty state:**

- "No changes yet" message when the map is empty

## New Files

| File                                                                       | Purpose                                                                     |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/common/adapter/ipcBridge.ts`                                          | Add `fileSnapshot.change` emitter (modify existing)                         |
| `src/process/bridge/fsBridge.ts`                                           | Add before-snapshot logic in writeFile provider (modify existing)           |
| `src/renderer/pages/conversation/Workspace/hooks/useFileChanges.ts`        | New hook: listen to snapshot events, manage cumulative state                |
| `src/renderer/pages/conversation/Workspace/components/WorkspaceTabBar.tsx` | New component: tab bar switching Files/Changes                              |
| `src/renderer/pages/conversation/Workspace/components/FileChangeList.tsx`  | New component: change list with status markers and stats                    |
| `src/renderer/pages/conversation/Workspace/index.tsx`                      | Modify: integrate tab bar and conditionally render file tree or change list |

## Edge Cases

- **Binary files**: skip snapshot for non-text files (detect via file extension or content sniffing). Show "Binary file changed" in the list without diff.
- **Large files**: cap snapshot at a reasonable size (e.g., 1MB). Files exceeding the limit show "File too large to diff" in the change list.
- **Rapid writes**: multiple writes in quick succession to the same file — the merge logic handles this naturally by keeping the original `before` and updating `after`.
- **Workspace not set**: if the write is not within any workspace directory, skip snapshot capture.
- **File encoding**: assume UTF-8 for text comparison. Non-UTF-8 files treated as binary.
