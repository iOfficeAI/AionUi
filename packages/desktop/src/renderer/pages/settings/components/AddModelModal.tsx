import type { IProvider } from '@/common/config/storage';
import {
  type ModelImageInputChoice,
  type ModelOpenAiApiModeChoice,
  supportsOpenAiApiMode,
  updateModelSettings,
} from '@/common/utils/modelCapabilities';
import ModalHOC from '@/renderer/utils/ui/ModalHOC';
import AionModal from '@/renderer/components/base/AionModal';
import { Select } from '@arco-design/web-react';
import { PreviewOpen } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useModeModeList from '@renderer/hooks/agent/useModeModeList';
import {
  isNewApiPlatform,
  NEW_API_PROTOCOL_OPTIONS,
  detectNewApiProtocol,
} from '@/renderer/utils/model/modelPlatforms';

const AddModelModal = ModalHOC<{ data?: IProvider; model?: string; onSubmit: (model: IProvider) => void }>(
  ({ modalProps, data, model: editingModel, onSubmit, modalCtrl }) => {
    const { t } = useTranslation();
    const [models, setModels] = useState<string[]>([]);
    const [modelProtocol, setModelProtocol] = useState<string>('openai');
    const [imageInput, setImageInput] = useState<ModelImageInputChoice>('auto');
    const [openAiApiMode, setOpenAiApiMode] = useState<ModelOpenAiApiModeChoice>('auto');
    const isNewApi = isNewApiPlatform(data?.platform ?? '');
    const isEditing = Boolean(editingModel);
    const { data: modelList, isLoading } = useModeModeList(data?.platform, data?.base_url, data?.api_key);
    const existingModels = data?.models || [];
    const showOpenAiApiMode = supportsOpenAiApiMode(data?.platform ?? '', modelProtocol);
    const optionsList = useMemo(() => {
      // 处理新的数据格式，可能包含 fix_base_url
      const fetchedModels = Array.isArray(modelList) ? modelList : modelList?.models || [];
      if (!fetchedModels || !data?.models) return fetchedModels;
      return fetchedModels.map((item) => {
        return { ...item, disabled: data.models.includes(item.value) };
      });
    }, [modelList, data?.models]);

    useEffect(() => {
      if (!modalProps.visible) return;

      setModels([]);
      const settings = editingModel ? data?.model_settings?.[editingModel] : undefined;
      setImageInput(settings?.image_input ?? 'auto');
      setOpenAiApiMode(settings?.openai_api_mode ?? 'auto');
      setModelProtocol(editingModel ? (data?.model_protocols?.[editingModel] ?? 'openai') : 'openai');
    }, [data, editingModel, modalProps.visible]);

    const handleConfirm = useCallback(() => {
      if (!data || (!editingModel && !models.length)) return;
      const targetModels = editingModel ? [editingModel] : models;
      const updatedData: IProvider = {
        ...data,
        models: editingModel ? existingModels : [...existingModels, ...models],
        model_settings: updateModelSettings(
          data.model_settings,
          targetModels,
          imageInput,
          showOpenAiApiMode ? openAiApiMode : 'auto'
        ),
      };

      // new-api 平台：为每个选中的模型添加协议配置 / new-api platform: add protocol config for every selected model
      if (isNewApi) {
        updatedData.model_protocols = {
          ...data?.model_protocols,
          ...Object.fromEntries(targetModels.map((model) => [model, modelProtocol])),
        };
      }

      onSubmit(updatedData);
      modalCtrl.close();
    }, [
      data,
      editingModel,
      existingModels,
      imageInput,
      isNewApi,
      modelProtocol,
      models,
      onSubmit,
      openAiApiMode,
      modalCtrl,
      showOpenAiApiMode,
    ]);

    return (
      <AionModal
        variant='standard'
        visible={modalProps.visible}
        onCancel={modalCtrl.close}
        header={{ title: t(isEditing ? 'settings.configureModel' : 'settings.addModel'), showClose: true }}
        onOk={handleConfirm}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !isEditing && !models.length }}
      >
        <div className='flex flex-col gap-16px'>
          {isEditing ? (
            <div className='space-y-8px'>
              <div className='text-13px font-500 text-t-secondary'>{t('settings.modelName')}</div>
              <div className='text-14px text-t-primary'>{editingModel}</div>
            </div>
          ) : (
            <div className='space-y-8px'>
              <div className='text-13px font-500 text-t-secondary'>{t('settings.addModelPlaceholder')}</div>
              <Select
                mode='multiple'
                showSearch
                options={optionsList}
                loading={isLoading}
                onChange={(value: string[]) => {
                  setModels(value);
                  // new-api 平台：以最后选中的模型推断协议 / new-api: infer protocol from the last picked model
                  if (isNewApi && value.length > 0) setModelProtocol(detectNewApiProtocol(value[value.length - 1]));
                }}
                value={models}
                allowCreate
                placeholder={t('settings.addModelPlaceholder')}
              />
            </div>
          )}

          {/* New API 协议选择 / New API Protocol Selection */}
          {isNewApi && (
            <div className='space-y-8px'>
              <div className='text-13px font-500 text-t-secondary'>{t('settings.modelProtocol')}</div>
              <Select
                value={modelProtocol}
                onChange={setModelProtocol}
                options={NEW_API_PROTOCOL_OPTIONS}
                triggerProps={{ getPopupContainer: (node) => node.parentElement || document.body }}
              />
              <div className='text-11px text-t-secondary leading-4'>{t('settings.modelProtocolTip')}</div>
            </div>
          )}

          <div className='space-y-8px'>
            <div className='flex items-center gap-5px text-13px font-500 text-t-secondary'>
              <PreviewOpen theme='outline' size='14' />
              <span>{t('settings.imageInput')}</span>
            </div>
            <Select
              value={imageInput}
              onChange={(value) => setImageInput(value as ModelImageInputChoice)}
              options={[
                { label: t('settings.imageInputAuto'), value: 'auto' },
                { label: t('settings.imageInputSupported'), value: 'supported' },
                { label: t('settings.imageInputUnsupported'), value: 'unsupported' },
              ]}
            />
            <div className='text-11px text-t-secondary leading-4'>{t('settings.imageInputTip')}</div>
          </div>

          {showOpenAiApiMode && (
            <div className='space-y-8px'>
              <div className='text-13px font-500 text-t-secondary'>{t('settings.openAiApiMode')}</div>
              <Select
                value={openAiApiMode}
                onChange={(value) => setOpenAiApiMode(value as ModelOpenAiApiModeChoice)}
                options={[
                  { label: t('settings.modelSettingAuto'), value: 'auto' },
                  { label: t('settings.openAiApiModeChatCompletions'), value: 'chat_completions' },
                  { label: t('settings.openAiApiModeResponses'), value: 'responses' },
                ]}
              />
              <div className='text-11px text-t-secondary leading-4'>{t('settings.openAiApiModeTip')}</div>
            </div>
          )}

          {!isEditing && models.length > 1 && (
            <div className='text-11px text-t-secondary leading-4'>{t('settings.modelSettingsApplyToSelected')}</div>
          )}
        </div>
      </AionModal>
    );
  }
);

export default AddModelModal;
