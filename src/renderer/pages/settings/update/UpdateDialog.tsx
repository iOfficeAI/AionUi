/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Modal, Button, Typography, Space, Alert, Divider, Spin } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useAutoUpdate } from '@renderer/hooks/useAutoUpdate';
import { useUpdateUtils } from '@renderer/hooks/useUpdateUtils';
import { UpdateProgress } from './UpdateProgress';
import { UpdateStatus } from '@renderer/services/UpdateService';
import { IconDownload, IconRefresh, IconExclamationCircleFill } from '@arco-design/web-react/icon';

const { Title, Paragraph, Text } = Typography;

interface UpdateDialogProps {
  /**
   * 是否显示对话框
   */
  visible: boolean;
  
  /**
   * 关闭对话框的回调
   */
  onClose: () => void;
  
  /**
   * 对话框类型
   */
  type?: 'update-available' | 'force-update' | 'download-progress';
  
  /**
   * 是否允许用户关闭对话框（强制更新时为 false）
   */
  closable?: boolean;
}

/**
 * UpdateDialog - 更新对话框组件
 * 
 * 用于显示更新相关的模态对话框
 */
export const UpdateDialog: React.FC<UpdateDialogProps> = ({
  visible,
  onClose,
  type = 'update-available',
  closable = true,
}) => {
  const { t } = useTranslation();
  const [isConfirming, setIsConfirming] = useState(false);
  const { buildPackageInfo } = useUpdateUtils();
  
  const {
    state,
    status,
    hasUpdate,
    isDownloading,
    isDownloaded,
    hasError,
    currentVersion,
    latestVersion,
    isMajorUpdate,
    version,
    downloadSession,
    error,
    downloadUpdate,
    installAndRestart,
    checkForUpdates,
  } = useAutoUpdate();

  // 获取对话框标题
  const getDialogTitle = () => {
    switch (type) {
      case 'force-update':
        return t('update.forceUpdateRequired');
      case 'download-progress':
        return t('update.downloadProgress');
      default:
        return t('update.updateAvailable');
    }
  };

  // 处理下载更新
  const handleDownload = async () => {
    if (!version || !hasUpdate) return;

    setIsConfirming(true);
    
    try {
      // 优先使用真实的包信息
      const realPackages = state.updateCheckResult?.availablePackages;
      let packageInfo;
      
      if (realPackages && realPackages.length > 0) {
        // 使用第一个兼容的包
        packageInfo = realPackages[0];
        console.log('[UpdateDialog] Using real package info:', packageInfo);
      } else {
        // 降级到构建的包信息
        packageInfo = await buildPackageInfo(version.latest);
        if (!packageInfo) {
          console.error('Cannot build package info - system info not available');
          return;
        }
        console.warn('[UpdateDialog] Using fallback package info (no real packages available)');
      }

      await downloadUpdate({
        packageInfo,
        versionInfo: version,
        skipUserConfirmation: false,
      });
    } finally {
      setIsConfirming(false);
    }
  };

  // 处理安装并重启
  const handleInstallAndRestart = async () => {
    if (!downloadSession) return;
    
    setIsConfirming(true);
    
    try {
      await installAndRestart(downloadSession.sessionId);
    } finally {
      setIsConfirming(false);
    }
  };


  // 渲染更新可用内容
  const renderUpdateAvailableContent = () => {
    if (!hasUpdate || !version) return null;

    const updateType = isMajorUpdate ? t('update.majorUpdate') : t('update.minorUpdate');

    return (
      <div>
        <Alert
          type="info"
          icon={<IconExclamationCircleFill />}
          title={t('update.newVersionAvailable', { 
            type: updateType,
            version: latestVersion 
          })}
          className="mb-16px"
        />

        <Space direction="vertical" style={{ gap: '16px' }} className="w-full">
          <div>
            <Text style={{ fontWeight: 'bold' }}>{t('update.currentVersion')}: </Text>
            <Text code>{currentVersion}</Text>
          </div>
          
          <div>
            <Text style={{ fontWeight: 'bold' }}>{t('update.newVersion')}: </Text>
            <Text code>{latestVersion}</Text>
          </div>

          {version.releaseNotes && (
            <>
              <Divider />
              <div>
                <Title heading={6}>{t('update.releaseNotes')}</Title>
                <Paragraph 
                  style={{ 
                    maxHeight: '200px', 
                    overflowY: 'auto',
                    backgroundColor: 'var(--color-fill-2)',
                    padding: '12px',
                    borderRadius: '4px'
                  }}
                >
                  {version.releaseNotes}
                </Paragraph>
              </div>
            </>
          )}

          {isMajorUpdate && (
            <Alert
              type="warning"
              content={t('update.majorUpdateWarning')}
              showIcon
            />
          )}
        </Space>
      </div>
    );
  };

  // 渲染强制更新内容
  const renderForceUpdateContent = () => {
    return (
      <div>
        <Alert
          type="error"
          icon={<IconExclamationCircleFill />}
          title={t('update.forceUpdateRequired')}
          content={t('update.forceUpdateMessage')}
          className="mb-16px"
        />

        <Space direction="vertical" style={{ gap: '16px' }} className="w-full">
          <div>
            <Text style={{ fontWeight: 'bold' }}>{t('update.currentVersion')}: </Text>
            <Text code>{currentVersion}</Text>
          </div>
          
          <div>
            <Text style={{ fontWeight: 'bold' }}>{t('update.minimumVersion')}: </Text>
            <Text code>{latestVersion}</Text>
          </div>

          <Alert
            type="warning"
            content={t('update.forceUpdateWarning')}
            showIcon
          />
        </Space>
      </div>
    );
  };

  // 渲染下载进度内容
  const renderDownloadProgressContent = () => {
    if (hasError) {
      return (
        <div>
          <Alert
            type="error"
            title={t('update.downloadError')}
            content={error}
            showIcon
            className="mb-16px"
          />
          
          <Button 
            type="primary" 
            icon={<IconRefresh />}
            onClick={() => checkForUpdates(true)}
            loading={isConfirming}
          >
            {t('update.retry')}
          </Button>
        </div>
      );
    }

    return (
      <div>
        <UpdateProgress showDetails />
        
        {isDownloaded && (
          <Alert
            type="success"
            title={t('update.downloadCompleted')}
            content={t('update.readyToInstall')}
            showIcon
            className="mt-16px"
          />
        )}
      </div>
    );
  };

  // 获取对话框内容
  const getDialogContent = () => {
    switch (type) {
      case 'force-update':
        return renderForceUpdateContent();
      case 'download-progress':
        return renderDownloadProgressContent();
      default:
        return renderUpdateAvailableContent();
    }
  };

  // 获取对话框底部按钮
  const getFooterButtons = () => {
    if (type === 'download-progress') {
      if (isDownloaded && downloadSession) {
        return [
          <Button key="later" onClick={onClose}>
            {t('update.installLater')}
          </Button>,
          <Button 
            key="install" 
            type="primary"
            loading={isConfirming}
            onClick={handleInstallAndRestart}
          >
            {t('update.installAndRestart')}
          </Button>
        ];
      }
      
      if (isDownloading) {
        return [
          <Button key="background" onClick={onClose}>
            {t('update.downloadInBackground')}
          </Button>
        ];
      }

      return [
        <Button key="close" onClick={onClose}>
          {t('common.close')}
        </Button>
      ];
    }

    if (type === 'force-update') {
      return [
        <Button 
          key="download" 
          type="primary"
          icon={<IconDownload />}
          loading={isConfirming}
          onClick={handleDownload}
        >
          {t('update.downloadNow')}
        </Button>
      ];
    }

    // update-available
    return [
      <Button key="later" onClick={onClose}>
        {t('update.remindLater')}
      </Button>,
      <Button 
        key="download" 
        type="primary"
        icon={<IconDownload />}
        loading={isConfirming}
        onClick={handleDownload}
      >
        {t('update.downloadNow')}
      </Button>
    ];
  };

  return (
    <Modal
      title={getDialogTitle()}
      visible={visible}
      onCancel={closable ? onClose : undefined}
      closable={closable}
      maskClosable={closable}
      footer={getFooterButtons()}
      style={{ top: '20vh', width: 500 }}
    >
      <Spin loading={status === UpdateStatus.CHECKING}>
        {getDialogContent()}
      </Spin>
    </Modal>
  );
};

export default UpdateDialog;