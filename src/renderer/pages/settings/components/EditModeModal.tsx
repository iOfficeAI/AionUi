import type { IProvider } from '@/common/storage';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input } from '@arco-design/web-react';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AionModal from '@/renderer/components/base/AionModal';
import { LinkCloud } from '@icon-park/react';

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
 * 供应商配置（包含名称、URL、Logo）
 * Provider config (includes name, URL, logo)
 */
const PROVIDER_CONFIGS = [
  { name: 'Gemini', url: '', logo: GeminiLogo, platform: 'gemini' },
  { name: 'Gemini (Vertex AI)', url: '', logo: GeminiLogo, platform: 'gemini-vertex-ai' },
  { name: 'OpenAI', url: 'https://api.openai.com/v1', logo: OpenAILogo },
  { name: 'Anthropic', url: 'https://api.anthropic.com/v1', logo: AnthropicLogo },
  { name: 'DeepSeek', url: 'https://api.deepseek.com', logo: DeepSeekLogo },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', logo: OpenRouterLogo },
  { name: 'SiliconFlow', url: 'https://api.siliconflow.cn/v1', logo: SiliconFlowLogo },
  { name: 'Dashscope', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', logo: QwenLogo },
  { name: 'Moonshot', url: 'https://api.moonshot.cn/v1', logo: KimiLogo },
  { name: 'Zhipu', url: 'https://open.bigmodel.cn/api/paas/v4', logo: ZhipuLogo },
  { name: 'xAI', url: 'https://api.x.ai/v1', logo: XaiLogo },
  { name: 'Ark', url: 'https://ark.cn-beijing.volces.com/api/v3', logo: VolcengineLogo },
  { name: 'Qianfan', url: 'https://qianfan.baidubce.com/v2', logo: BaiduLogo },
  { name: 'Hunyuan', url: 'https://api.hunyuan.cloud.tencent.com/v1', logo: TencentLogo },
  { name: 'Lingyi', url: 'https://api.lingyiwanwu.com/v1', logo: LingyiLogo },
  { name: 'Poe', url: 'https://api.poe.com/v1', logo: PoeLogo },
  { name: 'ModelScope', url: 'https://api-inference.modelscope.cn/v1', logo: ModelScopeLogo },
  { name: 'InfiniAI', url: 'https://cloud.infini-ai.com/maas/v1', logo: InfiniAILogo },
  { name: 'Ctyun', url: 'https://wishub-x1.ctyun.cn/v1', logo: CtyunLogo },
  { name: 'StepFun', url: 'https://api.stepfun.com/v1', logo: StepFunLogo },
];

/**
 * 根据名称或 URL 获取供应商 Logo
 * Get provider logo by name or URL
 */
const getProviderLogo = (name?: string, baseUrl?: string, platform?: string): string | null => {
  if (!name && !baseUrl && !platform) return null;

  // 优先按 platform 匹配（Gemini 系列）
  if (platform) {
    const byPlatform = PROVIDER_CONFIGS.find((p) => p.platform === platform);
    if (byPlatform) return byPlatform.logo;
  }

  // 按名称精确匹配
  const byName = PROVIDER_CONFIGS.find((p) => p.name === name);
  if (byName) return byName.logo;

  // 按名称模糊匹配（忽略大小写）
  const byNameLower = PROVIDER_CONFIGS.find((p) => p.name.toLowerCase() === name?.toLowerCase());
  if (byNameLower) return byNameLower.logo;

  // 按 URL 匹配
  if (baseUrl) {
    const byUrl = PROVIDER_CONFIGS.find((p) => p.url && baseUrl.includes(p.url.replace('https://', '').split('/')[0]));
    if (byUrl) return byUrl.logo;
  }

  return null;
};

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

const EditModeModal = ModalHOC<{ data?: IProvider; onChange(data: IProvider): void }>(({ modalProps, modalCtrl, ...props }) => {
  const { t } = useTranslation();
  const { data } = props;
  const [form] = Form.useForm();

  // 获取供应商 Logo / Get provider logo
  const providerLogo = useMemo(() => {
    return getProviderLogo(data?.name, data?.baseUrl, data?.platform);
  }, [data?.name, data?.baseUrl, data?.platform]);

  useEffect(() => {
    if (data) {
      form.setFieldsValue(data);
    }
  }, [data]);

  return (
    <AionModal
      visible={modalProps.visible}
      onCancel={modalCtrl.close}
      header={{ title: t('settings.editModel'), showClose: true }}
      style={{ minHeight: '400px', maxHeight: '90vh', borderRadius: 16 }}
      contentStyle={{ background: 'var(--bg-1)', borderRadius: 16, padding: '20px 24px 16px', overflow: 'auto' }}
      onOk={async () => {
        const values = await form.validate();
        props.onChange({ ...(data || {}), ...values });
        modalCtrl.close();
      }}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
    >
      <div className='py-20px'>
        <Form form={form} layout='vertical'>
          {/* 模型供应商名称（可编辑，带 Logo）/ Model Provider name (editable, with Logo) */}
          <Form.Item
            label={
              <div className='flex items-center gap-6px'>
                <ProviderLogo logo={providerLogo} name={data?.name || ''} size={16} />
                <span>{t('settings.modelProvider')}</span>
              </div>
            }
            field='name'
            required
            rules={[{ required: true }]}
          >
            <Input placeholder={t('settings.modelProvider')} />
          </Form.Item>

          {/* Base URL - 仅 Gemini 平台显示（用于自定义代理）/ Base URL - only for Gemini platform (for custom proxy) */}
          <Form.Item label={t('settings.baseUrl')} required={data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai'} rules={[{ required: data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai' }]} field={'baseUrl'} disabled>
            <Input></Input>
          </Form.Item>

          <Form.Item label={t('settings.apiKey')} required rules={[{ required: true }]} field={'apiKey'} extra={<div className='text-11px text-t-secondary mt-2'>💡 {t('settings.multiApiKeyEditTip')}</div>}>
            <Input.TextArea rows={4} placeholder={t('settings.apiKeyPlaceholder')} />
          </Form.Item>
        </Form>
      </div>
    </AionModal>
  );
});

export default EditModeModal;
