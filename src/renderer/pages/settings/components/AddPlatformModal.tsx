import { IModel } from '@/common/storage';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input, Message, Modal, Select } from '@arco-design/web-react';
import { Search } from '@icon-park/react';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useModeModeList from '../../../hooks/useModeModeList';

const useModePlatformList = () => {
  const { t } = useTranslation();
  return useMemo(() => {
    return [
      {
        label: 'Gemini',
        value: 'gemini',
      },
      {
        label: 'Gemini(Vertex AI)',
        value: 'gemini-vertex-ai',
      },
      {
        label: 'ModelScope',
        value: 'ModelScope',
      },
      {
        label: 'OpenRouter',
        value: 'OpenRouter',
      },
      {
        label: t('settings.customOpenAI'),
        value: 'custom',
      },
    ];
  }, []);
};

const defaultBaseUrl = {
  qwen: 'https://api.qwen.com/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  OpenRouter: 'https://openrouter.ai/api/v1',
  ModelScope: 'https://api-inference.modelscope.cn/v1',
};

const AddPlatformModal = ModalHOC<{
  onSubmit: (platform: IModel) => void;
}>(({ modalProps, onSubmit }) => {
  const [message, messageContext] = Message.useMessage();
  const modelPlatformOptions = useModePlatformList();
  const { t } = useTranslation();
  const [form] = Form.useForm();

  const platform = Form.useWatch('platform', form);
  const baseUrl = Form.useWatch('baseUrl', form);
  const apiKey = Form.useWatch('apiKey', form);

  const modelListState = useModeModeList(platform, baseUrl, apiKey);
  useEffect(() => {
    if (platform?.includes('gemini')) {
      modelListState.mutate();
    }
  }, [platform]);

  const handleSubmit = () => {
    form
      .validate()
      .then((values) => {
        onSubmit({
          platform: values.platform,
          name: values.name,
          baseUrl: values.baseUrl,
          apiKey: values.apiKey,
          model: [values.model],
        });
      })
      .catch((e) => {
        console.log('>>>>>>>>>>>>>>>>>>e', e);
      });
  };

  return (
    <Modal {...modalProps} title={t('settings.addModel')} onOk={handleSubmit} style={{ width: 750 }}>
      {messageContext}
      <Form
        form={form}
        labelCol={{
          span: 5,
          flex: '200px',
        }}
        wrapperCol={{
          flex: '1',
        }}
      >
        <Form.Item initialValue='gemini' label={t('settings.modelPlatform')} field={'platform'}>
          <Select
            showSearch
            options={modelPlatformOptions}
            onChange={(value) => {
              form.setFieldValue('baseUrl', defaultBaseUrl[value as keyof typeof defaultBaseUrl] || '');
              form.setFieldValue('name', value !== 'custom' ? value : '');
            }}
          ></Select>
        </Form.Item>
        <Form.Item hidden={platform !== 'custom' && platform !== 'gemini'} label='base url' required={platform !== 'gemini'} rules={[{ required: platform !== 'gemini' }]} field={'baseUrl'}>
          <Input
            placeholder={platform === 'gemini' ? 'https://generativelanguage.googleapis.com' : ''}
            onChange={(value) => {
              if (platform === 'custom') {
                try {
                  const urlObj = new URL(value);
                  const hostname = urlObj.hostname;
                  const parts = hostname.split('.');
                  if (parts.length >= 2) {
                    form.setFieldValue('name', parts[parts.length - 2]);
                  } else {
                    form.setFieldValue('name', parts[0]);
                  }
                } catch (e) {
                  console.error('Invalid URL:', e);
                }
              }
            }}
          ></Input>
        </Form.Item>
        <Form.Item hidden={platform !== 'custom'} label={t('settings.platformName')} required rules={[{ required: true }]} field={'name'}>
          <Input></Input>
        </Form.Item>
        <Form.Item label='API Key' required rules={[{ required: true }]} field={'apiKey'}>
          <Input></Input>
        </Form.Item>
        <Form.Item label={t('settings.modelName')} field={'model'} required rules={[{ required: true }]} validateStatus={modelListState.error ? 'error' : 'success'} help={modelListState.error}>
          <Select
            loading={modelListState.isLoading}
            showSearch
            suffixIcon={
              <Search
                onClick={(e) => {
                  e.stopPropagation();
                  if (!platform?.includes('gemini') && (!baseUrl || !apiKey)) {
                    message.warning(t('settings.pleaseEnterBaseUrlAndApiKey'));
                    return;
                  }
                  modelListState.mutate();
                }}
                className='flex'
              />
            }
            options={modelListState.data}
          ></Select>
        </Form.Item>
      </Form>
    </Modal>
  );
});

export default AddPlatformModal;
