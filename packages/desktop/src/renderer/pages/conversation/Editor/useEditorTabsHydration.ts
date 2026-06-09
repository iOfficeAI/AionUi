/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Restores persisted editor tabs for a workspace root when the editor panel
 * mounts in command-center mode. Storage keys use the absolute workspace path
 * (same bucket as {@link writeEditorTabs} in EditorContext).
 *
 * Two kinds of entries are rehydrated:
 *   - Saved files (`path`): `openEditorFile({ path, workspace })` is invoked,
 *     reusing the existing per-path read pipeline.
 *   - Untitled hot-exit buffers (`backupId`): the content is fetched from
 *     the main-process `UntitledBackupService` via
 *     `ipcBridge.untitledBackup.read`, then handed to
 *     `editor.restoreUntitledBuffer`, which re-creates an untitled buffer
 *     with the same `backupId` so the next save- or close-cycle cleans it
 *     up correctly.
 *
 * Split-group and `activePath` restoration are still path-based — untitled
 * buffers rehydrate into the focused group, which matches the V1 persist
 * side (it doesn't serialize untitled group positions).
 */

import { useEffect, useRef } from 'react';
import { ipcBridge } from '@/common';
import { isEditorAccessibleInLayoutMode } from '@renderer/utils/layout/layoutModeStorage';
import { useEditorContext } from './EditorContext';
import { readEditorTabs } from './editorTabsPersistence';

type Options = {
  /** Conversation / project workspace root (absolute path). */
  workspaceRoot: string | undefined;
};

export const useEditorTabsHydration = ({ workspaceRoot }: Options): void => {
  const editor = useEditorContext();
  const hydratedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceRoot) return;
    if (!isEditorAccessibleInLayoutMode()) return;
    if (hydratedForRef.current === workspaceRoot) return;

    const persisted = readEditorTabs(workspaceRoot);
    hydratedForRef.current = workspaceRoot;
    if (!persisted?.entries.length) return;

    void (async () => {
      // Resolve the workspace used to open each path so we can rebuild buffer
      // keys deterministically (`${workspace ?? ''}::${path}`) without racing
      // the async state updates from openEditorFile.
      const wsForPath = new Map<string, string>();
      for (const entry of persisted.entries) {
        if (entry.path) {
          const ws = entry.workspace ?? workspaceRoot;
          wsForPath.set(entry.path, ws);
          await editor.openEditorFile({ path: entry.path, workspace: ws });
          continue;
        }
        if (entry.backupId) {
          // Untitled hot-exit entry. Fetch the content + meta from the
          // main-process backup store and rebuild the buffer. A missing or
          // failed read (backup was deleted, content file corrupt) is
          // swallowed — the persisted tab simply doesn't come back, which
          // is consistent with VS Code's "hot-exit cleaned up" path.
          try {
            const res = await ipcBridge.untitledBackup.read.invoke({ backupId: entry.backupId });
            const data = res?.success ? res.data : null;
            if (!data) continue;
            // Prefer the meta captured at persist time; fall back to what
            // the backup store currently has so a partially-truncated
            // entry (legacy data) still rehydrates.
            const meta = entry.untitledMeta ?? data.meta;
            editor.restoreUntitledBuffer(entry.backupId, data.content, {
              fileName: meta.fileName,
              language: meta.language,
            });
          } catch (err) {
            console.error('[UntitledBackup] failed to restore', entry.backupId, err);
          }
          continue;
        }
      }

      const keyForPath = (path: string): string => `${wsForPath.get(path) ?? workspaceRoot}::${path}`;

      // Restore the split layout when one was persisted.
      if (persisted.groups && persisted.groups.length > 1) {
        editor.setSplitLayout(
          persisted.groups.map((g) => ({
            bufferKeys: g.entryPaths.map(keyForPath),
            activeKey: g.activePath ? keyForPath(g.activePath) : null,
          }))
        );
        return;
      }

      if (!persisted.activePath) return;
      editor.setActiveBuffer(keyForPath(persisted.activePath));
    })();
  }, [workspaceRoot, editor]);
};
