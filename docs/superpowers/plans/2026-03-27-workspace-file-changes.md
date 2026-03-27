# Workspace 文件变更面板 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 在 Workspace 面板中通过 isomorphic-git 追踪文件变更，支持已有 git 仓库（展示分支名和未提交变更）和临时目录（独立快照对比）两种模式。

**架构:** 主进程 `WorkspaceSnapshotService` 使用 isomorphic-git 管理快照，通过 IPC provider 暴露 init/compare/getBaselineContent/dispose 接口，渲染进程按需请求比对结果并展示。

**技术栈:** isomorphic-git、Electron IPC bridge（`@office-ai/platform`）、React hooks、Arco Design、`diff` 包、已有 DiffViewer。

---

## 文件结构

| 文件                                                                       | 操作 | 职责                                                              |
| -------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------- |
| `src/common/types/fileSnapshot.ts`                                         | 重写 | 新类型定义：FileChangeInfo、SnapshotInfo（移除旧的事件/合并逻辑） |
| `src/common/adapter/ipcBridge.ts`                                          | 修改 | 将 `fileSnapshot` emitter 替换为 providers                        |
| `src/process/services/WorkspaceSnapshotService.ts`                         | 新建 | isomorphic-git 快照管理服务（双模式）                             |
| `src/process/bridge/workspaceSnapshotBridge.ts`                            | 新建 | 快照操作的 IPC provider 处理器                                    |
| `src/process/bridge/index.ts`                                              | 修改 | 注册快照 bridge                                                   |
| `src/process/bridge/fsBridge.ts`                                           | 修改 | 移除旧的快照拦截代码                                              |
| `src/renderer/pages/conversation/Workspace/hooks/useFileChanges.ts`        | 重写 | 从事件监听改为按需 IPC 调用                                       |
| `src/renderer/pages/conversation/Workspace/components/FileChangeList.tsx`  | 修改 | 延迟加载 diff、loading 状态、刷新按钮                             |
| `src/renderer/pages/conversation/Workspace/components/WorkspaceTabBar.tsx` | 修改 | 展示分支名                                                        |
| `src/renderer/pages/conversation/Workspace/index.tsx`                      | 修改 | 适配新 hook 接口                                                  |
| `tests/unit/WorkspaceSnapshotService.test.ts`                              | 新建 | 快照服务单元测试                                                  |
| `tests/unit/fileChanges.test.ts`                                           | 重写 | 适配新类型的测试                                                  |
| `package.json`                                                             | 修改 | 添加 `isomorphic-git` 依赖                                        |

---

### Task 1: 安装依赖 & 清理旧快照拦截代码

**Files:**

- Modify: `package.json`
- Modify: `src/process/bridge/fsBridge.ts`
- Modify: `src/common/adapter/ipcBridge.ts`

- [ ] **Step 1: 安装 isomorphic-git**

```bash
bun add isomorphic-git
```

- [ ] **Step 2: 移除 fsBridge.ts 中 writeFile provider 的快照代码**

在 `src/process/bridge/fsBridge.ts` 的 writeFile provider 中，找到 `// Capture before-state for file change tracking` 开头的代码块（约从 `let beforeContent` 到 `ipcBridge.fileSnapshot.change.emit(...)` 的 try/catch 结束），全部移除。恢复为原来的简单写入：

```typescript
// 移除 before-content capture 和 snapshot emit
// 保留原始的 await fs.writeFile(filePath, data, 'utf-8');
```

- [ ] **Step 3: 移除 fsBridge.ts 中 removeEntry provider 的快照代码**

在 removeEntry provider 的文件删除分支中，找到 `// Capture before-state for file change tracking` 开头的代码块，全部移除。恢复为原来的简单删除：

```typescript
// 恢复为：
await fs.unlink(targetPath);
```

- [ ] **Step 4: 验证 fsBridge.ts 编译无误**

```bash
bunx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock src/process/bridge/fsBridge.ts
git commit -m "chore: add isomorphic-git and remove old snapshot interception from fsBridge"
```

---

### Task 2: 类型定义 & IPC 通道

**Files:**

- Rewrite: `src/common/types/fileSnapshot.ts`
- Modify: `src/common/adapter/ipcBridge.ts`
- Rewrite: `tests/unit/fileChanges.test.ts`

- [ ] **Step 1: 重写类型定义文件**

```typescript
// src/common/types/fileSnapshot.ts

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type FileChangeOperation = 'create' | 'modify' | 'delete';

/** A single file's change status returned by comparison */
export type FileChangeInfo = {
  filePath: string;
  relativePath: string;
  operation: FileChangeOperation;
};

/** Snapshot metadata returned by init and getInfo */
export type SnapshotInfo = {
  mode: 'git-repo' | 'snapshot';
  branch: string | null;
};
```

- [ ] **Step 2: 替换 ipcBridge.ts 中的 fileSnapshot 定义**

在 `src/common/adapter/ipcBridge.ts` 中，找到现有的 `fileSnapshot` 导出：

```typescript
// 旧代码：
export const fileSnapshot = {
  change: bridge.buildEmitter<import('@/common/types/fileSnapshot').FileChangeEvent>('file-snapshot-change'),
};
```

替换为：

```typescript
// 新代码：
export const fileSnapshot = {
  init: bridge.buildProvider<import('@/common/types/fileSnapshot').SnapshotInfo, { workspace: string }>(
    'file-snapshot-init'
  ),
  compare: bridge.buildProvider<import('@/common/types/fileSnapshot').FileChangeInfo[], { workspace: string }>(
    'file-snapshot-compare'
  ),
  getBaselineContent: bridge.buildProvider<string | null, { workspace: string; filePath: string }>(
    'file-snapshot-baseline'
  ),
  getInfo: bridge.buildProvider<import('@/common/types/fileSnapshot').SnapshotInfo, { workspace: string }>(
    'file-snapshot-info'
  ),
  dispose: bridge.buildProvider<void, { workspace: string }>('file-snapshot-dispose'),
};
```

- [ ] **Step 3: 重写测试文件**

```typescript
// tests/unit/fileChanges.test.ts
import { describe, it, expect } from 'vitest';
import type { FileChangeInfo, SnapshotInfo } from '../../src/common/types/fileSnapshot';

describe('FileChangeInfo type', () => {
  it('represents a created file', () => {
    const info: FileChangeInfo = {
      filePath: '/workspace/src/new.ts',
      relativePath: 'src/new.ts',
      operation: 'create',
    };
    expect(info.operation).toBe('create');
  });

  it('represents a modified file', () => {
    const info: FileChangeInfo = {
      filePath: '/workspace/src/index.ts',
      relativePath: 'src/index.ts',
      operation: 'modify',
    };
    expect(info.operation).toBe('modify');
  });

  it('represents a deleted file', () => {
    const info: FileChangeInfo = {
      filePath: '/workspace/src/old.ts',
      relativePath: 'src/old.ts',
      operation: 'delete',
    };
    expect(info.operation).toBe('delete');
  });
});

describe('SnapshotInfo type', () => {
  it('represents git-repo mode with branch', () => {
    const info: SnapshotInfo = { mode: 'git-repo', branch: 'main' };
    expect(info.mode).toBe('git-repo');
    expect(info.branch).toBe('main');
  });

  it('represents snapshot mode without branch', () => {
    const info: SnapshotInfo = { mode: 'snapshot', branch: null };
    expect(info.mode).toBe('snapshot');
    expect(info.branch).toBeNull();
  });
});
```

- [ ] **Step 4: 运行测试验证**

```bash
bun run test -- tests/unit/fileChanges.test.ts
```

- [ ] **Step 5: 类型检查**

```bash
bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/common/types/fileSnapshot.ts src/common/adapter/ipcBridge.ts tests/unit/fileChanges.test.ts
git commit -m "refactor(snapshot): replace event-based types with on-demand comparison types and IPC providers"
```

---

### Task 3: WorkspaceSnapshotService

**Files:**

- Create: `src/process/services/WorkspaceSnapshotService.ts`
- Create: `tests/unit/WorkspaceSnapshotService.test.ts`

- [ ] **Step 1: 编写 WorkspaceSnapshotService 的测试**

```typescript
// tests/unit/WorkspaceSnapshotService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceSnapshotService } from '../../src/process/services/WorkspaceSnapshotService';

describe('WorkspaceSnapshotService', () => {
  let service: WorkspaceSnapshotService;
  let tmpDir: string;

  beforeEach(async () => {
    service = new WorkspaceSnapshotService();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-test-'));
  });

  afterEach(async () => {
    await service.dispose(tmpDir).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('snapshot mode (no .git)', () => {
    it('init returns snapshot mode with null branch', async () => {
      await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello');
      const info = await service.init(tmpDir);
      expect(info.mode).toBe('snapshot');
      expect(info.branch).toBeNull();
    });

    it('compare detects new file as create', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'b.txt'), 'new file');
      const changes = await service.compare(tmpDir);

      const created = changes.find((c) => c.relativePath === 'b.txt');
      expect(created).toBeDefined();
      expect(created!.operation).toBe('create');
    });

    it('compare detects modified file', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'modified');
      const changes = await service.compare(tmpDir);

      const modified = changes.find((c) => c.relativePath === 'a.txt');
      expect(modified).toBeDefined();
      expect(modified!.operation).toBe('modify');
    });

    it('compare detects deleted file', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      await fs.unlink(path.join(tmpDir, 'a.txt'));
      const changes = await service.compare(tmpDir);

      const deleted = changes.find((c) => c.relativePath === 'a.txt');
      expect(deleted).toBeDefined();
      expect(deleted!.operation).toBe('delete');
    });

    it('compare returns empty array when nothing changed', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      const changes = await service.compare(tmpDir);
      expect(changes).toEqual([]);
    });

    it('getBaselineContent returns original content', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original content');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'modified content');
      const content = await service.getBaselineContent(tmpDir, 'a.txt');
      expect(content).toBe('original content');
    });

    it('getBaselineContent returns null for non-existent file', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'original');
      await service.init(tmpDir);

      const content = await service.getBaselineContent(tmpDir, 'nonexistent.txt');
      expect(content).toBeNull();
    });

    it('respects .gitignore', async () => {
      await fs.writeFile(path.join(tmpDir, '.gitignore'), 'ignored.txt\n');
      await fs.writeFile(path.join(tmpDir, 'tracked.txt'), 'tracked');
      await fs.writeFile(path.join(tmpDir, 'ignored.txt'), 'ignored');
      await service.init(tmpDir);

      await fs.writeFile(path.join(tmpDir, 'ignored.txt'), 'changed ignored');
      await fs.writeFile(path.join(tmpDir, 'tracked.txt'), 'changed tracked');
      const changes = await service.compare(tmpDir);

      expect(changes.some((c) => c.relativePath === 'tracked.txt')).toBe(true);
      expect(changes.some((c) => c.relativePath === 'ignored.txt')).toBe(false);
    });
  });

  describe('git-repo mode (has .git)', () => {
    let git: typeof import('isomorphic-git');

    beforeEach(async () => {
      git = await import('isomorphic-git');
      const nodeFs = await import('node:fs');
      await git.init({ fs: nodeFs, dir: tmpDir });
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'initial');
      await git.add({ fs: nodeFs, dir: tmpDir, filepath: 'initial.txt' });
      await git.commit({
        fs: nodeFs,
        dir: tmpDir,
        message: 'initial commit',
        author: { name: 'Test', email: 'test@test.com' },
      });
    });

    it('init returns git-repo mode with branch name', async () => {
      const info = await service.init(tmpDir);
      expect(info.mode).toBe('git-repo');
      expect(info.branch).toBe('master');
    });

    it('compare detects uncommitted changes', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'changed');

      const changes = await service.compare(tmpDir);
      const modified = changes.find((c) => c.relativePath === 'initial.txt');
      expect(modified).toBeDefined();
      expect(modified!.operation).toBe('modify');
    });

    it('getBaselineContent returns HEAD version', async () => {
      await service.init(tmpDir);
      await fs.writeFile(path.join(tmpDir, 'initial.txt'), 'changed');

      const content = await service.getBaselineContent(tmpDir, 'initial.txt');
      expect(content).toBe('initial');
    });
  });
});
```

- [ ] **Step 2: 运行测试，确认全部失败**

```bash
bun run test -- tests/unit/WorkspaceSnapshotService.test.ts
```

预期：全部 FAIL（WorkspaceSnapshotService 不存在）

- [ ] **Step 3: 实现 WorkspaceSnapshotService**

```typescript
// src/process/services/WorkspaceSnapshotService.ts

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import git from 'isomorphic-git';
import nodeFs from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FileChangeInfo, SnapshotInfo } from '@/common/types/fileSnapshot';

type SnapshotState = {
  mode: 'git-repo' | 'snapshot';
  workspacePath: string;
  gitdir: string;
  baselineOid: string;
  branch: string | null;
};

const DEFAULT_GITIGNORE = `node_modules/
.git/
*.lock
`;

export class WorkspaceSnapshotService {
  private snapshots = new Map<string, SnapshotState>();

  async init(workspacePath: string): Promise<SnapshotInfo> {
    // Dispose existing snapshot if re-initializing
    if (this.snapshots.has(workspacePath)) {
      await this.dispose(workspacePath);
    }

    const mode = await this.detectMode(workspacePath);

    if (mode === 'git-repo') {
      return this.initGitRepo(workspacePath);
    }
    return this.initSnapshot(workspacePath);
  }

  async compare(workspacePath: string): Promise<FileChangeInfo[]> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return [];
    }

    const matrix = await git.statusMatrix({
      fs: nodeFs,
      dir: workspacePath,
      gitdir: state.gitdir,
    });

    // statusMatrix: [filepath, HEAD, WORKDIR, STAGE]
    // HEAD=1 file in baseline, WORKDIR=0 deleted, WORKDIR=2 modified
    // HEAD=0 + WORKDIR=2 = new file
    return matrix
      .filter(([_, head, workdir]) => head !== workdir)
      .map(([filepath, head, workdir]) => ({
        relativePath: filepath as string,
        filePath: path.join(workspacePath, filepath as string),
        operation: head === 0 ? ('create' as const) : workdir === 0 ? ('delete' as const) : ('modify' as const),
      }));
  }

  async getBaselineContent(workspacePath: string, filePath: string): Promise<string | null> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return null;
    }

    try {
      const { blob } = await git.readBlob({
        fs: nodeFs,
        dir: workspacePath,
        gitdir: state.gitdir,
        oid: state.baselineOid,
        filepath: filePath,
      });
      return new TextDecoder().decode(blob);
    } catch {
      return null;
    }
  }

  async getInfo(workspacePath: string): Promise<SnapshotInfo> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return { mode: 'snapshot', branch: null };
    }
    return { mode: state.mode, branch: state.branch };
  }

  async dispose(workspacePath: string): Promise<void> {
    const state = this.snapshots.get(workspacePath);
    if (!state) {
      return;
    }

    // Only clean up temp gitdir in snapshot mode
    if (state.mode === 'snapshot') {
      await fs.rm(state.gitdir, { recursive: true, force: true }).catch(() => {});
    }

    this.snapshots.delete(workspacePath);
  }

  async disposeAll(): Promise<void> {
    const workspaces = Array.from(this.snapshots.keys());
    await Promise.all(workspaces.map((ws) => this.dispose(ws)));
  }

  private async detectMode(workspacePath: string): Promise<'git-repo' | 'snapshot'> {
    try {
      const gitPath = path.join(workspacePath, '.git');
      const stat = await fs.stat(gitPath);
      // Only treat as git-repo if .git is a directory (not a file, which indicates worktree/submodule)
      return stat.isDirectory() ? 'git-repo' : 'snapshot';
    } catch {
      return 'snapshot';
    }
  }

  private async initGitRepo(workspacePath: string): Promise<SnapshotInfo> {
    const gitdir = path.join(workspacePath, '.git');
    const branch = (await git.currentBranch({ fs: nodeFs, dir: workspacePath, gitdir })) ?? null;

    const commits = await git.log({ fs: nodeFs, dir: workspacePath, gitdir, depth: 1 });
    const baselineOid = commits[0]?.oid ?? '';

    this.snapshots.set(workspacePath, {
      mode: 'git-repo',
      workspacePath,
      gitdir,
      baselineOid,
      branch,
    });

    return { mode: 'git-repo', branch };
  }

  private async initSnapshot(workspacePath: string): Promise<SnapshotInfo> {
    const gitdir = path.join(os.tmpdir(), `aionui-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    // Create default .gitignore if none exists
    const gitignorePath = path.join(workspacePath, '.gitignore');
    let createdGitignore = false;
    try {
      await fs.access(gitignorePath);
    } catch {
      await fs.writeFile(gitignorePath, DEFAULT_GITIGNORE, 'utf-8');
      createdGitignore = true;
    }

    try {
      await git.init({ fs: nodeFs, dir: workspacePath, gitdir });
      await git.add({ fs: nodeFs, dir: workspacePath, gitdir, filepath: '.' });
      const baselineOid = await git.commit({
        fs: nodeFs,
        dir: workspacePath,
        gitdir,
        message: 'baseline',
        author: { name: 'AionUI', email: 'snapshot@aionui.local' },
      });

      this.snapshots.set(workspacePath, {
        mode: 'snapshot',
        workspacePath,
        gitdir,
        baselineOid,
        branch: null,
      });

      return { mode: 'snapshot', branch: null };
    } finally {
      // Clean up the .gitignore we created (don't leave artifacts in user's workspace)
      if (createdGitignore) {
        await fs.unlink(gitignorePath).catch(() => {});
      }
    }
  }
}
```

- [ ] **Step 4: 运行测试，确认全部通过**

```bash
bun run test -- tests/unit/WorkspaceSnapshotService.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/process/services/WorkspaceSnapshotService.ts tests/unit/WorkspaceSnapshotService.test.ts
git commit -m "feat(snapshot): add WorkspaceSnapshotService with dual-mode isomorphic-git support"
```

---

### Task 4: IPC Bridge 注册

**Files:**

- Create: `src/process/bridge/workspaceSnapshotBridge.ts`
- Modify: `src/process/bridge/index.ts`

- [ ] **Step 1: 创建 workspaceSnapshotBridge.ts**

```typescript
// src/process/bridge/workspaceSnapshotBridge.ts

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { WorkspaceSnapshotService } from '@process/services/WorkspaceSnapshotService';

const snapshotService = new WorkspaceSnapshotService();

export function initWorkspaceSnapshotBridge(): void {
  ipcBridge.fileSnapshot.init.provider(async ({ workspace }) => {
    return snapshotService.init(workspace);
  });

  ipcBridge.fileSnapshot.compare.provider(async ({ workspace }) => {
    return snapshotService.compare(workspace);
  });

  ipcBridge.fileSnapshot.getBaselineContent.provider(async ({ workspace, filePath }) => {
    return snapshotService.getBaselineContent(workspace, filePath);
  });

  ipcBridge.fileSnapshot.getInfo.provider(async ({ workspace }) => {
    return snapshotService.getInfo(workspace);
  });

  ipcBridge.fileSnapshot.dispose.provider(async ({ workspace }) => {
    await snapshotService.dispose(workspace);
  });
}

/** Clean up all snapshots on app exit */
export function disposeAllSnapshots(): Promise<void> {
  return snapshotService.disposeAll();
}
```

- [ ] **Step 2: 在 bridge/index.ts 中注册**

在 `src/process/bridge/index.ts` 中添加 import 和调用：

```typescript
// 添加 import
import { initWorkspaceSnapshotBridge } from './workspaceSnapshotBridge';

// 在 initAllBridges 函数末尾（initWeixinLoginBridge() 之后）添加：
initWorkspaceSnapshotBridge();

// 在 export 列表中添加：
export { initWorkspaceSnapshotBridge };
// 同时导出清理函数
export { disposeAllSnapshots } from './workspaceSnapshotBridge';
```

- [ ] **Step 3: 类型检查**

```bash
bunx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/process/bridge/workspaceSnapshotBridge.ts src/process/bridge/index.ts
git commit -m "feat(snapshot): add IPC bridge for workspace snapshot operations"
```

---

### Task 5: 重写 useFileChanges Hook

**Files:**

- Rewrite: `src/renderer/pages/conversation/Workspace/hooks/useFileChanges.ts`

- [ ] **Step 1: 重写 hook**

```typescript
// src/renderer/pages/conversation/Workspace/hooks/useFileChanges.ts

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { FileChangeInfo, SnapshotInfo } from '@/common/types/fileSnapshot';
import { useCallback, useEffect, useRef, useState } from 'react';

type UseFileChangesParams = {
  workspace: string;
  conversationId: string;
};

type UseFileChangesReturn = {
  changes: FileChangeInfo[];
  changeCount: number;
  loading: boolean;
  snapshotInfo: SnapshotInfo | null;
  refreshChanges: () => Promise<void>;
};

export function useFileChanges({ workspace, conversationId }: UseFileChangesParams): UseFileChangesReturn {
  const [changes, setChanges] = useState<FileChangeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [snapshotInfo, setSnapshotInfo] = useState<SnapshotInfo | null>(null);
  const initializedRef = useRef(false);

  // Initialize snapshot when workspace is set or conversation changes
  useEffect(() => {
    if (!workspace) return;

    initializedRef.current = false;
    setChanges([]);
    setSnapshotInfo(null);

    ipcBridge.fileSnapshot.init
      .invoke({ workspace })
      .then((info) => {
        setSnapshotInfo(info);
        initializedRef.current = true;
      })
      .catch((err) => {
        console.error('[useFileChanges] Failed to init snapshot:', err);
      });

    return () => {
      ipcBridge.fileSnapshot.dispose.invoke({ workspace }).catch(() => {});
    };
  }, [workspace, conversationId]);

  // Fetch changes on demand
  const refreshChanges = useCallback(async () => {
    if (!workspace || !initializedRef.current) return;
    setLoading(true);
    try {
      const result = await ipcBridge.fileSnapshot.compare.invoke({ workspace });
      setChanges(result);
    } catch (err) {
      console.error('[useFileChanges] Failed to compare:', err);
    } finally {
      setLoading(false);
    }
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

- [ ] **Step 2: 类型检查**

```bash
bunx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/conversation/Workspace/hooks/useFileChanges.ts
git commit -m "refactor(workspace): rewrite useFileChanges hook for on-demand IPC comparison"
```

---

### Task 6: 更新 UI 组件

**Files:**

- Modify: `src/renderer/pages/conversation/Workspace/components/FileChangeList.tsx`
- Modify: `src/renderer/pages/conversation/Workspace/components/WorkspaceTabBar.tsx`
- Modify: `src/renderer/pages/conversation/Workspace/index.tsx`

- [ ] **Step 1: 更新 FileChangeList.tsx**

主要变更：

1. 将 props 类型从 `FileChangeRecord[]` 改为 `FileChangeInfo[]`（无 before/after 字段）
2. 移除组件内的 diff stats 预计算逻辑（diff stats 在点击时按需获取）
3. 添加 loading 和 refresh props
4. 点击文件时通过 IPC 获取基线内容，再计算 diff

关键改动点：

- Props 接口增加 `loading: boolean` 和 `onRefresh: () => void`
- 文件列表项不再显示 `+N -N` 统计（因为没有 before/after 数据预计算），改为只显示操作状态
- `handleClick` 改为异步：先调 `ipcBridge.fileSnapshot.getBaselineContent.invoke()` 获取基线，再用 `ipcBridge.fs.readFile.invoke()` 读取当前内容，最后 `createTwoFilesPatch()` + `openPreview()`
- 顶部增加刷新按钮（使用 Arco `Button` + `@icon-park/react` 的 `Refresh` 图标）
- loading 状态时显示 Arco `Spin` 组件

- [ ] **Step 2: 更新 WorkspaceTabBar.tsx**

添加 `branch` prop，当有分支信息时在 Tab 栏右侧展示分支名：

```typescript
type WorkspaceTabBarProps = {
  t: TFunction;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  changeCount: number;
  branch: string | null;
};
```

分支名展示用一个简单的 `<span>` 标签，带 git branch 图标（`@icon-park/react` 的 `BranchOne`）。放在 Tabs 组件的 `extra` 区域（Arco Tabs 支持 `extra` prop）。

- [ ] **Step 3: 更新 Workspace/index.tsx**

适配新的 `useFileChanges` 返回值：

- 解构增加 `loading`、`snapshotInfo`、`refreshChanges`
- 切换到 "changes" tab 时自动调用 `refreshChanges()`
- 传递 `loading` 和 `onRefresh` 给 `FileChangeList`
- 传递 `branch={snapshotInfo?.branch ?? null}` 给 `WorkspaceTabBar`
- `handleOpenChangeDiff` 改为只传递 `FileChangeInfo`（不含 before/after），diff 逻辑移至 `FileChangeList` 内部

- [ ] **Step 4: 类型检查 & lint**

```bash
bunx tsc --noEmit && bun run lint:fix && bun run format
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/conversation/Workspace/components/FileChangeList.tsx \
       src/renderer/pages/conversation/Workspace/components/WorkspaceTabBar.tsx \
       src/renderer/pages/conversation/Workspace/index.tsx
git commit -m "feat(workspace): update UI components for on-demand diff and branch display"
```

---

### Task 7: i18n 补充

**Files:**

- Modify: 所有 6 个 locale 的 `conversation.json`

- [ ] **Step 1: 检查是否需要新增 i18n key**

需要新增的 key（如果尚未存在）：

- `conversation.workspace.changes.refresh` — 刷新按钮 tooltip
- `conversation.workspace.changes.loading` — 加载中文案
- `conversation.workspace.changes.branch` — 分支名标签（可能不需要，分支名直接展示）

读取 `src/common/config/i18n-config.json` 确认所有语言列表。

- [ ] **Step 2: 在所有 locale 的 conversation.json 中添加新 key**

每个 locale 目录添加：

```json
{
  "workspace": {
    "changes": {
      "refresh": "<localized: Refresh>",
      "loading": "<localized: Loading changes...>"
    }
  }
}
```

- [ ] **Step 3: 重新生成类型定义并校验**

```bash
bun run i18n:types
node scripts/check-i18n.js
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/services/i18n/
git commit -m "feat(i18n): add refresh and loading keys for workspace changes tab"
```

---

### Task 8: 格式化 & 质量检查

- [ ] **Step 1: 运行全部测试**

```bash
bun run test
```

- [ ] **Step 2: lint & format**

```bash
bun run lint:fix
bun run format
```

- [ ] **Step 3: 类型检查**

```bash
bunx tsc --noEmit
```

- [ ] **Step 4: prek 检查**

```bash
prek run --from-ref origin/main --to-ref HEAD
```

- [ ] **Step 5: 修复所有问题并 commit**

```bash
git add -A
git commit -m "style: fix lint and formatting issues"
```
