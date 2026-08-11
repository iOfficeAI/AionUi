import type { IProvider } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import AionModal from '@/renderer/components/base/AionModal';
import useModeModeList from '@renderer/hooks/agent/useModeModeList';
import ModalHOC from '@/renderer/utils/ui/ModalHOC';
import { isAionrsOnlyPlatform } from '@/renderer/utils/model/modelPlatforms';
import { Button, Form, Input, InputNumber, Message, Select, Tag } from '@arco-design/web-react';
import { LinkCloud } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import GeminiLogo from '@/renderer/assets/logos/ai-major/gemini.svg';
import OpenAILogo from '@/renderer/assets/logos/ai-major/openai.svg';
import AnthropicLogo from '@/renderer/assets/logos/ai-major/anthropic.svg';
import BedrockLogo from '@/renderer/assets/logos/ai-cloud/bedrock.svg';
import DeepSeekLogo from '@/renderer/assets/logos/ai-major/deepseek.svg';
import OpenRouterLogo from '@/renderer/assets/logos/ai-cloud/openrouter.svg';
import SiliconFlowLogo from '@/renderer/assets/logos/ai-cloud/siliconflow.png';
import QwenLogo from '@/renderer/assets/logos/ai-china/qwen.svg';
import KimiLogo from '@/renderer/assets/logos/ai-china/kimi.svg';
import ZhipuLogo from '@/renderer/assets/logos/ai-china/zhipu.svg';
import XaiLogo from '@/renderer/assets/logos/ai-major/xai.svg';
import VolcengineLogo from '@/renderer/assets/logos/ai-china/volcengine.svg';
import BaiduLogo from '@/renderer/assets/logos/ai-china/baidu.svg';
import TencentLogo from '@/renderer/assets/logos/ai-china/tencent.svg';
import LingyiLogo from '@/renderer/assets/logos/ai-china/lingyiwanwu.svg';
import PoeLogo from '@/renderer/assets/logos/ai-cloud/poe.svg';
import ModelScopeLogo from '@/renderer/assets/logos/ai-cloud/modelscope.svg';
import InfiniAILogo from '@/renderer/assets/logos/ai-cloud/infiniai.svg';
import CtyunLogo from '@/renderer/assets/logos/ai-cloud/ctyun.svg';
import StepFunLogo from '@/renderer/assets/logos/ai-china/stepfun.svg';
import NewApiLogo from '@/renderer/assets/logos/ai-cloud/newapi.svg';
import GitHubLogo from '@/renderer/assets/logos/tools/github.svg';

const PROVIDER_CONFIGS = [
  { name: 'Gemini', url: '', logo: GeminiLogo, platform: 'gemini' },
  { name: 'Gemini (Vertex AI)', url: '', logo: GeminiLogo, platform: 'gemini-vertex-ai' },
  { name: 'New API', url: '', logo: NewApiLogo, platform: 'new-api' },
  { name: 'GitHub Copilot', url: 'https://api.githubcopilot.com', logo: GitHubLogo, platform: 'copilot' },
  { name: 'ChatGPT', url: 'https://chatgpt.com', logo: OpenAILogo, platform: 'chatgpt' },
  { name: 'OpenAI', url: 'https://api.openai.com/v1', logo: OpenAILogo },
  { name: 'Ollama', url: 'https://ollama.com/v1', logo: null },
  { name: 'Anthropic', url: 'https://api.anthropic.com/v1', logo: AnthropicLogo },
  { name: 'AWS Bedrock', url: '', logo: BedrockLogo, platform: 'bedrock' },
  { name: 'DeepSeek', url: 'https://api.deepseek.com', logo: DeepSeekLogo },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', logo: OpenRouterLogo },
  { name: 'SiliconFlow-CN', url: 'https://api.siliconflow.cn/v1', logo: SiliconFlowLogo },
  { name: 'SiliconFlow', url: 'https://api.siliconflow.com/v1', logo: SiliconFlowLogo },
  { name: 'Dashscope', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', logo: QwenLogo },
  { name: 'Moonshot (China)', url: 'https://api.moonshot.cn/v1', logo: KimiLogo },
  { name: 'Moonshot (Global)', url: 'https://api.moonshot.ai/v1', logo: KimiLogo },
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

const getProviderLogo = (name?: string, baseUrl?: string, platform?: string): string | null => {
  if (!name && !baseUrl && !platform) return null;

  if (platform) {
    const byPlatform = PROVIDER_CONFIGS.find((item) => item.platform === platform);
    if (byPlatform) return byPlatform.logo;
  }

  const byName = PROVIDER_CONFIGS.find((item) => item.name === name);
  if (byName) return byName.logo;

  const byNameLower = PROVIDER_CONFIGS.find((item) => item.name.toLowerCase() === name?.toLowerCase());
  if (byNameLower) return byNameLower.logo;

  if (baseUrl) {
    const byUrl = PROVIDER_CONFIGS.find(
      (item) => item.url && baseUrl.includes(item.url.replace('https://', '').split('/')[0])
    );
    if (byUrl) return byUrl.logo;
  }

  return null;
};

const ProviderLogo: React.FC<{ logo: string | null; name: string; size?: number }> = ({ logo, name, size = 20 }) => {
  if (logo) {
    return <img src={logo} alt={name} className='object-contain shrink-0' style={{ width: size, height: size }} />;
  }
  return <LinkCloud theme='outline' size={size} className='text-t-secondary flex shrink-0' />;
};

const normalizeRequestIntervalMs = (value: unknown): number => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }
  return Math.floor(numericValue);
};

type AionrsLoginStatus = {
  authenticated: boolean;
  authPath: string;
  expiresAt?: string;
  lastRefresh?: string;
};

type AionrsLoginInfo = {
  userCode?: string;
  verificationUri?: string;
  expiresAt?: string;
};

function getOptionalLoginField(data: unknown, key: keyof AionrsLoginInfo): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function getAionrsLoginBridge(platform: string | undefined) {
  if (platform === 'copilot') return ipcBridge.copilotAuth;
  if (platform === 'chatgpt') return ipcBridge.chatgptAuth;
  return null;
}

function getAionrsLoginKey(platform: string | undefined): 'copilot' | 'chatgpt' | null {
  if (platform === 'copilot' || platform === 'chatgpt') return platform;
  return null;
}

const EditModeModal = ModalHOC<{ data?: IProvider; onChange(data: IProvider): void }>(
  ({ modalProps, modalCtrl, ...props }) => {
    const { t } = useTranslation();
    const { data } = props;
    const [form] = Form.useForm();
    const [message, messageContext] = Message.useMessage();
    const bedrockAuthMethod = Form.useWatch('bedrockAuthMethod', form);
    const isBedrock = data?.platform === 'bedrock';
    const loginPlatformKey = getAionrsLoginKey(data?.platform);
    const loginAuthBridge = getAionrsLoginBridge(data?.platform);
    const isAionrsLoginPlatform = isAionrsOnlyPlatform(data?.platform);
    const canEditBaseUrl = !isBedrock && !isAionrsLoginPlatform && data?.platform !== 'gemini-vertex-ai';
    const modelListApiKey = isAionrsLoginPlatform ? '' : data?.apiKey;
    const proxyValue = Form.useWatch('proxy', form);

    const [loginAuthStatus, setLoginAuthStatus] = useState<AionrsLoginStatus | null>(null);
    const [loginInfo, setLoginInfo] = useState<AionrsLoginInfo | null>(null);
    const [loginAuthLoading, setLoginAuthLoading] = useState(false);
    const [waitingLogin, setWaitingLogin] = useState(false);

    const providerLogo = useMemo(
      () => getProviderLogo(data?.name, data?.baseUrl, data?.platform),
      [data?.baseUrl, data?.name, data?.platform]
    );

    const modelListState = useModeModeList(
      data?.platform || 'gemini',
      data?.baseUrl,
      modelListApiKey,
      proxyValue,
      true,
      undefined
    );

    const refreshLoginStatus = useCallback(async () => {
      if (!loginAuthBridge) {
        setLoginAuthStatus(null);
        return;
      }

      const result = await loginAuthBridge.status.invoke();
      if (result.success && result.data) {
        setLoginAuthStatus(result.data);
        return;
      }
      setLoginAuthStatus(null);
    }, [loginAuthBridge]);

    const handleLoginPlatformLogin = useCallback(async () => {
      if (!loginAuthBridge || !loginPlatformKey) return;

      setLoginAuthLoading(true);
      try {
        const result = await loginAuthBridge.startLogin.invoke({ proxy: proxyValue });
        if (!result.success || !result.data) {
          message.error(result.msg || t(`settings.${loginPlatformKey}LoginFailed`));
          return;
        }

        setLoginInfo({
          userCode: getOptionalLoginField(result.data, 'userCode'),
          verificationUri: getOptionalLoginField(result.data, 'verificationUri'),
          expiresAt: getOptionalLoginField(result.data, 'expiresAt'),
        });
        setWaitingLogin(true);
        message.info(t(`settings.${loginPlatformKey}LoginStarted`));

        void loginAuthBridge.waitForLogin
          .invoke({ loginId: result.data.loginId })
          .then(async (waitResult) => {
            if (!waitResult.success) {
              message.error(waitResult.msg || t(`settings.${loginPlatformKey}LoginFailed`));
              return;
            }

            setLoginInfo(null);
            await refreshLoginStatus();
            void modelListState.mutate();
            message.success(t(`settings.${loginPlatformKey}LoginSuccess`));
          })
          .finally(() => {
            setWaitingLogin(false);
          });
      } finally {
        setLoginAuthLoading(false);
      }
    }, [loginAuthBridge, loginPlatformKey, message, modelListState, proxyValue, refreshLoginStatus, t]);

    const handleLoginPlatformLogout = useCallback(async () => {
      if (!loginAuthBridge || !loginPlatformKey) return;

      setLoginAuthLoading(true);
      try {
        const result = await loginAuthBridge.logout.invoke({ proxy: proxyValue });
        if (!result.success) {
          message.error(result.msg || t(`settings.${loginPlatformKey}LoginFailed`));
          return;
        }

        setLoginInfo(null);
        setWaitingLogin(false);
        await refreshLoginStatus();
        message.success(t(`settings.${loginPlatformKey}LogoutSuccess`));
      } finally {
        setLoginAuthLoading(false);
      }
    }, [loginAuthBridge, loginPlatformKey, message, proxyValue, refreshLoginStatus, t]);

    useEffect(() => {
      if (!data) return;
      form.setFieldsValue({
        ...data,
        apiKey: isAionrsOnlyPlatform(data.platform) ? '' : data.apiKey,
        requestIntervalMs: data.requestIntervalMs ?? 0,
        model: data.model && data.model.length > 0 ? (data.model.length === 1 ? data.model[0] : data.model) : undefined,
        bedrockAuthMethod: data.bedrockConfig?.authMethod || 'accessKey',
        bedrockRegion: data.bedrockConfig?.region || 'us-east-1',
        bedrockAccessKeyId: data.bedrockConfig?.accessKeyId || '',
        bedrockSecretAccessKey: data.bedrockConfig?.secretAccessKey || '',
        bedrockProfile: data.bedrockConfig?.profile || '',
      });
      setLoginInfo(null);
      setWaitingLogin(false);
    }, [data, form]);

    useEffect(() => {
      if (!modalProps.visible || !loginPlatformKey) return;
      void refreshLoginStatus();
    }, [loginPlatformKey, modalProps.visible, refreshLoginStatus]);

    return (
      <AionModal
        visible={modalProps.visible}
        onCancel={modalCtrl.close}
        header={{ title: t('settings.editModel'), showClose: true }}
        style={{ minHeight: '400px', maxHeight: '90vh', borderRadius: 16 }}
        contentStyle={{
          background: 'var(--dialog-fill-0)',
          borderRadius: 16,
          padding: '20px 24px 16px',
          overflow: 'auto',
        }}
        onOk={async () => {
          try {
            const values = await form.validate();
            const updatedProvider: IProvider = {
              ...data,
              ...values,
              apiKey: isBedrock || isAionrsLoginPlatform ? '' : values.apiKey,
              proxy: typeof values.proxy === 'string' && values.proxy.trim() ? values.proxy.trim() : undefined,
              requestIntervalMs: normalizeRequestIntervalMs(values.requestIntervalMs),
              model: Array.isArray(values.model) ? values.model : [values.model],
            };

            if (isBedrock) {
              updatedProvider.bedrockConfig = {
                authMethod: values.bedrockAuthMethod,
                region: values.bedrockRegion,
                ...(values.bedrockAuthMethod === 'accessKey'
                  ? {
                      accessKeyId: values.bedrockAccessKeyId,
                      secretAccessKey: values.bedrockSecretAccessKey,
                    }
                  : {
                      profile: values.bedrockProfile,
                    }),
              };
            }

            props.onChange(updatedProvider);
            modalCtrl.close();
          } catch {
            // Validation failed. Arco Form will highlight invalid fields.
          }
        }}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        {messageContext}
        <div className='py-20px'>
          <Form form={form} layout='vertical'>
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

            <Form.Item
              hidden={isBedrock}
              label={t('settings.baseUrl')}
              required={data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai' && !isBedrock}
              rules={[{ required: data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai' && !isBedrock }]}
              field={'baseUrl'}
              disabled={!canEditBaseUrl}
            >
              <Input></Input>
            </Form.Item>

            <Form.Item
              hidden={isBedrock || isAionrsLoginPlatform}
              label={t('settings.apiKey')}
              required={!isBedrock && !isAionrsLoginPlatform}
              rules={[{ required: !isBedrock && !isAionrsLoginPlatform }]}
              field={'apiKey'}
              extra={<div className='text-11px text-t-secondary mt-2'>{t('settings.multiApiKeyEditTip')}</div>}
            >
              <Input.TextArea rows={4} placeholder={t('settings.apiKeyPlaceholder')} />
            </Form.Item>

            <Form.Item
              hidden={isBedrock}
              label={t('settings.proxyConfig')}
              field={'proxy'}
              rules={[{ match: /^https?:\/\/.+$/, message: t('settings.proxyHttpOnly') }]}
            >
              <Input placeholder={t('settings.proxyHttpOnly')} />
            </Form.Item>

            <Form.Item
              label={t('settings.requestIntervalMs')}
              field={'requestIntervalMs'}
              extra={t('settings.requestIntervalMsTip')}
            >
              <InputNumber min={0} step={100} precision={0} style={{ width: '100%' }} placeholder='0' />
            </Form.Item>

            {isAionrsLoginPlatform && loginPlatformKey && (
              <div className='mb-12px rd-12px bg-aou-1 p-12px flex flex-col gap-10px'>
                <div className='flex items-center justify-between gap-12px'>
                  <div className='flex items-center gap-8px'>
                    <span className='text-13px font-medium'>{t(`settings.${loginPlatformKey}AuthTitle`)}</span>
                    <Tag size='small' color='arcoblue'>
                      {t('settings.aionrsOnly')}
                    </Tag>
                    <Tag color={waitingLogin ? 'orange' : loginAuthStatus?.authenticated ? 'green' : 'gray'}>
                      {waitingLogin
                        ? t(`settings.${loginPlatformKey}LoginPending`)
                        : loginAuthStatus?.authenticated
                          ? t(`settings.${loginPlatformKey}AuthLoggedIn`)
                          : t(`settings.${loginPlatformKey}AuthLoggedOut`)}
                    </Tag>
                  </div>
                  {loginAuthStatus?.authenticated ? (
                    <Button loading={loginAuthLoading} size='small' onClick={() => void handleLoginPlatformLogout()}>
                      {t(`settings.${loginPlatformKey}Logout`)}
                    </Button>
                  ) : (
                    <Button
                      type='primary'
                      loading={loginAuthLoading || waitingLogin}
                      size='small'
                      onClick={() => void handleLoginPlatformLogin()}
                    >
                      {t(`settings.${loginPlatformKey}Login`)}
                    </Button>
                  )}
                </div>

                <div className='text-12px text-t-secondary leading-5'>
                  {t(`settings.${loginPlatformKey}AuthDescription`)}
                </div>

                {loginInfo?.userCode || loginInfo?.verificationUri ? (
                  <div className='flex flex-col gap-8px'>
                    {loginInfo?.userCode ? (
                      <Input
                        readOnly
                        value={loginInfo.userCode}
                        addBefore={t(`settings.${loginPlatformKey}DeviceCode`)}
                      />
                    ) : null}
                    {loginInfo?.verificationUri ? (
                      <Input
                        readOnly
                        value={loginInfo.verificationUri}
                        addBefore={t(`settings.${loginPlatformKey}VerificationUrl`)}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            <Form.Item
              hidden={!isBedrock}
              label={t('settings.bedrock.authMethod')}
              field={'bedrockAuthMethod'}
              required={isBedrock}
              rules={[{ required: isBedrock }]}
            >
              <Select>
                <Select.Option value='accessKey'>{t('settings.bedrock.authMethodAccessKey')}</Select.Option>
                <Select.Option value='profile'>{t('settings.bedrock.authMethodProfile')}</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              hidden={!isBedrock}
              label={t('settings.bedrock.region')}
              field={'bedrockRegion'}
              required={isBedrock}
              rules={[{ required: isBedrock }]}
              extra={t('settings.bedrock.regionHint')}
            >
              <Select showSearch>
                <Select.Option value='us-east-1'>US East (N. Virginia)</Select.Option>
                <Select.Option value='us-west-2'>US West (Oregon)</Select.Option>
                <Select.Option value='eu-west-1'>Europe (Ireland)</Select.Option>
                <Select.Option value='eu-central-1'>Europe (Frankfurt)</Select.Option>
                <Select.Option value='ap-southeast-1'>Asia Pacific (Singapore)</Select.Option>
                <Select.Option value='ap-northeast-1'>Asia Pacific (Tokyo)</Select.Option>
                <Select.Option value='ap-southeast-2'>Asia Pacific (Sydney)</Select.Option>
                <Select.Option value='ca-central-1'>Canada (Central)</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              hidden={!isBedrock || bedrockAuthMethod !== 'accessKey'}
              label={t('settings.bedrock.accessKeyId')}
              field={'bedrockAccessKeyId'}
              required={isBedrock && bedrockAuthMethod === 'accessKey'}
              rules={[{ required: isBedrock && bedrockAuthMethod === 'accessKey' }]}
            >
              <Input.Password placeholder='AKIA...' visibilityToggle />
            </Form.Item>

            <Form.Item
              hidden={!isBedrock || bedrockAuthMethod !== 'accessKey'}
              label={t('settings.bedrock.secretAccessKey')}
              field={'bedrockSecretAccessKey'}
              required={isBedrock && bedrockAuthMethod === 'accessKey'}
              rules={[{ required: isBedrock && bedrockAuthMethod === 'accessKey' }]}
            >
              <Input.Password visibilityToggle />
            </Form.Item>

            <Form.Item
              hidden={!isBedrock || bedrockAuthMethod !== 'profile'}
              label={t('settings.bedrock.profile')}
              field={'bedrockProfile'}
              required={isBedrock && bedrockAuthMethod === 'profile'}
              rules={[{ required: isBedrock && bedrockAuthMethod === 'profile' }]}
              extra={t('settings.bedrock.profileHint')}
            >
              <Input placeholder='default' />
            </Form.Item>

            <Form.Item
              label={t('settings.modelName')}
              field={'model'}
              required
              rules={[{ required: true }]}
              validateStatus={modelListState.error ? 'error' : undefined}
              help={modelListState.error}
            >
              <Select
                loading={modelListState.isLoading}
                showSearch
                allowCreate
                mode={data?.model && data.model.length > 1 ? 'multiple' : undefined}
                onFocus={async () => {
                  if (isBedrock) {
                    const values = form.getFields();
                    if (!values.bedrockAuthMethod || !values.bedrockRegion) {
                      message.error(t('settings.bedrock.fillRequiredFields'));
                      return;
                    }
                    if (
                      values.bedrockAuthMethod === 'accessKey' &&
                      (!values.bedrockAccessKeyId || !values.bedrockSecretAccessKey)
                    ) {
                      message.error(t('settings.bedrock.fillRequiredFields'));
                      return;
                    }
                    if (values.bedrockAuthMethod === 'profile' && !values.bedrockProfile) {
                      message.error(t('settings.bedrock.fillRequiredFields'));
                      return;
                    }

                    const bedrockConfig = {
                      authMethod: values.bedrockAuthMethod,
                      region: values.bedrockRegion,
                      ...(values.bedrockAuthMethod === 'accessKey'
                        ? {
                            accessKeyId: values.bedrockAccessKeyId,
                            secretAccessKey: values.bedrockSecretAccessKey,
                          }
                        : {
                            profile: values.bedrockProfile,
                          }),
                    };

                    try {
                      const result = await ipcBridge.mode.fetchModelList.invoke({
                        platform: data?.platform || 'bedrock',
                        api_key: '',
                        proxy: proxyValue,
                        bedrockConfig,
                      });
                      if (!result.success) {
                        message.error(result.msg || 'Failed to fetch models');
                        return;
                      }

                      const models =
                        result.data?.mode.map((item: string | { id: string; name: string }) =>
                          typeof item === 'string' ? { label: item, value: item } : { label: item.name, value: item.id }
                        ) || [];
                      void modelListState.mutate({ models }, false);
                    } catch (error) {
                      message.error(error instanceof Error ? error.message : 'Failed to fetch models');
                    }
                    return;
                  }

                  void modelListState.mutate();
                }}
                options={modelListState.data?.models || []}
              />
            </Form.Item>
          </Form>
        </div>
      </AionModal>
    );
  }
);

export default EditModeModal;
