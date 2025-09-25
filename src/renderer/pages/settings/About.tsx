import { ipcBridge } from '@/common';
import { Form, Divider } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import packageJson from '../../../../package.json';
import SettingContainer from './components/SettingContainer';
import UpdateStatus from '@renderer/pages/settings/update/UpdateStatus';

const About: React.FC = () => {
  const { t } = useTranslation();
  const link = (url: string) => {
    return (
      <a
        href={url}
        target='_blank'
        onClick={(e) => {
          e.preventDefault();
          ipcBridge.shell.openExternal.invoke(url);
        }}
      >
        {url}
      </a>
    );
  };
  return (
    <SettingContainer title={t('settings.about')} bodyContainer>
      <Form
        labelCol={{
          flex: '200px',
        }}
        wrapperCol={{
          flex: '1',
        }}
      >
        <Form.Item label={t('common.website')}>{link('https://www.aionui.com')}</Form.Item>
        <Form.Item label={t('common.version')}>
          <span>{packageJson.version}</span>
        </Form.Item>
        <Form.Item label={t('common.contact')}>{link('https://x.com/WailiVery')}</Form.Item>
        <Form.Item label={t('common.github')}>{link('https://github.com/iOfficeAI/AionUi')}</Form.Item>
      </Form>

      <Divider />

      <div className='mt-24px'>
        <UpdateStatus autoCheckOnMount={false} showVersionInfo={true} showDetailedProgress={true} />
      </div>
    </SettingContainer>
  );
};

export default About;
