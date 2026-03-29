# Workspace 文件变更面板

在 Workspace 面板中追踪和展示 AI 产生的文件变更，让用户能看到在对话过程中哪些文件被修改、新增或删除。

## 背景

AI agent（Codex、Gemini、ACP）在 workspace 中修改代码时，用户没有统一的视图来查看变更。虽然单条消息的 tool result 能展示当次操作的变更，但缺少跨轮次的累计汇总。用户需要在 review 或提交前看到完整的修改全貌。

**为什么不拦截文件写入？** AI agent 不经过 `ipcBridge.fs.writeFile` ——Codex 和 ACP 直接调用 `fs.promises.writeFile()`，Gemini 使用外部库的 `executeToolCall()`。不存在统一的拦截点。因此我们采用 **快照对比** 方案。

## 设计决策

- **使用 isomorphic-git** —— 纯 JS git 实现，不依赖系统 git。原生支持 `statusMatrix()`、`.gitignore`、binary 检测。
- **双模式**：workspace 已有 `.git` 时直接复用（读取分支、对比 HEAD）；无 `.git` 时用独立 gitdir 创建基线快照。
- **按需比对** —— 用户查看「变更」Tab 时才请求比对，不需要文件监听或写入拦截。
- **Workspace 面板内的 Tab** —— 在已有的「文件」Tab 旁新增「变更」Tab（已实现）。

## 架构

### 三层结构

```
┌─────────────────────────────────────────────────┐
│  1. 快照层（主进程）                               │
│  WorkspaceSnapshotService                        │
│  - 双模式：复用已有 .git / 创建独立 gitdir          │
│  - statusMatrix() = 按需比对                       │
│  - readBlob() = 读取基线文件内容                    │
│  - currentBranch() = 读取当前分支名                 │
├─────────────────────────────────────────────────┤
│  2. IPC 层                                       │
│  fileSnapshot providers（请求/响应模式）             │
│  - init：初始化快照（自动识别模式）                   │
│  - compare：获取变更文件列表                         │
│  - getFileContent：获取基线文件内容用于 diff          │
│  - getInfo：获取快照信息（模式、分支名等）             │
│  - dispose：清理（仅独立 gitdir 模式需要）            │
├─────────────────────────────────────────────────┤
│  3. UI 层（渲染进程）                               │
│  useFileChanges hook + 变更 Tab                    │
│  - 切换到变更 Tab 时请求比对                         │
│  - 展示文件列表及 M/A/D 状态标记                     │
│  - 展示当前分支名（有 .git 时）                      │
│  - 点击文件时请求基线内容 → 展示 diff                 │
└─────────────────────────────────────────────────┘
```

### 双模式设计

根据 workspace 目录是否已有 `.git`，服务自动选择模式：

|              | Git 仓库模式（已有 `.git`）          | 快照模式（无 `.git`）                           |
| ------------ | ------------------------------------ | ----------------------------------------------- |
| **适用场景** | 用户指定了本地项目目录               | 临时 workspace 目录                             |
| **初始化**   | 无需额外操作，直接读取已有 `.git`    | 创建独立 gitdir → `git init` + `add` + `commit` |
| **基线**     | 当前 HEAD commit                     | 自建的 baseline commit                          |
| **比对**     | `statusMatrix()` 对比 HEAD vs 工作区 | `statusMatrix()` 对比 baseline vs 工作区        |
| **分支信息** | `currentBranch()` 读取当前分支       | 无分支概念                                      |
| **清理**     | 无需清理（不修改用户的 `.git`）      | 销毁临时 gitdir                                 |

**模式检测逻辑：**

```typescript
import fs from 'node:fs';
import path from 'node:path';

async function detectMode(workspacePath: string): Promise<'git-repo' | 'snapshot'> {
  try {
    await fs.promises.access(path.join(workspacePath, '.git'));
    return 'git-repo';
  } catch {
    return 'snapshot';
  }
}
```

### 快照服务 —— WorkspaceSnapshotService

位于主进程，每个 workspace 目录管理一个快照实例。

```typescript
class WorkspaceSnapshotService {
  private snapshots: Map<string, SnapshotState>;

  /** 初始化：检测模式并建立快照 */
  async init(workspacePath: string): Promise<SnapshotInfo>;

  /** 使用 statusMatrix() 比对当前文件系统与基线 */
  async compare(workspacePath: string): Promise<FileChangeInfo[]>;

  /** 从 git object store 读取文件的基线内容 */
  async getBaselineContent(workspacePath: string, filePath: string): Promise<string | null>;

  /** 获取快照信息（模式、分支名等） */
  async getInfo(workspacePath: string): Promise<SnapshotInfo>;

  /** 清理临时 gitdir（仅快照模式） */
  async dispose(workspacePath: string): Promise<void>;
}
```

**快照状态：**

```typescript
type SnapshotState = {
  mode: 'git-repo' | 'snapshot';
  workspacePath: string;
  gitdir: string; // git-repo 模式下等于 path.join(workspacePath, '.git')
  baselineOid: string; // git-repo 模式下为 HEAD commit OID
  branch: string | null; // git-repo 模式下为当前分支名，snapshot 模式下为 null
};

type SnapshotInfo = {
  mode: 'git-repo' | 'snapshot';
  branch: string | null;
};
```

### isomorphic-git 操作

**Git 仓库模式初始化：**

```typescript
// workspace 已有 .git，直接读取
const gitdir = path.join(workspacePath, '.git');
const branch = (await git.currentBranch({ fs, dir: workspacePath, gitdir })) ?? null;
const [headCommit] = await git.log({ fs, dir: workspacePath, gitdir, depth: 1 });
const baselineOid = headCommit.oid;
```

**快照模式初始化：**

```typescript
// workspace 无 .git，创建独立 gitdir
const gitdir = path.join(os.tmpdir(), `aionui-snapshot-${Date.now()}`);

await git.init({ fs, dir: workspacePath, gitdir });
await git.add({ fs, dir: workspacePath, gitdir, filepath: '.' });
const baselineOid = await git.commit({
  fs,
  dir: workspacePath,
  gitdir,
  message: 'baseline',
  author: { name: 'AionUI', email: 'snapshot@aionui.local' },
});
```

**按需比对（两种模式通用）：**

```typescript
const matrix = await git.statusMatrix({ fs, dir: workspacePath, gitdir });

// statusMatrix 返回：[filepath, HEAD, WORKDIR, STAGE]
// HEAD=1 表示文件存在于基线中
// WORKDIR=0 表示文件已删除，WORKDIR=2 表示文件已修改
// HEAD=0 + WORKDIR=2 表示文件是新增的

const changes: FileChangeInfo[] = matrix
  .filter(([_, head, workdir]) => head !== workdir) // 只保留有变更的文件
  .map(([filepath, head, workdir]) => ({
    relativePath: filepath,
    filePath: path.join(workspacePath, filepath),
    operation: head === 0 ? 'create' : workdir === 0 ? 'delete' : 'modify',
  }));
```

**读取基线文件内容（用于 diff，两种模式通用）：**

```typescript
const { blob } = await git.readBlob({
  fs,
  dir: workspacePath,
  gitdir,
  oid: baselineOid,
  filepath: relativePath,
});
const content = new TextDecoder().decode(blob);
```

### .gitignore 支持

- **Git 仓库模式**：workspace 自带 `.gitignore`，isomorphic-git 原生遵守。
- **快照模式**：如果 workspace 没有 `.gitignore`，在拍摄快照前创建一个最小默认配置：

```
node_modules/
.git/
*.lock
```

### IPC 通道

将旧的 `buildEmitter`（单向事件）替换为 `buildProvider`（请求/响应模式）：

```typescript
export const fileSnapshot = {
  init: bridge.buildProvider<SnapshotInfo, { workspace: string }>('file-snapshot-init'),
  compare: bridge.buildProvider<FileChangeInfo[], { workspace: string }>('file-snapshot-compare'),
  getBaselineContent: bridge.buildProvider<string | null, { workspace: string; filePath: string }>(
    'file-snapshot-baseline'
  ),
  getInfo: bridge.buildProvider<SnapshotInfo, { workspace: string }>('file-snapshot-info'),
  dispose: bridge.buildProvider<void, { workspace: string }>('file-snapshot-dispose'),
};
```

```typescript
type FileChangeInfo = {
  filePath: string;
  relativePath: string;
  operation: 'create' | 'modify' | 'delete';
};

type SnapshotInfo = {
  mode: 'git-repo' | 'snapshot';
  branch: string | null; // 如 'main'、'feat/xxx'，快照模式下为 null
};
```

### 快照生命周期

**何时创建快照：**

1. **对话关联 workspace 时** —— 打开对话且 `extra.workspace` 已设置
2. **Workspace 迁移时** —— 用户从临时 workspace 切换到指定目录（为新目录创建快照，旧的销毁）

**何时销毁：**

1. **对话关闭时** —— 清理临时 gitdir（仅快照模式）
2. **Workspace 迁移时** —— 先销毁旧快照再创建新的
3. **应用退出时** —— 清理所有剩余的临时 gitdir

**渲染进程触发：**

`useFileChanges` hook 在 workspace 变化时调用 `ipcBridge.fileSnapshot.init.invoke()`，在用户切换到「变更」Tab 时调用 `ipcBridge.fileSnapshot.compare.invoke()`。

### 状态管理 —— useFileChanges Hook（重新设计）

Hook 不再监听实时事件，改为按需请求比对。

```typescript
export function useFileChanges({ workspace, conversationId }: UseFileChangesParams): UseFileChangesReturn {
  const [changes, setChanges] = useState<FileChangeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [snapshotInfo, setSnapshotInfo] = useState<SnapshotInfo | null>(null);
  const initializedRef = useRef(false);

  // workspace 设置时初始化快照
  useEffect(() => {
    if (!workspace) return;
    initializedRef.current = false;
    ipcBridge.fileSnapshot.init.invoke({ workspace }).then((info) => {
      setSnapshotInfo(info);
      initializedRef.current = true;
    });
    return () => {
      ipcBridge.fileSnapshot.dispose.invoke({ workspace });
    };
  }, [workspace, conversationId]);

  // 按需获取变更
  const refreshChanges = useCallback(async () => {
    if (!workspace || !initializedRef.current) return;
    setLoading(true);
    const result = await ipcBridge.fileSnapshot.compare.invoke({ workspace });
    setChanges(result);
    setLoading(false);
  }, [workspace]);

  return {
    changes,
    changeCount: changes.length,
    loading,
    snapshotInfo,
    refreshChanges,
  };
}
```

### UI —— 变更 Tab（已实现）

已有的 UI 组件（`WorkspaceTabBar.tsx`、`FileChangeList.tsx`）基本保留，主要调整：

- **分支名展示**：当 `snapshotInfo.mode === 'git-repo'` 时，在 Tab 栏或工具栏区域展示当前分支名（如 `main`、`feat/xxx`）。
- **FileChangeList**：移除 `before`/`after` 字段 —— diff 统计不再预计算。用户点击文件时，通过 `ipcBridge.fileSnapshot.getBaselineContent.invoke()` 获取基线内容，再读取当前内容，然后计算 diff。
- **刷新按钮**：增加手动刷新操作，重新执行 `compare()`（因为变更不是实时推送的）。
- **加载状态**：比对过程中显示 loading 指示器。
- **自动刷新**：切换到「变更」Tab 时自动调用 `refreshChanges()`。

### Diff 流程（点击文件时）

```
用户在变更 Tab 中点击文件
  → FileChangeList 调用 handleOpenDiff(file)
  → modify：通过 getBaselineContent 获取基线 + 读取当前文件
  → create：基线为 null，读取当前内容
  → delete：读取基线内容，当前为 null
  → 使用 createTwoFilesPatch() 计算 diff
  → 通过 openPreview({ type: 'diff', ... }) 在 Preview 面板中打开
```

## 需要创建/修改的文件

| 文件                                                                       | 操作 | 用途                                                            |
| -------------------------------------------------------------------------- | ---- | --------------------------------------------------------------- |
| `src/process/services/WorkspaceSnapshotService.ts`                         | 新建 | isomorphic-git 快照管理服务（双模式）                           |
| `src/process/bridge/workspaceSnapshotBridge.ts`                            | 新建 | 快照操作的 IPC provider 处理器                                  |
| `src/process/bridge/index.ts`                                              | 修改 | 在 `initAllBridges()` 中注册快照 bridge                         |
| `src/common/adapter/ipcBridge.ts`                                          | 修改 | 将 `fileSnapshot` emitter 替换为 providers                      |
| `src/common/types/fileSnapshot.ts`                                         | 修改 | 更新类型（新增 SnapshotInfo，FileChangeInfo 移除 before/after） |
| `src/renderer/pages/conversation/Workspace/hooks/useFileChanges.ts`        | 重写 | 从事件监听改为按需比对，增加 snapshotInfo                       |
| `src/renderer/pages/conversation/Workspace/components/FileChangeList.tsx`  | 修改 | 延迟加载 diff、loading 状态、刷新                               |
| `src/renderer/pages/conversation/Workspace/components/WorkspaceTabBar.tsx` | 修改 | 展示分支名                                                      |
| `src/process/bridge/fsBridge.ts`                                           | 修改 | 移除快照拦截代码                                                |
| `package.json`                                                             | 修改 | 添加 `isomorphic-git` 依赖                                      |

## 边界情况

- **二进制文件**：isomorphic-git 会在 object store 中追踪它们。`statusMatrix()` 能检测变更。UI 显示「Binary file changed」不提供 diff（使用 `FileService.isTextFile()` 区分）。
- **大型 workspace**：`git.add({ filepath: '.' })` 和 `statusMatrix()` 会遍历整个目录树。对于非常大的 workspace（>10K 文件），初始快照可能需要几秒 —— 显示 loading 指示器。考虑增加文件数量限制或超时。
- **无 .gitignore（快照模式）**：快照前创建一个最小默认 `.gitignore`（node_modules、.git、lock 文件），避免 git object store 膨胀。
- **Git 仓库模式下用户自己提交**：如果用户在 AionUI 外面 commit 了代码，HEAD 会变化。下次 `compare()` 的基线可能和 init 时不同。可以在 `compare()` 时检测 HEAD 是否变化并更新 `baselineOid`，或者保持 init 时的 OID 不变（展示「自打开对话以来的所有变更」）。当前选择：**保持 init 时的 OID 不变**，即展示对话开始以来的所有变更。
- **并发快照**：服务按 workspace 路径维护一个快照实例。如果同一个 workspace 在多个对话中打开，它们共享快照。
- **文件编码**：`readBlob()` 返回 `Uint8Array`。文本文件使用 `TextDecoder`。非 UTF-8 文件视为二进制。
- **临时目录清理**：gitdir 使用 `os.tmpdir()`。在应用退出和对话关闭时注册清理逻辑。Git 仓库模式不需要清理。
- **裸 worktree / submodule**：暂不支持特殊 git 配置，`.git` 为文件（非目录）时回退到快照模式。
