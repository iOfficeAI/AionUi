/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import FontSizeControl from '@/renderer/components/FontSizeControl';
import LanguageSwitcher from '@/renderer/components/LanguageSwitcher';
import ThemeSwitcher from '@/renderer/components/ThemeSwitcher';
import { iconColors } from '@/renderer/theme/colors';
import { Alert, Button, Divider, Form, Modal, Input } from '@arco-design/web-react';
import { FolderOpen, Down, Up } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import CodeMirror from '@uiw/react-codemirror';
import { css as cssLang } from '@codemirror/lang-css';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import AionCollapse from '@/renderer/components/base/AionCollapse';

// Directory selection input component
const DirInputItem: React.FC<{
  label: string;
  field: string;
}> = ({ label, field }) => {
  const { t } = useTranslation();
  return (
    <Form.Item layout='horizontal' label={label} field={field}>
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
          <Input
            readOnly
            value={currentValue}
            placeholder={t('settings.dirNotConfigured')}
            className='w-full [&_.arco-input]:shadow-none [&_.arco-input]:bg-white dark:[&_.arco-input]:bg-[var(--color-bg-3)]'
            suffix={
              <FolderOpen
                theme='outline'
                size='18'
                fill={iconColors.primary}
                className='cursor-pointer'
                onClick={(e) => {
                  e.stopPropagation();
                  handlePick();
                }}
              />
            }
          />
        );
      }}
    </Form.Item>
  );
};

const PreferenceRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='text-14px text-2 w-160px'>{label}</div>
    <div className='flex-1 flex justify-end'>{children}</div>
  </div>
);

const SystemModalContent: React.FC = () => {
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

  const renderExpandIcon = (active: boolean) => (active ? <Up theme='outline' size='16' fill={iconColors.secondary} /> : <Down theme='outline' size='16' fill={iconColors.secondary} />);

  // Directory configuration save confirmation
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

  // Save directory configuration
  const onSubmit = async () => {
    try {
      const values = await form.validate();
      const { cacheDir, workDir } = values;
      setLoading(true);
      setError(null);

      // Check if directories are modified
      const needsRestart = cacheDir !== systemInfo?.cacheDir || workDir !== systemInfo?.workDir;

      if (needsRestart) {
        try {
          await saveDirConfigValidate(values);
          const result = await ipcBridge.application.updateSystemInfo.invoke({ cacheDir, workDir });
          if (result.success) {
            await ipcBridge.application.restart.invoke();
          } else {
            setError(result.msg || 'Failed to update system info');
          }
        } catch (caughtError: unknown) {
          if (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
          }
        }
      }
    } catch (error: any) {
      setError(error.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='flex flex-col h-full w-full'>
      {modalContextHolder}

      {/* Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px'>
        <div className='space-y-16px'>
          {/* Language & Theme Block - Horizontal Layout */}
          <div className='h-80px flex justify-between items-center px-32px bg-2 rd-16px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              <PreferenceRow label={t('settings.language')}>
                <LanguageSwitcher />
              </PreferenceRow>
            </div>
          </div>

          <div className='h-80px flex justify-between items-center px-32px bg-2 rd-16px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              <PreferenceRow label={t('settings.theme')}>
                <ThemeSwitcher />
              </PreferenceRow>
            </div>
          </div>

          <div className='h-80px flex justify-between items-center px-32px bg-2 rd-16px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              <PreferenceRow label={t('settings.fontSize')}>
                <FontSizeControl />
              </PreferenceRow>
            </div>
          </div>

          {/* Advanced Settings - Collapsible */}
          <AionCollapse bordered={false} defaultActiveKey={['advanced']} expandIcon={renderExpandIcon as any} expandIconPosition='right'>
            <AionCollapse.Item name='advanced' header={<span className='text-14px text-2'>{t('settings.advancedSettings')}</span>} className='bg-transparent' contentStyle={{ padding: '12px 0 0' }}>
              <Form form={form} layout='vertical' className='space-y-16px'>
                <DirInputItem label={t('settings.cacheDir')} field='cacheDir' />
                <DirInputItem label={t('settings.workDir')} field='workDir' />

                {error && <Alert className='mt-16px' type='error' content={typeof error === 'string' ? error : JSON.stringify(error)} />}
              </Form>
            </AionCollapse.Item>
          </AionCollapse>

          {/* CSS Settings - Collapsible */}
          <AionCollapse bordered={false} defaultActiveKey={['css']} expandIcon={renderExpandIcon as any} expandIconPosition='right'>
            <AionCollapse.Item name='css' header={<span className='text-14px text-2'>{t('settings.customCss')}</span>} className='bg-transparent' contentStyle={{ padding: '12px 0 0' }}>
              <CodeMirror
                value={customCss}
                theme={theme}
                extensions={[cssLang()]}
                onChange={handleCustomCssChange}
                placeholder={`/* ${t('settings.customCssDesc') || '在这里输入自定义 CSS 样式'} */\n/* 例如: */\n.chat-message {\n  font-size: 16px;\n}`}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  dropCursor: false,
                  allowMultipleSelections: false,
                }}
                style={{
                  fontSize: '13px',
                  border: '1px solid var(--color-border-2)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
                className='[&_.cm-editor]:rounded-[6px]'
              />
            </AionCollapse.Item>
          </AionCollapse>
        </div>
      </AionScrollArea>

      {/* Footer with Save Button */}
      <div className='flex-shrink-0 px-24px py-16px border-t border-border-2 flex justify-end gap-10px'>
        <Button className='rd-100px'>{t('common.cancel') || '取消'}</Button>
        <Button type='primary' loading={loading} onClick={onSubmit} className='rd-100px'>
          {t('common.save') || '确定'}
        </Button>
      </div>
    </div>
  );
};

export default SystemModalContent;
