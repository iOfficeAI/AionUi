import { ArrowCircleLeft, Plus, SettingTwo } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import ChatHistory from './pages/conversation/ChatHistory';
import SettingsSider from './pages/settings/SettingsSider';
import { iconColors } from './theme/colors';

const Sider: React.FC = () => {
  const { pathname } = useLocation();

  const { t } = useTranslation();
  const navigate = useNavigate();
  const isSettings = pathname.startsWith('/settings');
  return (
    <div className='size-full flex flex-col'>
      {isSettings ? (
        <SettingsSider></SettingsSider>
      ) : (
        <>
          <div
            className='flex items-center justify-start gap-10px px-12px py-8px hover:bg-hover rd-0.5rem mb-8px cursor-pointer group'
            onClick={() => {
              Promise.resolve(navigate('/guid')).catch((error) => {
                console.error('Navigation failed:', error);
              });
            }}
          >
            <Plus theme='outline' size='24' fill={iconColors.primary} className='flex' />
            <span className='collapsed-hidden font-bold text-t-primary'>{t('conversation.welcome.newConversation')}</span>
          </div>
          <ChatHistory></ChatHistory>
        </>
      )}
      <div
        onClick={() => {
          if (isSettings) {
            Promise.resolve(navigate('/guid')).catch((error) => {
              console.error('Navigation failed:', error);
            });
            return;
          }
          Promise.resolve(navigate('/settings')).catch((error) => {
            console.error('Navigation failed:', error);
          });
        }}
        className='flex items-center justify-start gap-10px px-12px py-8px hover:bg-hover rd-0.5rem mb-8px cursor-pointer'
      >
        {isSettings ? <ArrowCircleLeft className='flex' theme='outline' size='24' fill={iconColors.primary} /> : <SettingTwo className='flex' theme='outline' size='24' fill={iconColors.primary} />}
        <span className='collapsed-hidden text-t-primary'>{isSettings ? t('common.back') : t('common.settings')}</span>
      </div>
    </div>
  );
};

export default Sider;
