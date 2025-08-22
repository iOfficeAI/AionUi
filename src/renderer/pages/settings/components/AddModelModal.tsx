import type { IModel } from '@/common/storage';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Modal, Select } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useModeModeList from '../../../hooks/useModeModeList';
import { useThemeColors, useTextColor } from '../../../themes/index';

const AddModelModal = ModalHOC<{ data?: IModel; onSubmit: (model: IModel) => void }>(({ modalProps, data, onSubmit }) => {
  const { t } = useTranslation();
  const themeColors = useThemeColors();
  const getTextColor = useTextColor();
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
      style={{
        backgroundColor: themeColors.surface,
        color: getTextColor('settings.addModel', 'textPrimary'),
      }}
      okButtonProps={{
        disabled: !model,
        style: {
          backgroundColor: themeColors.primary,
          borderColor: themeColors.primary,
          color: '#FFFFFF',
        },
      }}
      cancelButtonProps={{
        style: {
          backgroundColor: themeColors.surface,
          borderColor: themeColors.border,
          color: getTextColor('settings.addModel.cancel', 'textPrimary'),
        },
      }}
      onOk={() => {
        const updatedData = { ...data, model: [...(data?.model || []), model] };
        onSubmit(updatedData);
      }}
    >
      <Select
        showSearch
        options={optionsList}
        loading={isLoading}
        onChange={setModel}
        value={model}
        style={{
          backgroundColor: themeColors.surface,
          color: getTextColor('settings.addModel.select', 'textPrimary'),
        }}
      ></Select>
    </Modal>
  );
});

export default AddModelModal;
