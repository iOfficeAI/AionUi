/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Button, Typography, Space, Alert, Progress } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useAutoUpdate } from '@renderer/hooks/useAutoUpdate';
import { useUpdateUtils } from '@renderer/hooks/useUpdateUtils';
import { UpdateStatus as UpdateStatusEnum } from '@renderer/services/UpdateService';
import { IconRefresh, IconDownload, IconPause, IconClose } from '@arco-design/web-react/icon';

const { Text, Paragraph } = Typography;

interface UpdateStatusComponentProps {
  /**
   * 是否在应用启动时自动检查更新
   */
  autoCheckOnMount?: boolean;

  /**
   * 是否显示版本信息
   */
  showVersionInfo?: boolean;

  /**
   * 是否显示详细进度信息
   */
  showDetailedProgress?: boolean;
}

/**
 * UpdateStatusComponent - 更新状态组件
 *
 * 用于在关于页面显示更新相关信息和操作
 */
const UpdateStatusComponent: React.FC<UpdateStatusComponentProps> = ({ autoCheckOnMount = true, showVersionInfo = true, showDetailedProgress = true }) => {
  const { t } = useTranslation();
  const { buildPackageInfo, formatBytes } = useUpdateUtils();
  const { state, status, hasUpdate, isChecking, isDownloading, isDownloaded, hasError, progress, formattedSpeed, formattedTimeRemaining, currentVersion, latestVersion, isMajorUpdate, version, downloadSession, error, checkForUpdates, downloadUpdate, pauseDownload, resumeDownload, cancelDownload, installAndRestart } = useAutoUpdate();

  // 自动检查更新
  useEffect(() => {
    if (autoCheckOnMount) {
      checkForUpdates();
    }
  }, [autoCheckOnMount, checkForUpdates]);

  // 渲染版本信息
  const renderVersionInfo = () => {
    if (!showVersionInfo || !currentVersion) return null;

    return (
      <div className='mb-16px'>
        <Space direction='vertical' style={{ fontSize: '12px', gap: '8px' }}>
          <Text>
            {t('update.currentVersion')}: <Text code>{currentVersion}</Text>
          </Text>
          {latestVersion && (
            <Text>
              {t('update.latestVersion')}: <Text code>{latestVersion}</Text>
            </Text>
          )}
        </Space>
      </div>
    );
  };

  // 渲染更新状态
  const renderUpdateStatus = () => {
    if (hasError) {
      return <Alert type='error' title={t('update.error')} content={error} showIcon className='mb-16px' />;
    }

    if (hasUpdate) {
      const updateType = isMajorUpdate ? t('update.majorUpdate') : t('update.minorUpdate');

      return (
        <Alert
          type='info'
          title={t('update.available', { type: updateType })}
          content={
            version?.releaseNotes ? (
              <div>
                <Paragraph ellipsis={{ rows: 3, expandable: true }}>{version.releaseNotes}</Paragraph>
              </div>
            ) : (
              t('update.availableMessage')
            )
          }
          showIcon
          className='mb-16px'
        />
      );
    }

    if (status === UpdateStatusEnum.NOT_AVAILABLE) {
      return <Alert type='success' title={t('update.upToDate')} content={t('update.upToDateMessage')} showIcon className='mb-16px' />;
    }

    return null;
  };

  // 渲染下载进度
  const renderDownloadProgress = () => {
    if (!isDownloading && !isDownloaded) return null;

    return (
      <div className='mb-16px'>
        <Progress percent={Math.round(progress * 100) / 100} status={isDownloaded ? 'success' : 'normal'} showText className='mb-8px' />

        {showDetailedProgress && downloadSession && (
          <Space>
            {formattedSpeed && (
              <Text type='secondary' style={{ fontSize: '12px', gap: '8px' }}>
                {t('update.downloadSpeed')}: {formattedSpeed}
              </Text>
            )}
            {formattedTimeRemaining && (
              <Text type='secondary' style={{ fontSize: '12px', gap: '8px' }}>
                {t('update.timeRemaining')}: {formattedTimeRemaining}
              </Text>
            )}
            <Text type='secondary' style={{ fontSize: '12px', gap: '8px' }}>
              {formatBytes(downloadSession.bytesDownloaded)} / {formatBytes(downloadSession.totalBytes)}
            </Text>
          </Space>
        )}
      </div>
    );
  };

  // 渲染操作按钮
  const renderActions = () => {
    if (isDownloaded && downloadSession) {
      return (
        <Space>
          <Button type='primary' onClick={() => installAndRestart(downloadSession.sessionId)}>
            {t('update.installAndRestart')}
          </Button>
          <Button onClick={() => cancelDownload(downloadSession.sessionId)}>{t('update.cancel')}</Button>
        </Space>
      );
    }

    if (isDownloading && downloadSession) {
      const isPaused = downloadSession.status === 'paused';

      return (
        <Space>
          <Button icon={isPaused ? <IconRefresh /> : <IconPause />} onClick={() => (isPaused ? resumeDownload(downloadSession.sessionId) : pauseDownload(downloadSession.sessionId))}>
            {isPaused ? t('update.resume') : t('update.pause')}
          </Button>
          <Button icon={<IconClose />} onClick={() => cancelDownload(downloadSession.sessionId)}>
            {t('update.cancel')}
          </Button>
        </Space>
      );
    }

    if (hasUpdate) {
      return (
        <Button type='primary' icon={<IconDownload />} onClick={handleDownload} disabled={!version?.latest}>
          {t('update.download')}
        </Button>
      );
    }

    return (
      <Button icon={<IconRefresh />} loading={isChecking} onClick={() => checkForUpdates(true)}>
        {t('update.checkForUpdates')}
      </Button>
    );
  };

  // 处理下载
  const handleDownload = async () => {
    if (!version || !hasUpdate) return;

    // 优先使用真实的包信息
    const realPackages = state.updateCheckResult?.availablePackages;
    let packageInfo;

    if (realPackages && realPackages.length > 0) {
      // 使用第一个兼容的包
      packageInfo = realPackages[0];
      console.log('[UpdateStatus] Using real package info:', packageInfo);
    } else {
      // 降级到构建的包信息
      packageInfo = await buildPackageInfo(version.latest);
      if (!packageInfo) {
        console.error('Cannot build package info - system info not available');
        return;
      }
      console.warn('[UpdateStatus] Using fallback package info (no real packages available)');
    }

    await downloadUpdate({
      packageInfo,
      versionInfo: version,
      skipUserConfirmation: false,
    });
  };

  return (
    <div className='update-status'>
      {renderVersionInfo()}
      {renderUpdateStatus()}
      {renderDownloadProgress()}
      <div className='update-actions'>{renderActions()}</div>
    </div>
  );
};

export default UpdateStatusComponent;
export type UpdateStatusProps = UpdateStatusComponentProps;
