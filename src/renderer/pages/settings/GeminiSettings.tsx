/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { Alert, Button, Form, Input, Switch } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingContainer from './components/SettingContainer';

const GeminiSettings: React.FC = (props) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleAccountLoading, setGoogleAccountLoading] = useState(false);
  const [userLoggedOut, setUserLoggedOut] = useState(false);

  const loadGoogleAuthStatus = (proxy?: string) => {
    setGoogleAccountLoading(true);
    ipcBridge.googleAuth.status
      .invoke({ proxy: proxy })
      .then((data) => {
        if (data.success && data.data?.account) {
          form.setFieldValue('googleAccount', data.data.account);
          setUserLoggedOut(false); // 重置logout标记
        } else if (data.success === false && (!data.msg || userLoggedOut)) {
          // 明确认证失败 OR 用户主动logout时才清空账户信息
          form.setFieldValue('googleAccount', '');
        }
        // 如果有错误信息且非用户主动logout，保持当前状态不变
      })
      .catch((error) => {
        // 网络或系统错误，保持当前状态
        console.warn('Failed to check Google auth status:', error);
      })
      .finally(() => {
        setGoogleAccountLoading(false);
      });
  };

  // 保存 Gemini 配置 / Save Gemini configuration
  const onSubmit = async () => {
    const values = await form.validate();
    const { googleAccount, ...rest } = values;
    setLoading(true);
    setError(null);

    ConfigStorage.set('gemini.config', values)
      .then(() => {
        // 配置保存成功 / Configuration saved successfully
        setError(null);
      })
      .catch((e) => {
        setError(e.message || e);
      })
      .finally(() => {
        setLoading(false);
      });
  };
  // 初始化配置 / Initialize configuration
  useEffect(() => {
    ConfigStorage.get('gemini.config')
      .then((data) => {
        form.setFieldsValue(data);
        loadGoogleAuthStatus(data?.proxy);
      })
      .catch((error) => {
        console.error('Failed to load Gemini config:', error);
      });
  }, []);

  return (
    <SettingContainer
      title={t('settings.gemini')}
      className='setting-gemini-container'
      footer={
        <div className='flex justify-center gap-10px' onClick={onSubmit}>
          <Button type='primary' loading={loading}>
            {t('common.save')}
          </Button>
        </div>
      }
      bodyContainer
    >
      <Form
        layout='horizontal'
        labelCol={{
          span: 5,
          flex: '200px',
        }}
        wrapperCol={{
          flex: '1',
        }}
        form={form}
        className={'[&_.arco-row]:flex-nowrap  max-w-800px '}
      >
        <Form.Item label={t('settings.personalAuth')} field={'googleAccount'}>
          {(props) => {
            return (
              <div>
                {props.googleAccount ? (
                  <span>
                    {props.googleAccount}
                    <Button
                      type='outline'
                      size='mini'
                      className={'ml-4px'}
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
                  </span>
                ) : (
                  <Button
                    type='primary'
                    loading={googleAccountLoading}
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
            );
          }}
        </Form.Item>
        <Form.Item label={t('settings.proxyConfig')} field='proxy' rules={[{ match: /^https?:\/\/.+$/, message: t('settings.proxyHttpOnly') }]}>
          <Input placeholder={t('settings.proxyHttpOnly')}></Input>
        </Form.Item>
        <Form.Item label='GOOGLE_CLOUD_PROJECT' field='GOOGLE_CLOUD_PROJECT'>
          <Input placeholder='Enter your Google Cloud Project ID'></Input>
        </Form.Item>
        <Form.Item label={t('settings.yoloMode')} field='yoloMode'>
          {(value, form) => <Switch checked={value.yoloMode} onChange={(checked) => form.setFieldValue('yoloMode', checked)} />}
        </Form.Item>
        {error && <Alert className={'m-b-10px'} type='error' content={typeof error === 'string' ? error : JSON.stringify(error)} />}
      </Form>
    </SettingContainer>
  );
};

export default GeminiSettings;
