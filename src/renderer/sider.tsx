import { ArrowCircleLeft, Plus, SettingTwo } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import ChatHistory from './pages/conversation/ChatHistory';
import SettingsSider from './pages/settings/SettingsSider';
import { useThemeColors, useTextColor } from './themes/index';

const Sider: React.FC = () => {
  const { pathname } = useLocation();
  const themeColors = useThemeColors();
  const getTextColor = useTextColor();

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
            className='flex items-center justify-start gap-10px px-12px py-8px rd-0.5rem mb-8px cursor-pointer group'
            style={{
              color: getTextColor('conversation.welcome.newConversation', 'textPrimary'),
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeColors.sidebarHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              navigate('/guid');
            }}
          >
            <Plus theme='outline' size='24' fill={getTextColor('conversation.welcome.newConversation', 'textSecondary')} className='flex' />
            <span className='collapsed-hidden font-bold'>{t('conversation.welcome.newConversation')}</span>
          </div>
          <ChatHistory></ChatHistory>
        </>
      )}
      <div
        onClick={() => {
          if (isSettings) return navigate('/guid');
          navigate('/settings');
        }}
        className='flex items-center justify-start gap-10px px-12px py-8px rd-0.5rem mb-8px cursor-pointer'
        style={{
          color: getTextColor(isSettings ? 'common.back' : 'common.settings', 'textPrimary'),
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = themeColors.sidebarHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {isSettings ? <ArrowCircleLeft className='flex' theme='outline' size='24' fill={getTextColor('common.back', 'textSecondary')} /> : <SettingTwo className='flex' theme='outline' size='24' fill={getTextColor('common.settings', 'textSecondary')} />}
        <span className='collapsed-hidden'>{isSettings ? t('common.back') : t('common.settings')}</span>
      </div>
    </div>
  );
};

export default Sider;
