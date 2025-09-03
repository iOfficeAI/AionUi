import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { Gemini, Info, LinkCloud, System, Theme, Toolkit } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

const SettingsSider: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const menus = useMemo(() => {
    return [
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
        label: t('settings.tools'),
        icon: <Toolkit />,
        path: 'tools',
      },
      {
        label: t('settings.system'),
        icon: <System />,
        path: 'system',
      },
      {
        label: t('settings.theme'),
        icon: <Theme />,
        path: 'theme',
      },
      {
        label: t('settings.about'),
        icon: <Info />,
        path: 'about',
      },
    ];
  }, [t]);
  return (
    <div className='flex-1'>
      {menus.map((item) => {
        const isSelected = pathname.includes(item.path);
        return (
          <div
            key={item.path}
            data-app-style='o-slider-menu'
            data-app-state={isSelected ? 'active' : undefined}
            className={classNames(' px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden group shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px', {
              '': isSelected,
            })}
            onClick={() => {
              navigate(`/settings/${item.path}`);
            }}
          >
            {React.cloneElement(item.icon, {
              theme: 'outline',
              size: '20',
              className: 'mt-2px ml-2px mr-8px flex',
            })}
            <FlexFullContainer className='h-24px'>
              <div className='text-nowrap overflow-hidden inline-block w-full text-14px lh-24px  whitespace-nowrap' data-i18n-key={`settings.${item.path}`}>
                {item.label}
              </div>
            </FlexFullContainer>
          </div>
        );
      })}
    </div>
  );
};

export default SettingsSider;
