import type { IModel } from '@/common/storage';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input, Modal } from '@arco-design/web-react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTextColor } from '../../../themes/index';

const EditModeModal = ModalHOC<{ data?: IModel; onChange(data: IModel): void }>(({ modalProps, modalCtrl, ...props }) => {
  const { t } = useTranslation();
  const getTextColor = useTextColor();
  const { data } = props;
  const [form] = Form.useForm();
  useEffect(() => {
    if (data) {
      form.setFieldsValue(data);
    }
  }, [data]);
  return (
    <Modal
      title={t('settings.editModel')}
      {...modalProps}
      onOk={() => {
        form.validate().then((values) => {
          props.onChange({ ...(data || {}), ...values });
        });
      }}
    >
      <Form form={form}>
        <Form.Item label={<span style={{ color: getTextColor('settings.platformName', 'textPrimary') }}>{t('settings.platformName')}</span>} required rules={[{ required: true }]} field={'name'} disabled={data?.platform !== 'custom'}>
          <Input></Input>
        </Form.Item>
        <Form.Item label={<span style={{ color: getTextColor('settings.baseUrl', 'textPrimary') }}>{t('settings.baseUrl')}</span>} required rules={[{ required: true }]} field={'baseUrl'} disabled>
          <Input></Input>
        </Form.Item>
        <Form.Item label={<span style={{ color: getTextColor('settings.apiKey', 'textPrimary') }}>{t('settings.apiKey')}</span>} required rules={[{ required: true }]} field={'apiKey'}>
          <Input></Input>
        </Form.Item>
      </Form>
    </Modal>
  );
});

export default EditModeModal;
