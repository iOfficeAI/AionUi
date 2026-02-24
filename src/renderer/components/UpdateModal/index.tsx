/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Progress, Switch, Message } from '@arco-design/web-react';
import { CheckOne, Download, FolderOpen, Refresh, CloseOne, Install } from '@icon-park/react';
import { ipcBridge } from '@/common';
import AionModal from '@/renderer/components/base/AionModal';
import MarkdownView from '@/renderer/components/Markdown';
import type { UpdateDownloadProgressEvent, UpdateReleaseInfo, AutoUpdateStatus } from '@/common/updateTypes';
import { useTranslation } from 'react-i18next';

type UpdateStatus = 'checking' | 'upToDate' | 'available' | 'downloading' | 'downloaded' | 'success' | 'error';

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
  const [useAutoUpdate, setUseAutoUpdate] = useState(true); // 默认使用自动更新
  const [autoUpdateInfo, setAutoUpdateInfo] = useState<{ version: string; releaseNotes?: string } | null>(null);

  const resetState = () => {
    setStatus('checking');
    setUpdateInfo(null);
    setCurrentVersion('');
    setDownloadId(null);
    setProgress({ percent: 0, speed: '', total: 0, transferred: 0 });
    setErrorMsg('');
    setDownloadPath('');
    setAutoUpdateInfo(null);
  };

  const includePrerelease = useMemo(() => localStorage.getItem('update.includePrerelease') === 'true', [visible]);

  const checkForUpdates = async () => {
    setStatus('checking');
    try {
      // 优先使用自动更新模式
      if (useAutoUpdate) {
        const res = await ipcBridge.autoUpdate.check.invoke();
        if (res?.success && res.data?.updateInfo) {
          setAutoUpdateInfo({
            version: res.data.updateInfo.version,
            releaseNotes: res.data.updateInfo.releaseNotes,
          });
          // 获取当前版本
          const manualRes = await ipcBridge.update.check.invoke({ includePrerelease });
          if (manualRes?.success) {
            setCurrentVersion(manualRes.data?.currentVersion || '');
          }
          setStatus('available');
          return;
        } else if (res?.msg) {
          // 自动更新失败，尝试手动更新
          console.warn('Auto-update check failed, falling back to manual mode:', res.msg);
        }
      }

      // 手动更新模式
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
    if (!updateInfo && !autoUpdateInfo) return;
    setStatus('downloading');
    try {
      // 使用自动更新模式
      if (useAutoUpdate) {
        const res = await ipcBridge.autoUpdate.download.invoke();
        if (!res?.success) {
          throw new Error(res?.msg || t('update.downloadStartFailed'));
        }
        return;
      }

      // 手动更新模式
      if (!updateInfo) return;
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
      setDownloadPath(res.data.filePath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Download failed:', err);
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const quitAndInstall = async () => {
    try {
      await ipcBridge.autoUpdate.quitAndInstall.invoke();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Install failed:', err);
      Message.error(msg);
    }
  };

  const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond > 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  };

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const handleOpenUpdateModal = () => {
    setVisible(true);
    resetState();
    void checkForUpdates();
  };

  useEffect(() => {
    const removeOpenListener = ipcBridge.update.open.on(handleOpenUpdateModal);
    window.addEventListener('aionui-open-update-modal', handleOpenUpdateModal);

    return () => {
      removeOpenListener();
      window.removeEventListener('aionui-open-update-modal', handleOpenUpdateModal);
    };
  }, []);

  // 监听自动更新状态
  useEffect(() => {
    const removeListener = ipcBridge.autoUpdate.status.on((evt: AutoUpdateStatus) => {
      if (!evt) return;

      switch (evt.status) {
        case 'checking':
          break;
        case 'available':
          setAutoUpdateInfo({
            version: evt.version || '',
            releaseNotes: evt.releaseNotes,
          });
          setStatus('available');
          break;
        case 'not-available':
          setStatus('upToDate');
          break;
        case 'downloading':
          if (evt.progress) {
            setProgress({
              percent: Math.round(evt.progress.percent),
              speed: formatSpeed(evt.progress.bytesPerSecond),
              total: evt.progress.total,
              transferred: evt.progress.transferred,
            });
          }
          break;
        case 'downloaded':
          setStatus('downloaded');
          break;
        case 'error':
          setStatus('error');
          setErrorMsg(evt.error || t('update.downloadFailed'));
          break;
      }
    });

    return () => {
      removeListener();
    };
  }, [t]);

  useEffect(() => {
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
      removeProgressListener();
    };
  }, [downloadId, t]);

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
          <div className='flex flex-col items-center justify-center py-48px'>
            <div className='w-48px h-48px mb-20px relative'>
              <div className='absolute inset-0 border-3 border-fill-3 rounded-full' />
              <div className='absolute inset-0 border-3 border-primary border-t-transparent rounded-full animate-spin' />
            </div>
            <div className='text-15px text-t-primary font-500'>{t('update.checking')}</div>
          </div>
        );

      case 'upToDate':
        return (
          <div className='flex flex-col items-center justify-center py-48px'>
            <div className='w-56px h-56px bg-[rgb(var(--success-6))]/12 rounded-full flex items-center justify-center mb-20px'>
              <CheckOne theme='filled' size='28' fill='rgb(var(--success-6))' />
            </div>
            <div className='text-16px text-t-primary font-600 mb-8px'>{t('update.upToDateTitle')}</div>
            <div className='text-13px text-t-tertiary'>{t('update.currentVersion', { version: currentVersion || '-' })}</div>
          </div>
        );

      case 'available':
        return (
          <div className='flex flex-col h-full'>
            {/* 版本信息头部 / Version info header */}
            <div className='flex items-center justify-between px-24px py-16px border-b border-border-2 bg-fill-1'>
              <div className='flex items-center gap-12px'>
                <div className='w-40px h-40px bg-[rgb(var(--primary-6))]/12 rounded-10px flex items-center justify-center'>
                  <Download size='20' fill='rgb(var(--primary-6))' />
                </div>
                <div>
                  <div className='text-15px font-600 text-t-primary'>{t('update.availableTitle')}</div>
                  <div className='text-12px text-t-tertiary mt-2px'>
                    {currentVersion} → <span className='text-[rgb(var(--primary-6))] font-500'>{updateInfo?.version || autoUpdateInfo?.version}</span>
                  </div>
                </div>
              </div>
              <div className='flex items-center gap-12px'>
                {!useAutoUpdate && (
                  <Button type='primary' size='small' onClick={startDownload} className='!px-16px'>
                    {t('update.downloadButton')}
                  </Button>
                )}
                {useAutoUpdate && (
                  <Button type='primary' size='small' onClick={startDownload} className='!px-16px'>
                    {t('update.downloadAndInstall')}
                  </Button>
                )}
              </div>
            </div>

            {/* 自动更新开关 / Auto update toggle */}
            {useAutoUpdate && (
              <div className='flex items-center justify-between px-24px py-12px bg-fill-1 border-b border-border-2'>
                <div className='text-13px text-t-secondary'>{t('update.autoUpdateMode')}</div>
                <Switch checked={useAutoUpdate} onChange={setUseAutoUpdate} size='small' />
              </div>
            )}

            {/* 更新日志内容 / Release notes content */}
            <div className='flex-1 min-h-0 overflow-y-auto px-24px py-16px custom-scrollbar'>
              {updateInfo?.name && <div className='text-14px font-500 text-t-primary mb-12px'>{updateInfo.name}</div>}
              {updateInfo?.body || autoUpdateInfo?.releaseNotes ? (
                <div className='text-13px text-t-secondary leading-relaxed'>
                  <MarkdownView>{updateInfo?.body || autoUpdateInfo?.releaseNotes || ''}</MarkdownView>
                </div>
              ) : (
                <div className='text-13px text-t-tertiary italic'>{t('update.noReleaseNotes')}</div>
              )}
            </div>
          </div>
        );

      case 'downloading':
        return (
          <div className='flex flex-col items-center justify-center py-48px px-32px'>
            <div className='w-56px h-56px bg-[rgb(var(--primary-6))]/12 rounded-full flex items-center justify-center mb-20px'>
              <Download size='24' fill='rgb(var(--primary-6))' className='animate-bounce' />
            </div>
            <div className='text-16px text-t-primary font-600 mb-20px'>{t('update.downloadingTitle')}</div>
            <div className='w-full max-w-320px'>
              <Progress percent={progress.percent} status='normal' showText={false} strokeWidth={6} className='!mb-12px' />
              <div className='flex justify-between text-12px text-t-tertiary'>
                <span>
                  {formatSize(progress.transferred)} / {formatSize(progress.total)}
                </span>
                <span className='text-[rgb(var(--primary-6))] font-500'>{progress.speed}</span>
              </div>
            </div>
          </div>
        );

      case 'downloaded':
        return (
          <div className='flex flex-col items-center justify-center py-48px px-32px'>
            <div className='w-56px h-56px bg-[rgb(var(--success-6))]/12 rounded-full flex items-center justify-center mb-20px'>
              <CheckOne theme='filled' size='28' fill='rgb(var(--success-6))' />
            </div>
            <div className='text-16px text-t-primary font-600 mb-8px'>{t('update.readyToInstall')}</div>
            <div className='text-13px text-t-tertiary mb-24px text-center max-w-360px'>
              {t('update.readyToInstallDesc')}
            </div>
            <Button type='primary' size='small' onClick={quitAndInstall} icon={<Install size='14' />} className='!px-16px'>
              {t('update.installNow')}
            </Button>
          </div>
        );

      case 'success':
        return (
          <div className='flex flex-col items-center justify-center py-48px px-32px'>
            <div className='w-56px h-56px bg-[rgb(var(--success-6))]/12 rounded-full flex items-center justify-center mb-20px'>
              <CheckOne theme='filled' size='28' fill='rgb(var(--success-6))' />
            </div>
            <div className='text-16px text-t-primary font-600 mb-8px'>{t('update.downloadCompleteTitle')}</div>
            <div className='text-12px text-t-tertiary mb-24px text-center max-w-360px break-all line-clamp-2'>{downloadPath}</div>
            <div className='flex gap-12px'>
              <Button size='small' onClick={showInFolder} icon={<FolderOpen size='14' />} className='!px-16px'>
                {t('update.showInFolder')}
              </Button>
              <Button type='primary' size='small' onClick={openFile} className='!px-16px'>
                {t('update.openFile')}
              </Button>
            </div>
          </div>
        );

      case 'error':
        return (
          <div className='flex flex-col items-center justify-center py-48px px-32px'>
            <div className='w-56px h-56px bg-[rgb(var(--danger-6))]/12 rounded-full flex items-center justify-center mb-20px'>
              <CloseOne theme='filled' size='28' fill='rgb(var(--danger-6))' />
            </div>
            <div className='text-16px text-t-primary font-600 mb-8px'>{t('update.errorTitle')}</div>
            <div className='text-13px text-t-tertiary mb-24px text-center max-w-360px'>{errorMsg}</div>
            <Button size='small' onClick={checkForUpdates} icon={<Refresh size='14' />} className='!px-16px'>
              {t('common.retry')}
            </Button>
          </div>
        );
    }
  };

  return (
    <AionModal
      visible={visible}
      onCancel={handleClose}
      size={status === 'available' ? 'medium' : 'small'}
      header={{
        title: t('update.modalTitle'),
        showClose: true,
      }}
      footer={{ render: () => null }}
      contentStyle={{
        height: status === 'available' ? '420px' : 'auto',
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <div className='flex flex-col h-full w-full'>{renderContent()}</div>
    </AionModal>
  );
};

export default UpdateModal;
