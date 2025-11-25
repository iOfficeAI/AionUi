# Workspace Module Documentation

## Overview

The Workspace module is a core component in AionUi for managing conversation workspace files and folders. It provides complete file tree display, file operations (open, delete, rename, preview), file addition, and paste functionality. The module follows a React Hooks architecture, splitting business logic into multiple independent hooks, achieving high modularity and maintainability.

## Architecture Design

The Workspace module follows the **Container Component Pattern**:

- **index.tsx (550 lines)**: Acts as the container component, composing and coordinating all hooks
- **hooks/**: 5 specialized hooks, each handling a specific business logic domain
- **utils/**: Utility functions for tree structure operations and path calculations
- **types.ts**: TypeScript type definitions

Advantages of this architecture:

- Single Responsibility Principle: Each hook handles only one business domain
- Highly testable: Business logic separated from UI
- Easy to maintain: Modifying specific functionality only requires focusing on the corresponding hook
- Code reuse: Hooks can be reused in other components

## Directory Structure

```
workspace/
├── index.tsx                   # Container component (550 lines) - Composes all hooks
├── hooks/                      # Business logic hooks
│   ├── useWorkspaceTree.ts     # Tree state management and selection logic
│   ├── useWorkspaceEvents.ts   # Event listener management
│   ├── useWorkspaceFileOps.ts  # File operations (open, delete, rename, preview)
│   ├── useWorkspaceModals.ts   # Modal and menu state management
│   └── useWorkspacePaste.ts    # File paste and add logic
├── utils/
│   └── treeHelpers.ts          # Tree structure utility functions
└── types.ts                    # TypeScript type definitions
```

## Hook Details

### 1. useWorkspaceTree

**Responsibility**: Manage workspace file tree state and selection logic

**Main Features**:

- File tree state management (files, loading, expandedKeys)
- Node selection state (selected, selectedKeysRef, selectedNodeRef)
- Load and refresh workspace
- Ensure node is properly selected
- Clear selection state

**Core API**:

```typescript
const {
  // State
  files, // File tree data
  loading, // Loading state (with debounce)
  selected, // Selected node keys
  expandedKeys, // Expanded node keys
  selectedNodeRef, // Last selected folder node reference

  // Actions
  loadWorkspace, // Load workspace
  refreshWorkspace, // Refresh workspace
  ensureNodeSelected, // Ensure node is selected
  clearSelection, // Clear selection
} = useWorkspaceTree({ workspace, conversation_id, eventPrefix });
```

**Features**:

- Loading state with debounce (at least 1 second) to avoid icon flickering
- Supports resetting Tree key when searching, maintains selection state otherwise
- Automatically expands first-level folders (root node)

### 2. useWorkspaceEvents

**Responsibility**: Manage all event listeners

**Events Listened**:

1. **Conversation switch event** - Reset all states (file tree, selection, modals)
2. **Agent response stream** - Auto-refresh workspace
   - Gemini: `tool_group`, `tool_call`
   - ACP: `acp_tool_call`
   - Codex: `codex_tool_call`
3. **Manual refresh workspace event** - `${eventPrefix}.workspace.refresh`
4. **Clear selected files event** - `${eventPrefix}.selected.file.clear` (after sending message)
5. **Search workspace response** - Update search results
6. **Context menu outside click** - Close menu (click, scroll, ESC key)

**Features**:

- Centralized event listener management
- Automatic cleanup of event listeners (React useEffect cleanup)
- Supports multiple agent type response streams

### 3. useWorkspaceFileOps

**Responsibility**: Handle all file operation logic

**Main Features**:

1. **Open node** (`handleOpenNode`) - Open file/folder with system default handler
2. **Reveal node** (`handleRevealNode`) - Show in system file explorer
3. **Delete node** (`handleDeleteNode`, `handleDeleteConfirm`) - Delete with confirmation
4. **Rename node** (`openRenameModal`, `handleRenameConfirm`) - Rename with timeout protection
5. **Preview file** (`handlePreviewFile`) - Support multiple format previews
6. **Add to chat** (`handleAddToChat`) - Add file/folder to conversation

**Supported Preview Formats**:

- **Markdown**: `.md`, `.markdown`
- **Diff**: `.diff`, `.patch`
- **Documents**: `.pdf`, `.ppt`, `.pptx`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.csv`
- **Code**: `.js`, `.ts`, `.tsx`, `.jsx`, `.py`, `.java`, `.go`, `.rs`, `.c`, `.cpp`, `.json`, `.xml`, `.yaml`, etc.
- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`, `.svg`, `.ico`, etc.
- **HTML**: `.html`, `.htm`

**Features**:

- Rename operation with 8-second timeout protection
- Auto-refresh after deletion (200ms delay)
- Preview automatically identifies type based on file extension
- Image preview reads as Base64 format

### 4. useWorkspaceModals

**Responsibility**: Manage all modal and menu states

**Managed States**:

1. **Context menu** (`contextMenu`) - Position, visibility, target node
2. **Rename modal** (`renameModal`) - Visibility, input value, target node, loading state
3. **Delete confirmation modal** (`deleteModal`) - Visibility, target node, loading state
4. **Paste confirmation modal** (`pasteConfirm`) - Visibility, file list, "do not ask again" option

**Core API**:

```typescript
const {
  // Context menu
  contextMenu,
  openContextMenu,
  closeContextMenu,

  // Rename modal
  renameModal,
  setRenameModal,
  renameLoading,
  closeRenameModal,

  // Delete modal
  deleteModal,
  setDeleteModal,
  closeDeleteModal,

  // Paste confirm
  pasteConfirm,
  setPasteConfirm,
  closePasteConfirm,
} = useWorkspaceModals();
```

**Features**:

- Centralized UI state management
- Provides unified open/close API
- Automatic state reset (avoid state leakage)

### 5. useWorkspacePaste

**Responsibility**: Handle file paste and add logic

**Main Features**:

1. **Add files** (`handleAddFiles`) - Add from file picker
2. **Handle paste** (`handleFilesToAdd`) - Add from system clipboard
3. **Confirm paste** (`handlePasteConfirm`) - Handle paste confirmation dialog

**Workflow**:

```
User pastes files
    ↓
Check workspace.pasteConfirm config
    ↓
├─ Confirmation disabled → Copy directly to target folder
└─ Confirmation required → Show confirmation dialog
                              ↓
                          User confirms → Copy files
                              ↓
                          If "do not ask again" checked → Save config
```

**Features**:

- Integrates `usePasteService` to capture global paste events
- Supports "do not ask again" preference (stored in `workspace.pasteConfirm`)
- Automatically calculates target folder (based on currently selected node)
- Visual feedback: Paste target folder displays "PASTE" label
- Supports pasting multiple files simultaneously
- Shows detailed error messages on failure

## Usage Examples

### Basic Usage

```tsx
import ChatWorkspace from './workspace';

function ConversationPage() {
  const [messageApi, messageContext] = Message.useMessage();

  return (
    <>
      {messageContext}
      <ChatWorkspace conversation_id={conversationId} workspace={workspacePath} eventPrefix='gemini' messageApi={messageApi} />
    </>
  );
}
```

### Listen to File Selection Events

```tsx
import { emitter } from '@/renderer/utils/emitter';
import { useEffect } from 'react';

function MyComponent() {
  useEffect(() => {
    const handleFileSelected = (items: Array<{ path: string; name: string; isFile: boolean }>) => {
      console.log('Selected files:', items);
    };

    emitter.on('gemini.selected.file', handleFileSelected);

    return () => {
      emitter.off('gemini.selected.file', handleFileSelected);
    };
  }, []);
}
```

### Manually Refresh Workspace

```tsx
import { emitter } from '@/renderer/utils/emitter';

function RefreshButton() {
  const handleRefresh = () => {
    emitter.emit('gemini.workspace.refresh');
  };

  return <button onClick={handleRefresh}>Refresh</button>;
}
```

### Clear File Selection

```tsx
import { emitter } from '@/renderer/utils/emitter';

function ClearButton() {
  const handleClear = () => {
    emitter.emit('gemini.selected.file.clear');
  };

  return <button onClick={handleClear}>Clear Selection</button>;
}
```

## Integration Points

### 1. EventPrefix Configuration

`eventPrefix` is used to distinguish different agent types, supports:

- `gemini` - Gemini AI conversation
- `acp` - ACP (AI Code Partner) conversation
- `codex` - Codex conversation

Event naming convention: `${eventPrefix}.${eventName}`

### 2. Preview Integration

Workspace depends on `PreviewContext` for file preview:

```tsx
import { PreviewProvider } from '../preview';

function Layout() {
  return (
    <PreviewProvider>
      <ChatWorkspace {...props} />
    </PreviewProvider>
  );
}
```

### 3. Paste Service Configuration

Control whether to show paste confirmation dialog via `workspace.pasteConfirm` config:

```typescript
// Disable paste confirmation
await ConfigStorage.set('workspace.pasteConfirm', true);

// Enable paste confirmation (default)
await ConfigStorage.set('workspace.pasteConfirm', false);
```

## Performance Optimizations

### 1. Debounced Loading State

Loading icon persists for at least 1 second to avoid flickering from rapid toggling:

```typescript
if (Date.now() - lastLoadingTime.current > 1000) {
  setLoading(false);
} else {
  setTimeout(() => setLoading(false), 1000);
}
```

### 2. Search Debounce

Search input uses `useDebounce` hook with 200ms delay to reduce unnecessary requests:

```typescript
const onSearch = useDebounce(
  (value: string) => {
    void treeHook.loadWorkspace(workspace, value);
  },
  200,
  [workspace, treeHook.loadWorkspace]
);
```

### 3. Selection State Optimization

Uses `useRef` to store selection state, avoiding unnecessary re-renders:

```typescript
const selectedKeysRef = useRef<string[]>([]);
const selectedNodeRef = useRef<SelectedNodeRef | null>(null);
```

## Error Handling

All file operations include comprehensive error handling:

```typescript
try {
  const result = await operation();
  if (!result.success) {
    messageApi.error(result.msg || t('defaultErrorMessage'));
  }
} catch (error) {
  messageApi.error(t('unknownError'));
}
```

## Testing Recommendations

1. **Unit Tests**: Test independent logic of each hook
2. **Integration Tests**: Test cooperation between hooks
3. **E2E Tests**: Test complete user operation flows
   - Add file → Preview → Rename → Delete
   - Paste files (with/without confirmation)
   - Search and filter

## Dependencies

```
index.tsx (Container Component)
    ↓
├── useWorkspaceTree        (Independent)
├── useWorkspaceModals      (Independent)
├── useWorkspacePaste       (Depends on: Tree, Modals)
├── useWorkspaceFileOps     (Depends on: Tree, Modals, Preview)
└── useWorkspaceEvents      (Depends on: Tree, Modals)
```

## FAQ

### Q: How to extend support for new file preview formats?

Add new extension detection in the `handlePreviewFile` function in `useWorkspaceFileOps`:

```typescript
if (['new', 'ext'].includes(ext)) {
  contentType = 'newType';
}
```

### Q: How to customize context menu items?

Modify the context menu rendering logic in `index.tsx` (lines 363-429).

### Q: Why is there a delay after deletion before refresh?

The 200ms delay ensures the file system operation completes, avoiding reading stale data during refresh.

### Q: How to disable paste confirmation dialog?

Users can check "do not ask again" in the paste confirmation dialog, or set it programmatically:

```typescript
await ConfigStorage.set('workspace.pasteConfirm', true);
```

## Related Links

- [Preview Module Documentation](../preview/README.en.md)
- [IPC Bridge Documentation](../../../../common/ipcBridge/README.en.md)
- [Configuration Storage Documentation](../../../../common/storage.ts)
