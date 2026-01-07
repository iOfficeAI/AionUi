import type { IProvider } from '@/common/storage';
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { isGoogleApisHost } from '@/common/utils/urlValidation';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input, Message, Select } from '@arco-design/web-react';
import { Search, LinkCloud, Edit } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useModeModeList from '../../../hooks/useModeModeList';
import useProtocolDetection from '../../../hooks/useProtocolDetection';
import AionModal from '@/renderer/components/base/AionModal';
import ApiKeyEditorModal from './ApiKeyEditorModal';
import ProtocolDetectionStatus from './ProtocolDetectionStatus';
import { MODEL_PLATFORMS, getPlatformByValue, isCustomOption, isGeminiPlatform, type PlatformConfig } from '@/renderer/config/modelPlatforms';

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

  // 获取当前选中的平台配置 / Get current selected platform config
  const selectedPlatform = useMemo(() => getPlatformByValue(platformValue), [platformValue]);

  const platform = selectedPlatform?.platform ?? 'gemini';
  // 判断是否为"自定义"选项（没有预设 baseUrl） / Check if "Custom" option (no preset baseUrl)
  const isCustom = isCustomOption(platformValue);
  const isGemini = isGeminiPlatform(platform);

  const modelListState = useModeModeList(platform, baseUrl, apiKey, true);

  // 计算实际使用的 baseUrl（优先使用用户输入，否则使用平台预设）
  // Calculate actual baseUrl (prefer user input, fallback to platform preset)
  const actualBaseUrl = useMemo(() => {
    if (baseUrl) return baseUrl;
    return selectedPlatform?.baseUrl || '';
  }, [baseUrl, selectedPlatform?.baseUrl]);

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
      protocolDetection.reset();
      setLastDetectionInput(null); // 重置检测记录 / Reset detection record
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

          {/* Base URL - 仅自定义选项和标准 Gemini 显示 / Base URL - only for Custom option and standard Gemini */}
          <Form.Item hidden={!isCustom && platformValue !== 'gemini'} label={t('settings.baseUrl')} field={'baseUrl'} required={isCustom} rules={[{ required: isCustom }]}>
            <Input
              placeholder={selectedPlatform?.baseUrl || ''}
              onBlur={() => {
                void modelListState.mutate();
              }}
            />
          </Form.Item>

          {/* API Key */}
          <Form.Item
            label={t('settings.apiKey')}
            required
            rules={[{ required: true }]}
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
