import { ipcBridge } from '@/common';
import { useCallback } from 'react';

interface UseOpenFileSelectorOptions {
  onFilesSelected: (files: string[]) => void;
}

interface UseOpenFileSelectorResult {
  openFileSelector: () => void;
  onSlashBuiltinCommand: (name: string) => void;
}

/**
 * Shared open-file selector behavior for send boxes.
 * Unifies '+' button and '/open' builtin command handling.
 *
 * In Electron: opens native file dialog.
 * In WebUI: routes through the registered web file picker (webFsPicker),
 * which browses the server filesystem via `/api/fs/dir`.
 */
export function useOpenFileSelector(options: UseOpenFileSelectorOptions): UseOpenFileSelectorResult {
  const { onFilesSelected } = options;

  const openFileSelector = useCallback(() => {
    void ipcBridge.dialog.showOpen
      .invoke({ properties: ['openFile', 'multiSelections'] })
      .then((files) => {
        if (!files || files.length === 0) {
          return;
        }
        onFilesSelected(files);
      })
      .catch((error) => {
        // In WebUI, dialog may fail if the web file picker (webFsPicker) is not
        // registered or the bridge is not properly connected. Log for debugging.
        console.warn('[useOpenFileSelector] Failed to open file selector:', error);
      });
  }, [onFilesSelected]);

  const onSlashBuiltinCommand = useCallback(
    (name: string) => {
      if (name === 'open') {
        openFileSelector();
      }
    },
    [openFileSelector]
  );

  return {
    openFileSelector,
    onSlashBuiltinCommand,
  };
}
