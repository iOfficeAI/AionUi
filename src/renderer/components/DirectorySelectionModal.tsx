/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Modal, Spin } from '@arco-design/web-react';
import { IconFile, IconFolder, IconUp } from '@arco-design/web-react/icon';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile?: boolean;
}

interface DirectoryData {
  items: DirectoryItem[];
  canGoUp: boolean;
  parentPath?: string;
}

interface DirectorySelectionModalProps {
  visible: boolean;
  isFileMode?: boolean;
  onConfirm: (paths: string[] | undefined) => void;
  onCancel: () => void;
}

const DirectorySelectionModal: React.FC<DirectorySelectionModalProps> = ({ visible, isFileMode = false, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [directoryData, setDirectoryData] = useState<DirectoryData>({ items: [], canGoUp: false });
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');

  const loadDirectory = useCallback(
    async (path = '') => {
      setLoading(true);
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const token = (window as any).__SESSION_TOKEN__ || urlParams.get('token');
        const showFiles = isFileMode ? 'true' : 'false';
        const response = await fetch(`/api/directory/browse?path=${encodeURIComponent(path)}&showFiles=${showFiles}&token=${token}`, {
          method: 'GET',
          credentials: 'include',
        });
        const data = await response.json();
        setDirectoryData(data);
        setCurrentPath(path);
      } catch (error) {
        console.error('Failed to load directory:', error);
      } finally {
        setLoading(false);
      }
    },
    [isFileMode]
  );

  useEffect(() => {
    if (visible) {
      setSelectedPath('');
      loadDirectory('').catch((error) => console.error('Failed to load initial directory:', error));
    }
  }, [visible, loadDirectory]);

  const handleItemClick = (item: DirectoryItem) => {
    if (item.isDirectory && !isFileMode) {
      loadDirectory(item.path).catch((error) => console.error('Failed to load directory:', error));
    }
  };

  const handleItemDoubleClick = (item: DirectoryItem) => {
    if (item.isDirectory && isFileMode) {
      loadDirectory(item.path).catch((error) => console.error('Failed to load directory:', error));
    }
  };

  const handleSelect = (path: string) => {
    setSelectedPath(path);
  };

  const handleGoUp = () => {
    if (directoryData.parentPath !== undefined) {
      loadDirectory(directoryData.parentPath).catch((error) => console.error('Failed to load parent directory:', error));
    }
  };

  const handleConfirm = () => {
    if (selectedPath) {
      onConfirm([selectedPath]);
    }
  };

  const canSelect = (item: DirectoryItem) => {
    return isFileMode ? item.isFile : item.isDirectory;
  };

  return (
    <Modal
      visible={visible}
      title={isFileMode ? '📄 ' + t('fileSelection.selectFile') : '📁 ' + t('fileSelection.selectDirectory')}
      onCancel={onCancel}
      onOk={handleConfirm}
      okButtonProps={{ disabled: !selectedPath }}
      style={{ width: 600 }}
      footer={
        <div className='w-full flex justify-between items-center'>
          <div className='text-#666 text-14px overflow-hidden text-ellipsis whitespace-nowrap max-w-400px' title={selectedPath || currentPath}>
            {selectedPath || currentPath || (isFileMode ? t('fileSelection.pleaseSelectFile') : t('fileSelection.pleaseSelectDirectory'))}
          </div>
          <div className='flex gap-10px'>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button type='primary' onClick={handleConfirm} disabled={!selectedPath}>
              {t('common.confirm')}
            </Button>
          </div>
        </div>
      }
    >
      <Spin loading={loading} className='w-full'>
        <div className='w-full border border-#ddd rd-4px overflow-hidden' style={{ height: 400 }}>
          <div className='h-full overflow-y-auto'>
            {directoryData.canGoUp && (
              <div className='flex items-center p-10px border-b border-#eee cursor-pointer hover:bg-#f5f5f5 transition' onClick={handleGoUp}>
                <IconUp className='mr-10px text-#86909c' />
                <span>..</span>
              </div>
            )}
            {directoryData.items.map((item, index) => (
              <div key={index} className='flex items-center justify-between p-10px border-b border-#eee cursor-pointer hover:bg-#f5f5f5 transition' style={selectedPath === item.path ? { background: '#e3f2fd' } : {}} onClick={() => handleItemClick(item)} onDoubleClick={() => handleItemDoubleClick(item)}>
                <div className='flex items-center flex-1 min-w-0'>
                  {item.isDirectory ? <IconFolder className='mr-10px text-#ff9800 shrink-0' /> : <IconFile className='mr-10px text-#2196f3 shrink-0' />}
                  <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{item.name}</span>
                </div>
                {canSelect(item) && (
                  <Button
                    type='primary'
                    size='mini'
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(item.path);
                    }}
                  >
                    {t('common.select')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Spin>
    </Modal>
  );
};

export default DirectorySelectionModal;
