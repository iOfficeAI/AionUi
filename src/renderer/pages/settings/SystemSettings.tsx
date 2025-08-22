import LanguageSwitcher from '@/renderer/components/LanguageSwitcher';
import { Form } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import SettingContainer from './components/SettingContainer';
import { useTextColor } from '../../themes/index';

const SystemSettings: React.FC = (props) => {
  const { t } = useTranslation();
  const getTextColor = useTextColor();
  return (
    <SettingContainer title={t('settings.system')}>
      <Form
        labelCol={{
          flex: '100px',
        }}
        wrapperCol={{
          flex: '1',
        }}
        className={'[&_.arco-row]:flex-nowrap pl-20px'}
      >
        <Form.Item label={<span style={{ color: getTextColor('settings.language', 'textPrimary') }}>{t('settings.language')}</span>} field={'language'}>
          <LanguageSwitcher></LanguageSwitcher>
        </Form.Item>
      </Form>
    </SettingContainer>
  );
};

export default SystemSettings;
