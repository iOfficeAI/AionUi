/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Progress, Typography, Space, Card, Divider } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useAutoUpdate } from '@renderer/hooks/useAutoUpdate';
import { UpdateStatus } from '@renderer/services/UpdateService';
import { formatBytes } from '../../../../common/update/updateConfig';

const { Text, Title } = Typography;

interface UpdateProgressProps {
  /**
   * 是否显示详细信息
   */
  showDetails?: boolean;

  /**
   * 卡片样式
   */
  style?: React.CSSProperties;

  /**
   * 自定义标题
   */
  title?: string;
}

/**
 * UpdateProgress - 更新进度组件
 *
 * 专用于显示下载和安装进度的详细信息
 */
export const UpdateProgress: React.FC<UpdateProgressProps> = ({ showDetails = true, style, title }) => {
  const { t } = useTranslation();
  const { status, isDownloading, isDownloaded, progress, formattedSpeed, formattedTimeRemaining, downloadSession, latestVersion } = useAutoUpdate();

  // 如果不在下载状态，不显示进度组件
  if (!isDownloading && !isDownloaded) {
    return null;
  }

  // 获取状态文本
  const getStatusText = () => {
    switch (status) {
      case UpdateStatus.DOWNLOADING:
        return downloadSession?.status === 'paused' ? t('update.status.paused') : t('update.status.downloading');
      case UpdateStatus.DOWNLOADED:
        return t('update.status.downloaded');
      default:
        return t('update.status.preparing');
    }
  };

  // 获取进度状态
  const getProgressStatus = () => {
    if (isDownloaded) return 'success';
    if (downloadSession?.status === 'failed') return 'error';
    if (downloadSession?.status === 'paused') return 'normal';
    return 'normal';
  };

  // 渲染基本进度信息
  const renderBasicProgress = () => (
    <div>
      <div className='flex justify-between items-center mb-8px'>
        <Text style={{ fontWeight: 'bold' }}>{getStatusText()}</Text>
        <Text type='secondary'>{progress.toFixed(1)}%</Text>
      </div>

      <Progress percent={progress} status={getProgressStatus()} showText={false} strokeWidth={8} className='mb-12px' />

      {downloadSession && (
        <div className='flex justify-between items-center'>
          <Text type='secondary' style={{ fontSize: '12px' }}>
            {formatBytes(downloadSession.bytesDownloaded)} / {formatBytes(downloadSession.totalBytes)}
          </Text>
          {formattedSpeed && (
            <Text type='secondary' style={{ fontSize: '12px' }}>
              {formattedSpeed}
            </Text>
          )}
        </div>
      )}
    </div>
  );

  // 渲染详细信息
  const renderDetailedInfo = () => {
    if (!showDetails || !downloadSession) return null;

    return (
      <>
        <Divider />
        <Space direction='vertical' size='small' className='w-full'>
          <div className='flex justify-between'>
            <Text type='secondary'>{t('update.version')}:</Text>
            <Text code>{latestVersion}</Text>
          </div>

          <div className='flex justify-between'>
            <Text type='secondary'>{t('update.fileSize')}:</Text>
            <Text>{formatBytes(downloadSession.totalBytes)}</Text>
          </div>

          {formattedTimeRemaining && (
            <div className='flex justify-between'>
              <Text type='secondary'>{t('update.timeRemaining')}:</Text>
              <Text>{formattedTimeRemaining}</Text>
            </div>
          )}

          <div className='flex justify-between'>
            <Text type='secondary'>{t('update.status')}:</Text>
            <Text>{getStatusText()}</Text>
          </div>

          {downloadSession.startedAt && (
            <div className='flex justify-between'>
              <Text type='secondary'>{t('update.startedAt')}:</Text>
              <Text>{new Date(downloadSession.startedAt).toLocaleTimeString()}</Text>
            </div>
          )}

          {downloadSession.completedAt && (
            <div className='flex justify-between'>
              <Text type='secondary'>{t('update.completedAt')}:</Text>
              <Text>{new Date(downloadSession.completedAt).toLocaleTimeString()}</Text>
            </div>
          )}
        </Space>
      </>
    );
  };

  const cardTitle = title || t('update.downloadProgress');

  return (
    <Card title={<Title heading={6}>{cardTitle}</Title>} style={{ width: '100%', ...style }} bordered>
      {renderBasicProgress()}
      {renderDetailedInfo()}
    </Card>
  );
};

// formatBytes 函数已移到 @/common/updateConfig 中统一管理

export default UpdateProgress;
