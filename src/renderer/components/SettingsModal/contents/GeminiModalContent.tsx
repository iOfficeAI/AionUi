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
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface GeminiModalContentProps {
  /** 请求关闭设置弹窗 / Request closing the settings modal */
  onRequestClose?: () => void;
}

const GeminiModalContent: React.FC<GeminiModalContentProps> = ({ onRequestClose }) => {
  const { t } = useTranslation();
  const { theme } = useThemeContext();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [googleAccountLoading, setGoogleAccountLoading] = useState(false);
  const [userLoggedOut, setUserLoggedOut] = useState(false);
  const [message, messageContext] = Message.useMessage();

  const loadGoogleAuthStatus = (proxy?: string) => {
    setGoogleAccountLoading(true);
    ipcBridge.googleAuth.status
      .invoke({ proxy: proxy })
      .then((data) => {
        if (data.success && data.data?.account) {
          form.setFieldValue('googleAccount', data.data.account);
          setUserLoggedOut(false);
        } else if (data.success === false && (!data.msg || userLoggedOut)) {
          form.setFieldValue('googleAccount', '');
        }
      })
      .catch((error) => {
        console.warn('Failed to check Google auth status:', error);
      })
      .finally(() => {
        setGoogleAccountLoading(false);
      });
  };

  const onSubmit = async () => {
    try {
      const values = await form.validate();
      const { googleAccount, customCss, ...geminiConfig } = values;
      setLoading(true);

      await ConfigStorage.set('gemini.config', geminiConfig);
      await ConfigStorage.set('customCss', customCss || '');

      message.success(t('common.saveSuccess'));
      onRequestClose?.();

      window.dispatchEvent(
        new CustomEvent('custom-css-updated', {
          detail: { customCss: customCss || '' },
        })
      );
    } catch (error: any) {
      message.error(error.message || t('common.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onRequestClose?.();
  };

  useEffect(() => {
    Promise.all([ConfigStorage.get('gemini.config'), ConfigStorage.get('customCss')])
      .then(([geminiConfig, customCss]) => {
        const formData = {
          ...geminiConfig,
          customCss: customCss || '',
        };
        form.setFieldsValue(formData);
        loadGoogleAuthStatus(geminiConfig?.proxy);
      })
      .catch((error) => {
        console.error('Failed to load configuration:', error);
      });
  }, []);

  return (
    <div className='flex flex-col h-full w-full'>
      {messageContext}

      {/* Content Area */}
      <AionScrollArea className='flex-1 min-h-0'>
        <div className='space-y-16px'>
          <div className='px-[12px] py-[24px] md:px-[32px] bg-2 rd-12px md:rd-16px border border-border-2'>
            <Form form={form} layout='horizontal' labelCol={{ flex: '140px' }} labelAlign='left' wrapperCol={{ flex: '1' }}>
              <Form.Item label={t('settings.personalAuth')} field='googleAccount' layout='horizontal'>
                {(props) => (
                  <div className='float-right'>
                    {props.googleAccount ? (
                      <>
                        <span className='text-14px text-t-primary mr-12px'>{props.googleAccount}</span>
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
                            .then(() => {
                              loadGoogleAuthStatus(form.getFieldValue('proxy'));
                            })
                            .catch((error) => {
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
                  <div className='float-right'>
                    <Switch checked={value.yoloMode} onChange={(checked) => form.setFieldValue('yoloMode', checked)} />
                  </div>
                )}
              </Form.Item>
            </Form>
          </div>
        </div>
      </AionScrollArea>

      {/* Footer with Buttons */}
      <div className='flex-shrink-0 pl-24px py-16px border-t border-border-2 flex justify-end gap-10px'>
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

export default GeminiModalContent;
