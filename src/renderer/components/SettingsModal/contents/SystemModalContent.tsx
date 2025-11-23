/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import FontSizeControl from '@/renderer/components/FontSizeControl';
import LanguageSwitcher from '@/renderer/components/LanguageSwitcher';
import { ThemeSwitcher } from '@/renderer/components/ThemeSwitcher';
import { iconColors } from '@/renderer/theme/colors';
import { Alert, Button, Divider, Form, Modal, Input, Tooltip } from '@arco-design/web-react';
import { FolderOpen, Down, Up } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CSSProperties } from 'react';
import useSWR from 'swr';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import CodeMirror from '@uiw/react-codemirror';
import { css as cssLang } from '@codemirror/lang-css';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import AionCollapse from '@/renderer/components/base/AionCollapse';

// ==================== 样式常量 / Style Constants ====================

/** CodeMirror 编辑器样式 / CodeMirror editor styles */
const CODE_MIRROR_STYLE: CSSProperties = {
  fontSize: '13px',
  border: '1px solid var(--color-border-2)',
  borderRadius: '6px',
  overflow: 'hidden',
} as const;

/** CodeMirror 基础配置 / CodeMirror basic setup */
const CODE_MIRROR_BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  dropCursor: false,
  allowMultipleSelections: false,
} as const;

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
          <div className='aion-dir-input h-[32px] flex items-center rounded-8px border border-solid border-transparent pl-14px'>
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
}> = ({ label, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='text-14px text-2'>{label}</div>
    <div className='flex-1 flex justify-end'>{children}</div>
  </div>
);

/**
 * 系统设置内容组件 / System settings content component
 *
 * 提供系统级配置选项，包括语言、主题、字体大小、目录配置和自定义CSS
 * Provides system-level configuration options including language, theme, font size, directory config and custom CSS
 *
 * @features
 * - 偏好设置：语言、主题、字体大小 / Preferences: language, theme, font size
 * - 高级设置：缓存目录、工作目录配置 / Advanced: cache directory, work directory configuration
 * - 自定义CSS编辑器，支持实时预览 / Custom CSS editor with live preview
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
  const { theme } = useThemeContext();
  const [customCss, setCustomCss] = useState('');

  // Get system directory info
  const { data: systemInfo } = useSWR('system.dir.info', () => ipcBridge.application.systemInfo.invoke());

  // Initialize form data
  useEffect(() => {
    if (systemInfo) {
      form.setFieldValue('cacheDir', systemInfo.cacheDir);
      form.setFieldValue('workDir', systemInfo.workDir);
    }
  }, [systemInfo, form]);

  // Load custom CSS
  useEffect(() => {
    void ConfigStorage.get('customCss')
      .then((storedCss) => {
        setCustomCss(storedCss || '');
      })
      .catch((err) => {
        console.error('Failed to load custom CSS:', err);
      });
  }, []);

  /**
   * 处理自定义 CSS 变更 / Handle custom CSS change
   * 保存到存储并触发自定义事件通知其他组件更新
   * Saves to storage and dispatches custom event to notify other components
   * @param cssValue - CSS 样式内容 / CSS style content
   */
  const handleCustomCssChange = (cssValue: string) => {
    setCustomCss(cssValue);
    void ConfigStorage.set('customCss', cssValue || '').catch((err) => {
      console.error('Failed to save custom CSS:', err);
    });
    window.dispatchEvent(
      new CustomEvent('custom-css-updated', {
        detail: { customCss: cssValue || '' },
      })
    );
  };

  // 渲染折叠面板的展开/收起图标 / Render expand/collapse icon for collapse panel
  const renderExpandIcon = (active: boolean) => (active ? <Up theme='outline' size='16' fill={iconColors.secondary} /> : <Down theme='outline' size='16' fill={iconColors.secondary} />);

  // 偏好设置项配置 / Preference items configuration
  const preferenceItems = [
    { key: 'language', label: t('settings.language'), component: <LanguageSwitcher /> },
    { key: 'theme', label: t('settings.theme'), component: <ThemeSwitcher /> },
    { key: 'fontSize', label: t('settings.fontSize'), component: <FontSizeControl /> },
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
      <AionScrollArea className='flex-1 min-h-0 pb-16px scrollbar-hide'>
        <div className='space-y-16px'>
          {/* 偏好设置项（语言、主题、字体大小）/ Preference items (Language, Theme, Font Size) */}
          {preferenceItems.map((item) => (
            <div key={item.key} className='h-80px flex justify-between items-center px-[12px] md:px-[32px] bg-2 rd-16px'>
              <div className='w-full flex flex-col divide-y divide-border-2'>
                <PreferenceRow label={item.label}>{item.component}</PreferenceRow>
              </div>
            </div>
          ))}

          {/* 高级设置 / Advanced Settings - Collapsible */}
          <AionCollapse bordered={false} defaultActiveKey={['advanced']} expandIcon={renderExpandIcon} expandIconPosition='right'>
            <AionCollapse.Item name='advanced' header={<span className='text-14px text-2'>{t('settings.advancedSettings')}</span>} className='bg-transparent' contentStyle={{ padding: '12px 0 0' }}>
              <Form form={form} layout='vertical' className='space-y-16px'>
                <DirInputItem label={t('settings.cacheDir')} field='cacheDir' />
                <DirInputItem label={t('settings.workDir')} field='workDir' />

                {error && <Alert className='mt-16px' type='error' content={typeof error === 'string' ? error : JSON.stringify(error)} />}
              </Form>
            </AionCollapse.Item>
          </AionCollapse>

          {/* 自定义CSS设置 / Custom CSS Settings - Collapsible */}
          <AionCollapse bordered={false} defaultActiveKey={['css']} expandIcon={renderExpandIcon} expandIconPosition='right'>
            <AionCollapse.Item name='css' header={<span className='text-14px text-2'>{t('settings.customCss')}</span>} className='bg-transparent' contentStyle={{ padding: '12px 0 0' }}>
              <CodeMirror value={customCss} theme={theme} extensions={[cssLang()]} onChange={handleCustomCssChange} placeholder={`/* ${t('settings.customCssDesc') || '在这里输入自定义 CSS 样式'} */\n/* 例如: */\n.chat-message {\n  font-size: 16px;\n}`} basicSetup={CODE_MIRROR_BASIC_SETUP} style={CODE_MIRROR_STYLE} className='[&_.cm-editor]:rounded-[6px]' />
            </AionCollapse.Item>
          </AionCollapse>
        </div>
      </AionScrollArea>

      {/* 底部操作栏 / Footer with action buttons */}
      <div className='flex-shrink-0 px-24px pt-10px border-t border-border-2 flex justify-end gap-10px'>
        <Button className='rd-100px' onClick={handleCancel}>
          {t('common.cancel')}
        </Button>
        <Button type='primary' loading={loading} onClick={onSubmit} className='rd-100px'>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
};

export default SystemModalContent;
