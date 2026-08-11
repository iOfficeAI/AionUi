/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Dropdown, Menu, Message } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { FileService } from '@/renderer/services/FileService';
import type { FileMetadata } from '@/renderer/services/FileService';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface FileAttachButtonProps {
  /** Open server/host file browser (existing ipcBridge.dialog.showOpen behavior) */
  openFileSelector: () => void;
  /** Open server/host directory browser for agents that accept folder context */
  openDirectorySelector?: () => void;
  /** Callback when local device files are selected via browser file picker */
  onLocalFilesAdded?: (files: FileMetadata[]) => void;
}

/**
 * Unified file-attach button for SendBox.
 *
 * - **Electron desktop**: Simple "+" button → opens native OS file dialog (same as before).
 * - **WebUI (desktop/mobile browser)**: "+" button with dropdown → choose between
 *   host machine files (server-side directory browser) or local device files (browser file picker).
 */
const FileAttachButton: React.FC<FileAttachButtonProps> = ({
  openFileSelector,
  openDirectorySelector,
  onLocalFilesAdded,
}) => {
  const conversationContext = useConversationContextSafe();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleLocalFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0 || !onLocalFilesAdded) return;
      setUploading(true);
      try {
        const processed = await FileService.processDroppedFiles(fileList, conversationContext?.conversationId);
        if (processed.length > 0) {
          onLocalFilesAdded(processed);
        }
      } catch (err) {
        Message.error(t('common.fileAttach.failed'));
      } finally {
        setUploading(false);
      }
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [conversationContext?.conversationId, onLocalFilesAdded, t]
  );

  const plusIcon = <Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />;

  const handleMenuClick = (key: string) => {
    if (key === 'host') openFileSelector();
    if (key === 'directory') openDirectorySelector?.();
    if (key === 'device') fileInputRef.current?.click();
  };

  const hostMenuItems = (
    <>
      <Menu.Item key='host'>{t('common.fileAttach.hostFiles')}</Menu.Item>
      {openDirectorySelector && <Menu.Item key='directory'>{t('fileSelection.selectDirectory')}</Menu.Item>}
    </>
  );

  // Electron desktop: simple button unless the caller also supports directory selection.
  if (isElectronDesktop() && !openDirectorySelector) {
    return <Button type='secondary' shape='circle' icon={plusIcon} onClick={openFileSelector} />;
  }

  if (isElectronDesktop()) {
    return (
      <Dropdown
        droplist={<Menu onClickMenuItem={handleMenuClick}>{hostMenuItems}</Menu>}
        trigger='click'
        position='top'
      >
        <Button type='secondary' shape='circle' icon={plusIcon} />
      </Dropdown>
    );
  }

  // WebUI: dropdown with two options
  const dropdownMenu = (
    <Menu onClickMenuItem={handleMenuClick}>
      {hostMenuItems}
      <Menu.Item key='device'>{t('common.fileAttach.myDevice')}</Menu.Item>
    </Menu>
  );

  return (
    <>
      <Dropdown droplist={dropdownMenu} trigger='click' position='top'>
        <Button type='secondary' shape='circle' icon={plusIcon} loading={uploading} disabled={uploading} />
      </Dropdown>
      <input ref={fileInputRef} type='file' multiple style={{ display: 'none' }} onChange={handleLocalFileChange} />
    </>
  );
};

export default FileAttachButton;
