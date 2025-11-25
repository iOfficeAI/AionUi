# Preview 模块文档

## 概述

Preview 模块是 AionUi 中的文件预览和编辑系统，支持多种文件格式的查看和编辑。该模块采用**多 Tab 架构**，支持同时打开多个文件，每个文件在独立的 Tab 中显示。Preview 模块集成了实时流式更新、版本历史、分屏预览、快捷键等高级功能，为用户提供强大的文件处理能力。

## 核心特性

### 1. 多 Tab 管理

- 同时打开多个文件，每个文件在独立 Tab 中显示
- 智能 Tab 复用：相同文件不会重复打开
- Tab 溢出处理：自动显示渐变效果和滚动支持
- 右键菜单：关闭当前、关闭其他、关闭全部

### 2. 文件类型支持

支持的查看器（Viewers）：

- **Markdown** (`.md`, `.markdown`) - 完整的 Markdown 渲染
- **代码** (`.js`, `.ts`, `.tsx`, `.py`, `.java` 等) - 语法高亮
- **图片** (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg` 等) - 图片查看器
- **Diff** (`.diff`, `.patch`) - 差异对比
- **PDF** (`.pdf`) - PDF 文档查看
- **Word** (`.doc`, `.docx`, `.odt`) - Word 文档查看
- **Excel** (`.xls`, `.xlsx`, `.ods`, `.csv`) - 表格查看
- **PPT** (`.ppt`, `.pptx`, `.odp`) - 幻灯片查看
- **HTML** (`.html`, `.htm`) - HTML 渲染

支持的编辑器（Editors）：

- **Markdown 编辑器** - 实时预览 + 分屏模式
- **代码编辑器** - Monaco Editor 集成
- **HTML 编辑器** - HTML 实时编辑

### 3. 高级功能

- **实时流式更新** - Agent 写入文件时自动更新预览（带防抖优化）
- **版本历史** - 查看和恢复历史版本（基于 Git）
- **分屏预览** - 编辑器和预览同时显示，支持滚动同步
- **快捷键** - `Cmd/Ctrl + S` 保存，`Cmd/Ctrl + W` 关闭 Tab
- **脏检测** - 自动检测未保存的修改，关闭时弹出确认
- **拖拽调整** - 自由调整分屏比例
- **主题适配** - 自动跟随系统主题

## 架构设计

```
preview/
├── context/                           # React Context
│   ├── PreviewContext.tsx             # 核心上下文：Tab 管理、内容更新、保存
│   └── PreviewToolbarExtrasContext.tsx # 工具栏扩展上下文
├── components/
│   ├── PreviewPanel/                  # 主面板组件
│   │   ├── PreviewPanel.tsx           # 主组件（管理视图状态、分屏、编辑模式）
│   │   ├── PreviewTabs.tsx            # Tab 栏（Tab 切换、右键菜单）
│   │   ├── PreviewToolbar.tsx         # 工具栏（视图切换、编辑、保存、历史）
│   │   ├── PreviewContextMenu.tsx     # 右键菜单
│   │   ├── PreviewConfirmModals.tsx   # 确认对话框
│   │   └── PreviewHistoryDropdown.tsx # 历史版本下拉菜单
│   ├── viewers/                       # 查看器组件
│   │   ├── MarkdownViewer.tsx         # Markdown 渲染
│   │   ├── CodeViewer.tsx             # 代码高亮
│   │   ├── ImageViewer.tsx            # 图片查看
│   │   ├── DiffViewer.tsx             # Diff 对比
│   │   ├── PDFViewer.tsx              # PDF 查看
│   │   ├── WordViewer.tsx             # Word 查看
│   │   ├── ExcelViewer.tsx            # Excel 查看
│   │   ├── PPTViewer.tsx              # PPT 查看
│   │   └── HTMLViewer.tsx             # HTML 渲染
│   ├── editors/                       # 编辑器组件
│   │   ├── MarkdownEditor.tsx         # Markdown 编辑器
│   │   ├── TextEditor.tsx             # 代码编辑器（Monaco）
│   │   └── HTMLEditor.tsx             # HTML 编辑器
│   └── renderers/                     # 特殊渲染器
│       ├── HTMLRenderer.tsx           # HTML iframe 渲染器
│       └── SelectionToolbar.tsx       # HTML 选择工具栏
├── hooks/                             # 自定义 Hooks
│   ├── usePreviewHistory.ts           # 版本历史管理
│   ├── usePreviewKeyboardShortcuts.ts # 快捷键处理
│   ├── useScrollSync.ts               # 滚动同步
│   ├── useTabOverflow.ts              # Tab 溢出处理
│   └── useThemeDetection.ts           # 主题检测
├── utils/                             # 工具函数
│   └── fileUtils.ts                   # 文件操作工具
├── types/                             # TypeScript 类型
│   └── index.ts                       # 类型定义
└── constants.ts                       # 常量配置
```

## 核心 Context

### PreviewContext

Preview 模块的核心状态管理，负责 Tab 管理、内容更新和保存。

**状态**:

```typescript
interface PreviewContextValue {
  // 面板状态
  isOpen: boolean; // 预览面板是否打开
  tabs: PreviewTab[]; // 所有打开的 tabs
  activeTabId: string | null; // 当前激活的 tab ID
  activeTab: PreviewTab | null; // 当前激活的 tab

  // 操作
  openPreview: (content: string, type: PreviewContentType, metadata?: PreviewMetadata) => void;
  closePreview: () => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  updateContent: (content: string) => void;
  saveContent: (tabId?: string) => Promise<boolean>;

  // Tab 查找和管理
  findPreviewTab: (type: PreviewContentType, content?: string, metadata?: PreviewMetadata) => PreviewTab | null;
  closePreviewByIdentity: (type: PreviewContentType, content?: string, metadata?: PreviewMetadata) => void;

  // 发送框集成
  addToSendBox: (text: string) => void;
  setSendBoxHandler: (handler: ((text: string) => void) | null) => void;
}
```

**Tab 数据结构**:

```typescript
interface PreviewTab {
  id: string; // 唯一标识
  content: string; // 文件内容
  contentType: PreviewContentType; // 内容类型
  metadata?: PreviewMetadata; // 元数据（文件路径、标题等）
  title: string; // Tab 标题
  isDirty?: boolean; // 是否有未保存的修改
  originalContent?: string; // 原始内容（用于对比）
}
```

**智能 Tab 复用机制**:

当打开文件时，系统会按以下优先级查找是否已存在相同的 Tab：

1. **文件路径匹配**（最可靠）- `metadata.filePath`
2. **文件名匹配** - `metadata.fileName`
3. **标题匹配** - `metadata.title`
4. **内容匹配**（仅小文件 <100KB）- `content`

如果找到匹配的 Tab：

- 直接激活该 Tab
- 如果用户已编辑内容，保留编辑内容，仅更新元数据
- 如果未编辑，更新内容和元数据

如果没有找到匹配的 Tab：

- 创建新 Tab
- 自动激活新 Tab

### PreviewToolbarExtrasContext

用于查看器组件向工具栏注入自定义按钮。

```typescript
interface PreviewToolbarExtras {
  leftButtons?: React.ReactNode; // 工具栏左侧额外按钮
  rightButtons?: React.ReactNode; // 工具栏右侧额外按钮
}
```

## 流式更新机制

### 工作原理

当 Agent 写入工作空间文件时，Preview 模块会自动接收流式更新，无需手动刷新。

```typescript
// 订阅文件内容更新
ipcBridge.fileStream.contentUpdate.on(({ filePath, content, operation }) => {
  if (operation === 'delete') {
    // 文件被删除，关闭对应的 Tab
    closeTabByFilePath(filePath);
  } else {
    // 文件被写入，更新内容（带防抖）
    updateTabContent(filePath, content);
  }
});
```

### 防抖优化

为了避免 Agent 频繁写入导致预览被中断，流式更新使用了 **500ms 防抖**：

- Agent 每次写入文件都会触发事件
- 系统会等待 500ms 内没有新的写入
- 然后一次性更新预览内容

这样可以避免打字动画被频繁中断，提供更流畅的体验。

### 保存冲突处理

为了避免用户保存和流式更新冲突：

```typescript
// 保存文件时标记
savingFilesRef.current.add(filePath);

// 流式更新时检查
if (savingFilesRef.current.has(filePath) || tab.isDirty) {
  return; // 跳过更新
}
```

## 使用示例

### 基础用法

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

  return <button onClick={handleOpenFile}>打开文件</button>;
}
```

### 打开不同类型的文件

```tsx
// Markdown 文件
openPreview(markdownContent, 'markdown', {
  fileName: 'README.md',
  filePath: '/workspace/README.md',
  workspace: '/workspace',
});

// 代码文件
openPreview(codeContent, 'code', {
  fileName: 'app.tsx',
  filePath: '/workspace/src/app.tsx',
  workspace: '/workspace',
  language: 'typescript',
});

// 图片文件
openPreview(base64Content, 'image', {
  fileName: 'screenshot.png',
  filePath: '/workspace/screenshot.png',
  workspace: '/workspace',
});

// Diff 文件
openPreview(diffContent, 'diff', {
  fileName: 'changes.diff',
});
```

### 查找和关闭 Tab

```tsx
// 查找 Tab
const tab = findPreviewTab('markdown', undefined, {
  filePath: '/workspace/README.md',
});

// 关闭特定 Tab
if (tab) {
  closeTab(tab.id);
}

// 根据身份关闭 Tab
closePreviewByIdentity('markdown', undefined, {
  filePath: '/workspace/README.md',
});
```

### 集成发送框

```tsx
function SendBox() {
  const { setSendBoxHandler } = usePreviewContext();
  const [text, setText] = useState('');

  useEffect(() => {
    // 注册处理器
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

## 自定义 Hooks

### usePreviewHistory

管理文件版本历史（基于 Git）。

```typescript
const {
  historyVersions, // 历史版本列表
  historyLoading, // 加载状态
  snapshotSaving, // 保存快照状态
  historyError, // 错误信息
  historyTarget, // 当前查看的历史版本
  refreshHistory, // 刷新历史
  handleSaveSnapshot, // 保存快照
  handleSnapshotSelect, // 选择历史版本
} = usePreviewHistory({ activeTab, updateContent });
```

### usePreviewKeyboardShortcuts

注册全局快捷键。

支持的快捷键：

- `Cmd/Ctrl + S` - 保存当前 Tab
- `Cmd/Ctrl + W` - 关闭当前 Tab（未实现，预留）

```typescript
usePreviewKeyboardShortcuts({
  isDirty: activeTab?.isDirty,
  onSave: () => saveContent(),
});
```

### useScrollSync

同步编辑器和预览的滚动位置。

```typescript
const { handleEditorScroll, handlePreviewScroll } = useScrollSync({
  enabled: isSplitScreenEnabled,
  editorContainerRef,
  previewContainerRef,
});
```

### useTabOverflow

处理 Tab 栏溢出，自动显示渐变效果。

```typescript
const { tabsContainerRef, tabFadeState } = useTabOverflow([tabs, activeTabId]);
```

### useThemeDetection

检测当前主题（light/dark）。

```typescript
const currentTheme = useThemeDetection(); // 'light' | 'dark'
```

## 编辑模式

### 进入编辑模式

点击工具栏的"编辑"按钮或双击内容区域进入编辑模式。

支持编辑的类型：

- Markdown (`.md`, `.markdown`)
- 代码文件（所有文本文件）
- HTML (`.html`, `.htm`)

### 编辑器功能

**Markdown 编辑器**:

- 实时预览
- 分屏模式（编辑器 + 预览）
- 滚动同步
- 语法高亮

**代码编辑器（Monaco）**:

- 完整的代码编辑功能
- 语法高亮
- 自动补全
- 多语言支持

**HTML 编辑器**:

- 实时渲染
- 分屏模式
- 代码编辑 + 实时预览

### 保存和退出

- **保存** - 点击工具栏"保存"按钮或按 `Cmd/Ctrl + S`
- **退出** - 点击工具栏"完成"按钮
- **脏检测** - 如果有未保存的修改，退出时会弹出确认对话框

## 分屏模式

### 启用分屏

点击工具栏的分屏按钮启用分屏模式。

分屏模式下：

- 左侧显示编辑器
- 右侧显示预览
- 支持拖拽调整比例（默认 50/50）
- 支持滚动同步

### 调整分屏比例

拖拽中间的分隔条可以调整左右比例：

- 最小宽度：30%
- 最大宽度：70%
- 比例会自动保存到 LocalStorage

## 版本历史

### 功能说明

版本历史基于 Git，可以查看文件的所有历史版本。

前提条件：

- 文件必须在 Git 仓库中
- 文件有 `workspace` 和 `filePath` 元数据

### 使用方法

1. 点击工具栏的"历史"按钮
2. 在下拉菜单中查看历史版本
3. 点击某个版本查看内容
4. 点击"恢复此版本"将内容恢复到该版本

### 保存快照

点击"保存快照"按钮可以创建一个新的 Git commit，保存当前状态。

## 性能优化

### 1. Tab 智能复用

避免重复打开相同文件，减少内存占用。

### 2. 流式更新防抖

500ms 防抖避免频繁更新，提升性能和用户体验。

### 3. 大文件优化

- 内容匹配时跳过大文件（>100KB）
- 图片使用 Base64 延迟加载
- PDF/PPT/Word/Excel 使用外部查看器

### 4. Tab 溢出优化

使用 IntersectionObserver 监听 Tab 可见性，自动显示渐变效果。

### 5. 滚动同步节流

滚动同步使用 requestAnimationFrame 优化性能。

## 常见问题

### Q: 如何添加新的文件类型支持？

1. 在 `PreviewPanel.tsx` 中添加新的查看器/编辑器组件
2. 在 `renderContent()` 函数中添加类型判断
3. 更新 `PreviewContentType` 类型定义

### Q: 如何自定义工具栏按钮？

在查看器组件中使用 `PreviewToolbarExtrasContext`：

```tsx
const { setExtras } = usePreviewToolbarExtrasContext();

useEffect(() => {
  setExtras({
    rightButtons: <CustomButton />,
  });
  return () => setExtras(null);
}, []);
```

### Q: 流式更新为什么有延迟？

流式更新使用 500ms 防抖，避免 Agent 频繁写入导致预览被中断。这是性能和体验的权衡。

### Q: 如何禁用流式更新？

流式更新是自动的，无法禁用。如果不希望接收更新，可以进入编辑模式（编辑时会忽略流式更新）。

### Q: 为什么有些文件无法编辑？

以下文件类型不支持编辑：

- PDF
- Word
- Excel
- PPT
- 图片（但可以查看）

这些文件类型只提供查看功能。

## 配置项

### 常量配置

在 `constants.ts` 中定义：

```typescript
// 分屏默认比例
export const DEFAULT_SPLIT_RATIO = 50;

// 分屏最小宽度
export const MIN_SPLIT_WIDTH = 30;

// 分屏最大宽度
export const MAX_SPLIT_WIDTH = 70;

// 内置打开按钮的文件类型
export const FILE_TYPES_WITH_BUILTIN_OPEN = ['pdf', 'word', 'excel', 'ppt'];
```

## 相关链接

- [Workspace 模块文档](../workspace/README.md)
- [IPC Bridge 文档](../../../../common/ipcBridge/README.md)
- [Monaco Editor 文档](https://microsoft.github.io/monaco-editor/)
