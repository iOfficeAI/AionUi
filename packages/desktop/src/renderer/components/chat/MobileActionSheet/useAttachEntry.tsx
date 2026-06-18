/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { FileService, type FileMetadata } from '@/renderer/services/FileService';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Message } from '@arco-design/web-react';
import { FolderOpen, FolderUpload, Paperclip } from '@icon-park/react';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { MobileActionSheetEntry } from './types';

interface UseAttachEntryOptions {
  /** Open the host-side file picker (paths from disk via IPC). */
  openFileSelector: () => void;
  /** Receives FileMetadata[] for files uploaded through the browser <input>. WebUI only. */
  onLocalFilesAdded?: (files: FileMetadata[]) => void;
  /** Whether to render the first entry above a divider — passed through. */
  dividerBefore?: boolean;
}

interface UseAttachEntryResult {
  /** One entry on desktop (single "Attach" row); two on WebUI (host picker + device upload),
   * flattened so all top-level rows in the action sheet share a uniform height. */
  entries: MobileActionSheetEntry[];
  /** Mount this near the sendbox so the hidden file input can be triggered. */
  hiddenFileInput: React.ReactElement;
}

/**
 * Builds the "Attach" entries for the mobile action sheet, branching on platform:
 * - Desktop: single row → opens host file picker.
 * - WebUI: two flat rows — "Add files or photos" (host picker over IPC) and
 *   "Upload from device" (browser <input type="file">). Flattened (rather than
 *   submenu) so all top-level rows in the sheet share a consistent height.
 */
export const useAttachEntry = ({
  openFileSelector,
  onLocalFilesAdded,
  dividerBefore,
}: UseAttachEntryOptions): UseAttachEntryResult => {
  const { t } = useTranslation();
  const conversationContext = useConversationContextSafe();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDesktop = isElectronDesktop();

  const handleLocalFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0 || !onLocalFilesAdded) return;
      try {
        const processed = await FileService.processDroppedFiles(fileList, conversationContext?.conversation_id);
        if (processed.length > 0) onLocalFilesAdded(processed);
      } catch {
        Message.error(t('common.fileAttach.failed'));
      }
      e.target.value = '';
    },
    [conversationContext?.conversation_id, onLocalFilesAdded, t]
  );

  const triggerLocalUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const entries = useMemo<MobileActionSheetEntry[]>(() => {
    if (isDesktop) {
      return [
        {
          key: 'attach',
          icon: <FolderUpload theme='outline' size='16' />,
          label: t('common.fileAttach.addFiles', { defaultValue: 'Add files' }),
          variant: 'muted',
          dividerBefore,
          onClick: () => openFileSelector(),
        },
      ];
    }

    return [
      {
        key: 'attach-host-files',
        icon: <Paperclip theme='outline' size='16' />,
        label: t('common.fileAttach.addFiles', { defaultValue: 'Add files' }),
        variant: 'muted',
        dividerBefore,
        onClick: () => openFileSelector(),
      },
      {
        key: 'attach-my-device',
        icon: <FolderOpen theme='outline' size='16' />,
        label: t('common.fileAttach.myDevice', { defaultValue: 'Upload from device' }),
        variant: 'muted',
        onClick: () => triggerLocalUpload(),
      },
    ];
  }, [dividerBefore, isDesktop, openFileSelector, t, triggerLocalUpload]);

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type='file'
      multiple
      style={{ display: 'none' }}
      onChange={handleLocalFileChange}
      data-testid='mobile-sheet-file-upload-input'
    />
  );

  return { entries, hiddenFileInput };
};
