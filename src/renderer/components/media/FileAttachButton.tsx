/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Dropdown, Menu, Message, Modal, Input, List, Spin } from '@arco-design/web-react';
import {
  Plus,
  FileText,
  FilePdf,
  Picture,
  Video as VideoIcon,
  FileWord,
  FileExcel,
  FilePpt,
} from '@icon-park/react';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { FileService } from '@/renderer/services/FileService';
import type { FileMetadata } from '@/renderer/services/FileService';
import type { ILibraryItem, LibraryFileType } from '@/common/types/library';
import { ipcBridge } from '@/common';
import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface FileAttachButtonProps {
  /** Open server/host file browser (existing ipcBridge.dialog.showOpen behavior) */
  openFileSelector: () => void;
  /** Callback when local device files are selected via browser file picker */
  onLocalFilesAdded?: (files: FileMetadata[]) => void;
  /** Callback to append file paths directly to sendbox */
  onFilePathsSelected?: (paths: string[]) => void;
}

const getFileTypeIcon = (type: LibraryFileType) => {
  const iconProps = { theme: 'outline' as const, size: '16', className: 'mr-8px shrink-0 text-[#8c8c8c]' };
  switch (type) {
    case 'markdown':
      return <FileText {...iconProps} fill='#e3e3e3' />;
    case 'pdf':
      return <FilePdf {...iconProps} fill='#FF4D4F' />;
    case 'image':
      return <Picture {...iconProps} fill='#52C41A' />;
    case 'video':
      return <VideoIcon {...iconProps} fill='#722ED1' />;
    case 'document':
      return <FileWord {...iconProps} fill='#1890FF' />;
    case 'spreadsheet':
      return <FileExcel {...iconProps} fill='#389E0D' />;
    case 'presentation':
      return <FilePpt {...iconProps} fill='#D4380D' />;
    default:
      return <FileText {...iconProps} fill='#e3e3e3' />;
  }
};

/**
 * Unified file-attach button for SendBox.
 *
 * - Now always opens a dropdown offering Upload file, Auto-inject skills (Host Files),
 *   and Select from Library. Selecting from Library lets the user insert any library page.
 */
const FileAttachButton: React.FC<FileAttachButtonProps> = ({
  openFileSelector,
  onLocalFilesAdded,
  onFilePathsSelected,
}) => {
  const conversationContext = useConversationContextSafe();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Library modal states
  const [isLibraryModalVisible, setIsLibraryModalVisible] = useState(false);
  const [libraryItems, setLibraryItems] = useState<ILibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  const loadLibraryItems = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const results = await ipcBridge.library.listItems.invoke({
        filter: 'recents',
        keyword: searchKeyword,
      });
      setLibraryItems(results);
    } catch (err) {
      console.error('[FileAttachButton] Failed to load library items:', err);
    } finally {
      setLibraryLoading(false);
    }
  }, [searchKeyword]);

  useEffect(() => {
    if (isLibraryModalVisible) {
      void loadLibraryItems();
    }
  }, [isLibraryModalVisible, loadLibraryItems]);

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
      e.target.value = '';
    },
    [conversationContext?.conversationId, onLocalFilesAdded, t]
  );

  const selectLibraryItem = (item: ILibraryItem) => {
    if (onFilePathsSelected && item.filePath) {
      onFilePathsSelected([item.filePath]);
      Message.success(t('common.saveSuccess', { defaultValue: 'Success' }));
    }
    setIsLibraryModalVisible(false);
  };

  const plusIcon = <Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />;

  // WebUI or Electron: dropdown with three options
  const dropdownMenu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'host') openFileSelector();
        if (key === 'device') {
          if (isElectronDesktop()) {
            openFileSelector();
          } else {
            fileInputRef.current?.click();
          }
        }
        if (key === 'library') {
          setIsLibraryModalVisible(true);
        }
      }}
    >
      <Menu.Item key='device'>{t('conversation.welcome.uploadFile', { defaultValue: 'Upload File' })}</Menu.Item>
      <Menu.Item key='host'>{t('settings.autoInjectedSkills', { defaultValue: 'Auto-inject skills' })}</Menu.Item>
      <Menu.Item key='library'>{t('library.title', { defaultValue: 'Library' })}</Menu.Item>
    </Menu>
  );

  return (
    <>
      <Dropdown droplist={dropdownMenu} trigger='click' position='top'>
        <Button type='secondary' shape='circle' icon={plusIcon} loading={uploading} disabled={uploading} />
      </Dropdown>
      <input ref={fileInputRef} type='file' multiple style={{ display: 'none' }} onChange={handleLocalFileChange} />

      {/* Library pages selector Modal */}
      <Modal
        title={t('library.title', { defaultValue: 'Select from Library' })}
        visible={isLibraryModalVisible}
        onCancel={() => setIsLibraryModalVisible(false)}
        footer={null}
        style={{ width: '480px', borderRadius: '12px' }}
      >
        <div className='flex flex-col gap-12px'>
          <Input.Search
            placeholder={t('library.searchPlaceholder', { defaultValue: 'Search pages...' })}
            value={searchKeyword}
            onChange={setSearchKeyword}
            allowClear
          />
          <Spin loading={libraryLoading}>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <List
                dataSource={libraryItems}
                noDataElement={<div className='py-20px text-center text-t-secondary'>No pages found</div>}
                render={(item) => (
                  <List.Item
                    key={item.id}
                    className='px-12px py-8px cursor-pointer hover:bg-fill-2 transition-colors flex items-center rounded-8px'
                    onClick={() => selectLibraryItem(item)}
                  >
                    {getFileTypeIcon(item.fileType)}
                    <span className='text-13px font-medium text-t-primary truncate'>{item.name}</span>
                  </List.Item>
                )}
              />
            </div>
          </Spin>
        </div>
      </Modal>
    </>
  );
};

export default FileAttachButton;
