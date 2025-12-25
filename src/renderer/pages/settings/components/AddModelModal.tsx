import type { IProvider } from '@/common/storage';
import ModalHOC from '@/renderer/utils/ModalHOC';
import AionModal from '@/renderer/components/base/AionModal';
import { Button, Select, Tag } from '@arco-design/web-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useModeModeList from '../../../hooks/useModeModeList';

const AddModelModal = ModalHOC<{ data?: IProvider; onSubmit: (model: IProvider) => void }>(({ modalProps, data, onSubmit, modalCtrl }) => {
  const { t } = useTranslation();
  const [model, setModel] = useState('');
  const { data: modelList, isLoading } = useModeModeList(data?.platform, data?.baseUrl, data?.apiKey);
  const existingModels = data?.model || [];
  const optionsList = useMemo(() => {
    // 处理新的数据格式，可能包含 fix_base_url
    const models = Array.isArray(modelList) ? modelList : modelList?.models || [];
    if (!models || !data?.model) return models;
    return models.map((item) => {
      return { ...item, disabled: data.model.includes(item.value) };
    });
  }, [modelList, data?.model]);
  const previewModels = useMemo(() => existingModels.slice(0, 6), [existingModels]);
  const remainingCount = existingModels.length > previewModels.length ? existingModels.length - previewModels.length : 0;

  const handleConfirm = useCallback(() => {
    if (!model) return;
    const updatedData = { ...data, model: [...existingModels, model] };
    onSubmit(updatedData);
    modalCtrl.close();
  }, [data, existingModels, model, onSubmit, modalCtrl]);

  return (
    <AionModal visible={modalProps.visible} onCancel={modalCtrl.close} header={{ title: t('settings.addModel'), showClose: true }} style={{ maxHeight: '90vh' }} contentStyle={{ background: 'var(--bg-1)', borderRadius: 16, padding: '20px 24px', overflow: 'auto' }} onOk={handleConfirm} okText={t('common.confirm')} cancelText={t('common.cancel')} okButtonProps={{ disabled: !model }}>
      <div className='flex flex-col gap-16px pt-20px'>
        <div className='space-y-8px'>
          <div className='text-13px font-500 text-t-secondary'>{t('settings.addModelPlaceholder')}</div>
          <Select showSearch options={optionsList} loading={isLoading} onChange={setModel} value={model} allowCreate placeholder={t('settings.addModelPlaceholder')}></Select>
        </div>

        <div className='space-y-8px'>
          {/* <div className='text-13px font-500 text-t-secondary'>{t('settings.currentModelsLabel')}</div>
          {existingModels.length === 0 ? (
            <div className='text-13px text-t-secondary bg-fill-1 rd-8px px-12px py-14px border border-dashed border-border-2'>{t('settings.addModelNoExisting')}</div>
          ) : (
            <div className='flex flex-wrap gap-8px bg-1 rd-8px px-12px py-10px border border-solid border-border-2'>
              {previewModels.map((item) => (
                <Tag key={item} bordered color='arcoblue' className='text-12px'>
                  {item}
                </Tag>
              ))}
              {remainingCount > 0 && <Tag bordered>{t('settings.addModelMoreCount', { count: remainingCount })}</Tag>}
            </div>
          )} */}
        </div>

        {/* <div className='text-12px tet-t-tertiary leading-5 bg-fill-1 rd-8px px-12px py-10px border border-dashed border-border-2'>{t('settings.addModelTips')}</div> */}
      </div>
      {/* <div className='text-12px text-t-secondary leading-5 my-4'>{model ? t('settings.addModelSelectedHint', { model }) : t('settings.addModelHint')}</div> */}
    </AionModal>
  );
});

export default AddModelModal;
