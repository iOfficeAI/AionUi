import type { IModel } from '@/common/storage';
import { uuid } from '@/common/utils';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input, Modal } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const AddApiKeyModal = ModalHOC<{
  onSubmit: (platform: IModel) => void;
}>(({ modalProps, onSubmit }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  const handleSubmit = () => {
    form
      .validate()
      .then((values) => {
        onSubmit({
          id: uuid(),
          platform: 'gemini',
          name: 'Gemini API Key',
          baseUrl: '',
          apiKey: values.apiKey,
          model: ['gemini-pro'],
        });
      })
      .catch((e) => {
        console.log('>>>>>>>>>>>>>>>>>>e', e);
      });
  };

  return (
    <Modal {...modalProps} title={t('Add Gemini API Key')} onOk={handleSubmit}>
      <Form form={form}>
        <Form.Item label='API Key' required rules={[{ required: true }]} field={'apiKey'}>
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
});

export default AddApiKeyModal;
