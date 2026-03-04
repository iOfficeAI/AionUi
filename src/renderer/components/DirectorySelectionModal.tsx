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
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(
    async (dirPath = '') => {
      setLoading(true);
      setError(null);
      try {
        const showFiles = isFileMode ? 'true' : 'false';
        const response = await fetch(`/api/directory/browse?path=${encodeURIComponent(dirPath)}&showFiles=${showFiles}`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          setError(errorData.error || `HTTP ${response.status}`);
          return;
        }
        const data = await response.json();
        if (!data || !Array.isArray(data.items)) {
          setError('Invalid response from server');
          return;
        }
        setDirectoryData(data);
        setCurrentPath(dirPath);
      } catch (err) {
        console.error('Failed to load directory:', err);
        setError(err instanceof Error ? err.message : 'Failed to load directory');
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
    if (item.isDirectory) {
      loadDirectory(item.path).catch((error) => console.error('Failed to load directory:', error));
    }
  };

  // Double-click behavior removed - single click now handles directory navigation
  // 移除双击行为 - 单击现在处理目录导航
  const handleItemDoubleClick = (_item: DirectoryItem) => {
    // No-op: single click already handles navigation
  };

  const handleSelect = (path: string) => {
    setSelectedPath(path);
  };

  // Windows 驱动器列表状态
  const [drives, setDrives] = useState<string[]>([]);
  const [isWindows, setIsWindows] = useState(false);

  // 检测 Windows 系统和加载驱动器列表 (#1082)
  useEffect(() => {
    const win = /win/i.test(navigator.userAgent) || currentPath.includes('\\');
    setIsWindows(win);
    
    if (win && currentPath === '') {
      // 尝试从 API 加载驱动器列表，或使用默认值
      fetch('/api/directory/drives', { credentials: 'include' })
        .then(r => {
          if (!r.ok) throw new Error('Drive API not available');
          return r.json();
        })
        .then(data => setDrives(data.drives || ['C:', 'D:']))
        .catch(() => {
          // 回退：使用常见的 Windows 驱动器
          setDrives(['C:', 'D:']);
        });
    } else {
      setDrives([]);
    }
  }, [currentPath]);

  const handleGoUp = () => {
    if (directoryData.parentPath !== undefined && directoryData.parentPath !== '') {
      // 优先使用 API 返回的父路径
      const targetPath = directoryData.parentPath === '__ROOT__' ? '' : directoryData.parentPath;
      loadDirectory(targetPath).catch((error) => console.error('Failed to load parent directory:', error));
    } else if (currentPath && currentPath !== '') {
      // 回退方案：从当前路径计算父目录 (#1082)
      const separator = currentPath.includes('\\') ? '\\' : '/';
      const parts = currentPath.split(separator).filter(Boolean);
      if (parts.length > 1) {
        parts.pop();
        const parentPath = parts.join(separator);
        loadDirectory(parentPath).catch((error) => console.error('Failed to load parent:', error));
      } else {
        // 到达根目录，显示驱动器列表（Windows）或空路径
        loadDirectory('').catch((error) => console.error('Failed to load root:', error));
      }
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
      className='w-[90vw] md:w-[600px]'
      style={{ width: 'min(600px, 90vw)' }}
      wrapStyle={{ zIndex: 3000 }}
      maskStyle={{ zIndex: 2990 }}
      footer={
        <div className='w-full flex justify-between items-center'>
          <div className='text-t-secondary text-14px overflow-hidden text-ellipsis whitespace-nowrap max-w-[70vw]' title={selectedPath || currentPath}>
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
        <div className='w-full border border-b-base rd-4px overflow-hidden' style={{ height: 'min(400px, 60vh)' }}>
          <div className='h-full overflow-y-auto'>
            {directoryData.canGoUp && (
              <div className='flex items-center p-10px border-b border-b-light cursor-pointer hover:bg-hover transition' onClick={handleGoUp}>
                <IconUp className='mr-10px text-t-secondary' />
                <span>..</span>
              </div>
            )}
            {error && (
              <div className='p-16px text-center text-danger text-13px'>
                <div>{error}</div>
                <Button size='mini' className='mt-8px' onClick={() => loadDirectory(currentPath).catch(() => {})}>
                  {t('common.retry', { defaultValue: 'Retry' })}
                </Button>
              </div>
            )}
            {directoryData.items.map((item, index) => (
              <div key={index} className='flex items-center justify-between p-10px border-b border-b-light cursor-pointer hover:bg-hover transition' style={selectedPath === item.path ? { background: 'var(--brand-light)' } : {}} onClick={() => handleItemClick(item)} onDoubleClick={() => handleItemDoubleClick(item)}>
                <div className='flex items-center flex-1 min-w-0'>
                  {item.isDirectory ? <IconFolder className='mr-10px text-warning shrink-0' /> : <IconFile className='mr-10px text-primary shrink-0' />}
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
            
            {/* Windows 驱动器选择区域 (#1082) */}
            {isWindows && currentPath === '' && drives.length > 0 && (
              <div className='p-10px border-t border-t-light mt-10px'>
                <div className='text-12px text-t-secondary mb-8px'>{t('fileSelection.selectDrive', { defaultValue: 'Select Drive' })}</div>
                <div className='flex flex-wrap gap-8px'>
                  {drives.map((drive) => (
                    <Button
                      key={drive}
                      size='mini'
                      onClick={() => loadDirectory(drive + '\\')}
                    >
                      {drive}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Spin>
    </Modal>
  );
};

export default DirectorySelectionModal;
