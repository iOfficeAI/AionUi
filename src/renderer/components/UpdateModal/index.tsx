/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Progress, Space, Typography } from '@arco-design/web-react';
import { Attention, CheckOne, Download, FileText, FolderOpen, Refresh } from '@icon-park/react';
import { ipcBridge } from '@/common';
import AionModal from '@/renderer/components/base/AionModal';
import MarkdownView from '@/renderer/components/Markdown';
import type { UpdateDownloadProgressEvent, UpdateReleaseInfo } from '@/common/updateTypes';
import { useTranslation } from 'react-i18next';

type UpdateStatus = 'checking' | 'upToDate' | 'available' | 'downloading' | 'success' | 'error';

type UpdateInfo = UpdateReleaseInfo;

const UpdateModal: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>('checking');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ percent: 0, speed: '', total: 0, transferred: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  const [downloadPath, setDownloadPath] = useState('');

  const resetState = () => {
    setStatus('checking');
    setUpdateInfo(null);
    setCurrentVersion('');
    setDownloadId(null);
    setProgress({ percent: 0, speed: '', total: 0, transferred: 0 });
    setErrorMsg('');
    setDownloadPath('');
  };

  const includePrerelease = useMemo(() => localStorage.getItem('update.includePrerelease') === 'true', [visible]);

  const checkForUpdates = async () => {
    setStatus('checking');
    try {
      const res = await ipcBridge.update.check.invoke({ includePrerelease });
      if (!res?.success) {
        throw new Error(res?.msg || t('update.checkFailed'));
      }
      setCurrentVersion(res.data?.currentVersion || '');

      if (res.data?.updateAvailable && res.data.latest) {
        setUpdateInfo(res.data.latest);
        setStatus('available');
        return;
      }

      setUpdateInfo(res.data?.latest || null);
      setStatus('upToDate');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Update check failed:', err);
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const startDownload = async () => {
    if (!updateInfo) return;
    setStatus('downloading');
    try {
      const asset = updateInfo.recommendedAsset;
      if (!asset) {
        throw new Error(t('update.noCompatibleAsset'));
      }

      const res = await ipcBridge.update.download.invoke({
        url: asset.url,
        fileName: asset.name,
      });
      if (!res?.success || !res.data) {
        throw new Error(res?.msg || t('update.downloadStartFailed'));
      }

      setDownloadId(res.data.downloadId);
      // We may not be done yet; this path is the target.
      setDownloadPath(res.data.filePath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Download failed:', err);
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond > 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  };

  useEffect(() => {
    const removeOpenListener = ipcBridge.update.open.on(() => {
      setVisible(true);
      resetState();
      void checkForUpdates();
    });

    const removeProgressListener = ipcBridge.update.downloadProgress.on((evt: UpdateDownloadProgressEvent) => {
      if (!evt) return;
      if (!downloadId || evt.downloadId !== downloadId) return;

      setProgress({
        percent: Math.round(evt.percent ?? 0),
        speed: formatSpeed(evt.bytesPerSecond ?? 0),
        total: evt.totalBytes ?? 0,
        transferred: evt.receivedBytes ?? 0,
      });

      if (evt.status === 'completed') {
        setStatus('success');
        if (evt.filePath) {
          setDownloadPath(evt.filePath);
        }
      } else if (evt.status === 'error' || evt.status === 'cancelled') {
        setStatus('error');
        setErrorMsg(evt.error || t('update.downloadFailed'));
      }
    });

    return () => {
      removeOpenListener();
      removeProgressListener();
    };
  }, [downloadId]);

  const handleClose = () => {
    setVisible(false);
  };

  const openFile = () => {
    if (!downloadPath) return;
    void ipcBridge.shell.openFile.invoke(downloadPath).catch((error) => {
      console.error('Failed to open file:', error);
    });
  };

  const showInFolder = () => {
    if (!downloadPath) return;
    void ipcBridge.shell.showItemInFolder.invoke(downloadPath).catch((error) => {
      console.error('Failed to show item in folder:', error);
    });
  };

  const renderContent = () => {
    switch (status) {
      case 'checking':
        return (
          <div className='flex flex-col items-center justify-center py-40px h-300px'>
            <div className='loading w-32px h-32px border-2 border-primary border-t-transparent rounded-full animate-spin mb-16px' />
            <Typography.Text className='text-t-secondary'>{t('update.checking')}</Typography.Text>
          </div>
        );

      case 'upToDate':
        return (
          <div className='flex flex-col items-center justify-center py-40px h-300px'>
            <div className='w-64px h-64px bg-success/10 rounded-full flex items-center justify-center mb-16px text-success'>
              <CheckOne theme='filled' size='32' />
            </div>
            <Typography.Title heading={5} className='m-0 mb-8px'>
              {t('update.upToDateTitle')}
            </Typography.Title>
            <Typography.Text className='text-t-secondary'>{t('update.currentVersion', { version: currentVersion || '-' })}</Typography.Text>
          </div>
        );

      case 'available':
        return (
          <div className='flex flex-col h-full overflow-hidden'>
            <div className='flex items-center justify-between mb-16px shrink-0'>
              <div>
                <div className='flex items-center gap-8px'>
                  <Typography.Title heading={5} className='m-0'>
                    {t('update.availableTitle')}
                  </Typography.Title>
                  <span className='bg-primary/10 text-primary px-8px py-2px rounded text-12px font-bold'>{updateInfo?.version}</span>
                </div>
                {updateInfo?.name && <Typography.Text className='text-t-secondary text-12px block mt-4px'>{updateInfo.name}</Typography.Text>}
              </div>
            </div>
            <div className='flex-1 min-h-0 border border-border rounded-lg bg-bg-2 overflow-hidden flex flex-col'>
              <div className='flex-1 overflow-y-auto p-16px custom-scrollbar'>{updateInfo?.body ? <MarkdownView>{updateInfo.body}</MarkdownView> : <Typography.Text className='text-t-secondary italic'>{t('update.noReleaseNotes')}</Typography.Text>}</div>
            </div>
          </div>
        );

      case 'downloading':
        return (
          <div className='flex flex-col items-center justify-center py-40px h-300px'>
            <Typography.Title heading={6} className='mb-24px'>
              {t('update.downloadingTitle')}
            </Typography.Title>
            <div className='w-full max-w-300px'>
              <Progress percent={progress.percent} status='normal' width='100%' />
              <div className='flex justify-between mt-8px text-12px text-t-secondary'>
                <span>{progress.speed}</span>
                <span>{progress.percent}%</span>
              </div>
            </div>
          </div>
        );

      case 'success':
        return (
          <div className='flex flex-col items-center justify-center py-40px h-300px'>
            <div className='w-64px h-64px bg-primary/10 rounded-full flex items-center justify-center mb-16px text-primary'>
              <CheckOne theme='filled' size='32' />
            </div>
            <Typography.Title heading={5} className='m-0 mb-8px'>
              {t('update.downloadCompleteTitle')}
            </Typography.Title>
            <Typography.Text className='text-t-secondary mb-24px text-center max-w-400px break-all'>{downloadPath}</Typography.Text>
            <Space>
              <Button onClick={showInFolder} icon={<FolderOpen />}>
                {t('update.showInFolder')}
              </Button>
              <Button type='primary' onClick={openFile} icon={<FileText />}>
                {t('update.openFile')}
              </Button>
            </Space>
          </div>
        );

      case 'error':
        return (
          <div className='flex flex-col items-center justify-center py-40px h-300px'>
            <div className='w-64px h-64px bg-danger/10 rounded-full flex items-center justify-center mb-16px text-danger'>
              <Attention theme='filled' size='32' />
            </div>
            <Typography.Title heading={5} className='m-0 mb-8px'>
              {t('update.errorTitle')}
            </Typography.Title>
            <Typography.Text className='text-t-secondary mb-24px text-center px-24px'>{errorMsg}</Typography.Text>
            <Button onClick={checkForUpdates} icon={<Refresh />}>
              {t('common.retry')}
            </Button>
          </div>
        );
    }
  };

  const renderFooter = () => {
    if (status === 'available') {
      return (
        <div className='flex justify-end gap-12px pt-16px border-t border-border'>
          <Button onClick={handleClose}>{t('common.close')}</Button>
          <Button type='primary' onClick={startDownload} icon={<Download />}>
            {t('update.downloadButton')}
          </Button>
        </div>
      );
    }
    if (status === 'upToDate') {
      return (
        <div className='flex justify-center pt-16px'>
          <Button type='primary' onClick={handleClose}>
            {t('common.close')}
          </Button>
        </div>
      );
    }
    return null;
  };

  return (
    <AionModal
      visible={visible}
      onCancel={handleClose}
      size={status === 'available' ? 'large' : 'medium'}
      header={{
        title: t('update.modalTitle'),
        showClose: true,
      }}
      footer={{
        render: renderFooter,
      }}
      contentStyle={{
        height: status === 'available' ? '500px' : 'auto',
        overflow: 'hidden',
      }}
    >
      <div className='flex flex-col h-full w-full'>{renderContent()}</div>
    </AionModal>
  );
};

export default UpdateModal;
