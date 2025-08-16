/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { Alert, Button, Form, Input } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingContainer from './components/SettingContainer';

const GeminiSettings: React.FC = (props) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleAccountLoading, setGoogleAccountLoading] = useState(false);
  const loadGoogleAuthStatus = (proxy?: string) => {
    setGoogleAccountLoading(true);
    ipcBridge.googleAuth.status
      .invoke({ proxy: proxy })
      .then((data) => {
        if (data.success && data.data?.account) {
          form.setFieldValue('googleAccount', data.data.account);
        }
      })
      .finally(() => {
        setGoogleAccountLoading(false);
      });
  };
  const onSubmit = async () => {
    const values = await form.validate();
    delete values.tempDir;
    delete values.googleAccount;
    setLoading(true);
    setError(null);
    ConfigStorage.set('gemini.config', values)
      .then(() => {
        ipcBridge.conversation.reset.invoke({}).finally(() => {
          window.location.reload();
        });
      })
      .catch((e) => {
        setError(e.message || e);
      })
      .finally(() => {
        setLoading(false);
      });
  };
  useEffect(() => {
    ConfigStorage.get('gemini.config').then((data) => {
      form.setFieldsValue(data);
      loadGoogleAuthStatus(data?.proxy);
    });
    ipcBridge.application.systemInfo.invoke().then((data) => {
      form.setFieldValue('tempDir', data.tempDir);
    });
  }, []);

  return (
    <SettingContainer
      title={t('settings.gemini')}
      footer={
        <div className='flex justify-center gap-10px' onClick={onSubmit}>
          <Button type='primary' loading={loading}>
            {t('common.save')}
          </Button>
        </div>
      }
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
        className={'[&_.arco-row]:flex-nowrap  max-w-800px'}
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
                        ipcBridge.googleAuth.logout.invoke({}).then(() => {
                          form.setFieldValue('googleAccount', '');
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
        <Form.Item label={t('settings.tempDir')} field='tempDir'>
          {(props) => (
            <Input
              disabled
              value={props.tempDir}
              addAfter={
                <FolderOpen
                  theme='outline'
                  size='24'
                  fill='#333'
                  onClick={() => {
                    ipcBridge.shell.showItemInFolder.invoke(props.tempDir);
                  }}
                />
              }
            ></Input>
          )}
        </Form.Item>
        {error && <Alert className={'m-b-10px'} type='error' content={typeof error === 'string' ? error : JSON.stringify(error)} />}
      </Form>
    </SettingContainer>
  );
};

export default GeminiSettings;
