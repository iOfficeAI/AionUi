import type { IProvider } from '@/common/storage';
import ModalHOC from '@/renderer/utils/ModalHOC';
import { Form, Input } from '@arco-design/web-react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import AionModal from '@/renderer/components/base/AionModal';

const EditModeModal = ModalHOC<{ data?: IProvider; onChange(data: IProvider): void }>(({ modalProps, modalCtrl, ...props }) => {
  const { t } = useTranslation();
  const { data } = props;
  const [form] = Form.useForm();

  useEffect(() => {
    if (data) {
      form.setFieldsValue(data);
    }
  }, [data]);
  return (
    <AionModal
      visible={modalProps.visible}
      onCancel={modalCtrl.close}
      header={{ title: t('settings.editModel'), showClose: true }}
      style={{ minHeight: '400px', maxHeight: '90vh', borderRadius: 16 }}
      contentStyle={{ background: 'var(--bg-1)', borderRadius: 16, padding: '20px 24px 16px', overflow: 'auto' }}
      onOk={async () => {
        const values = await form.validate();
        props.onChange({ ...(data || {}), ...values });
        modalCtrl.close();
      }}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
    >
      <div className='py-20px'>
        <Form form={form} layout='vertical'>
          <Form.Item label={t('settings.platformName')} required rules={[{ required: true }]} field={'name'}>
            <Input />
          </Form.Item>
          <Form.Item label={t('settings.baseUrl')} required={data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai'} rules={[{ required: data?.platform !== 'gemini' && data?.platform !== 'gemini-vertex-ai' }]} field={'baseUrl'} disabled>
            <Input></Input>
          </Form.Item>
          <Form.Item label={t('settings.apiKey')} required rules={[{ required: true }]} field={'apiKey'} extra={<div className='text-11px text-t-secondary mt-2'>💡 {t('settings.multiApiKeyEditTip')}</div>}>
            <Input.TextArea rows={4} placeholder={t('settings.apiKeyPlaceholder')} />
          </Form.Item>
        </Form>
      </div>
    </AionModal>
  );
});

export default EditModeModal;
