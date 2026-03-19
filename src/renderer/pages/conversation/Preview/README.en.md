# Preview Module Documentation

## Overview

The Preview module is the file preview and editing system in AionUi, supporting viewing and editing of multiple file formats. The module adopts a **multi-tab architecture**, allowing multiple files to be opened simultaneously, with each file displayed in its own tab. The Preview module integrates advanced features such as real-time streaming updates, version history, split-screen preview, and keyboard shortcuts, providing users with powerful file handling capabilities.

## Core Features

### 1. Multi-Tab Management

- Open multiple files simultaneously, each displayed in its own tab
- Smart tab reuse: Same file won't be opened multiple times
- Tab overflow handling: Automatically shows fade effect and scroll support
- Context menu: Close current, close others, close all

### 2. File Type Support

Supported Viewers:

- **Markdown** (`.md`, `.markdown`) - Complete Markdown rendering
- **Code** (`.js`, `.ts`, `.tsx`, `.py`, `.java`, etc.) - Syntax highlighting
- **Images** (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, etc.) - Image viewer
- **Diff** (`.diff`, `.patch`) - Diff comparison
- **PDF** (`.pdf`) - PDF document viewer
- **Word** (`.doc`, `.docx`, `.odt`) - Word document viewer
- **Excel** (`.xls`, `.xlsx`, `.ods`, `.csv`) - Spreadsheet viewer
- **PPT** (`.ppt`, `.pptx`, `.odp`) - Presentation viewer
- **HTML** (`.html`, `.htm`) - HTML rendering

Supported Editors:

- **Markdown Editor** - Live preview + split-screen mode
- **Code Editor** - Monaco Editor integration
- **HTML Editor** - Real-time HTML editing

### 3. Advanced Features

- **Real-time streaming updates** - Auto-update preview when agent writes files (with debounce optimization)
- **Version history** - View and restore historical versions (Git-based)
- **Split-screen preview** - Show editor and preview simultaneously with scroll sync
- **Keyboard shortcuts** - `Cmd/Ctrl + S` to save, `Cmd/Ctrl + W` to close tab
- **Dirty detection** - Automatically detect unsaved changes, show confirmation when closing
- **Drag to resize** - Freely adjust split-screen ratio
- **Theme adaptation** - Automatically follows system theme

## Architecture Design

```
preview/
├── context/                           # React Context
│   ├── PreviewContext.tsx             # Core context: Tab management, content updates, saving
│   └── PreviewToolbarExtrasContext.tsx # Toolbar extension context
├── components/
│   ├── PreviewPanel/                  # Main panel component
│   │   ├── PreviewPanel.tsx           # Main component (manages view states, split-screen, edit mode)
│   │   ├── PreviewTabs.tsx            # Tab bar (tab switching, context menu)
│   │   ├── PreviewToolbar.tsx         # Toolbar (view switching, edit, save, history)
│   │   ├── PreviewContextMenu.tsx     # Context menu
│   │   ├── PreviewConfirmModals.tsx   # Confirmation dialogs
│   │   └── PreviewHistoryDropdown.tsx # History version dropdown
│   ├── viewers/                       # Viewer components
│   │   ├── MarkdownViewer.tsx         # Markdown rendering
│   │   ├── CodeViewer.tsx             # Code highlighting
│   │   ├── ImageViewer.tsx            # Image viewer
│   │   ├── DiffViewer.tsx             # Diff comparison
│   │   ├── PDFViewer.tsx              # PDF viewer
│   │   ├── WordViewer.tsx             # Word viewer
│   │   ├── ExcelViewer.tsx            # Excel viewer
│   │   ├── PPTViewer.tsx              # PPT viewer
│   │   └── HTMLViewer.tsx             # HTML rendering
│   ├── editors/                       # Editor components
│   │   ├── MarkdownEditor.tsx         # Markdown editor
│   │   ├── TextEditor.tsx             # Code editor (Monaco)
│   │   └── HTMLEditor.tsx             # HTML editor
│   └── renderers/                     # Special renderers
│       ├── HTMLRenderer.tsx           # HTML iframe renderer
│       └── SelectionToolbar.tsx       # HTML selection toolbar
├── hooks/                             # Custom hooks
│   ├── usePreviewHistory.ts           # Version history management
│   ├── usePreviewKeyboardShortcuts.ts # Keyboard shortcut handling
│   ├── useScrollSync.ts               # Scroll synchronization
│   ├── useTabOverflow.ts              # Tab overflow handling
│   └── useThemeDetection.ts           # Theme detection
├── utils/                             # Utility functions
│   └── fileUtils.ts                   # File operation utilities
├── types/                             # TypeScript types
│   └── index.ts                       # Type definitions
└── constants.ts                       # Configuration constants
```

## Core Context

### PreviewContext

The core state management of the Preview module, responsible for tab management, content updates, and saving.

**State**:

```typescript
interface PreviewContextValue {
  // Panel state
  isOpen: boolean; // Whether preview panel is open
  tabs: PreviewTab[]; // All open tabs
  activeTabId: string | null; // Currently active tab ID
  activeTab: PreviewTab | null; // Currently active tab

  // Operations
  openPreview: (content: string, type: PreviewContentType, metadata?: PreviewMetadata) => void;
  closePreview: () => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  updateContent: (content: string) => void;
  saveContent: (tabId?: string) => Promise<boolean>;

  // Tab finding and management
  findPreviewTab: (type: PreviewContentType, content?: string, metadata?: PreviewMetadata) => PreviewTab | null;
  closePreviewByIdentity: (type: PreviewContentType, content?: string, metadata?: PreviewMetadata) => void;

  // Send box integration
  addToSendBox: (text: string) => void;
  setSendBoxHandler: (handler: ((text: string) => void) | null) => void;
}
```

**Tab Data Structure**:

```typescript
interface PreviewTab {
  id: string; // Unique identifier
  content: string; // File content
  contentType: PreviewContentType; // Content type
  metadata?: PreviewMetadata; // Metadata (file path, title, etc.)
  title: string; // Tab title
  isDirty?: boolean; // Whether there are unsaved changes
  originalContent?: string; // Original content (for comparison)
}
```

**Smart Tab Reuse Mechanism**:

When opening a file, the system searches for existing tabs with the same identity in the following priority order:

1. **File path match** (most reliable) - `metadata.filePath`
2. **File name match** - `metadata.fileName`
3. **Title match** - `metadata.title`
4. **Content match** (small files only <100KB) - `content`

If a matching tab is found:

- Activate that tab directly
- If user has edited content, keep edited content and only update metadata
- If not edited, update both content and metadata

If no matching tab is found:

- Create a new tab
- Automatically activate the new tab

### PreviewToolbarExtrasContext

Used by viewer components to inject custom buttons into the toolbar.

```typescript
interface PreviewToolbarExtras {
  leftButtons?: React.ReactNode; // Extra buttons on left side of toolbar
  rightButtons?: React.ReactNode; // Extra buttons on right side of toolbar
}
```

## Streaming Update Mechanism

### How It Works

When an agent writes to workspace files, the Preview module automatically receives streaming updates without manual refresh.

```typescript
// Subscribe to file content updates
ipcBridge.fileStream.contentUpdate.on(({ filePath, content, operation }) => {
  if (operation === 'delete') {
    // File deleted, close corresponding tab
    closeTabByFilePath(filePath);
  } else {
    // File written, update content (with debounce)
    updateTabContent(filePath, content);
  }
});
```

### Debounce Optimization

To avoid frequent agent writes interrupting the preview, streaming updates use **500ms debounce**:

- Each agent file write triggers an event
- System waits for 500ms without new writes
- Then updates preview content in one batch

This avoids frequent interruptions to typing animations, providing a smoother experience.

### Save Conflict Handling

To avoid conflicts between user saves and streaming updates:

```typescript
// Mark when saving file
savingFilesRef.current.add(filePath);

// Check during streaming update
if (savingFilesRef.current.has(filePath) || tab.isDirty) {
  return; // Skip update
}
```

## Usage Examples

### Basic Usage

```tsx
import { PreviewProvider, usePreviewContext } from './preview';

function App() {
  return (
    <PreviewProvider>
      <YourComponent />
    </PreviewProvider>
  );
}

function YourComponent() {
  const { openPreview } = usePreviewContext();

  const handleOpenFile = async (filePath: string) => {
    const content = await readFile(filePath);
    openPreview(content, 'markdown', {
      fileName: 'example.md',
      filePath: '/path/to/example.md',
      workspace: '/workspace/root',
    });
  };

  return <button onClick={handleOpenFile}>Open File</button>;
}
```

### Open Different File Types

```tsx
// Markdown file
openPreview(markdownContent, 'markdown', {
  fileName: 'README.md',
  filePath: '/workspace/README.md',
  workspace: '/workspace',
});

// Code file
openPreview(codeContent, 'code', {
  fileName: 'app.tsx',
  filePath: '/workspace/src/app.tsx',
  workspace: '/workspace',
  language: 'typescript',
});

// Image file
openPreview(base64Content, 'image', {
  fileName: 'screenshot.png',
  filePath: '/workspace/screenshot.png',
  workspace: '/workspace',
});

// Diff file
openPreview(diffContent, 'diff', {
  fileName: 'changes.diff',
});
```

### Find and Close Tabs

```tsx
// Find tab
const tab = findPreviewTab('markdown', undefined, {
  filePath: '/workspace/README.md',
});

// Close specific tab
if (tab) {
  closeTab(tab.id);
}

// Close tab by identity
closePreviewByIdentity('markdown', undefined, {
  filePath: '/workspace/README.md',
});
```

### Integrate with Send Box

```tsx
function SendBox() {
  const { setSendBoxHandler } = usePreviewContext();
  const [text, setText] = useState('');

  useEffect(() => {
    // Register handler
    setSendBoxHandler((content) => {
      setText((prev) => prev + content);
    });

    return () => {
      setSendBoxHandler(null);
    };
  }, [setSendBoxHandler]);

  return <textarea value={text} onChange={(e) => setText(e.target.value)} />;
}
```

## Custom Hooks

### usePreviewHistory

Manage file version history (Git-based).

```typescript
const {
  historyVersions, // List of history versions
  historyLoading, // Loading state
  snapshotSaving, // Snapshot saving state
  historyError, // Error message
  historyTarget, // Currently viewing history version
  refreshHistory, // Refresh history
  handleSaveSnapshot, // Save snapshot
  handleSnapshotSelect, // Select history version
} = usePreviewHistory({ activeTab, updateContent });
```

### usePreviewKeyboardShortcuts

Register global keyboard shortcuts.

Supported shortcuts:

- `Cmd/Ctrl + S` - Save current tab
- `Cmd/Ctrl + W` - Close current tab (not implemented, reserved)

```typescript
usePreviewKeyboardShortcuts({
  isDirty: activeTab?.isDirty,
  onSave: () => saveContent(),
});
```

### useScrollSync

Synchronize scroll position between editor and preview.

```typescript
const { handleEditorScroll, handlePreviewScroll } = useScrollSync({
  enabled: isSplitScreenEnabled,
  editorContainerRef,
  previewContainerRef,
});
```

### useTabOverflow

Handle tab bar overflow, automatically show fade effects.

```typescript
const { tabsContainerRef, tabFadeState } = useTabOverflow([tabs, activeTabId]);
```

### useThemeDetection

Detect current theme (light/dark).

```typescript
const currentTheme = useThemeDetection(); // 'light' | 'dark'
```

## Edit Mode

### Enter Edit Mode

Click the "Edit" button in the toolbar or double-click the content area to enter edit mode.

Editable types:

- Markdown (`.md`, `.markdown`)
- Code files (all text files)
- HTML (`.html`, `.htm`)

### Editor Features

**Markdown Editor**:

- Live preview
- Split-screen mode (editor + preview)
- Scroll synchronization
- Syntax highlighting

**Code Editor (Monaco)**:

- Full code editing capabilities
- Syntax highlighting
- Auto-completion
- Multi-language support

**HTML Editor**:

- Real-time rendering
- Split-screen mode
- Code editing + live preview

### Save and Exit

- **Save** - Click "Save" button in toolbar or press `Cmd/Ctrl + S`
- **Exit** - Click "Done" button in toolbar
- **Dirty detection** - If there are unsaved changes, a confirmation dialog will appear when exiting

## Split-Screen Mode

### Enable Split-Screen

Click the split-screen button in the toolbar to enable split-screen mode.

In split-screen mode:

- Editor displayed on the left
- Preview displayed on the right
- Support drag to adjust ratio (default 50/50)
- Support scroll synchronization

### Adjust Split Ratio

Drag the divider in the middle to adjust the left-right ratio:

- Minimum width: 30%
- Maximum width: 70%
- Ratio is automatically saved to LocalStorage

## Version History

### Feature Description

Version history is Git-based and allows viewing all historical versions of a file.

Prerequisites:

- File must be in a Git repository
- File must have `workspace` and `filePath` metadata

### How to Use

1. Click the "History" button in the toolbar
2. View historical versions in the dropdown menu
3. Click on a version to view its content
4. Click "Restore this version" to restore content to that version

### Save Snapshot

Click the "Save snapshot" button to create a new Git commit, saving the current state.

## Performance Optimizations

### 1. Smart Tab Reuse

Avoid opening the same file multiple times, reducing memory usage.

### 2. Streaming Update Debounce

500ms debounce avoids frequent updates, improving performance and user experience.

### 3. Large File Optimization

- Skip content matching for large files (>100KB)
- Images use Base64 lazy loading
- PDF/PPT/Word/Excel use external viewers

### 4. Tab Overflow Optimization

Use IntersectionObserver to monitor tab visibility, automatically show fade effects.

### 5. Scroll Sync Throttling

Scroll synchronization uses requestAnimationFrame to optimize performance.

## FAQ

### Q: How to add support for new file types?

1. Add new viewer/editor component in `PreviewPanel.tsx`
2. Add type check in `renderContent()` function
3. Update `PreviewContentType` type definition

### Q: How to customize toolbar buttons?

Use `PreviewToolbarExtrasContext` in viewer components:

```tsx
const { setExtras } = usePreviewToolbarExtrasContext();

useEffect(() => {
  setExtras({
    rightButtons: <CustomButton />,
  });
  return () => setExtras(null);
}, []);
```

### Q: Why is there a delay in streaming updates?

Streaming updates use 500ms debounce to avoid frequent agent writes interrupting the preview. This is a tradeoff between performance and user experience.

### Q: How to disable streaming updates?

Streaming updates are automatic and cannot be disabled. If you don't want to receive updates, enter edit mode (streaming updates are ignored during editing).

### Q: Why can't some files be edited?

The following file types do not support editing:

- PDF
- Word
- Excel
- PPT
- Images (view only)

These file types only provide viewing functionality.

## Configuration

### Constant Configuration

Defined in `constants.ts`:

```typescript
// Default split ratio
export const DEFAULT_SPLIT_RATIO = 50;

// Minimum split width
export const MIN_SPLIT_WIDTH = 30;

// Maximum split width
export const MAX_SPLIT_WIDTH = 70;

// File types with built-in open button
export const FILE_TYPES_WITH_BUILTIN_OPEN = ['pdf', 'word', 'excel', 'ppt'];
```

## Related Links

- [Workspace Module Documentation](../workspace/README.en.md)
- [IPC Bridge Documentation](../../../../common/ipcBridge/README.en.md)
- [Monaco Editor Documentation](https://microsoft.github.io/monaco-editor/)
