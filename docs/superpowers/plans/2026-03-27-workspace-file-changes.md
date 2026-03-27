# Workspace File Changes Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Changes" tab to the Workspace panel that shows a cumulative list of files modified by AI during a conversation, with click-to-view diffs.

**Architecture:** Intercept all file writes in `fsBridge.ts` to capture before/after snapshots, emit via a new IPC channel, accumulate state in a renderer hook, and display in a new tab alongside the existing file tree.

**Tech Stack:** Electron IPC bridge (`@office-ai/platform`), React hooks, Arco Design components, existing `diffUtils.ts` and `DiffViewer` for diff rendering.

---

## File Structure

| File                                                                       | Action | Responsibility                                                |
| -------------------------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| `src/common/adapter/ipcBridge.ts`                                          | Modify | Add `fileSnapshot.change` emitter                             |
| `src/common/types/fileSnapshot.ts`                                         | Create | Type definitions for `FileChangeEvent` and `FileChangeRecord` |
| `src/process/bridge/fsBridge.ts`                                           | Modify | Capture before-content on write/delete, emit snapshot events  |
| `src/renderer/pages/conversation/Workspace/hooks/useFileChanges.ts`        | Create | Listen to snapshot events, manage cumulative change map       |
| `src/renderer/pages/conversation/Workspace/components/WorkspaceTabBar.tsx` | Create | Tab bar component for Files/Changes switching                 |
| `src/renderer/pages/conversation/Workspace/components/FileChangeList.tsx`  | Create | Change list UI with status markers, stats, click-to-diff      |
| `src/renderer/pages/conversation/Workspace/index.tsx`                      | Modify | Integrate tab bar and conditional rendering                   |
| `src/renderer/pages/conversation/Workspace/types.ts`                       | Modify | Add tab-related types                                         |
| `src/renderer/services/i18n/locales/en-US/conversation.json`               | Modify | Add i18n keys for changes tab                                 |
| `src/renderer/services/i18n/locales/zh-CN/conversation.json`               | Modify | Add i18n keys for changes tab                                 |
| `tests/unit/fileChanges.test.ts`                                           | Create | Tests for merge logic                                         |
| `tests/unit/fsBridgeSnapshot.test.ts`                                      | Create | Tests for snapshot interception                               |
| `tests/unit/FileChangeList.dom.test.tsx`                                   | Create | Tests for UI component                                        |

---

### Task 1: Type Definitions

**Files:**

- Create: `src/common/types/fileSnapshot.ts`
- Test: `tests/unit/fileChanges.test.ts`

- [ ] **Step 1: Create type definitions file**

```typescript
// src/common/types/fileSnapshot.ts

/**
 * IPC event emitted by fsBridge when a file is written or deleted.
 */
export type FileChangeEvent = {
  workspace: string;
  filePath: string;
  relativePath: string;
  operation: 'create' | 'modify' | 'delete';
  before: string | null;
  after: string | null;
  timestamp: number;
};

/**
 * Accumulated record of a file's changes within a conversation.
 */
export type FileChangeRecord = {
  filePath: string;
  relativePath: string;
  operation: 'create' | 'modify' | 'delete';
  before: string | null;
  after: string | null;
  timestamp: number;
};

/**
 * Merge a new FileChangeEvent into an existing FileChangeRecord.
 * Returns the updated record, or null if the net effect is "nothing happened".
 */
export function mergeFileChange(
  existing: FileChangeRecord | undefined,
  event: FileChangeEvent
): FileChangeRecord | null {
  if (!existing) {
    return {
      filePath: event.filePath,
      relativePath: event.relativePath,
      operation: event.operation,
      before: event.before,
      after: event.after,
      timestamp: event.timestamp,
    };
  }

  // create + delete = net nothing
  if (existing.operation === 'create' && event.operation === 'delete') {
    return null;
  }

  // create + modify = still create (keep before=null, update after)
  if (existing.operation === 'create' && event.operation === 'modify') {
    return {
      ...existing,
      after: event.after,
      timestamp: event.timestamp,
    };
  }

  // modify + modify = keep original before, update after
  if (existing.operation === 'modify' && event.operation === 'modify') {
    return {
      ...existing,
      after: event.after,
      timestamp: event.timestamp,
    };
  }

  // modify + delete = delete with original before
  if (existing.operation === 'modify' && event.operation === 'delete') {
    return {
      ...existing,
      operation: 'delete',
      after: null,
      timestamp: event.timestamp,
    };
  }

  // delete + create = modify (restored file, possibly with different content)
  if (existing.operation === 'delete' && event.operation === 'create') {
    return {
      ...existing,
      operation: 'modify',
      after: event.after,
      timestamp: event.timestamp,
    };
  }

  // Fallback: replace with new event data, keep original before
  return {
    filePath: event.filePath,
    relativePath: event.relativePath,
    operation: event.operation,
    before: existing.before,
    after: event.after,
    timestamp: event.timestamp,
  };
}
```

- [ ] **Step 2: Write tests for merge logic**

```typescript
// tests/unit/fileChanges.test.ts
import { describe, it, expect } from 'vitest';
import { mergeFileChange } from '@/common/types/fileSnapshot';
import type { FileChangeEvent, FileChangeRecord } from '@/common/types/fileSnapshot';

const baseEvent = (overrides: Partial<FileChangeEvent>): FileChangeEvent => ({
  workspace: '/tmp/ws',
  filePath: '/tmp/ws/src/index.ts',
  relativePath: 'src/index.ts',
  operation: 'modify',
  before: 'old content',
  after: 'new content',
  timestamp: 1000,
  ...overrides,
});

describe('mergeFileChange', () => {
  it('creates a new record when no existing record', () => {
    const event = baseEvent({ operation: 'create', before: null, after: 'hello' });
    const result = mergeFileChange(undefined, event);
    expect(result).toEqual({
      filePath: '/tmp/ws/src/index.ts',
      relativePath: 'src/index.ts',
      operation: 'create',
      before: null,
      after: 'hello',
      timestamp: 1000,
    });
  });

  it('create + delete = null (net nothing)', () => {
    const existing: FileChangeRecord = {
      filePath: '/tmp/ws/src/index.ts',
      relativePath: 'src/index.ts',
      operation: 'create',
      before: null,
      after: 'hello',
      timestamp: 1000,
    };
    const event = baseEvent({ operation: 'delete', before: 'hello', after: null, timestamp: 2000 });
    expect(mergeFileChange(existing, event)).toBeNull();
  });

  it('create + modify = create with updated after', () => {
    const existing: FileChangeRecord = {
      filePath: '/tmp/ws/src/index.ts',
      relativePath: 'src/index.ts',
      operation: 'create',
      before: null,
      after: 'v1',
      timestamp: 1000,
    };
    const event = baseEvent({ operation: 'modify', before: 'v1', after: 'v2', timestamp: 2000 });
    const result = mergeFileChange(existing, event);
    expect(result?.operation).toBe('create');
    expect(result?.before).toBeNull();
    expect(result?.after).toBe('v2');
  });

  it('modify + modify = modify with original before and latest after', () => {
    const existing: FileChangeRecord = {
      filePath: '/tmp/ws/src/index.ts',
      relativePath: 'src/index.ts',
      operation: 'modify',
      before: 'original',
      after: 'v1',
      timestamp: 1000,
    };
    const event = baseEvent({ operation: 'modify', before: 'v1', after: 'v2', timestamp: 2000 });
    const result = mergeFileChange(existing, event);
    expect(result?.before).toBe('original');
    expect(result?.after).toBe('v2');
  });

  it('modify + delete = delete with original before', () => {
    const existing: FileChangeRecord = {
      filePath: '/tmp/ws/src/index.ts',
      relativePath: 'src/index.ts',
      operation: 'modify',
      before: 'original',
      after: 'v1',
      timestamp: 1000,
    };
    const event = baseEvent({ operation: 'delete', before: 'v1', after: null, timestamp: 2000 });
    const result = mergeFileChange(existing, event);
    expect(result?.operation).toBe('delete');
    expect(result?.before).toBe('original');
    expect(result?.after).toBeNull();
  });

  it('delete + create = modify', () => {
    const existing: FileChangeRecord = {
      filePath: '/tmp/ws/src/index.ts',
      relativePath: 'src/index.ts',
      operation: 'delete',
      before: 'original',
      after: null,
      timestamp: 1000,
    };
    const event = baseEvent({ operation: 'create', before: null, after: 'restored', timestamp: 2000 });
    const result = mergeFileChange(existing, event);
    expect(result?.operation).toBe('modify');
    expect(result?.before).toBe('original');
    expect(result?.after).toBe('restored');
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `bun run test -- tests/unit/fileChanges.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/common/types/fileSnapshot.ts tests/unit/fileChanges.test.ts
git commit -m "feat(workspace): add file change snapshot types and merge logic"
```

---

### Task 2: IPC Bridge — fileSnapshot Emitter

**Files:**

- Modify: `src/common/adapter/ipcBridge.ts:300-308`

- [ ] **Step 1: Add fileSnapshot emitter to ipcBridge**

In `src/common/adapter/ipcBridge.ts`, add a new export after the existing `fileStream` export (after line 308):

```typescript
// File snapshot events for tracking AI file changes
export const fileSnapshot = {
  change: bridge.buildEmitter<import('@/common/types/fileSnapshot').FileChangeEvent>('file-snapshot-change'),
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/common/adapter/ipcBridge.ts
git commit -m "feat(workspace): add fileSnapshot IPC emitter channel"
```

---

### Task 3: fsBridge Snapshot Interception

**Files:**

- Modify: `src/process/bridge/fsBridge.ts:372-431` (writeFile provider)
- Modify: `src/process/bridge/fsBridge.ts:658-688` (removeEntry provider)
- Test: `tests/unit/fsBridgeSnapshot.test.ts`

- [ ] **Step 1: Write failing test for snapshot on write**

```typescript
// tests/unit/fsBridgeSnapshot.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockLstat = vi.fn();
const mockUnlink = vi.fn();
const mockRm = vi.fn();
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    lstat: (...args: unknown[]) => mockLstat(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
    rm: (...args: unknown[]) => mockRm(...args),
  },
}));

// Mock ipcBridge
const mockSnapshotEmit = vi.fn();
const mockContentUpdateEmit = vi.fn();
vi.mock('@/common/adapter/ipcBridge', () => ({
  ipcBridge: {
    fs: {
      writeFile: { provider: vi.fn() },
      removeEntry: { provider: vi.fn() },
    },
    fileStream: {
      contentUpdate: { emit: mockContentUpdateEmit },
    },
    fileSnapshot: {
      change: { emit: mockSnapshotEmit },
    },
  },
}));

import { ipcBridge } from '@/common/adapter/ipcBridge';

describe('fsBridge snapshot interception', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('writeFile snapshot', () => {
    it('emits create event when file does not exist', async () => {
      // Get the handler registered via provider()
      const providerFn = vi.mocked(ipcBridge.fs.writeFile.provider);
      const handler = providerFn.mock.calls[0]?.[0];
      if (!handler) throw new Error('writeFile provider not registered');

      mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      mockWriteFile.mockResolvedValue(undefined);

      await handler({ path: '/workspace/src/new.ts', data: 'content' });

      expect(mockSnapshotEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: '/workspace/src/new.ts',
          operation: 'create',
          before: null,
          after: 'content',
        })
      );
    });

    it('emits modify event when file already exists', async () => {
      const providerFn = vi.mocked(ipcBridge.fs.writeFile.provider);
      const handler = providerFn.mock.calls[0]?.[0];
      if (!handler) throw new Error('writeFile provider not registered');

      mockReadFile.mockResolvedValue('old content');
      mockWriteFile.mockResolvedValue(undefined);

      await handler({ path: '/workspace/src/index.ts', data: 'new content' });

      expect(mockSnapshotEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'modify',
          before: 'old content',
          after: 'new content',
        })
      );
    });

    it('does not emit snapshot for binary (non-string) data', async () => {
      const providerFn = vi.mocked(ipcBridge.fs.writeFile.provider);
      const handler = providerFn.mock.calls[0]?.[0];
      if (!handler) throw new Error('writeFile provider not registered');

      mockWriteFile.mockResolvedValue(undefined);

      await handler({ path: '/workspace/image.png', data: new Uint8Array([1, 2, 3]) });

      expect(mockSnapshotEmit).not.toHaveBeenCalled();
    });
  });
});
```

Note: This test pattern captures the handler passed to `provider()`. The actual test may need adjustment based on how the module initialization works — the key is to verify that `fileSnapshot.change.emit()` is called with the correct event shape. If the `provider()` mock approach doesn't capture the handler (because `fsBridge.ts` registers during import), restructure the test to import `fsBridge.ts` after setting up mocks, or extract the snapshot logic into a testable helper function.

- [ ] **Step 2: Modify writeFile provider in fsBridge.ts**

In `src/process/bridge/fsBridge.ts`, modify the writeFile provider (starting at line 372). Add snapshot capture before the write for string data:

```typescript
  // 写入文件
  ipcBridge.fs.writeFile.provider(async ({ path: filePath, data }) => {
    try {
      // 处理字符串类型 / Handle string type
      if (typeof data === 'string') {
        // Capture before-state for file change tracking
        let beforeContent: string | null = null;
        let fileExisted = true;
        try {
          beforeContent = await fs.readFile(filePath, 'utf-8');
        } catch (readError) {
          if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
            fileExisted = false;
          }
          // Other read errors: skip snapshot, proceed with write
        }

        await fs.writeFile(filePath, data, 'utf-8');

        // Emit file snapshot change event for change tracking
        try {
          const pathSegments = filePath.split(path.sep);
          const fileName = pathSegments[pathSegments.length - 1];
          const workspace = pathSegments.slice(0, -1).join(path.sep);

          ipcBridge.fileSnapshot.change.emit({
            workspace,
            filePath,
            relativePath: fileName,
            operation: fileExisted ? 'modify' : 'create',
            before: beforeContent,
            after: data,
            timestamp: Date.now(),
          });
        } catch (snapshotError) {
          console.error('[fsBridge] Failed to emit file snapshot:', snapshotError);
        }

        // 发送流式内容更新事件到预览面板（用于实时更新）
        // Send streaming content update to preview panel (for real-time updates)
        try {
          const pathSegments = filePath.split(path.sep);
          const fileName = pathSegments[pathSegments.length - 1];
          const workspace = pathSegments.slice(0, -1).join(path.sep);

          const eventData = {
            filePath: filePath,
            content: data,
            workspace: workspace,
            relativePath: fileName,
            operation: 'write' as const,
          };

          ipcBridge.fileStream.contentUpdate.emit(eventData);
        } catch (emitError) {
          console.error('[fsBridge] ❌ Failed to emit file stream update:', emitError);
        }

        return true;
      }

      // ... rest of binary handling unchanged
```

- [ ] **Step 3: Modify removeEntry provider for delete snapshot**

In `src/process/bridge/fsBridge.ts`, modify the removeEntry provider (around line 658). Add snapshot capture before file deletion:

```typescript
  ipcBridge.fs.removeEntry.provider(async ({ path: targetPath }) => {
    try {
      const stats = await fs.lstat(targetPath);
      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      } else {
        // Capture before-state for file change tracking
        let beforeContent: string | null = null;
        try {
          beforeContent = await fs.readFile(targetPath, 'utf-8');
        } catch {
          // Binary file or read error: beforeContent stays null
        }

        await fs.unlink(targetPath);

        // Emit file snapshot delete event
        try {
          const pathSegments = targetPath.split(path.sep);
          const fileName = pathSegments[pathSegments.length - 1];
          const workspace = pathSegments.slice(0, -1).join(path.sep);

          ipcBridge.fileSnapshot.change.emit({
            workspace,
            filePath: targetPath,
            relativePath: fileName,
            operation: 'delete',
            before: beforeContent,
            after: null,
            timestamp: Date.now(),
          });
        } catch (snapshotError) {
          console.error('[fsBridge] Failed to emit file snapshot:', snapshotError);
        }

        // 发送流式删除事件到预览面板（用于关闭预览）
        // ... existing contentUpdate emit unchanged
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run snapshot tests**

Run: `bun run test -- tests/unit/fsBridgeSnapshot.test.ts`
Expected: PASS (adjust test structure if needed based on module loading)

- [ ] **Step 6: Commit**

```bash
git add src/process/bridge/fsBridge.ts tests/unit/fsBridgeSnapshot.test.ts
git commit -m "feat(workspace): capture file snapshots in fsBridge write/delete"
```

---

### Task 4: useFileChanges Hook

**Files:**

- Create: `src/renderer/pages/conversation/Workspace/hooks/useFileChanges.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/renderer/pages/conversation/Workspace/hooks/useFileChanges.ts

import { ipcBridge } from '@/common';
import { mergeFileChange } from '@/common/types/fileSnapshot';
import type { FileChangeEvent, FileChangeRecord } from '@/common/types/fileSnapshot';
import { useCallback, useEffect, useRef, useState } from 'react';

type UseFileChangesParams = {
  workspace: string;
  conversationId: string;
};

type UseFileChangesReturn = {
  changes: FileChangeRecord[];
  changeCount: number;
  clearChanges: () => void;
};

export function useFileChanges({ workspace, conversationId }: UseFileChangesParams): UseFileChangesReturn {
  const changesMapRef = useRef<Map<string, FileChangeRecord>>(new Map());
  const [changes, setChanges] = useState<FileChangeRecord[]>([]);

  const clearChanges = useCallback(() => {
    changesMapRef.current.clear();
    setChanges([]);
  }, []);

  // Clear on conversation switch
  useEffect(() => {
    clearChanges();
  }, [conversationId, clearChanges]);

  // Listen for file snapshot events
  useEffect(() => {
    const unsubscribe = ipcBridge.fileSnapshot.change.on((event: FileChangeEvent) => {
      // Only track changes within the current workspace
      if (!event.filePath.startsWith(workspace)) {
        return;
      }

      const map = changesMapRef.current;
      const existing = map.get(event.filePath);
      const merged = mergeFileChange(existing, event);

      if (merged === null) {
        map.delete(event.filePath);
      } else {
        map.set(event.filePath, merged);
      }

      setChanges(Array.from(map.values()));
    });

    return unsubscribe;
  }, [workspace]);

  return {
    changes,
    changeCount: changes.length,
    clearChanges,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/conversation/Workspace/hooks/useFileChanges.ts
git commit -m "feat(workspace): add useFileChanges hook for cumulative change tracking"
```

---

### Task 5: i18n Keys

**Files:**

- Modify: `src/renderer/services/i18n/locales/en-US/conversation.json`
- Modify: `src/renderer/services/i18n/locales/zh-CN/conversation.json`

- [ ] **Step 1: Add English i18n keys**

Add inside the `"workspace"` object in `src/renderer/services/i18n/locales/en-US/conversation.json`:

```json
"changes": {
  "tab": "Changes",
  "filesTab": "Files",
  "summary": "{{count}} file(s) changed",
  "insertions": "+{{count}} insertions",
  "deletions": "-{{count}} deletions",
  "empty": "No changes yet",
  "emptyDescription": "File changes will appear here when AI modifies files"
}
```

- [ ] **Step 2: Add Chinese i18n keys**

Add inside the `"workspace"` object in `src/renderer/services/i18n/locales/zh-CN/conversation.json`:

```json
"changes": {
  "tab": "变更",
  "filesTab": "文件",
  "summary": "{{count}} 个文件已变更",
  "insertions": "+{{count}} 行新增",
  "deletions": "-{{count}} 行删除",
  "empty": "暂无变更",
  "emptyDescription": "AI 修改文件后，变更记录将显示在此处"
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/services/i18n/locales/en-US/conversation.json src/renderer/services/i18n/locales/zh-CN/conversation.json
git commit -m "feat(workspace): add i18n keys for file changes tab"
```

---

### Task 6: WorkspaceTabBar Component

**Files:**

- Create: `src/renderer/pages/conversation/Workspace/components/WorkspaceTabBar.tsx`
- Modify: `src/renderer/pages/conversation/Workspace/types.ts`

- [ ] **Step 1: Add tab type to types.ts**

In `src/renderer/pages/conversation/Workspace/types.ts`, add:

```typescript
export type WorkspaceTab = 'files' | 'changes';
```

- [ ] **Step 2: Create WorkspaceTabBar component**

```typescript
// src/renderer/pages/conversation/Workspace/components/WorkspaceTabBar.tsx

import { Badge } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React from 'react';
import type { WorkspaceTab } from '../types';

type WorkspaceTabBarProps = {
  t: TFunction;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  changeCount: number;
};

const WorkspaceTabBar: React.FC<WorkspaceTabBarProps> = ({ t, activeTab, onTabChange, changeCount }) => {
  return (
    <div className='flex border-b border-b-base px-12px'>
      <button
        type='button'
        className={`px-16px py-8px text-13px border-b-2 bg-transparent cursor-pointer ${
          activeTab === 'files'
            ? 'font-semibold text-[rgb(var(--primary-6))] border-b-[rgb(var(--primary-6))]'
            : 'text-t-secondary border-b-transparent hover:text-t-primary'
        }`}
        onClick={() => onTabChange('files')}
      >
        {t('conversation.workspace.changes.filesTab')}
      </button>
      <button
        type='button'
        className={`px-16px py-8px text-13px border-b-2 bg-transparent cursor-pointer flex items-center gap-4px ${
          activeTab === 'changes'
            ? 'font-semibold text-[rgb(var(--primary-6))] border-b-[rgb(var(--primary-6))]'
            : 'text-t-secondary border-b-transparent hover:text-t-primary'
        }`}
        onClick={() => onTabChange('changes')}
      >
        {t('conversation.workspace.changes.tab')}
        {changeCount > 0 && (
          <Badge
            count={changeCount}
            maxCount={99}
            style={{ fontSize: '11px' }}
          />
        )}
      </button>
    </div>
  );
};

export default WorkspaceTabBar;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/conversation/Workspace/components/WorkspaceTabBar.tsx src/renderer/pages/conversation/Workspace/types.ts
git commit -m "feat(workspace): add WorkspaceTabBar component"
```

---

### Task 7: FileChangeList Component

**Files:**

- Create: `src/renderer/pages/conversation/Workspace/components/FileChangeList.tsx`
- Test: `tests/unit/FileChangeList.dom.test.tsx`

- [ ] **Step 1: Create FileChangeList component**

```typescript
// src/renderer/pages/conversation/Workspace/components/FileChangeList.tsx

import type { FileChangeRecord } from '@/common/types/fileSnapshot';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { Empty } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React, { useCallback, useMemo } from 'react';
import { createTwoFilesPatch } from 'diff';

type FileChangeListProps = {
  t: TFunction;
  changes: FileChangeRecord[];
  onOpenDiff: (record: FileChangeRecord) => void;
};

const STATUS_COLORS: Record<FileChangeRecord['operation'], string> = {
  create: 'color-green-6',
  modify: 'color-orange-6',
  delete: 'color-red-6',
};

const STATUS_LABELS: Record<FileChangeRecord['operation'], string> = {
  create: 'A',
  modify: 'M',
  delete: 'D',
};

type ChangeStats = {
  insertions: number;
  deletions: number;
};

function computeStats(record: FileChangeRecord): ChangeStats {
  const before = record.before ?? '';
  const after = record.after ?? '';
  const patch = createTwoFilesPatch(
    record.relativePath,
    record.relativePath,
    before,
    after
  );
  const info = parseDiff(patch, record.relativePath);
  return { insertions: info.insertions, deletions: info.deletions };
}

const FileChangeItem: React.FC<{
  record: FileChangeRecord;
  onClick: () => void;
}> = ({ record, onClick }) => {
  const stats = useMemo(() => computeStats(record), [record]);
  const statusColor = STATUS_COLORS[record.operation];
  const statusLabel = STATUS_LABELS[record.operation];

  return (
    <div
      className='flex items-center justify-between px-12px py-6px cursor-pointer hover:bg-fill-2 transition-colors'
      onClick={onClick}
      role='button'
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className='flex items-center gap-8px min-w-0'>
        <span
          className={`text-11px font-semibold w-14px text-center flex-shrink-0 text-[rgb(var(--${statusColor}))]`}
        >
          {statusLabel}
        </span>
        <span
          className={`overflow-hidden text-ellipsis whitespace-nowrap text-13px ${
            record.operation === 'delete' ? 'line-through text-t-tertiary' : 'text-t-primary'
          }`}
        >
          {record.relativePath}
        </span>
      </div>
      <div className='flex gap-6px text-11px flex-shrink-0'>
        {stats.insertions > 0 && (
          <span className='text-[rgb(var(--color-green-6))]'>+{stats.insertions}</span>
        )}
        {stats.deletions > 0 && (
          <span className='text-[rgb(var(--color-red-6))]'>-{stats.deletions}</span>
        )}
      </div>
    </div>
  );
};

const FileChangeList: React.FC<FileChangeListProps> = ({ t, changes, onOpenDiff }) => {
  const totalStats = useMemo(() => {
    let insertions = 0;
    let deletions = 0;
    for (const record of changes) {
      const stats = computeStats(record);
      insertions += stats.insertions;
      deletions += stats.deletions;
    }
    return { insertions, deletions };
  }, [changes]);

  const handleOpenDiff = useCallback(
    (record: FileChangeRecord) => {
      onOpenDiff(record);
    },
    [onOpenDiff]
  );

  if (changes.length === 0) {
    return (
      <div className='flex-1 size-full flex items-center justify-center px-12px'>
        <Empty
          description={
            <div>
              <span className='text-t-secondary font-bold text-14px'>
                {t('conversation.workspace.changes.empty')}
              </span>
              <div className='text-t-secondary'>
                {t('conversation.workspace.changes.emptyDescription')}
              </div>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className='flex flex-col size-full'>
      {/* Header */}
      <div className='px-12px py-8px border-b border-b-base'>
        <span className='text-12px text-t-secondary'>
          {t('conversation.workspace.changes.summary', { count: changes.length })}
        </span>
      </div>

      {/* File list */}
      <div className='flex-1 overflow-y-auto'>
        {changes.map((record) => (
          <FileChangeItem
            key={record.filePath}
            record={record}
            onClick={() => handleOpenDiff(record)}
          />
        ))}
      </div>

      {/* Summary bar */}
      <div className='px-12px py-8px border-t border-t-base flex gap-12px text-11px text-t-tertiary'>
        {totalStats.insertions > 0 && (
          <span className='text-[rgb(var(--color-green-6))]'>
            {t('conversation.workspace.changes.insertions', { count: totalStats.insertions })}
          </span>
        )}
        {totalStats.deletions > 0 && (
          <span className='text-[rgb(var(--color-red-6))]'>
            {t('conversation.workspace.changes.deletions', { count: totalStats.deletions })}
          </span>
        )}
      </div>
    </div>
  );
};

export default FileChangeList;
```

Note: This component uses the `diff` npm package (`createTwoFilesPatch`) to generate unified diffs from before/after content. Check if `diff` is already a dependency — if not, install it:

Run: `grep '"diff"' package.json`

If not found: `bun add diff && bun add -D @types/diff`

If `diff` is not available but `diff2html` is (which is already used by `DiffViewer`), you can generate diffs using a simpler line-by-line comparison or find another approach. The key is to produce a unified diff string that `parseDiff()` can consume.

- [ ] **Step 2: Write DOM test for FileChangeList**

```typescript
// tests/unit/FileChangeList.dom.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import React from 'react';

// Mock dependencies
vi.mock('@/renderer/utils/file/diffUtils', () => ({
  parseDiff: vi.fn(() => ({ insertions: 5, deletions: 2, fileName: 'test.ts', fullPath: '/test.ts', diff: '' })),
}));

vi.mock('diff', () => ({
  createTwoFilesPatch: vi.fn(() => 'mock diff'),
}));

vi.mock('@arco-design/web-react', () => ({
  Empty: ({ description }: { description: React.ReactNode }) => <div data-testid='empty'>{description}</div>,
}));

import FileChangeList from '@/renderer/pages/conversation/Workspace/components/FileChangeList';
import type { FileChangeRecord } from '@/common/types/fileSnapshot';

const mockT = ((key: string, opts?: Record<string, unknown>) => {
  if (opts?.count !== undefined) return `${key}:${opts.count}`;
  return key;
}) as unknown as import('i18next').TFunction;

const mockChanges: FileChangeRecord[] = [
  {
    filePath: '/ws/src/index.ts',
    relativePath: 'src/index.ts',
    operation: 'modify',
    before: 'old',
    after: 'new',
    timestamp: 1000,
  },
  {
    filePath: '/ws/src/new.ts',
    relativePath: 'src/new.ts',
    operation: 'create',
    before: null,
    after: 'content',
    timestamp: 2000,
  },
];

describe('FileChangeList', () => {
  it('renders empty state when no changes', () => {
    render(<FileChangeList t={mockT} changes={[]} onOpenDiff={vi.fn()} />);
    expect(screen.getByTestId('empty')).toBeDefined();
  });

  it('renders change items with status markers', () => {
    render(<FileChangeList t={mockT} changes={mockChanges} onOpenDiff={vi.fn()} />);
    expect(screen.getByText('src/index.ts')).toBeDefined();
    expect(screen.getByText('src/new.ts')).toBeDefined();
    expect(screen.getByText('M')).toBeDefined();
    expect(screen.getByText('A')).toBeDefined();
  });

  it('calls onOpenDiff when clicking a file', async () => {
    const onOpenDiff = vi.fn();
    render(<FileChangeList t={mockT} changes={mockChanges} onOpenDiff={onOpenDiff} />);

    const user = userEvent.setup();
    await user.click(screen.getByText('src/index.ts'));

    expect(onOpenDiff).toHaveBeenCalledWith(mockChanges[0]);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun run test -- tests/unit/FileChangeList.dom.test.tsx`
Expected: All 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/conversation/Workspace/components/FileChangeList.tsx tests/unit/FileChangeList.dom.test.tsx
git commit -m "feat(workspace): add FileChangeList component with diff stats"
```

---

### Task 8: Integrate into Workspace Panel

**Files:**

- Modify: `src/renderer/pages/conversation/Workspace/index.tsx`

- [ ] **Step 1: Add imports and hook initialization**

At the top of `src/renderer/pages/conversation/Workspace/index.tsx`, add imports:

```typescript
import { useFileChanges } from './hooks/useFileChanges';
import FileChangeList from './components/FileChangeList';
import WorkspaceTabBar from './components/WorkspaceTabBar';
import type { WorkspaceTab } from './types';
```

Inside the `ChatWorkspace` component, add state and hook:

```typescript
const [activeTab, setActiveTab] = useState<WorkspaceTab>('files');
const fileChangesHook = useFileChanges({ workspace, conversationId: conversation_id });
```

- [ ] **Step 2: Add diff opening handler**

Add a callback that opens the DiffViewer via the existing Preview panel:

```typescript
import { createTwoFilesPatch } from 'diff';

const handleOpenChangeDiff = useCallback(
  (record: FileChangeRecord) => {
    const before = record.before ?? '';
    const after = record.after ?? '';
    const diffContent = createTwoFilesPatch(record.relativePath, record.relativePath, before, after);
    openPreview(diffContent, 'diff', {
      fileName: record.relativePath,
      filePath: record.filePath,
      workspace,
    });
  },
  [openPreview, workspace]
);
```

Add `import type { FileChangeRecord } from '@/common/types/fileSnapshot';` to the imports.

- [ ] **Step 3: Add TabBar to the JSX**

Insert `WorkspaceTabBar` before the existing `WorkspaceToolbar` in the JSX return, and wrap the file tree and change list in conditional rendering:

```tsx
{
  /* Tab bar */
}
<WorkspaceTabBar t={t} activeTab={activeTab} onTabChange={setActiveTab} changeCount={fileChangesHook.changeCount} />;

{
  /* Toolbar: only show for files tab */
}
{
  activeTab === 'files' && (
    <WorkspaceToolbar
    // ... all existing props unchanged
    />
  );
}

{
  /* Main content area */
}
{
  !isWorkspaceCollapsed && activeTab === 'files' && (
    <FlexFullContainer containerClassName='overflow-y-auto'>
      {/* ... existing file tree content unchanged */}
    </FlexFullContainer>
  );
}

{
  /* Changes tab content */
}
{
  !isWorkspaceCollapsed && activeTab === 'changes' && (
    <FlexFullContainer containerClassName='overflow-y-auto'>
      <FileChangeList t={t} changes={fileChangesHook.changes} onOpenDiff={handleOpenChangeDiff} />
    </FlexFullContainer>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run lint and format**

Run: `bun run lint:fix && bun run format`
Expected: No errors

- [ ] **Step 6: Run all tests**

Run: `bun run test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/conversation/Workspace/index.tsx
git commit -m "feat(workspace): integrate file changes tab into workspace panel"
```

---

### Task 9: Manual Verification

- [ ] **Step 1: Start the app**

Run: `bun run dev` (or whatever the dev command is)

- [ ] **Step 2: Verify the tab bar renders**

Open a conversation with a workspace (Gemini, ACP, or Codex). Verify:

- "Files" and "Changes" tabs appear above the toolbar
- "Files" tab is active by default and shows the existing file tree
- "Changes" tab shows empty state: "No changes yet"

- [ ] **Step 3: Trigger an AI file write**

Ask the AI to create or modify a file. Verify:

- The "Changes" tab badge updates with the count
- Switching to "Changes" tab shows the modified file with status marker and stats
- Clicking the file opens the DiffViewer in the Preview panel

- [ ] **Step 4: Verify cumulative behavior**

Ask the AI to modify the same file again. Verify:

- The file still shows as one entry (not duplicated)
- The diff shows the cumulative change (original → latest)

- [ ] **Step 5: Verify conversation switch clears state**

Switch to a different conversation and back. Verify:

- Changes list is empty after switching

- [ ] **Step 6: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "fix(workspace): adjustments from manual testing"
```
