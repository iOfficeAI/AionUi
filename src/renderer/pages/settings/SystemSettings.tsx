import LanguageSwitcher from '@/renderer/components/LanguageSwitcher';
import ThemeSwitcher from '@/renderer/components/ThemeSwitcher';
import { Form } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import SettingContainer from './components/SettingContainer';

const SystemSettings: React.FC = (props) => {
  const { t } = useTranslation();
  return (
    <SettingContainer title={t('settings.system')} bodyContainer>
      <Form
        labelCol={{
          flex: '100px',
        }}
        wrapperCol={{
          flex: '1',
        }}
        className={'[&_.arco-row]:flex-nowrap pl-20px'}
      >
        <Form.Item label={t('settings.language')} field={'language'}>
          <LanguageSwitcher></LanguageSwitcher>
        </Form.Item>
        <Form.Item label={t('settings.theme')} field={'theme'}>
          <ThemeSwitcher></ThemeSwitcher>
        </Form.Item>
      </Form>
    </SettingContainer>
  );
};

export default SystemSettings;
