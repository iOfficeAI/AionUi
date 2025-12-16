import type { IProvider } from '@/common/storage';
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input, Message, Select } from '@arco-design/web-react';
import { Search, LinkCloud, Edit } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useModeModeList from '../../../hooks/useModeModeList';
import AionModal from '@/renderer/components/base/AionModal';
import ApiKeyEditorModal from './ApiKeyEditorModal';

// Provider Logo imports
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import OpenAILogo from '@/renderer/assets/logos/openai.svg';
import AnthropicLogo from '@/renderer/assets/logos/anthropic.svg';
import DeepSeekLogo from '@/renderer/assets/logos/deepseek.svg';
import OpenRouterLogo from '@/renderer/assets/logos/openrouter.svg';
import SiliconFlowLogo from '@/renderer/assets/logos/siliconflow.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';
import ZhipuLogo from '@/renderer/assets/logos/zhipu.svg';
import XaiLogo from '@/renderer/assets/logos/xai.svg';
import VolcengineLogo from '@/renderer/assets/logos/volcengine.svg';
import BaiduLogo from '@/renderer/assets/logos/baidu.svg';
import TencentLogo from '@/renderer/assets/logos/tencent.svg';
import LingyiLogo from '@/renderer/assets/logos/lingyiwanwu.svg';
import PoeLogo from '@/renderer/assets/logos/poe.svg';
import ModelScopeLogo from '@/renderer/assets/logos/modelscope.svg';
import InfiniAILogo from '@/renderer/assets/logos/infiniai.svg';
import CtyunLogo from '@/renderer/assets/logos/ctyun.svg';
import StepFunLogo from '@/renderer/assets/logos/stepfun.svg';

/**
 * 模型平台配置（第一层下拉）
 * Model Platform Configuration (first dropdown)
 */
interface PlatformConfig {
  /** 平台名称 / Platform name */
  name: string;
  /** 平台值 / Platform value */
  value: string;
  /** Logo */
  logo: string | null;
  /** 平台标识 / Platform identifier */
  platform: 'gemini' | 'gemini-vertex-ai' | 'custom';
  /** Base URL（非 More 选项使用）/ Base URL (for non-More options) */
  baseUrl?: string;
}

/**
 * 模型平台选项（第一层下拉）
 * Model Platform options (first dropdown)
 * 顺序：Gemini, Gemini Vertex AI, 自定义（第三个），其他供应商（第四个之后）
 */
const MODEL_PLATFORMS: PlatformConfig[] = [
  { name: 'Gemini', value: 'gemini', logo: GeminiLogo, platform: 'gemini' },
  { name: 'Gemini (Vertex AI)', value: 'gemini-vertex-ai', logo: GeminiLogo, platform: 'gemini-vertex-ai' },
  // 第三个：自定义（需要用户输入 base url）
  { name: 'Custom', value: 'custom', logo: null, platform: 'custom' },
  // 第四个之后：预设供应商
  { name: 'OpenAI', value: 'OpenAI', logo: OpenAILogo, platform: 'custom', baseUrl: 'https://api.openai.com/v1' },
  { name: 'Anthropic', value: 'Anthropic', logo: AnthropicLogo, platform: 'custom', baseUrl: 'https://api.anthropic.com/v1' },
  { name: 'DeepSeek', value: 'DeepSeek', logo: DeepSeekLogo, platform: 'custom', baseUrl: 'https://api.deepseek.com' },
  { name: 'OpenRouter', value: 'OpenRouter', logo: OpenRouterLogo, platform: 'custom', baseUrl: 'https://openrouter.ai/api/v1' },
  { name: 'Dashscope', value: 'Dashscope', logo: QwenLogo, platform: 'custom', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { name: 'SiliconFlow', value: 'SiliconFlow', logo: SiliconFlowLogo, platform: 'custom', baseUrl: 'https://api.siliconflow.cn/v1' },
  { name: 'Zhipu', value: 'Zhipu', logo: ZhipuLogo, platform: 'custom', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { name: 'Moonshot', value: 'Moonshot', logo: KimiLogo, platform: 'custom', baseUrl: 'https://api.moonshot.cn/v1' },
  { name: 'xAI', value: 'xAI', logo: XaiLogo, platform: 'custom', baseUrl: 'https://api.x.ai/v1' },
  { name: 'Ark', value: 'Ark', logo: VolcengineLogo, platform: 'custom', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { name: 'Qianfan', value: 'Qianfan', logo: BaiduLogo, platform: 'custom', baseUrl: 'https://qianfan.baidubce.com/v2' },
  { name: 'Hunyuan', value: 'Hunyuan', logo: TencentLogo, platform: 'custom', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1' },
  { name: 'Lingyi', value: 'Lingyi', logo: LingyiLogo, platform: 'custom', baseUrl: 'https://api.lingyiwanwu.com/v1' },
  { name: 'Poe', value: 'Poe', logo: PoeLogo, platform: 'custom', baseUrl: 'https://api.poe.com/v1' },
  { name: 'ModelScope', value: 'ModelScope', logo: ModelScopeLogo, platform: 'custom', baseUrl: 'https://api-inference.modelscope.cn/v1' },
  { name: 'InfiniAI', value: 'InfiniAI', logo: InfiniAILogo, platform: 'custom', baseUrl: 'https://cloud.infini-ai.com/maas/v1' },
  { name: 'Ctyun', value: 'Ctyun', logo: CtyunLogo, platform: 'custom', baseUrl: 'https://wishub-x1.ctyun.cn/v1' },
  { name: 'StepFun', value: 'StepFun', logo: StepFunLogo, platform: 'custom', baseUrl: 'https://api.stepfun.com/v1' },
];

/**
 * 供应商 Logo 组件
 * Provider Logo Component
 */
const ProviderLogo: React.FC<{ logo: string | null; name: string; size?: number }> = ({ logo, name, size = 20 }) => {
  if (logo) {
    return <img src={logo} alt={name} className='object-contain shrink-0' style={{ width: size, height: size }} />;
  }
  return <LinkCloud theme='outline' size={size} className='text-t-secondary flex shrink-0' />;
};

/**
 * 平台下拉选项渲染（第一层）
 * Platform dropdown option renderer (first level)
 */
const renderPlatformOption = (platform: PlatformConfig) => (
  <div className='flex items-center gap-8px'>
    <ProviderLogo logo={platform.logo} name={platform.name} size={18} />
    <span>{platform.name}</span>
  </div>
);

const AddPlatformModal = ModalHOC<{
  onSubmit: (platform: IProvider) => void;
}>(({ modalProps, onSubmit, modalCtrl }) => {
  const [message, messageContext] = Message.useMessage();
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [apiKeyEditorVisible, setApiKeyEditorVisible] = useState(false);

  const platformValue = Form.useWatch('platform', form);
  const baseUrl = Form.useWatch('baseUrl', form);
  const apiKey = Form.useWatch('apiKey', form);

  // 获取当前选中的平台配置 / Get current selected platform config
  const selectedPlatform = useMemo(() => {
    return MODEL_PLATFORMS.find((p) => p.value === platformValue);
  }, [platformValue]);

  const platform = selectedPlatform?.platform ?? 'gemini';
  // 判断是否为"自定义"选项（没有预设 baseUrl） / Check if "Custom" option (no preset baseUrl)
  const isCustom = platformValue === 'custom' && !selectedPlatform?.baseUrl;
  const isGemini = platform === 'gemini' || platform === 'gemini-vertex-ai';

  const modelListState = useModeModeList(platform, baseUrl, apiKey, true);

  useEffect(() => {
    if (platform?.includes('gemini')) {
      void modelListState.mutate();
    }
  }, [platform]);

  // 处理自动修复的 base_url / Handle auto-fixed base_url
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
        // 自定义选项使用 "Custom"，其他使用 platform 的 name
        const name = isCustom ? 'Custom' : (selectedPlatform?.name ?? values.platform);
        onSubmit({
          id: uuid(),
          platform: selectedPlatform?.platform ?? 'custom',
          name,
          baseUrl: values.baseUrl || '',
          apiKey: values.apiKey,
          model: [values.model],
        });
        modalCtrl.close();
      })
      .catch(() => {
        // validation failed
      });
  };

  return (
    <AionModal visible={modalProps.visible} onCancel={modalCtrl.close} header={{ title: t('settings.addModel'), showClose: true }} style={{ maxWidth: '92vw', borderRadius: 16 }} contentStyle={{ background: 'var(--bg-1)', borderRadius: 16, padding: '20px 24px 16px', overflow: 'auto' }} onOk={handleSubmit} confirmLoading={modalProps.confirmLoading} okText={t('common.confirm')} cancelText={t('common.cancel')}>
      {messageContext}
      <div className='flex flex-col gap-16px py-20px'>
        <Form form={form} layout='vertical' className='space-y-0'>
          {/* 模型平台选择（第一层）/ Model Platform Selection (first level) */}
          <Form.Item initialValue='gemini' label={t('settings.modelPlatform')} field={'platform'} required rules={[{ required: true }]}>
            <Select
              showSearch
              filterOption={(inputValue, option) => {
                const optionValue = (option as React.ReactElement<{ value?: string }>)?.props?.value;
                const plat = MODEL_PLATFORMS.find((p) => p.value === optionValue);
                return plat?.name.toLowerCase().includes(inputValue.toLowerCase()) ?? false;
              }}
              onChange={(value) => {
                const plat = MODEL_PLATFORMS.find((p) => p.value === value);
                if (plat) {
                  form.setFieldValue('baseUrl', plat.baseUrl || '');
                  form.setFieldValue('model', '');
                }
              }}
              renderFormat={(option) => {
                const optionValue = (option as { value?: string })?.value;
                const plat = MODEL_PLATFORMS.find((p) => p.value === optionValue);
                if (!plat) return optionValue;
                return renderPlatformOption(plat);
              }}
            >
              {MODEL_PLATFORMS.map((plat) => (
                <Select.Option key={plat.value} value={plat.value}>
                  {renderPlatformOption(plat)}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {/* Base URL - 仅自定义选项显示 / Base URL - only for Custom option */}
          <Form.Item hidden={!isCustom} label={t('settings.baseUrl')} field={'baseUrl'} required={isCustom} rules={[{ required: isCustom }]}>
            <Input
              placeholder='https://api.example.com/v1'
              onBlur={() => {
                void modelListState.mutate();
              }}
            />
          </Form.Item>

          {/* API Key */}
          <Form.Item label={t('settings.apiKey')} required rules={[{ required: true }]} field={'apiKey'} extra={<div className='text-11px text-t-secondary mt-2 leading-4'>{t('settings.multiApiKeyTip')}</div>}>
            <Input
              onBlur={() => {
                void modelListState.mutate();
              }}
              suffix={<Edit theme='outline' size={16} className='cursor-pointer text-t-secondary hover:text-t-primary flex' onClick={() => setApiKeyEditorVisible(true)} />}
            />
          </Form.Item>

          {/* 模型选择 / Model Selection */}
          <Form.Item label={t('settings.modelName')} field={'model'} required rules={[{ required: true }]} validateStatus={modelListState.error ? 'error' : 'success'} help={modelListState.error}>
            <Select
              loading={modelListState.isLoading}
              showSearch
              allowCreate
              suffixIcon={
                <Search
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCustom && !baseUrl) {
                      message.warning(t('settings.pleaseEnterBaseUrl'));
                      return;
                    }
                    if (!isGemini && !apiKey) {
                      message.warning(t('settings.pleaseEnterApiKey'));
                      return;
                    }
                    void modelListState.mutate();
                  }}
                  className='flex'
                />
              }
              options={modelListState.data?.models || []}
            />
          </Form.Item>
        </Form>
      </div>

      {/* API Key 编辑器弹窗 / API Key Editor Modal */}
      <ApiKeyEditorModal
        visible={apiKeyEditorVisible}
        apiKeys={apiKey || ''}
        onClose={() => setApiKeyEditorVisible(false)}
        onSave={(keys) => {
          form.setFieldValue('apiKey', keys);
          void modelListState.mutate();
        }}
        onTestKey={async (key) => {
          try {
            const res = await ipcBridge.mode.fetchModelList.invoke({
              base_url: baseUrl,
              api_key: key,
              platform: selectedPlatform?.platform ?? 'custom',
            });
            // 严格检查：success 为 true 且返回了模型列表
            return res.success === true && Array.isArray(res.data?.mode) && res.data.mode.length > 0;
          } catch {
            return false;
          }
        }}
      />
    </AionModal>
  );
});

export default AddPlatformModal;
