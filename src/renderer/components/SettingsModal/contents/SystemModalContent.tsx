/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import LanguageSwitcher from '@/renderer/components/LanguageSwitcher';
import { useStartupSettings } from '@/renderer/hooks/useStartupSettings';
import type { StartupSettings } from '@/renderer/hooks/useStartupSettings';
import { iconColors } from '@/renderer/theme/colors';
import { Alert, Button, Form, Modal, Switch, Tooltip } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import classNames from 'classnames';
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
              <div className='flex-1 min-w-0 text-13px text-t-primary truncate '>{currentValue || t('settings.dirNotConfigured')}</div>
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
  /** 描述文本 / Description text */
  description?: string;
  /** 控件元素 / Control element */
  children: React.ReactNode;
  /** 额外内容 / Extra content */
  extra?: React.ReactNode;
}> = ({ label, description, children, extra }) => (
  <div className='flex flex-col py-12px'>
    <div className='flex items-center justify-between gap-24px'>
      <div className='flex flex-col'>
        <div className='text-14px text-2'>{label}</div>
        {description && <div className='text-12px text-3 mt-4px'>{description}</div>}
      </div>
      <div className='flex-1 flex justify-end'>{children}</div>
    </div>
    {extra && <div className='mt-8px'>{extra}</div>}
  </div>
);

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
interface SystemModalContentProps {
  /** 关闭设置弹窗 / Close settings modal */
  onRequestClose?: () => void;
}

const SystemModalContent: React.FC<SystemModalContentProps> = ({ onRequestClose }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [modal, modalContextHolder] = Modal.useModal();
  const [error, setError] = useState<string | null>(null);
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  // Startup settings
  const { data: startupSettings, error: startupSettingsLoadError, mutate: refreshStartupSettings, setStartupSettings } = useStartupSettings();
  const [isSavingStartup, setIsSavingStartup] = useState(false);
  const [startupNotice, setStartupNotice] = useState<{ type: 'error' | 'warning'; message: string } | null>(null);

  // Get system directory info
  const { data: systemInfo } = useSWR('system.dir.info', () => ipcBridge.application.systemInfo.invoke());

  // Initialize form data
  useEffect(() => {
    if (systemInfo) {
      form.setFieldValue('cacheDir', systemInfo.cacheDir);
      form.setFieldValue('workDir', systemInfo.workDir);
    }
  }, [systemInfo, form]);

  const handleStartupChange = async (changes: Partial<StartupSettings>) => {
    if (!startupSettings) return;
    setIsSavingStartup(true);
    setStartupNotice(null);
    try {
      const result = await setStartupSettings({
        startOnBoot: startupSettings.startOnBoot,
        openWebUiOnBoot: startupSettings.openWebUiOnBoot,
        silentOnBoot: startupSettings.silentOnBoot,
        closeToTray: startupSettings.closeToTray,
        ...changes,
      });

      if (!result?.success) {
        setStartupNotice({ type: 'error', message: result?.msg || t('common.saveFailed') });
      } else if (result?.msg) {
        setStartupNotice({ type: 'warning', message: result.msg });
      }
    } catch (caughtError: unknown) {
      setStartupNotice({ type: 'error', message: caughtError instanceof Error ? caughtError.message : String(caughtError) });
    } finally {
      setIsSavingStartup(false);
    }
  };

  // 偏好设置项配置 / Preference items configuration
  const startupSettingsLoadErrorText = startupSettingsLoadError instanceof Error ? startupSettingsLoadError.message : startupSettingsLoadError ? String(startupSettingsLoadError) : null;
  const shouldShowStartupMismatch = startupSettings?.effectiveStartOnBoot !== undefined && startupSettings.effectiveStartOnBoot !== startupSettings.startOnBoot;

  const preferenceItems = [
    { key: 'language', label: t('settings.language'), component: <LanguageSwitcher /> },
    {
      key: 'startOnBoot',
      label: t('settings.startOnBoot'),
      description: t('settings.startOnBootDesc'),
      component: (
        <Switch
          checked={startupSettings?.startOnBoot ?? false}
          disabled={isSavingStartup}
          onChange={(val) => {
            void handleStartupChange({ startOnBoot: val });
          }}
        />
      ),
      extra:
        startupSettingsLoadErrorText || startupNotice || shouldShowStartupMismatch ? (
          <div className='space-y-8px'>
            {startupSettingsLoadErrorText ? (
              <Alert
                type='error'
                showIcon
                content={
                  <div className='flex items-center justify-between gap-12px'>
                    <div className='flex-1 min-w-0 truncate'>{startupSettingsLoadErrorText}</div>
                    <Button size='mini' type='text' onClick={() => void refreshStartupSettings()}>
                      {t('common.retry')}
                    </Button>
                  </div>
                }
              />
            ) : null}
            {startupNotice ? <Alert type={startupNotice.type} content={startupNotice.message} showIcon /> : null}
            {shouldShowStartupMismatch ? <Alert type='warning' content={t('settings.startOnBootMismatch')} showIcon /> : null}
          </div>
        ) : null,
    },
    {
      key: 'silentOnBoot',
      label: t('settings.silentOnBoot'),
      description: t('settings.silentOnBootDesc'),
      component: (
        <Switch
          checked={startupSettings?.silentOnBoot ?? false}
          disabled={!startupSettings?.startOnBoot || isSavingStartup}
          onChange={(val) => {
            void handleStartupChange({ silentOnBoot: val });
          }}
        />
      ),
    },
    {
      key: 'openWebUiOnBoot',
      label: t('settings.openWebUiOnBoot'),
      description: t('settings.openWebUiOnBootDesc'),
      component: (
        <Switch
          checked={startupSettings?.openWebUiOnBoot ?? false}
          disabled={!startupSettings?.startOnBoot || isSavingStartup}
          onChange={(val) => {
            void handleStartupChange({ openWebUiOnBoot: val });
          }}
        />
      ),
    },
    {
      key: 'closeToTray',
      label: t('settings.closeToTray'),
      description: t('settings.closeToTrayDesc'),
      component: (
        <Switch
          checked={startupSettings?.closeToTray ?? false}
          disabled={isSavingStartup}
          onChange={(val) => {
            void handleStartupChange({ closeToTray: val });
          }}
        />
      ),
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

  /**
   * 保存目录配置 / Save directory configuration
   * 如果目录发生变更，会提示用户确认并重启应用
   * If directories are changed, will prompt user for confirmation and restart the app
   */
  const onSubmit = async () => {
    let shouldClose = false;
    try {
      const values = await form.validate();
      const { cacheDir, workDir } = values;
      setLoading(true);
      setError(null);

      // 检查目录是否被修改 / Check if directories are modified
      const needsRestart = cacheDir !== systemInfo?.cacheDir || workDir !== systemInfo?.workDir;

      if (needsRestart) {
        try {
          await saveDirConfigValidate(values);
          const result = await ipcBridge.application.updateSystemInfo.invoke({ cacheDir, workDir });
          if (result.success) {
            await ipcBridge.application.restart.invoke();
            shouldClose = true;
          } else {
            setError(result.msg || 'Failed to update system info');
          }
        } catch (caughtError: unknown) {
          if (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
          }
        }
      } else {
        shouldClose = true;
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setLoading(false);
      if (shouldClose) {
        onRequestClose?.();
      }
    }
  };

  // 重置表单到初始值 / Reset form to initial values
  const onReset = () => {
    if (systemInfo) {
      form.setFieldValue('cacheDir', systemInfo.cacheDir);
      form.setFieldValue('workDir', systemInfo.workDir);
    }
    setError(null);
  };

  const handleCancel = () => {
    onReset();
    onRequestClose?.();
  };

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
                <PreferenceRow key={item.key} label={item.label} description={item.description} extra={item.extra}>
                  {item.component}
                </PreferenceRow>
              ))}
            </div>
            <Form form={form} layout='vertical' className='space-y-16px'>
              <DirInputItem label={t('settings.cacheDir')} field='cacheDir' />
              <DirInputItem label={t('settings.workDir')} field='workDir' />
              {error && <Alert className='mt-16px' type='error' content={typeof error === 'string' ? error : JSON.stringify(error)} />}
            </Form>
          </div>
        </div>
      </AionScrollArea>

      {/* 底部操作栏 / Footer with action buttons */}
      <div className={classNames('flex-shrink-0 flex gap-10px border-t border-border-2 px-24px pt-10px', isPageMode ? 'border-none px-0 pt-10px flex-col md:flex-row md:justify-end' : 'justify-end')}>
        <Button className={classNames('rd-100px', isPageMode && 'w-full md:w-auto')} onClick={handleCancel}>
          {t('common.cancel')}
        </Button>
        <Button type='primary' loading={loading} onClick={onSubmit} className={classNames('rd-100px', isPageMode && 'w-full md:w-auto')}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
};

export default SystemModalContent;
