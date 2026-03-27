/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

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
