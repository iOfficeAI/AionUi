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
    if (!modelList || !data?.model) return modelList || [];
    return modelList.map((item) => {
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
        onSubmit({ ...data, model: [...(data?.model || []), model] });
      }}
    >
      <Select showSearch options={optionsList} loading={isLoading} onChange={setModel} value={model}></Select>
    </Modal>
  );
});

export default AddModelModal;
