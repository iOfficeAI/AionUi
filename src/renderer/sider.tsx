import { ArrowCircleLeft, Plus, SettingTwo, SettingConfig } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import ChatHistory from './pages/conversation/ChatHistory';
import SettingsSider from './pages/settings/SettingsSider';
import { iconColors } from './theme/colors';
import { Tooltip } from '@arco-design/web-react';
<<<<<<< HEAD
import { useSettingsModal } from './components/SettingsModal/useSettingsModal';
=======
>>>>>>> origin/main

const Sider: React.FC<{ onSessionClick?: () => void; collapsed?: boolean }> = ({ onSessionClick, collapsed = false }) => {
  const { pathname } = useLocation();

  const { t } = useTranslation();
  const navigate = useNavigate();
  const isSettings = pathname.startsWith('/settings');
  const { openSettings, settingsModal } = useSettingsModal();
  return (
    <div className='size-full flex flex-col'>
      {isSettings ? (
        <SettingsSider collapsed={collapsed}></SettingsSider>
      ) : (
        <>
          <Tooltip disabled={!collapsed} content={t('conversation.welcome.newConversation')} position='right'>
            <div
              className='flex items-center justify-start gap-10px px-12px py-8px hover:bg-hover rd-0.5rem mb-8px cursor-pointer group'
              onClick={() => {
                Promise.resolve(navigate('/guid')).catch((error) => {
                  console.error('Navigation failed:', error);
                });
                // 点击new chat后自动隐藏sidebar / Hide sidebar after starting new chat on mobile
                if (onSessionClick) {
                  onSessionClick();
                }
              }}
            >
              <Plus theme='outline' size='24' fill={iconColors.primary} className='flex' />
              <span className='collapsed-hidden font-bold text-t-primary'>{t('conversation.welcome.newConversation')}</span>
            </div>
          </Tooltip>
          <ChatHistory collapsed={collapsed} onSessionClick={onSessionClick}></ChatHistory>
        </>
      )}
      <Tooltip disabled={!collapsed} content={isSettings ? t('common.back') : t('common.settings')} position='right'>
        <div
          onClick={() => {
<<<<<<< HEAD
            // if (isSettings) {
            //   Promise.resolve(navigate('/guid')).catch((error) => {
            //     console.error('Navigation failed:', error);
            //   });
            //   return;
            // }
            // Promise.resolve(navigate('/settings')).catch((error) => {
            //   console.error('Navigation failed:', error);
            // });
            openSettings();
=======
            if (isSettings) {
              Promise.resolve(navigate('/guid')).catch((error) => {
                console.error('Navigation failed:', error);
              });
              return;
            }
            Promise.resolve(navigate('/settings')).catch((error) => {
              console.error('Navigation failed:', error);
            });
>>>>>>> origin/main
          }}
          className='flex items-center justify-start gap-10px px-12px py-8px hover:bg-hover rd-0.5rem mb-8px cursor-pointer'
        >
          {isSettings ? <ArrowCircleLeft className='flex' theme='outline' size='24' fill={iconColors.primary} /> : <SettingTwo className='flex' theme='outline' size='24' fill={iconColors.primary} />}
          <span className='collapsed-hidden text-t-primary'>{isSettings ? t('common.back') : t('common.settings')}</span>
        </div>
      </Tooltip>
<<<<<<< HEAD

      {/* 渲染设置弹窗 */}
      {settingsModal}
=======
>>>>>>> origin/main
    </div>
  );
};

export default Sider;
