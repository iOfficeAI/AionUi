import { ipcBridge } from '@/common';
import { Divider, Typography } from '@arco-design/web-react';
import { Github, Right } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import packageJson from '../../../../package.json';
import SettingContainer from './components/SettingContainer';

const About: React.FC = () => {
  const { t } = useTranslation();

  const openLink = async (url: string) => {
    try {
      await ipcBridge.shell.openExternal.invoke(url);
    } catch (error) {
      console.log('Failed to open link:', error);
    }
  };

  const linkItems = [
    {
      title: t('settings.helpDocumentation'),
      url: 'https://github.com/iOfficeAI/AionUi/wiki',
      icon: <Right theme='outline' size='16' />,
    },
    {
      title: t('settings.updateLog'),
      url: 'https://github.com/iOfficeAI/AionUi/releases',
      icon: <Right theme='outline' size='16' />,
    },
    {
      title: t('settings.feedback'),
      url: 'https://github.com/iOfficeAI/AionUi/issues',
      icon: <Right theme='outline' size='16' />,
    },
    {
      title: t('settings.contactMe'),
      url: 'https://x.com/WailiVery',
      icon: <Right theme='outline' size='16' />,
    },
    {
      title: t('settings.officialWebsite'),
      url: 'https://www.aionui.com',
      icon: <Right theme='outline' size='16' />,
    },
  ];

  return (
    <SettingContainer title={t('settings.about')} bodyContainer>
      <div className='flex flex-col'>
        {/* 应用信息区域 */}
        <div className='flex flex-col items-center -mt-16px pb-8px'>
          <Typography.Title heading={3} className='text-24px font-bold text-gray-800 mb-4px'>
            AionUi
          </Typography.Title>
          <Typography.Text className='text-14px text-gray-600 mb-6px text-center'>{t('settings.appDescription')}</Typography.Text>
          <div className='flex items-center justify-center gap-6px'>
            <span className='px-8px py-2px rounded-6px text-12px bg-gray-100 text-gray-700'>v{packageJson.version}</span>
            <div className='text-black cursor-pointer hover:text-gray-600 transition-colors' onClick={() => openLink('https://github.com/iOfficeAI/AionUi').catch((error) => console.error('Failed to open link:', error))}>
              <Github theme='outline' size='20' />
            </div>
          </div>
        </div>

        {/* 分割线 */}
        <Divider className='my-16px' />

        {/* 链接区域 */}
        <div className='space-y-4px pt-8px pb-8px'>
          {linkItems.map((item, index) => (
            <div
              key={index}
              className='flex items-center justify-between p-12px rounded-8px hover:bg-gray-50 hover:shadow-sm transition-all cursor-pointer'
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openLink(item.url).catch((error) => console.error('Failed to open link:', error));
              }}
            >
              <Typography.Text className='text-14px text-gray-700'>{item.title}</Typography.Text>
              <div className='text-gray-400 hover:text-gray-600 transition-colors'>{item.icon}</div>
            </div>
          ))}
        </div>
      </div>
    </SettingContainer>
  );
};

export default About;
