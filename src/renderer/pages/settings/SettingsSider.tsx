import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Computer, Gemini, Info, LinkCloud, System, Toolkit, Robot, Earth } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@arco-design/web-react';

const SettingsSider: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pathname } = useLocation();

  // 检测是否在 Electron 桌面环境 / Check if running in Electron desktop environment
  const isDesktop = isElectronDesktop();

  const menus = useMemo(() => {
    const items = [
      {
        label: t('settings.gemini'),
        icon: <Gemini />,
        path: 'gemini',
      },
      {
        label: t('settings.model'),
        icon: <LinkCloud />,
        path: 'model',
      },
      {
        label: t('settings.assistants', { defaultValue: 'Assistants' }),
        icon: <Robot />,
        path: 'agent',
      },
      {
        label: t('settings.tools'),
        icon: <Toolkit />,
        path: 'tools',
      },
      {
        label: t('settings.display'),
        icon: <Computer />,
        path: 'display',
      },
    ];

    // 仅在桌面端添加 WebUI 选项（包含 Assistant 配置）/ Only add WebUI option on desktop (includes Assistant config)
    if (isDesktop) {
      items.push({
        label: t('settings.webui'),
        icon: <Earth />,
        path: 'webui',
      });
    }

    items.push(
      {
        label: t('settings.system'),
        icon: <System />,
        path: 'system',
      },
      {
        label: t('settings.about'),
        icon: <Info />,
        path: 'about',
      }
    );

    return items;
  }, [t, isDesktop]);
  return (
    <div className={classNames('flex-1 settings-sider flex flex-col gap-2px', { 'settings-sider--collapsed': collapsed })}>
      {menus.map((item) => {
        const isSelected = pathname.includes(item.path);
        return (
          <Tooltip key={item.path} disabled={!collapsed} content={item.label} position='right'>
            <div
              className={classNames('settings-sider__item hover:bg-aou-1 px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden group shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px', {
                '!bg-aou-2 ': isSelected,
              })}
              onClick={() => {
                Promise.resolve(navigate(`/settings/${item.path}`, { replace: true })).catch((error) => {
                  console.error('Navigation failed:', error);
                });
              }}
            >
              {React.cloneElement(item.icon, {
                theme: 'outline',
                size: '20',
                className: 'mt-2px ml-2px mr-8px flex',
              })}
              <FlexFullContainer className='h-24px'>
                <div className='settings-sider__item-label text-nowrap overflow-hidden inline-block w-full text-14px lh-24px whitespace-nowrap text-t-primary'>{item.label}</div>
              </FlexFullContainer>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

export default SettingsSider;
