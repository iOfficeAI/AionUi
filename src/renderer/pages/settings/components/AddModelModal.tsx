import { IModel } from '@/common/storage';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Modal, Select } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useModeModeList from '../../../hooks/useModeModeList';

const AddModelModal = ModalHOC<{ data?: IModel; onSubmit: (model: IModel) => void }>(({ modalProps, data, onSubmit }) => {
  const { t } = useTranslation();
  const [model, setModel] = useState('');
  const { data: modelList, isLoading } = useModeModeList(data?.platform, data?.baseUrl, data?.apiKey);
  const optionsList = useMemo(() => {
    // 处理新的数据格式，可能包含 fix_base_url
    const models = Array.isArray(modelList) ? modelList : modelList?.models || [];
    if (!models || !data?.model) return models;
    return models.map((item) => {
      return { ...item, disabled: data.model.includes(item.value) };
    });
  }, [modelList, data?.model]);
  return (
    <Modal
      {...modalProps}
      title={t('settings.addModel')}
      okButtonProps={{
        disabled: !model,
      }}
      onOk={() => {
        const updatedData = { ...data, model: [...(data?.model || []), model] };
        // 如果 base_url 被修复了，更新 baseUrl
        if (!Array.isArray(modelList) && modelList?.fix_base_url) {
          updatedData.baseUrl = modelList.fix_base_url;
        }
        onSubmit(updatedData);
      }}
    >
      <Select showSearch options={optionsList} loading={isLoading} onChange={setModel} value={model}></Select>
    </Modal>
  );
});

export default AddModelModal;
