import { ArrowCircleLeft, Plus, SettingTwo } from '@icon-park/react';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import WorkspaceGroupedHistory from './pages/conversation/WorkspaceGroupedHistory';
import SettingsSider from './pages/settings/SettingsSider';
import { iconColors } from './theme/colors';
import { Tooltip } from '@arco-design/web-react';
import { usePreviewContext } from './pages/conversation/preview';

interface SiderProps {
  onSessionClick?: () => void;
  collapsed?: boolean;
}

const Sider: React.FC<SiderProps> = ({ onSessionClick, collapsed = false }) => {
  const location = useLocation();
  const { pathname, search, hash } = location;

  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closePreview } = usePreviewContext();
  const isSettings = pathname.startsWith('/settings');
  const lastNonSettingsPathRef = useRef('/guid');

  useEffect(() => {
    if (!pathname.startsWith('/settings')) {
      lastNonSettingsPathRef.current = `${pathname}${search}${hash}`;
    }
  }, [pathname, search, hash]);

  const handleSettingsClick = () => {
    if (isSettings) {
      const target = lastNonSettingsPathRef.current || '/guid';
      Promise.resolve(navigate(target)).catch((error) => {
        console.error('Navigation failed:', error);
      });
    } else {
      Promise.resolve(navigate('/settings/gemini')).catch((error) => {
        console.error('Navigation failed:', error);
      });
    }
    if (onSessionClick) {
      onSessionClick();
    }
  };
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
                closePreview();
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
          <WorkspaceGroupedHistory collapsed={collapsed} onSessionClick={onSessionClick}></WorkspaceGroupedHistory>
        </>
      )}
      <Tooltip disabled={!collapsed} content={isSettings ? t('common.back') : t('common.settings')} position='right'>
        <div onClick={handleSettingsClick} className='flex items-center justify-start gap-10px px-12px py-8px hover:bg-hover rd-0.5rem mb-8px cursor-pointer'>
          {isSettings ? <ArrowCircleLeft className='flex' theme='outline' size='24' fill={iconColors.primary} /> : <SettingTwo className='flex' theme='outline' size='24' fill={iconColors.primary} />}
          <span className='collapsed-hidden text-t-primary'>{isSettings ? t('common.back') : t('common.settings')}</span>
        </div>
      </Tooltip>
    </div>
  );
};

export default Sider;
