# Workspace 模块文档

## 概述

Workspace 模块是 AionUi 中用于管理对话工作空间文件和文件夹的核心组件。它提供了完整的文件树展示、文件操作（打开、删除、重命名、预览）、文件添加和粘贴等功能。该模块采用 React Hooks 架构，将业务逻辑拆分为多个独立的 Hook，实现了高度模块化和可维护性。

## 架构设计

Workspace 模块遵循**容器组件模式（Container Component Pattern）**:

- **index.tsx (550行)**: 作为容器组件，负责组合和协调各个 Hook
- **hooks/**: 5个专用 Hook，每个处理特定的业务逻辑领域
- **utils/**: 工具函数，处理树结构操作和路径计算
- **types.ts**: TypeScript 类型定义

这种架构的优势:

- 单一职责原则：每个 Hook 只负责一个业务领域
- 高度可测试：业务逻辑与 UI 分离
- 易于维护：修改特定功能只需要关注对应的 Hook
- 代码复用：Hook 可以在其他组件中重用

## 目录结构

```
workspace/
├── index.tsx                   # 容器组件 (550行) - 组合所有 Hook
├── hooks/                      # 业务逻辑 Hooks
│   ├── useWorkspaceTree.ts     # 树状态管理和选择逻辑
│   ├── useWorkspaceEvents.ts   # 事件监听器管理
│   ├── useWorkspaceFileOps.ts  # 文件操作（打开、删除、重命名、预览）
│   ├── useWorkspaceModals.ts   # 模态框和菜单状态管理
│   └── useWorkspacePaste.ts    # 文件粘贴和添加逻辑
├── utils/
│   └── treeHelpers.ts          # 树结构操作工具函数
└── types.ts                    # TypeScript 类型定义
```

## Hook 详解

### 1. useWorkspaceTree

**职责**: 管理工作空间文件树的状态和选择逻辑

**主要功能**:

- 文件树状态管理（files, loading, expandedKeys）
- 节点选择状态（selected, selectedKeysRef, selectedNodeRef）
- 加载和刷新工作空间
- 确保节点被正确选中
- 清空选择状态

**核心 API**:

```typescript
const {
  // 状态
  files, // 文件树数据
  loading, // 加载状态（带防抖）
  selected, // 选中的节点 keys
  expandedKeys, // 展开的节点 keys
  selectedNodeRef, // 最后选中的文件夹节点引用

  // 操作
  loadWorkspace, // 加载工作空间
  refreshWorkspace, // 刷新工作空间
  ensureNodeSelected, // 确保节点被选中
  clearSelection, // 清空选择
} = useWorkspaceTree({ workspace, conversation_id, eventPrefix });
```

**特性**:

- Loading 状态带防抖（至少保持1秒），避免图标闪烁
- 支持搜索时重置 Tree key，非搜索时保持选中状态
- 自动展开第一层文件夹（根节点）

### 2. useWorkspaceEvents

**职责**: 管理所有事件监听器

**监听的事件**:

1. **对话切换事件** - 重置所有状态（文件树、选择、弹窗）
2. **Agent 响应流** - 自动刷新工作空间
   - Gemini: `tool_group`, `tool_call`
   - ACP: `acp_tool_call`
   - Codex: `codex_tool_call`
3. **手动刷新工作空间事件** - `${eventPrefix}.workspace.refresh`
4. **清空选中文件事件** - `${eventPrefix}.selected.file.clear`（发送消息后）
5. **搜索工作空间响应** - 更新搜索结果
6. **右键菜单外部点击** - 关闭菜单（点击、滚动、ESC键）

**特性**:

- 集中管理所有事件监听
- 自动清理事件监听器（React useEffect cleanup）
- 支持多种 Agent 类型的响应流

### 3. useWorkspaceFileOps

**职责**: 处理所有文件操作逻辑

**主要功能**:

1. **打开节点** (`handleOpenNode`) - 使用系统默认程序打开文件/文件夹
2. **定位节点** (`handleRevealNode`) - 在系统文件管理器中显示
3. **删除节点** (`handleDeleteNode`, `handleDeleteConfirm`) - 带确认的删除操作
4. **重命名节点** (`openRenameModal`, `handleRenameConfirm`) - 带超时保护的重命名
5. **预览文件** (`handlePreviewFile`) - 支持多种格式预览
6. **添加到聊天** (`handleAddToChat`) - 将文件/文件夹添加到对话

**支持的预览格式**:

- **Markdown**: `.md`, `.markdown`
- **Diff**: `.diff`, `.patch`
- **文档**: `.pdf`, `.ppt`, `.pptx`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.csv`
- **代码**: `.js`, `.ts`, `.tsx`, `.jsx`, `.py`, `.java`, `.go`, `.rs`, `.c`, `.cpp`, `.json`, `.xml`, `.yaml` 等
- **图片**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`, `.svg`, `.ico` 等
- **HTML**: `.html`, `.htm`

**特性**:

- 重命名操作带8秒超时保护
- 删除后自动刷新（延迟200ms）
- 预览支持根据文件扩展名自动识别类型
- 图片预览读取为 Base64 格式

### 4. useWorkspaceModals

**职责**: 管理所有模态框和菜单状态

**管理的状态**:

1. **右键菜单** (`contextMenu`) - 位置、可见性、目标节点
2. **重命名弹窗** (`renameModal`) - 可见性、输入值、目标节点、加载状态
3. **删除确认弹窗** (`deleteModal`) - 可见性、目标节点、加载状态
4. **粘贴确认弹窗** (`pasteConfirm`) - 可见性、文件列表、"不再询问"选项

**核心 API**:

```typescript
const {
  // 右键菜单
  contextMenu,
  openContextMenu,
  closeContextMenu,

  // 重命名弹窗
  renameModal,
  setRenameModal,
  renameLoading,
  closeRenameModal,

  // 删除弹窗
  deleteModal,
  setDeleteModal,
  closeDeleteModal,

  // 粘贴确认
  pasteConfirm,
  setPasteConfirm,
  closePasteConfirm,
} = useWorkspaceModals();
```

**特性**:

- 集中管理所有 UI 状态
- 提供统一的打开/关闭 API
- 自动重置状态（避免状态泄漏）

### 5. useWorkspacePaste

**职责**: 处理文件粘贴和添加逻辑

**主要功能**:

1. **添加文件** (`handleAddFiles`) - 从文件选择器添加
2. **处理粘贴** (`handleFilesToAdd`) - 从系统粘贴板添加
3. **确认粘贴** (`handlePasteConfirm`) - 处理粘贴确认对话框

**工作流程**:

```
用户粘贴文件
    ↓
检查 workspace.pasteConfirm 配置
    ↓
├─ 已禁用确认 → 直接复制到目标文件夹
└─ 需要确认 → 显示确认对话框
                ↓
            用户确认 → 复制文件
                ↓
            如果勾选"不再询问" → 保存配置
```

**特性**:

- 集成 `usePasteService` 捕获全局粘贴事件
- 支持"不再询问"偏好设置（存储在 `workspace.pasteConfirm`）
- 自动计算目标文件夹（基于当前选中的节点）
- 视觉反馈：粘贴目标文件夹显示 "PASTE" 标签
- 支持多文件同时粘贴
- 失败时显示详细错误信息

## 使用示例

### 基础用法

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

### 监听文件选中事件

```tsx
import { emitter } from '@/renderer/utils/emitter';
import { useEffect } from 'react';

function MyComponent() {
  useEffect(() => {
    const handleFileSelected = (items: Array<{ path: string; name: string; isFile: boolean }>) => {
      console.log('选中的文件:', items);
    };

    emitter.on('gemini.selected.file', handleFileSelected);

    return () => {
      emitter.off('gemini.selected.file', handleFileSelected);
    };
  }, []);
}
```

### 手动刷新工作空间

```tsx
import { emitter } from '@/renderer/utils/emitter';

function RefreshButton() {
  const handleRefresh = () => {
    emitter.emit('gemini.workspace.refresh');
  };

  return <button onClick={handleRefresh}>刷新</button>;
}
```

### 清空文件选择

```tsx
import { emitter } from '@/renderer/utils/emitter';

function ClearButton() {
  const handleClear = () => {
    emitter.emit('gemini.selected.file.clear');
  };

  return <button onClick={handleClear}>清空选择</button>;
}
```

## 集成要点

### 1. EventPrefix 配置

`eventPrefix` 用于区分不同的 Agent 类型，支持:

- `gemini` - Gemini AI 对话
- `acp` - ACP (AI Code Partner) 对话
- `codex` - Codex 对话

事件命名规则: `${eventPrefix}.${eventName}`

### 2. Preview 集成

Workspace 依赖 `PreviewContext` 来实现文件预览:

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

### 3. 粘贴服务配置

通过 `workspace.pasteConfirm` 配置项控制是否显示粘贴确认对话框:

```typescript
// 禁用粘贴确认
await ConfigStorage.set('workspace.pasteConfirm', true);

// 启用粘贴确认（默认）
await ConfigStorage.set('workspace.pasteConfirm', false);
```

## 性能优化

### 1. 防抖 Loading 状态

Loading 图标至少保持1秒，避免快速切换造成的闪烁:

```typescript
if (Date.now() - lastLoadingTime.current > 1000) {
  setLoading(false);
} else {
  setTimeout(() => setLoading(false), 1000);
}
```

### 2. 搜索防抖

搜索输入使用 `useDebounce` Hook，延迟200ms执行，减少不必要的请求:

```typescript
const onSearch = useDebounce(
  (value: string) => {
    void treeHook.loadWorkspace(workspace, value);
  },
  200,
  [workspace, treeHook.loadWorkspace]
);
```

### 3. 选择状态优化

使用 `useRef` 存储选择状态，避免不必要的重渲染:

```typescript
const selectedKeysRef = useRef<string[]>([]);
const selectedNodeRef = useRef<SelectedNodeRef | null>(null);
```

## 错误处理

所有文件操作都包含完整的错误处理:

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

## 测试建议

1. **单元测试**: 测试各个 Hook 的独立逻辑
2. **集成测试**: 测试 Hook 之间的协作
3. **E2E 测试**: 测试完整的用户操作流程
   - 文件添加 → 预览 → 重命名 → 删除
   - 粘贴文件（带/不带确认）
   - 搜索和过滤

## 依赖关系

```
index.tsx (容器组件)
    ↓
├── useWorkspaceTree        (独立)
├── useWorkspaceModals      (独立)
├── useWorkspacePaste       (依赖: Tree, Modals)
├── useWorkspaceFileOps     (依赖: Tree, Modals, Preview)
└── useWorkspaceEvents      (依赖: Tree, Modals)
```

## 常见问题

### Q: 如何扩展支持新的文件预览格式？

在 `useWorkspaceFileOps` 的 `handlePreviewFile` 函数中添加新的扩展名判断:

```typescript
if (['new', 'ext'].includes(ext)) {
  contentType = 'newType';
}
```

### Q: 如何自定义右键菜单项？

修改 `index.tsx` 中的右键菜单渲染逻辑（第363-429行）。

### Q: 为什么删除后需要延迟刷新？

延迟200ms是为了确保文件系统操作完成，避免刷新时读取到旧数据。

### Q: 如何禁用粘贴确认对话框？

用户可以在粘贴确认对话框中勾选"不再询问"，或者通过代码设置:

```typescript
await ConfigStorage.set('workspace.pasteConfirm', true);
```

## 相关链接

- [Preview 模块文档](../preview/README.md)
- [IPC Bridge 文档](../../../../common/ipcBridge/README.md)
- [配置存储文档](../../../../common/storage.ts)
