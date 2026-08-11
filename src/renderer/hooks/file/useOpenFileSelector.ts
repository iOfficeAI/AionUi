import { ipcBridge } from '@/common';
import type { OpenDialogOptions } from 'electron';
import { useCallback } from 'react';

interface UseOpenFileSelectorOptions {
  onFilesSelected: (files: string[]) => void;
}

interface UseOpenFileSelectorResult {
  openFileSelector: () => void;
  openDirectorySelector: () => void;
  onSlashBuiltinCommand: (name: string) => void;
}

/**
 * Shared open-file selector behavior for send boxes.
 * Unifies '+' button and '/open' builtin command handling.
 *
 * In Electron: opens native file dialog.
 * In WebUI: triggers DirectorySelectionModal via bridge events.
 */
export function useOpenFileSelector(options: UseOpenFileSelectorOptions): UseOpenFileSelectorResult {
  const { onFilesSelected } = options;

  const openSelector = useCallback(
    (properties: OpenDialogOptions['properties']) => {
      void ipcBridge.dialog.showOpen
        .invoke({ properties })
        .then((files) => {
          if (!files || files.length === 0) {
            return;
          }
          onFilesSelected(files);
        })
        .catch((error) => {
          // In WebUI, dialog may fail if DirectorySelectionModal is not rendered
          // or bridge is not properly connected. Log error for debugging.
          console.warn('[useOpenFileSelector] Failed to open selector:', error);
        });
    },
    [onFilesSelected]
  );

  const openFileSelector = useCallback(() => {
    openSelector(['openFile', 'multiSelections']);
  }, [openSelector]);

  const openDirectorySelector = useCallback(() => {
    openSelector(['openDirectory', 'createDirectory']);
  }, [openSelector]);

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
    openDirectorySelector,
    onSlashBuiltinCommand,
  };
}
