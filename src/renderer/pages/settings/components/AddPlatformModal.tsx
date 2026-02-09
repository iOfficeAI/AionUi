import type { IProvider } from '@/common/storage';
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { isGoogleApisHost } from '@/common/utils/urlValidation';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input, Message, Select } from '@arco-design/web-react';
import { LinkCloud, Edit, Search } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useModeModeList from '../../../hooks/useModeModeList';
import useProtocolDetection from '../../../hooks/useProtocolDetection';
import AionModal from '@/renderer/components/base/AionModal';
import ApiKeyEditorModal from './ApiKeyEditorModal';
import ProtocolDetectionStatus from './ProtocolDetectionStatus';
import { MODEL_PLATFORMS, NEW_API_PROTOCOL_OPTIONS, NEW_API_RECOMMENDED_MODELS, detectNewApiProtocol, getPlatformByValue, isCustomOption, isGeminiPlatform, isNewApiPlatform, type PlatformConfig } from '@/renderer/config/modelPlatforms';

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
 *
 * @param platform - 平台配置 / Platform config
 * @param t - 翻译函数 / Translation function
 */
const renderPlatformOption = (platform: PlatformConfig, t?: (key: string) => string) => {
  // 如果有 i18nKey 且提供了翻译函数，使用翻译后的名称；否则使用原始名称
  // If i18nKey exists and t function is provided, use translated name; otherwise use original name
  const displayName = platform.i18nKey && t ? t(platform.i18nKey) : platform.name;
  return (
    <div className='flex items-center gap-8px'>
      <ProviderLogo logo={platform.logo} name={displayName} size={18} />
      <span>{displayName}</span>
    </div>
  );
};

const AddPlatformModal = ModalHOC<{
  onSubmit: (platform: IProvider) => void;
}>(({ modalProps, onSubmit, modalCtrl }) => {
  const [message, messageContext] = Message.useMessage();
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [apiKeyEditorVisible, setApiKeyEditorVisible] = useState(false);
  // 用于追踪上次检测时的输入值，避免重复检测
  // Track last detection input to avoid redundant detection
  const [lastDetectionInput, setLastDetectionInput] = useState<{ baseUrl: string; apiKey: string } | null>(null);

  const platformValue = Form.useWatch('platform', form);
  const baseUrl = Form.useWatch('baseUrl', form);
  const apiKey = Form.useWatch('apiKey', form);
  const bedrockAuthMethod = Form.useWatch('bedrockAuthMethod', form);
  const _bedrockRegion = Form.useWatch('bedrockRegion', form);

  // 获取当前选中的平台配置 / Get current selected platform config
  const selectedPlatform = useMemo(() => getPlatformByValue(platformValue), [platformValue]);

  const platform = selectedPlatform?.platform ?? 'gemini';
  // 判断是否为"自定义"选项（没有预设 baseUrl） / Check if "Custom" option (no preset baseUrl)
  const isCustom = isCustomOption(platformValue);
  const isBedrock = platform === 'bedrock';
  const isGemini = isGeminiPlatform(platform);
  const isNewApi = isNewApiPlatform(platform);

  // new-api 每模型协议选择状态 / new-api per-model protocol selection state
  const [modelProtocol, setModelProtocol] = useState<string>('openai');

  // 计算实际使用的 baseUrl（优先使用用户输入，否则使用平台预设）
  // Calculate actual baseUrl (prefer user input, fallback to platform preset)
  const actualBaseUrl = useMemo(() => {
    if (baseUrl) return baseUrl;
    return selectedPlatform?.baseUrl || '';
  }, [baseUrl, selectedPlatform?.baseUrl]);

  // For Bedrock, don't pass bedrockConfig to avoid auto-refresh on input changes
  // We'll build it dynamically in onFocus
  const modelListState = useModeModeList(platform, actualBaseUrl, apiKey, true, undefined);

  // 协议检测 Hook / Protocol detection hook
  // 启用检测的条件：
  // 1. 自定义平台 或 用户输入了自定义 base URL（非官方地址，如本地代理）
  // 2. 输入值与上次"采纳建议"时不同（避免切换平台后重复检测）
  // Enable detection when:
  // 1. Custom platform OR user entered a custom base URL (non-official, like local proxy)
  // 2. Input values differ from last "accepted suggestion" (avoid redundant detection after platform switch)
  const isNonOfficialBaseUrl = baseUrl && !isGoogleApisHost(baseUrl);
  const shouldEnableDetection = isCustom || isNonOfficialBaseUrl;
  // 只有在用户修改了输入值（相对于上次采纳建议时）才触发检测
  // Only trigger detection when input changed since last accepted suggestion
  const inputChangedSinceLastSwitch = !lastDetectionInput || lastDetectionInput.baseUrl !== actualBaseUrl || lastDetectionInput.apiKey !== apiKey;
  const protocolDetection = useProtocolDetection(shouldEnableDetection && inputChangedSinceLastSwitch ? actualBaseUrl : '', shouldEnableDetection && inputChangedSinceLastSwitch ? apiKey : '', {
    debounceMs: 1000,
    autoDetect: true,
    timeout: 10000,
  });

  // 是否显示检测结果：启用检测 且 (有结果或正在检测) 且 输入值与上次采纳时不同
  // Whether to show detection result: enabled AND (has result or detecting) AND input changed since last switch
  const shouldShowDetectionResult = shouldEnableDetection && inputChangedSinceLastSwitch;

  // 处理平台切换建议
  // Handle platform switch suggestion
  const handleSwitchPlatform = (suggestedPlatform: string) => {
    const targetPlatform = MODEL_PLATFORMS.find((p) => p.value === suggestedPlatform || p.name === suggestedPlatform);
    if (targetPlatform) {
      form.setFieldValue('platform', targetPlatform.value);
      form.setFieldValue('model', '');
      protocolDetection.reset();
      // 记录当前输入，防止切换后重复检测
      // Record current input to prevent redundant detection after switch
      setLastDetectionInput({ baseUrl: actualBaseUrl, apiKey });
      message.success(t('settings.platformSwitched', { platform: targetPlatform.name }));
    }
  };

  // 弹窗打开时重置表单 / Reset form when modal opens
  useEffect(() => {
    if (modalProps.visible) {
      form.resetFields();
      form.setFieldValue('platform', 'gemini');
      form.setFieldValue('bedrockAuthMethod', 'accessKey');
      form.setFieldValue('bedrockRegion', 'us-east-1');
      protocolDetection.reset();
      setLastDetectionInput(null); // 重置检测记录 / Reset detection record
      setModelProtocol('openai'); // 重置协议选择 / Reset protocol selection
    }
  }, [modalProps.visible]);

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
        // 如果有 i18nKey 使用翻译后的名称，否则使用 platform 的 name
        // If i18nKey exists use translated name, otherwise use platform name
        const name = selectedPlatform?.i18nKey ? t(selectedPlatform.i18nKey) : (selectedPlatform?.name ?? values.platform);
        const provider: IProvider = {
          id: uuid(),
          platform: selectedPlatform?.platform ?? 'custom',
          name,
          // 优先使用用户输入的 baseUrl，否则使用平台预设值
          // Prefer user input baseUrl, fallback to platform preset
          baseUrl: isBedrock ? '' : values.baseUrl || selectedPlatform?.baseUrl || '',
          apiKey: isBedrock ? '' : values.apiKey,
          model: [values.model],
        };

        // Add Bedrock configuration if platform is Bedrock
        if (isBedrock) {
          provider.bedrockConfig = {
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

        // new-api 平台：保存每模型协议配置 / new-api platform: save per-model protocol config
        if (isNewApi && values.model) {
          provider.modelProtocols = { [values.model]: modelProtocol };
        }

        onSubmit(provider);
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
                  form.setFieldValue('model', '');
                }
              }}
              renderFormat={(option) => {
                const optionValue = (option as { value?: string })?.value;
                const plat = MODEL_PLATFORMS.find((p) => p.value === optionValue);
                if (!plat) return optionValue;
                return renderPlatformOption(plat, t);
              }}
            >
              {MODEL_PLATFORMS.map((plat) => (
                <Select.Option key={plat.value} value={plat.value}>
                  {renderPlatformOption(plat, t)}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {/* Base URL - 自定义选项、标准 Gemini 和 New API 显示 / Base URL - for Custom, standard Gemini and New API */}
          <Form.Item hidden={isBedrock || (!isCustom && !isNewApi && platformValue !== 'gemini')} label={t('settings.baseUrl')} field={'baseUrl'} required={isCustom || isNewApi} rules={[{ required: isCustom || isNewApi }]}>
            <Input
              placeholder={isNewApi ? 'https://your-newapi-instance.com' : selectedPlatform?.baseUrl || ''}
              onBlur={() => {
                void modelListState.mutate();
              }}
            />
          </Form.Item>

          {/* API Key */}
          <Form.Item
            hidden={isBedrock}
            label={t('settings.apiKey')}
            required={!isBedrock}
            rules={[{ required: !isBedrock }]}
            field={'apiKey'}
            extra={
              <div className='space-y-2px'>
                <div className='text-11px text-t-secondary mt-2 leading-4'>{t('settings.multiApiKeyTip')}</div>
                {/* 协议检测状态 / Protocol detection status */}
                {shouldShowDetectionResult && <ProtocolDetectionStatus isDetecting={protocolDetection.isDetecting} result={protocolDetection.result} currentPlatform={platformValue} onSwitchPlatform={handleSwitchPlatform} />}
              </div>
            }
          >
            <Input
              onBlur={() => {
                void modelListState.mutate();
              }}
              suffix={<Edit theme='outline' size={16} className='cursor-pointer text-t-secondary hover:text-t-primary flex' onClick={() => setApiKeyEditorVisible(true)} />}
            />
          </Form.Item>

          {/* AWS Bedrock Authentication Method */}
          <Form.Item hidden={!isBedrock} label={t('settings.bedrock.authMethod')} field={'bedrockAuthMethod'} initialValue='accessKey' required={isBedrock} rules={[{ required: isBedrock }]}>
            <Select>
              <Select.Option value='accessKey'>{t('settings.bedrock.authMethodAccessKey')}</Select.Option>
              <Select.Option value='profile'>{t('settings.bedrock.authMethodProfile')}</Select.Option>
            </Select>
          </Form.Item>

          {/* AWS Region */}
          <Form.Item hidden={!isBedrock} label={t('settings.bedrock.region')} field={'bedrockRegion'} initialValue='us-east-1' required={isBedrock} rules={[{ required: isBedrock }]} extra={t('settings.bedrock.regionHint')}>
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

          {/* Access Key ID */}
          <Form.Item hidden={!isBedrock || bedrockAuthMethod !== 'accessKey'} label={t('settings.bedrock.accessKeyId')} field={'bedrockAccessKeyId'} required={isBedrock && bedrockAuthMethod === 'accessKey'} rules={[{ required: isBedrock && bedrockAuthMethod === 'accessKey' }]}>
            <Input.Password placeholder='AKIA...' visibilityToggle />
          </Form.Item>

          {/* Secret Access Key */}
          <Form.Item hidden={!isBedrock || bedrockAuthMethod !== 'accessKey'} label={t('settings.bedrock.secretAccessKey')} field={'bedrockSecretAccessKey'} required={isBedrock && bedrockAuthMethod === 'accessKey'} rules={[{ required: isBedrock && bedrockAuthMethod === 'accessKey' }]}>
            <Input.Password visibilityToggle />
          </Form.Item>

          {/* AWS Profile */}
          <Form.Item hidden={!isBedrock || bedrockAuthMethod !== 'profile'} label={t('settings.bedrock.profile')} field={'bedrockProfile'} required={isBedrock && bedrockAuthMethod === 'profile'} rules={[{ required: isBedrock && bedrockAuthMethod === 'profile' }]} extra={t('settings.bedrock.profileHint')}>
            <Input placeholder='default' />
          </Form.Item>

          {/* 模型选择 / Model Selection */}
          <Form.Item label={t('settings.modelName')} field={'model'} required rules={[{ required: true }]} validateStatus={modelListState.error ? 'error' : 'success'} help={modelListState.error}>
            <Select
              loading={modelListState.isLoading}
              showSearch
              allowCreate
              suffixIcon={
                <Search
                  onClick={async (e) => {
                    e.stopPropagation();
                    if ((isCustom || isNewApi) && !baseUrl) {
                      message.warning(t('settings.pleaseEnterBaseUrl'));
                      return;
                    }
                    // For Bedrock, build bedrockConfig from current form values and fetch models
                    if (isBedrock) {
                      const values = form.getFields();
                      if (!values.bedrockAuthMethod || !values.bedrockRegion) {
                        message.warning(t('settings.bedrock.fillRequiredFields'));
                        return;
                      }
                      if (values.bedrockAuthMethod === 'accessKey' && (!values.bedrockAccessKeyId || !values.bedrockSecretAccessKey)) {
                        message.warning(t('settings.bedrock.fillRequiredFields'));
                        return;
                      }
                      if (values.bedrockAuthMethod === 'profile' && !values.bedrockProfile) {
                        message.warning(t('settings.bedrock.fillRequiredFields'));
                        return;
                      }
                      // Build bedrockConfig and fetch models manually
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
                        const res = await ipcBridge.mode.fetchModelList.invoke({
                          platform,
                          api_key: '',
                          bedrockConfig,
                        });
                        if (res.success) {
                          const models =
                            res.data?.mode.map((v: any) => {
                              if (typeof v === 'string') {
                                return { label: v, value: v };
                              } else {
                                return { label: v.name, value: v.id };
                              }
                            }) || [];
                          // Update the model list state manually
                          void modelListState.mutate({ models }, false);
                        } else {
                          message.error(res.msg || 'Failed to fetch models');
                        }
                      } catch (error: any) {
                        message.error(error.message || 'Failed to fetch models');
                      }
                      return;
                    }
                    // For Gemini, no apiKey check needed
                    if (!isGemini && !apiKey) {
                      message.warning(t('settings.pleaseEnterApiKey'));
                      return;
                    }
                    void modelListState.mutate();
                  }}
                  theme='outline'
                  size={16}
                  className='cursor-pointer text-t-secondary hover:text-t-primary'
                />
              }
              options={isNewApi && !modelListState.data?.models?.length ? NEW_API_RECOMMENDED_MODELS : modelListState.data?.models || []}
              onChange={
                isNewApi
                  ? (value: string) => {
                      form.setFieldValue('model', value);
                      // Auto-detect protocol based on model name
                      setModelProtocol(detectNewApiProtocol(value));
                    }
                  : undefined
              }
            />
          </Form.Item>

          {/* New API 协议选择 / New API Protocol Selection */}
          {isNewApi && (
            <Form.Item label={t('settings.modelProtocol')} extra={<span className='text-11px text-t-secondary'>{t('settings.modelProtocolTip')}</span>}>
              <Select value={modelProtocol} onChange={setModelProtocol} options={NEW_API_PROTOCOL_OPTIONS} />
            </Form.Item>
          )}
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
              base_url: actualBaseUrl,
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
