/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Restores persisted editor tabs for a workspace root when the editor panel
 * mounts in command-center mode. Storage keys use the absolute workspace path
 * (same bucket as {@link writeEditorTabs} in EditorContext).
 */

import { useEffect, useRef } from 'react';
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
        const ws = entry.workspace ?? workspaceRoot;
        wsForPath.set(entry.path, ws);
        await editor.openEditorFile({ path: entry.path, workspace: ws });
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
