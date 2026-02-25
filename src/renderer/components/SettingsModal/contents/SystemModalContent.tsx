/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import LanguageSwitcher from '@/renderer/components/LanguageSwitcher';
import { iconColors } from '@/renderer/theme/colors';
import { Alert, Button, Form, Modal, Switch, Tooltip, Message } from '@arco-design/web-react';
import { FolderOpen, Link } from '@icon-park/react';
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

  const handleToggle = async (checked: boolean) => {
    setSwitchLoading(true);
    try {
      const result = await ipcBridge.application.updateCdpConfig.invoke({ enabled: checked });
      if (result.success) {
        Message.success(t('settings.cdp.configSaved'));
        // Refresh status
        await mutate('cdp.status');
      } else {
        Message.error(result.msg || t('settings.cdp.configFailed'));
      }
    } catch (error) {
      Message.error(t('settings.cdp.configFailed'));
    } finally {
      setSwitchLoading(false);
    }
  };

  const openCdpUrl = () => {
    if (status?.port) {
      const url = `http://127.0.0.1:${status.port}`;
      ipcBridge.shell.openExternal.invoke(url).catch(console.error);
    }
  };

  const copyCdpUrl = () => {
    if (status?.port) {
      const url = `http://127.0.0.1:${status.port}`;
      void navigator.clipboard.writeText(url).then(() => {
        Message.success(t('common.copied'));
      });
    }
  };

  if (isLoading) {
    return (
      <div className='py-12px'>
        <div className='text-14px text-t-tertiary'>{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className='space-y-12px'>
      <PreferenceRow label={t('settings.cdp.enable')} description={t('settings.cdp.enableDesc')}>
        <Switch checked={status?.startupEnabled ?? false} loading={switchLoading} onChange={handleToggle} />
      </PreferenceRow>

      {/* Show current status if port is available */}
      {status?.port && (
        <div className='flex items-center gap-8px py-8px px-12px bg-[var(--fill-1)] rounded-8px'>
          <div className='flex-1'>
            <div className='text-12px text-t-tertiary'>{t('settings.cdp.currentPort')}</div>
            <div className='text-14px text-t-primary font-medium'>http://127.0.0.1:{status.port}</div>
          </div>
          <Tooltip content={t('settings.cdp.openInBrowser')}>
            <Button type='text' size='small' icon={<Link theme='outline' size='16' />} onClick={openCdpUrl} />
          </Tooltip>
          <Tooltip content={t('common.copy')}>
            <Button type='text' size='small' icon={<span className='i-carbon:copy text-16px' />} onClick={copyCdpUrl} />
          </Tooltip>
        </div>
      )}

      {/* Show hint when CDP is disabled */}
      {status && !status.port && !status.startupEnabled && <div className='text-12px text-t-tertiary py-8px'>{t('settings.cdp.disabledHint')}</div>}

      {/* Restart hint when config changed */}
      {status?.startupEnabled !== status?.enabled && <Alert type='warning' content={t('settings.cdp.restartRequired')} className='mt-8px' />}
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
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const initializingRef = useRef(true);

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
  const preferenceItems = [{ key: 'language', label: t('settings.language'), component: <LanguageSwitcher /> }];

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
            <Form form={form} layout='vertical' className='space-y-16px' onValuesChange={handleValuesChange}>
              <DirInputItem label={t('settings.cacheDir')} field='cacheDir' />
              <DirInputItem label={t('settings.workDir')} field='workDir' />
              {error && <Alert className='mt-16px' type='error' content={typeof error === 'string' ? error : JSON.stringify(error)} />}
            </Form>
          </div>

          {/* CDP 开发者设置 / CDP Developer Settings */}
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <div className='text-14px font-medium text-t-primary mb-8px'>{t('settings.cdp.title')}</div>
            <CdpSettings />
          </div>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default SystemModalContent;
