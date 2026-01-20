/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import { Button, Divider, Form, Input, Message, Switch } from '@arco-design/web-react';
import React, { useEffect, useState, useImperativeHandle, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';

interface GeminiModalContentProps {
  /** 请求关闭设置弹窗 / Request closing the settings modal */
  onRequestClose?: () => void;
  /** 隐藏底部按钮（用于嵌入到其他页面时） / Hide footer buttons (for embedding in other pages) */
  hideButtons?: boolean;
  /** 标记设置是否已更改 / Callback when settings are modified */
  onDirtyChange?: (isDirty: boolean) => void;
}

/** 暴露给父组件的方法 / Methods exposed to parent component */
export interface GeminiModalContentRef {
  /** 保存设置 / Save settings */
  save: () => Promise<boolean>;
  /** 重置表单到上次保存的状态 / Reset form to last saved state */
  reset: () => void;
}

const GeminiModalContent = React.forwardRef<GeminiModalContentRef, GeminiModalContentProps>(({ onRequestClose, hideButtons = false, onDirtyChange }, ref) => {
  const { t } = useTranslation();
  const { theme: _theme } = useThemeContext();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [googleAccountLoading, setGoogleAccountLoading] = useState(false);
  const [userLoggedOut, setUserLoggedOut] = useState(false);
  const [currentAccountEmail, setCurrentAccountEmail] = useState<string | null>(null);
  const [message, messageContext] = Message.useMessage();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const [initialValues, setInitialValues] = useState<Record<string, unknown> | null>(null);

  /**
   * 加载当前账号对应的 GOOGLE_CLOUD_PROJECT
   * Load GOOGLE_CLOUD_PROJECT for current account
   */
  const loadAccountProject = async (email: string, geminiConfig: Record<string, unknown>) => {
    const accountProjects = (geminiConfig?.accountProjects as Record<string, string>) || {};
    const projectId = accountProjects[email];

    // 清理旧的全局配置（不自动迁移，因为可能属于其他账号）
    // Clean up old global config (don't auto-migrate, it might belong to another account)
    if (geminiConfig?.GOOGLE_CLOUD_PROJECT) {
      const { GOOGLE_CLOUD_PROJECT: _, ...restConfig } = geminiConfig;
      await ConfigStorage.set('gemini.config', {
        ...restConfig,
        accountProjects: Object.keys(accountProjects).length > 0 ? accountProjects : undefined,
      } as Parameters<typeof ConfigStorage.set<'gemini.config'>>[1]);
    }

    form.setFieldValue('GOOGLE_CLOUD_PROJECT', projectId || '');
  };

  const loadGoogleAuthStatus = (proxy?: string, geminiConfig?: Record<string, unknown>) => {
    setGoogleAccountLoading(true);
    ipcBridge.googleAuth.status
      .invoke({ proxy: proxy })
      .then((data) => {
        if (data.success && data.data?.account) {
          const email = data.data.account;
          form.setFieldValue('googleAccount', email);
          setCurrentAccountEmail(email);
          setUserLoggedOut(false);
          // 加载该账号的项目配置 / Load project config for this account
          if (geminiConfig) {
            void loadAccountProject(email, geminiConfig);
          }
        } else if (data.success === false && (!data.msg || userLoggedOut)) {
          form.setFieldValue('googleAccount', '');
          setCurrentAccountEmail(null);
        }
      })
      .catch((error) => {
        console.warn('Failed to check Google auth status:', error);
      })
      .finally(() => {
        setGoogleAccountLoading(false);
      });
  };

  /**
   * 保存 Gemini 设置（内部实现）
   * Save Gemini settings (internal implementation)
   * @param showMessage 是否显示消息 / Whether to show message
   * @param closeOnSuccess 是否在成功后关闭 / Whether to close on success
   */
  const saveSettings = async (showMessage = true, closeOnSuccess = true): Promise<boolean> => {
    try {
      const values = await form.validate();
      const { googleAccount: _googleAccount, customCss, GOOGLE_CLOUD_PROJECT, ...restConfig } = values;
      setLoading(true);

      // 获取现有配置 / Get existing config
      const existingConfig = ((await ConfigStorage.get('gemini.config')) || {}) as Record<string, unknown>;
      const accountProjects = (existingConfig.accountProjects as Record<string, string>) || {};

      // 如果有当前账号，将项目 ID 存储到 accountProjects
      // If logged in, store project ID to accountProjects
      if (currentAccountEmail && GOOGLE_CLOUD_PROJECT) {
        accountProjects[currentAccountEmail] = GOOGLE_CLOUD_PROJECT;
      } else if (currentAccountEmail && !GOOGLE_CLOUD_PROJECT) {
        // 清空当前账号的项目配置 / Clear project config for current account
        delete accountProjects[currentAccountEmail];
      }

      const geminiConfig = {
        ...restConfig,
        accountProjects: Object.keys(accountProjects).length > 0 ? accountProjects : undefined,
        // 不再保存顶层的 GOOGLE_CLOUD_PROJECT / No longer save top-level GOOGLE_CLOUD_PROJECT
      };

      await ConfigStorage.set('gemini.config', geminiConfig);
      await ConfigStorage.set('customCss', customCss || '');

      // 更新初始值以便 reset 正确工作 / Update initial values for reset to work correctly
      setInitialValues({ ...values });
      onDirtyChange?.(false);

      if (showMessage) {
        message.success(t('common.saveSuccess'));
      }
      if (closeOnSuccess) {
        onRequestClose?.();
      }

      window.dispatchEvent(
        new CustomEvent('custom-css-updated', {
          detail: { customCss: customCss || '' },
        })
      );
      return true;
    } catch (error: unknown) {
      if (showMessage) {
        message.error((error as Error)?.message || t('common.saveFailed'));
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async () => {
    await saveSettings(true, true);
  };

  const handleCancel = () => {
    onRequestClose?.();
  };

  /**
   * 重置表单到初始值
   * Reset form to initial values
   */
  const resetForm = useCallback(() => {
    if (initialValues) {
      form.setFieldsValue(initialValues);
      onDirtyChange?.(false);
    }
  }, [form, initialValues, onDirtyChange]);

  /**
   * 暴露方法给父组件
   * Expose methods to parent component
   */
  useImperativeHandle(ref, () => ({
    save: () => saveSettings(false, false),
    reset: resetForm,
  }), [resetForm]);

  useEffect(() => {
    Promise.all([ConfigStorage.get('gemini.config'), ConfigStorage.get('customCss')])
      .then(([geminiConfig, customCss]) => {
        const formData = {
          ...geminiConfig,
          customCss: customCss || '',
          // 先不设置 GOOGLE_CLOUD_PROJECT，等账号加载完再设置
          // Don't set GOOGLE_CLOUD_PROJECT yet, wait for account to load
          GOOGLE_CLOUD_PROJECT: '',
        };
        form.setFieldsValue(formData);
        setInitialValues(formData);
        loadGoogleAuthStatus(geminiConfig?.proxy, geminiConfig);
      })
      .catch((error) => {
        console.error('Failed to load configuration:', error);
      });
  }, []);

  return (
    <div className='flex flex-col h-full w-full'>
      {messageContext}

      {/* Content Area */}
      <AionScrollArea className='flex-1 min-h-0' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          <div className='px-[12px] py-[24px] md:px-[32px] bg-2 rd-12px md:rd-16px border border-border-2'>
            <Form form={form} layout='horizontal' labelCol={{ flex: '140px' }} labelAlign='left' wrapperCol={{ flex: '1' }}>
              <Form.Item label={t('settings.personalAuth')} field='googleAccount' layout='horizontal'>
                {(props) => (
                  <div
                    className={classNames('flex flex-wrap items-center justify-end gap-12px', {
                      'mt-12px w-full justify-start md:mt-0 md:w-auto md:justify-end': isPageMode,
                    })}
                  >
                    {props.googleAccount ? (
                      <>
                        <span className='text-14px text-t-primary'>{props.googleAccount}</span>
                        <Button
                          size='small'
                          className='rd-100px border-1 border-[#86909C]'
                          shape='round'
                          type='outline'
                          onClick={() => {
                            setUserLoggedOut(true);
                            ipcBridge.googleAuth.logout
                              .invoke({})
                              .then(() => {
                                form.setFieldValue('googleAccount', '');
                              })
                              .catch((error) => {
                                console.error('Failed to logout from Google:', error);
                              });
                          }}
                        >
                          {t('settings.googleLogout')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type='primary'
                        loading={googleAccountLoading}
                        className='rd-100px'
                        onClick={() => {
                          setGoogleAccountLoading(true);
                          ipcBridge.googleAuth.login
                            .invoke({ proxy: form.getFieldValue('proxy') })
                            .then((result) => {
                              if (result.success) {
                                loadGoogleAuthStatus(form.getFieldValue('proxy'));
                                if (result.data?.account) {
                                  message.success(t('settings.googleLoginSuccess', { defaultValue: 'Successfully logged in' }));
                                }
                              } else {
                                // 登录失败，显示错误消息
                                // Login failed, show error message
                                const errorMsg = result.msg || t('settings.googleLoginFailed', { defaultValue: 'Login failed. Please try again.' });
                                message.error(errorMsg);
                                console.error('[GoogleAuth] Login failed:', result.msg);
                              }
                            })
                            .catch((error) => {
                              message.error(t('settings.googleLoginFailed', { defaultValue: 'Login failed. Please try again.' }));
                              console.error('Failed to login to Google:', error);
                            })
                            .finally(() => {
                              setGoogleAccountLoading(false);
                            });
                        }}
                      >
                        {t('settings.googleLogin')}
                      </Button>
                    )}
                  </div>
                )}
              </Form.Item>
              <Divider className='mt-0px mb-20px' />

              <Form.Item label={t('settings.proxyConfig')} field='proxy' layout='vertical' rules={[{ match: /^https?:\/\/.+$/, message: t('settings.proxyHttpOnly') }]}>
                <Input className='aion-input' placeholder={t('settings.proxyHttpOnly')} />
              </Form.Item>
              <Divider className='mt-0px mb-20px' />

              <Form.Item label='GOOGLE_CLOUD_PROJECT' field='GOOGLE_CLOUD_PROJECT' layout='vertical'>
                <Input className='aion-input' placeholder={t('settings.googleCloudProjectPlaceholder')} />
              </Form.Item>

              <Form.Item label={t('settings.yoloMode')} field='yoloMode' layout='horizontal'>
                {(value, form) => (
                  <div
                    className={classNames('flex justify-end', {
                      'mt-12px w-full justify-start md:mt-0 md:w-auto md:justify-end': isPageMode,
                    })}
                  >
                    <Switch checked={value.yoloMode} onChange={(checked) => form.setFieldValue('yoloMode', checked)} />
                  </div>
                )}
              </Form.Item>
            </Form>
          </div>
        </div>
      </AionScrollArea>

      {/* Footer with Buttons - only show when not embedded */}
      {!hideButtons && (
        <div className={classNames('flex-shrink-0 flex gap-10px border-t border-border-2 pl-24px py-16px', isPageMode ? 'border-none pl-0 pr-0 pt-10px flex-col md:flex-row md:justify-end' : 'justify-end')}>
          <Button className={classNames('rd-100px', isPageMode && 'w-full md:w-auto')} onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button type='primary' loading={loading} onClick={onSubmit} className={classNames('rd-100px', isPageMode && 'w-full md:w-auto')}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  );
});

GeminiModalContent.displayName = 'GeminiModalContent';

export default GeminiModalContent;
