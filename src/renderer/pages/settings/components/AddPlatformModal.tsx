import { IModel } from '@/common/storage';
import { uuid } from '@/common/utils';
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

const openaiCompatibleBaseUrls = [
  {
    url: 'https://api.openai.com/v1',
    name: 'OpenAI',
  },
  {
    url: 'https://openrouter.ai/api/v1',
    name: 'OpenRouter',
  },
  {
    url: 'https://api.anthropic.com/v1',
    name: 'Anthropic',
  },
  {
    url: 'https://api.x.ai/v1',
    name: 'xAI',
  },
  {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    name: 'Dashscope',
  },
  {
    url: 'https://ark.cn-beijing.volces.com/api/v3',
    name: 'Ark',
  },
  {
    url: 'https://api.deepseek.com',
    name: 'DeepSeek',
  },
  {
    url: 'https://qianfan.baidubce.com/v2',
    name: 'Qianfan',
  },
  {
    url: 'https://api.moonshot.cn/v1',
    name: 'Moonshot',
  },
  {
    url: 'https://open.bigmodel.cn/api/paas/v4',
    name: 'Zhipu',
  },
  {
    url: 'https://api.hunyuan.cloud.tencent.com/v1',
    name: 'Hunyuan',
  },
  {
    url: 'https://api.lingyiwanwu.com/v1',
    name: 'Lingyi',
  },
  {
    url: 'https://api.poe.com/v1',
    name: 'Poe',
  },
  {
    url: 'https://api-inference.modelscope.cn/v1',
    name: 'ModelScope',
  },
  {
    url: 'https://api.siliconflow.cn/v1',
    name: 'SiliconFlow',
  },
  {
    url: 'https://cloud.infini-ai.com/maas/v1',
    name: 'InfiniAI',
  },
  {
    url: 'https://wishub-x1.ctyun.cn/v1',
    name: 'Ctyun',
  },
  {
    url: 'https://api.stepfun.com/v1',
    name: 'StepFun',
  },
];

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

  const modelListState = useModeModeList(platform, baseUrl, apiKey, true);

  useEffect(() => {
    if (platform?.includes('gemini')) {
      modelListState.mutate();
    }
  }, [platform]);

  // 处理自动修复的 base_url
  useEffect(() => {
    if (modelListState.data?.fix_base_url) {
      form.setFieldValue('baseUrl', modelListState.data.fix_base_url);
      message.info(t('settings.baseUrlAutoFix', { base_url: modelListState.data.fix_base_url }));
    }
  }, [modelListState.data?.fix_base_url, form]);

  const handleSubmit = () => {
    form
      .validate()
      .then((values) => {
        onSubmit({
          id: uuid(),
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
              form.setFieldValue('model', '');
              form.setFieldValue('name', value !== 'custom' ? value : '');
            }}
          ></Select>
        </Form.Item>
        <Form.Item hidden={platform !== 'custom' && platform !== 'gemini'} label='base url' required={platform !== 'gemini'} rules={[{ required: platform !== 'gemini' }]} field={'baseUrl'}>
          {platform === 'custom' ? (
            <Select
              showSearch
              allowCreate
              options={openaiCompatibleBaseUrls.map(item => ({
                label: item.url,
                value: item.url,
              }))}
              onChange={(value) => {
                const selectedItem = openaiCompatibleBaseUrls.find(i => i.url === value);
                if (selectedItem) {
                  form.setFieldValue('name', selectedItem.name);
                } else {
                  try {
                    const { hostname } = new URL(value);
                    const parts = hostname.split('.');
                    form.setFieldValue('name', parts.length >= 2 ? parts[parts.length - 2] : parts[0]);
                  } catch (e) {
                    console.error('Invalid URL:', e);
                  }
                }
              }}
            ></Select>
          ) : (
            <Input
              placeholder={platform === 'gemini' ? 'https://generativelanguage.googleapis.com' : ''}
              onChange={(value) => {
                if (platform === 'gemini') {
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
          )}
        </Form.Item>
        <Form.Item hidden={platform !== 'custom'} label={t('settings.platformName')} required rules={[{ required: true }]} field={'name'} initialValue={'gemini'}>
          <Input></Input>
        </Form.Item>
        <Form.Item label='API Key' required rules={[{ required: true }]} field={'apiKey'}>
          <Input
            onBlur={() => {
              modelListState.mutate();
            }}
          ></Input>
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
            options={modelListState.data?.models || []}
          ></Select>
        </Form.Item>
      </Form>
    </Modal>
  );
});

export default AddPlatformModal;
