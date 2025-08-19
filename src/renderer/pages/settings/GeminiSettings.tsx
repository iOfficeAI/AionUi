/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { Alert, Button, Form, Input, Modal } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import SettingContainer from './components/SettingContainer';

const DirInputItem: React.FC<{
  label: string;
  field: string;
  rules?: any[];
}> = (props) => {
  const { t } = useTranslation();
  return (
    <Form.Item label={props.label} field={props.field}>
      {(options, form) => (
        <Input
          disabled
          value={options[props.field]}
          addAfter={
            <FolderOpen
              theme='outline'
              size='24'
              fill='#333'
              onClick={() => {
                ipcBridge.dialog.showOpen
                  .invoke({
                    defaultPath: options[props.field],
                    properties: ['openDirectory', 'createDirectory'],
                  })
                  .then((data) => {
                    if (data?.[0]) {
                      form.setFieldValue(props.field, data[0]);
                    }
                  });
              }}
            />
          }
        ></Input>
      )}
    </Form.Item>
  );
};

const GeminiSettings: React.FC = (props) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [modal, modalContextHolder] = Modal.useModal();
  const [error, setError] = useState<string | null>(null);
  const [googleAccountLoading, setGoogleAccountLoading] = useState(false);
  const { data } = useSWR('gemini.env.config', () => ipcBridge.application.systemInfo.invoke());
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

  const saveDirConfigValidate = async (values: { cacheDir: string; workDir: string }) => {
    return new Promise((resolve, reject) => {
      modal.confirm({
        title: t('settings.updateConfirm'),
        content: t('settings.restartConfirm'),
        onOk: resolve,
        onCancel: reject,
      });
    });
  };

  const onSubmit = async () => {
    const values = await form.validate();
    const { cacheDir, workDir, googleAccount, ...rest } = values;
    setLoading(true);
    setError(null);
    await saveDirConfigValidate(values);
    ConfigStorage.set('gemini.config', values)
      .then(() => {
        return ipcBridge.application.updateSystemInfo.invoke({ cacheDir, workDir }).then((data) => {
          if (data.success) return ipcBridge.application.restart.invoke();
          return Promise.reject(data.msg);
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
  }, []);
  useEffect(() => {
    if (data) {
      form.setFieldValue('cacheDir', data.cacheDir);
      form.setFieldValue('workDir', data.workDir);
    }
  }, [data]);

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
        <DirInputItem label={t('settings.cacheDir')} field='cacheDir' />
        <DirInputItem label={t('settings.workDir')} field='workDir' />
        {error && <Alert className={'m-b-10px'} type='error' content={typeof error === 'string' ? error : JSON.stringify(error)} />}
      </Form>
      {modalContextHolder}
    </SettingContainer>
  );
};

export default GeminiSettings;
