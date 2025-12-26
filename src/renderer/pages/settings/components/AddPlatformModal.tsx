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
                  form.setFieldValue('baseUrl', plat.baseUrl || '');
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
