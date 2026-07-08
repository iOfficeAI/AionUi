import type { IProvider } from '@/common/config/storage';
import ModalHOC from '@/renderer/utils/ui/ModalHOC';
import AionModal from '@/renderer/components/base/AionModal';
import { Select } from '@arco-design/web-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useModeModeList from '@renderer/hooks/agent/useModeModeList';
import {
  isNewApiPlatform,
  NEW_API_PROTOCOL_OPTIONS,
  detectNewApiProtocol,
} from '@/renderer/utils/model/modelPlatforms';

const AddModelModal = ModalHOC<{ data?: IProvider; onSubmit: (model: IProvider) => void }>(
  ({ modalProps, data, onSubmit, modalCtrl }) => {
    const { t } = useTranslation();
    const [models, setModels] = useState<string[]>([]);
    const [modelProtocol, setModelProtocol] = useState<string>('openai');
    const isNewApi = isNewApiPlatform(data?.platform ?? '');
    const { data: modelList, isLoading } = useModeModeList(data?.platform, data?.base_url, data?.api_key);
    const existingModels = data?.models || [];
    const optionsList = useMemo(() => {
      // 处理新的数据格式，可能包含 fix_base_url
      const models = Array.isArray(modelList) ? modelList : modelList?.models || [];
      if (!models || !data?.models) return models;
      return models.map((item) => {
        return { ...item, disabled: data.models.includes(item.value) };
      });
    }, [modelList, data?.models]);

    const handleConfirm = useCallback(() => {
      if (!models.length) return;
      const updatedData: IProvider = { ...data, models: [...existingModels, ...models] };

      // new-api 平台：为每个选中的模型添加协议配置 / new-api platform: add protocol config for every selected model
      if (isNewApi) {
        updatedData.model_protocols = {
          ...data?.model_protocols,
          ...Object.fromEntries(models.map((m) => [m, modelProtocol])),
        };
      }

      onSubmit(updatedData);
      modalCtrl.close();
    }, [data, existingModels, models, modelProtocol, isNewApi, onSubmit, modalCtrl]);

    return (
      <AionModal
        variant='standard'
        visible={modalProps.visible}
        onCancel={modalCtrl.close}
        header={{ title: t('settings.addModel'), showClose: true }}
        onOk={handleConfirm}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !models.length }}
      >
        <div className='flex flex-col gap-16px'>
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
            ></Select>
          </div>

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
        </div>
      </AionModal>
    );
  }
);

export default AddModelModal;
