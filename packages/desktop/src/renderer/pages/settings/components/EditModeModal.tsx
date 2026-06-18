import type { IProvider } from '@/common/config/storage';
import ModalHOC from '@/renderer/utils/ui/ModalHOC';
import { Form, Input, Message, Select, Tag } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AionModal from '@/renderer/components/base/AionModal';
import { LinkCloud } from '@icon-park/react';
import { ipcBridge } from '@/common';
import useModeModeList from '@renderer/hooks/agent/useModeModeList';
import { getProviderLogo } from '@/renderer/utils/model/modelPlatforms';

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

const EditModeModal = ModalHOC<{ data?: IProvider; onChange(data: IProvider): void }>(
  ({ modalProps, modalCtrl, ...props }) => {
    const { t } = useTranslation();
    const { data } = props;
    const [form] = Form.useForm();
    const [message, messageContext] = Message.useMessage();

    // Watch bedrockAuthMethod only for UI conditional rendering (not for auto-refresh)
    const bedrockAuthMethod = Form.useWatch('bedrockAuthMethod', form);
    const isBedrock = data?.platform === 'bedrock';

    // Watch the live form values so editing the Base URL (or API key) re-keys the
    // model-list SWR cache. Without this the list would keep fetching from the
    // provider's original base_url and a Base URL edit could never refresh it.
    // Fall back to the initial provider value until the form is populated.
    const watchedBaseUrl = Form.useWatch('base_url', form);
    const watchedApiKey = Form.useWatch('api_key', form);
    const effectiveBaseUrl = watchedBaseUrl ?? data?.base_url;
    const effectiveApiKey = watchedApiKey ?? data?.api_key;

    // 获取供应商 Logo / Get provider logo
    const providerLogo = useMemo(() => {
      return getProviderLogo({ name: data?.name, base_url: data?.base_url, platform: data?.platform });
    }, [data?.name, data?.base_url, data?.platform]);

    const isFullUrl = data?.is_full_url ?? false;

    // A non-destructive hint shown when a refresh after a Base URL change
    // succeeds but a currently selected model is absent from the new list. It
    // never mutates the selection — the user keeps whatever they picked.
    const [modelsMissingAfterRefresh, setModelsMissingAfterRefresh] = useState<string[]>([]);

    // For Bedrock, don't pass bedrock_config to avoid auto-refresh on input changes
    // We'll build it dynamically in onFocus
    // When is_full_url, pass empty base_url to prevent auto-fetch with the full endpoint URL
    const modelListState = useModeModeList(
      data?.platform || 'gemini',
      isFullUrl ? '' : effectiveBaseUrl,
      isFullUrl ? '' : effectiveApiKey,
      true,
      undefined
    );

    // Re-fetch the model list after the user edits the Base URL. This is
    // strictly non-destructive: it only refreshes the dropdown candidates and
    // never resets the selected model(s). The most common reason to edit a
    // provider is "same models, new endpoint", and mid-edit / unauthenticated
    // states make fetches fail often — so we never clear the selection based on
    // a refresh result. When the refresh succeeds and a selected model is
    // missing from the new list we surface a passive hint only.
    const handleBaseUrlBlur = async () => {
      // is_full_url providers don't fetch a model list (the endpoint is a full
      // chat URL, not a base), so there is nothing to refresh — mirror onFocus.
      if (isFullUrl || isBedrock) return;

      const nextBaseUrl = form.getFieldValue('base_url') as string | undefined;
      const apiKey = (form.getFieldValue('api_key') as string | undefined) ?? '';
      // Backend requires an api_key for non-bedrock platforms; without one a
      // fetch would just return empty — skip and clear any stale hint.
      if (!apiKey) {
        setModelsMissingAfterRefresh([]);
        return;
      }

      const selected = form.getFieldValue('model') as string | string[] | undefined;
      const selectedModels = (Array.isArray(selected) ? selected : selected ? [selected] : []).filter(Boolean);

      try {
        const res = await ipcBridge.mode.fetchModelList.invoke({
          base_url: nextBaseUrl,
          api_key: apiKey,
          try_fix: true,
          platform: data?.platform || 'gemini',
        });
        const models = res.models.map((v) =>
          typeof v === 'string' ? { label: v, value: v } : { label: v.name, value: v.id }
        );
        // Refresh the dropdown candidates only — selection is untouched.
        void modelListState.mutate({ models }, false);

        // An empty list almost always means the fetch didn't really succeed
        // (bad URL / unauthenticated returns no models rather than an error), so
        // treat it like a failure: don't warn, don't touch the selection.
        if (models.length === 0) {
          setModelsMissingAfterRefresh([]);
          return;
        }

        // Genuine success with candidates: warn (without changing anything) if a
        // selected model is not among the freshly fetched ones.
        const available = new Set(models.map((m) => m.value));
        const missing = selectedModels.filter((m) => !available.has(m));
        setModelsMissingAfterRefresh(missing);
      } catch {
        // Fetch failed (bad URL, auth not ready, network): do NOT show the hint
        // and do NOT touch the selection — a genuine failure is surfaced later
        // when the user actually sends a message.
        setModelsMissingAfterRefresh([]);
      }
    };

    useEffect(() => {
      if (data) {
        form.setFieldsValue({
          ...data,
          model:
            data.models && data.models.length > 0
              ? data.models.length === 1
                ? data.models[0]
                : data.models
              : undefined,
          bedrockAuthMethod: data.bedrock_config?.auth_method || 'accessKey',
          bedrockRegion: data.bedrock_config?.region || 'us-east-1',
          bedrockAccessKeyId: data.bedrock_config?.access_key_id || '',
          bedrockSecretAccessKey: data.bedrock_config?.secret_access_key || '',
          bedrockProfile: data.bedrock_config?.profile || '',
        });
      }
    }, [data, form]);

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
              // Ensure models is always an array
              models: Array.isArray(values.model) ? values.model : [values.model],
            };

            // Add Bedrock configuration if platform is Bedrock
            if (isBedrock) {
              updatedProvider.bedrock_config = {
                auth_method: values.bedrockAuthMethod,
                region: values.bedrockRegion,
                ...(values.bedrockAuthMethod === 'accessKey'
                  ? {
                      access_key_id: values.bedrockAccessKeyId,
                      secret_access_key: values.bedrockSecretAccessKey,
                    }
                  : {
                      profile: values.bedrockProfile,
                    }),
              };
            }

            props.onChange(updatedProvider);
            modalCtrl.close();
          } catch {
            // Validation failed — Arco Form highlights invalid fields automatically
          }
        }}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        {messageContext}
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

            {/* Base URL */}
            <Form.Item
              hidden={isBedrock}
              label={
                <span className='inline-flex items-center gap-4px'>
                  {t('settings.apiEndpoint', 'API 请求地址')}
                  {isFullUrl && (
                    <Tag size='small' color='arcoblue'>
                      {t('settings.fullUrl', '完整URL')}
                    </Tag>
                  )}
                </span>
              }
              required={data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai' && !isBedrock}
              rules={[{ required: data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai' && !isBedrock }]}
              field={'base_url'}
            >
              <Input onBlur={handleBaseUrlBlur} />
            </Form.Item>
            {modelsMissingAfterRefresh.length > 0 && (
              <div className='text-11px text-t-secondary -mt-8px mb-12px'>
                {t('settings.modelNotFoundAfterUrlChange', { model: modelsMissingAfterRefresh.join(', ') })}
              </div>
            )}

            <Form.Item
              hidden={isBedrock}
              label={t('settings.apiKey')}
              required={!isBedrock}
              rules={[{ required: !isBedrock }]}
              field={'api_key'}
              extra={<div className='text-11px text-t-secondary mt-2'>💡 {t('settings.multiApiKeyEditTip')}</div>}
            >
              <Input.TextArea rows={4} placeholder={t('settings.apiKeyPlaceholder')} />
            </Form.Item>

            {/* AWS Bedrock Authentication Method */}
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

            {/* AWS Region */}
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

            {/* Access Key ID */}
            <Form.Item
              hidden={!isBedrock || bedrockAuthMethod !== 'accessKey'}
              label={t('settings.bedrock.accessKeyId')}
              field={'bedrockAccessKeyId'}
              required={isBedrock && bedrockAuthMethod === 'accessKey'}
              rules={[{ required: isBedrock && bedrockAuthMethod === 'accessKey' }]}
            >
              <Input.Password placeholder='AKIA...' visibilityToggle />
            </Form.Item>

            {/* Secret Access Key */}
            <Form.Item
              hidden={!isBedrock || bedrockAuthMethod !== 'accessKey'}
              label={t('settings.bedrock.secretAccessKey')}
              field={'bedrockSecretAccessKey'}
              required={isBedrock && bedrockAuthMethod === 'accessKey'}
              rules={[{ required: isBedrock && bedrockAuthMethod === 'accessKey' }]}
            >
              <Input.Password visibilityToggle />
            </Form.Item>

            {/* AWS Profile */}
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

            {/* Model Selection */}
            <Form.Item
              label={t('settings.modelName')}
              field={'model'}
              required
              rules={[{ required: true }]}
              validateStatus={!isFullUrl && modelListState.error ? 'error' : undefined}
              help={
                !isFullUrl && modelListState.error instanceof Error
                  ? modelListState.error.message
                  : !isFullUrl && modelListState.error
                    ? String(modelListState.error)
                    : undefined
              }
            >
              <Select
                loading={!isFullUrl && modelListState.isLoading}
                showSearch
                allowCreate
                mode={data?.models && data.models.length > 1 ? 'multiple' : undefined}
                onFocus={async () => {
                  if (isFullUrl) return;
                  // For Bedrock, build bedrock_config from current form values and fetch models
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
                    // Build bedrock_config and fetch models manually
                    const bedrock_config = {
                      auth_method: values.bedrockAuthMethod,
                      region: values.bedrockRegion,
                      ...(values.bedrockAuthMethod === 'accessKey'
                        ? {
                            access_key_id: values.bedrockAccessKeyId,
                            secret_access_key: values.bedrockSecretAccessKey,
                          }
                        : {
                            profile: values.bedrockProfile,
                          }),
                    };
                    try {
                      const res = await ipcBridge.mode.fetchModelList.invoke({
                        platform: data?.platform || 'bedrock',
                        api_key: '',
                        bedrock_config,
                      });
                      const models =
                        res.models.map((v) => {
                          if (typeof v === 'string') {
                            return { label: v, value: v };
                          } else {
                            return { label: v.name, value: v.id };
                          }
                        }) || [];
                      // Update the model list state manually
                      void modelListState.mutate({ models }, false);
                    } catch (error: any) {
                      message.error(error.message || 'Failed to fetch models');
                    }
                    return;
                  }
                  void modelListState.mutate();
                }}
                options={isFullUrl ? [] : modelListState.data?.models || []}
              />
            </Form.Item>
          </Form>
        </div>
      </AionModal>
    );
  }
);

export default EditModeModal;
