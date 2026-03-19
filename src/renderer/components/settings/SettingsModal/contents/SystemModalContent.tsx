/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import LanguageSwitcher from '@/renderer/components/settings/LanguageSwitcher';
import { iconColors } from '@/renderer/styles/colors';
import { Alert, Button, Collapse, Form, Modal, Switch, Tooltip, Message } from '@arco-design/web-react';
import { FolderOpen, FolderSearch, Link } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { mutate } from 'swr';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '../settingsViewContext';

/**
 * 目录选择输入组件 / Directory selection input component
 * 用于选择和显示系统目录路径 / Used for selecting and displaying system directory paths
 */
const DirInputItem: React.FC<{
  /** 标签文本 / Label text */
  label: string;
  /** 表单字段名 / Form field name */
  field: string;
}> = ({ label, field }) => {
  const { t } = useTranslation();
  return (
    <Form.Item label={label} field={field}>
      {(value, form) => {
        const currentValue = form.getFieldValue(field) || '';

        const handlePick = () => {
          ipcBridge.dialog.showOpen
            .invoke({
              defaultPath: currentValue,
              properties: ['openDirectory', 'createDirectory'],
            })
            .then((data) => {
              if (data?.[0]) {
                form.setFieldValue(field, data[0]);
              }
            })
            .catch((error) => {
              console.error('Failed to open directory dialog:', error);
            });
        };

        return (
          <div className='aion-dir-input h-[32px] flex items-center rounded-8px border border-solid border-transparent pl-14px bg-[var(--fill-0)]'>
            <Tooltip content={currentValue || t('settings.dirNotConfigured')} position='top'>
              <div className='flex-1 min-w-0 text-13px text-t-primary truncate '>
                {currentValue || t('settings.dirNotConfigured')}
              </div>
            </Tooltip>
            <Button
              type='text'
              style={{ borderLeft: '1px solid var(--color-border-2)', borderRadius: '0 8px 8px 0' }}
              icon={<FolderOpen theme='outline' size='18' fill={iconColors.primary} />}
              onClick={(e) => {
                e.stopPropagation();
                handlePick();
              }}
            />
          </div>
        );
      }}
    </Form.Item>
  );
};

/**
 * 偏好设置行组件 / Preference row component
 * 用于显示标签和对应的控件，统一的水平布局 / Used for displaying labels and corresponding controls in a unified horizontal layout
 */
const PreferenceRow: React.FC<{
  /** 标签文本 / Label text */
  label: string;
  /** 控件元素 / Control element */
  children: React.ReactNode;
  /** 描述文本 / Description text */
  description?: string;
}> = ({ label, children, description }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='flex-1'>
      <div className='text-14px text-2'>{label}</div>
      {description && <div className='text-12px text-t-tertiary mt-4px'>{description}</div>}
    </div>
    <div className='flex-shrink-0'>{children}</div>
  </div>
);

/**
 * CDP 设置组件 / CDP Settings Component
 * 用于配置 Chrome DevTools Protocol 远程调试
 */
const CdpSettings: React.FC = () => {
  const { t } = useTranslation();
  const { data: cdpStatus, isLoading } = useSWR('cdp.status', () => ipcBridge.application.getCdpStatus.invoke());
  const [switchLoading, setSwitchLoading] = useState(false);

  const status = cdpStatus?.data;

  // Track the pending state (config saved but not yet applied)
  const hasPendingChange = status?.startupEnabled !== status?.enabled;

  const handleToggle = async (checked: boolean) => {
    setSwitchLoading(true);
    try {
      const result = await ipcBridge.application.updateCdpConfig.invoke({ enabled: checked });
      if (result.success) {
        Message.success(t('settings.cdp.configSaved'));
        await mutate('cdp.status');
      } else {
        Message.error(result.msg || t('settings.cdp.configFailed'));
      }
    } catch {
      Message.error(t('settings.cdp.configFailed'));
    } finally {
      setSwitchLoading(false);
    }
  };

  const handleRestart = async () => {
    try {
      await ipcBridge.application.restart.invoke();
    } catch {
      Message.error(t('common.error'));
    }
  };

  const openCdpUrl = () => {
    if (status?.port) {
      const url = `http://127.0.0.1:${status.port}/json`;
      ipcBridge.shell.openExternal.invoke(url).catch(console.error);
    }
  };

  const copyCdpUrl = () => {
    if (status?.port) {
      const url = `http://127.0.0.1:${status.port}`;
      void navigator.clipboard.writeText(url).then(() => {
        Message.success(t('common.copySuccess'));
      });
    }
  };

  const copyMcpConfig = () => {
    if (status?.port) {
      const config = `{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@0.16.0",
        "--browser-url=http://127.0.0.1:${status.port}"
      ]
    }
  }
}`;
      void navigator.clipboard.writeText(config).then(() => {
        Message.success(t('common.copySuccess'));
      });
    }
  };

  // Only show CDP settings in development mode
  if (!isLoading && status?.isDevMode === false) {
    return null;
  }

  if (isLoading) {
    return null;
  }

  return (
    <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
      <div className='text-14px font-medium text-t-primary mb-8px'>{t('settings.cdp.title')}</div>
      <div className='space-y-12px'>
        <PreferenceRow label={t('settings.cdp.enable')} description={t('settings.cdp.enableDesc')}>
          <Switch checked={status?.startupEnabled ?? false} loading={switchLoading} onChange={handleToggle} />
        </PreferenceRow>

        {status?.port && (
          <div className='space-y-8px'>
            <div className='flex items-center gap-8px py-8px px-12px bg-[var(--fill-1)] rounded-8px'>
              <div className='flex-1'>
                <div className='text-12px text-t-tertiary'>{t('settings.cdp.currentPort')}</div>
                <div className='text-14px text-t-primary font-medium'>http://127.0.0.1:{status.port}</div>
              </div>
              <Tooltip content={t('settings.cdp.openInBrowser')}>
                <Button type='text' size='small' icon={<Link theme='outline' size='16' />} onClick={openCdpUrl} />
              </Tooltip>
              <Tooltip content={t('common.copy')}>
                <Button
                  type='text'
                  size='small'
                  icon={<span className='i-carbon:copy text-16px' />}
                  onClick={copyCdpUrl}
                />
              </Tooltip>
            </div>
            <div className='space-y-4px'>
              <div className='text-12px text-t-tertiary'>{t('settings.cdp.mcpConfig')}</div>
              <div className='flex items-start gap-8px py-8px px-12px bg-[var(--fill-1)] rounded-8px'>
                <pre className='flex-1 text-11px text-t-secondary font-mono overflow-x-auto whitespace-pre-wrap break-all m-0 leading-relaxed'>
                  {`{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@0.16.0",
        "--browser-url=http://127.0.0.1:${status.port}"
      ]
    }
  }
}`}
                </pre>
                <Tooltip content={t('settings.cdp.copyMcpConfig')}>
                  <Button
                    type='text'
                    size='small'
                    icon={<span className='i-carbon:copy text-16px' />}
                    onClick={copyMcpConfig}
                  />
                </Tooltip>
              </div>
              <div className='text-11px text-t-tertiary'>{t('settings.cdp.mcpConfigHint')}</div>
            </div>
          </div>
        )}

        {status && !status.port && !status.startupEnabled && (
          <div className='text-12px text-t-tertiary py-8px'>{t('settings.cdp.disabledHint')}</div>
        )}

        {hasPendingChange && (
          <Alert
            type='warning'
            content={
              <div className='flex items-center justify-between gap-12px'>
                <span>{t('settings.cdp.restartRequired')}</span>
                <Button size='small' type='primary' onClick={handleRestart}>
                  {t('settings.restartNow')}
                </Button>
              </div>
            }
            className='mt-8px'
          />
        )}
      </div>
    </div>
  );
};

/**
 * 系统设置内容组件 / System settings content component
 *
 * 提供系统级配置选项，包括语言和目录配置
 * Provides system-level configuration options including language and directory config
 *
 * @features
 * - 语言设置 / Language setting
 * - 高级设置：缓存目录、工作目录配置 / Advanced: cache directory, work directory configuration
 * - 配置变更自动保存 / Auto-save on configuration changes
 */
const SystemModalContent: React.FC = () => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [modal, modalContextHolder] = Modal.useModal();
  const [error, setError] = useState<string | null>(null);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const initializingRef = useRef(true);

  // 关闭到托盘状态 / Close to tray state
  const [closeToTray, setCloseToTray] = useState(false);

  // 全局通知总开关 / Global notification master switch
  const [notificationEnabled, setNotificationEnabled] = useState(true);

  // 任务完成通知子开关 / Task completion notification sub-switch
  const [cronNotificationEnabled, setCronNotificationEnabled] = useState(false);

  // Initialize DevTools state from Main Process
  useEffect(() => {
    ipcBridge.application.isDevToolsOpened
      .invoke()
      .then((isOpen) => {
        setIsDevToolsOpen(isOpen);
      })
      .catch((error) => {
        console.error('Failed to get DevTools state:', error);
      });

    const unsubscribe = ipcBridge.application.devToolsStateChanged.on((event) => {
      setIsDevToolsOpen(event.isOpen);
    });

    return () => unsubscribe();
  }, []);

  // 获取关闭到托盘设置 / Fetch close-to-tray setting
  useEffect(() => {
    ipcBridge.systemSettings.getCloseToTray
      .invoke()
      .then((enabled) => setCloseToTray(enabled))
      .catch(() => {});
  }, []);

  // 获取通知开关设置 / Fetch notification enabled setting
  useEffect(() => {
    ipcBridge.systemSettings.getNotificationEnabled
      .invoke()
      .then((enabled) => setNotificationEnabled(enabled))
      .catch(() => {});
  }, []);

  // 获取定时任务通知开关设置 / Fetch cron notification enabled setting
  useEffect(() => {
    ipcBridge.systemSettings.getCronNotificationEnabled
      .invoke()
      .then((enabled) => setCronNotificationEnabled(enabled))
      .catch(() => {});
  }, []);

  // 切换关闭到托盘 / Toggle close-to-tray
  const handleCloseToTrayChange = useCallback((checked: boolean) => {
    setCloseToTray(checked);
    // 通过 bridge 设置，provider 会处理持久化和主进程通知
    ipcBridge.systemSettings.setCloseToTray.invoke({ enabled: checked }).catch(() => {
      // 失败时回滚 UI 状态
      setCloseToTray(!checked);
    });
  }, []);

  // 切换全局通知总开关 / Toggle global notification master switch
  const handleNotificationEnabledChange = useCallback((checked: boolean) => {
    setNotificationEnabled(checked);
    ipcBridge.systemSettings.setNotificationEnabled.invoke({ enabled: checked }).catch(() => {
      setNotificationEnabled(!checked);
    });
  }, []);

  // 切换定时任务通知开关 / Toggle cron notification enabled
  const handleCronNotificationEnabledChange = useCallback((checked: boolean) => {
    setCronNotificationEnabled(checked);
    ipcBridge.systemSettings.setCronNotificationEnabled.invoke({ enabled: checked }).catch(() => {
      setCronNotificationEnabled(!checked);
    });
  }, []);

  const handleToggleDevTools = () => {
    ipcBridge.application.openDevTools
      .invoke()
      .then((isOpen) => {
        setIsDevToolsOpen(Boolean(isOpen));
      })
      .catch((error) => {
        console.error('Failed to toggle dev tools:', error);
      });
  };

  // Get system directory info
  const { data: systemInfo } = useSWR('system.dir.info', () => ipcBridge.application.systemInfo.invoke());

  // Initialize form data
  useEffect(() => {
    if (systemInfo) {
      initializingRef.current = true;
      form.setFieldsValue({ cacheDir: systemInfo.cacheDir, workDir: systemInfo.workDir });
      // Allow onValuesChange to fire after initialization settles
      requestAnimationFrame(() => {
        initializingRef.current = false;
      });
    }
  }, [systemInfo, form]);

  // 偏好设置项配置 / Preference items configuration
  const preferenceItems = [
    { key: 'language', label: t('settings.language'), component: <LanguageSwitcher /> },
    {
      key: 'closeToTray',
      label: t('settings.closeToTray'),
      component: <Switch checked={closeToTray} onChange={handleCloseToTrayChange} />,
    },
  ];

  // 目录配置保存确认 / Directory configuration save confirmation
  const saveDirConfigValidate = (_values: { cacheDir: string; workDir: string }): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      modal.confirm({
        title: t('settings.updateConfirm'),
        content: t('settings.restartConfirm'),
        onOk: resolve,
        onCancel: reject,
      });
    });
  };

  // Auto-save: when directory changes, prompt for restart
  const savingRef = useRef(false);

  const handleValuesChange = useCallback(
    async (_changedValue: unknown, allValues: Record<string, string>) => {
      if (initializingRef.current || savingRef.current || !systemInfo) return;
      const { cacheDir, workDir } = allValues;
      const needsRestart = cacheDir !== systemInfo.cacheDir || workDir !== systemInfo.workDir;
      if (!needsRestart) return;

      savingRef.current = true;
      setError(null);
      try {
        await saveDirConfigValidate({ cacheDir, workDir });
        const result = await ipcBridge.application.updateSystemInfo.invoke({ cacheDir, workDir });
        if (result.success) {
          await ipcBridge.application.restart.invoke();
        } else {
          setError(result.msg || 'Failed to update system info');
          // Revert form to original values on failure
          form.setFieldValue('cacheDir', systemInfo.cacheDir);
          form.setFieldValue('workDir', systemInfo.workDir);
        }
      } catch (caughtError: unknown) {
        // User cancelled the confirm dialog — revert
        form.setFieldValue('cacheDir', systemInfo.cacheDir);
        form.setFieldValue('workDir', systemInfo.workDir);
        if (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
        }
      } finally {
        savingRef.current = false;
      }
    },
    [systemInfo, form, saveDirConfigValidate]
  );

  return (
    <div className='flex flex-col h-full w-full'>
      {modalContextHolder}

      {/* 内容区域 / Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {/* 偏好设置与高级设置合并展示 / Combined preferences and advanced settings */}
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              {preferenceItems.map((item) => (
                <PreferenceRow key={item.key} label={item.label}>
                  {item.component}
                </PreferenceRow>
              ))}
            </div>
            {/* Notification settings with collapsible sub-options */}
            <Collapse
              bordered={false}
              activeKey={notificationEnabled ? ['notification'] : []}
              onChange={(_, keys) => {
                const shouldExpand = (keys as string[]).includes('notification');
                if (shouldExpand && !notificationEnabled) {
                  handleNotificationEnabledChange(true);
                } else if (!shouldExpand && notificationEnabled) {
                  handleNotificationEnabledChange(false);
                }
              }}
              className='[&_.arco-collapse-item]:!border-none [&_.arco-collapse-item-header]:!px-0 [&_.arco-collapse-item-header-title]:!flex-1 [&_.arco-collapse-item-content-box]:!px-0 [&_.arco-collapse-item-content-box]:!pb-0'
            >
              <Collapse.Item
                name='notification'
                showExpandIcon={false}
                header={
                  <div className='flex flex-1 items-center justify-between w-full'>
                    <span className='text-14px text-2 ml-12px'>{t('settings.notification')}</span>
                    <Switch
                      checked={notificationEnabled}
                      onClick={(e) => e.stopPropagation()}
                      onChange={handleNotificationEnabledChange}
                    />
                  </div>
                }
              >
                <div className='pl-12px'>
                  <PreferenceRow label={t('settings.cronNotificationEnabled')}>
                    <Switch
                      checked={cronNotificationEnabled}
                      disabled={!notificationEnabled}
                      onChange={handleCronNotificationEnabledChange}
                    />
                  </PreferenceRow>
                </div>
              </Collapse.Item>
            </Collapse>
            <Form form={form} layout='vertical' className='space-y-16px' onValuesChange={handleValuesChange}>
              <DirInputItem label={t('settings.cacheDir')} field='cacheDir' />
              <DirInputItem label={t('settings.workDir')} field='workDir' />
              {/* Log directory (read-only, click to open in file manager) */}
              <div className='!mt-32px'>
                <Form.Item label={t('settings.logDir')}>
                  <div className='aion-dir-input h-[32px] flex items-center rounded-8px border border-solid border-transparent pl-14px bg-[var(--fill-0)] '>
                    <Tooltip content={systemInfo?.logDir || ''} position='top'>
                      <div className='flex-1 min-w-0 text-13px text-t-primary truncate'>{systemInfo?.logDir || ''}</div>
                    </Tooltip>
                    <Button
                      type='text'
                      style={{ borderLeft: '1px solid var(--color-border-2)', borderRadius: '0 8px 8px 0' }}
                      icon={<FolderSearch theme='outline' size='18' fill={iconColors.primary} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (systemInfo?.logDir) {
                          void ipcBridge.shell.openFile.invoke(systemInfo.logDir);
                        }
                      }}
                    />
                  </div>
                </Form.Item>
              </div>
              {error && (
                <Alert
                  className='mt-16px'
                  type='error'
                  content={typeof error === 'string' ? error : JSON.stringify(error)}
                />
              )}
            </Form>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              <PreferenceRow label={t('settings.devTools')}>
                <Button
                  size='small'
                  type={isDevToolsOpen ? 'primary' : 'secondary'}
                  onClick={handleToggleDevTools}
                  className='shadow-md border-2 hover:shadow-lg transition-all'
                >
                  {isDevToolsOpen ? t('settings.closeDevTools') : t('settings.openDevTools')}
                </Button>
              </PreferenceRow>
            </div>
          </div>

          {/* CDP 开发者设置 / CDP Developer Settings (only visible in dev mode) */}
          <CdpSettings />
        </div>
      </AionScrollArea>
    </div>
  );
};

export default SystemModalContent;
