import { IModel } from '@/common/storage';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input, Modal } from '@arco-design/web-react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const EditModeModal = ModalHOC<{ data?: IModel; onChange(data: IModel): void }>(({ modalProps, modalCtrl, ...props }) => {
  const { t } = useTranslation();
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
        <Form.Item label={t('settings.platformName')} required rules={[{ required: true }]} field={'name'} disabled>
          <Input></Input>
        </Form.Item>
        <Form.Item label={t('settings.baseUrl')} required rules={[{ required: true }]} field={'baseUrl'} disabled>
          <Input></Input>
        </Form.Item>
        <Form.Item label={t('settings.apiKey')} required rules={[{ required: true }]} field={'apiKey'}>
          <Input></Input>
        </Form.Item>
      </Form>
    </Modal>
  );
});

export default EditModeModal;
