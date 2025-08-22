import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { Gemini, Info, LinkCloud, System, Theme } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useThemeColors, useTextColor, useIconColor } from '../../themes/index';

const SettingsSider: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const themeColors = useThemeColors();
  const getTextColor = useTextColor();
  const getIconColor = useIconColor();

  const menus = useMemo(() => {
    return [
      {
        label: t('settings.gemini'),
        icon: <Gemini />,
        path: 'gemini',
        i18nKey: 'settings.gemini',
      },
      {
        label: t('settings.model'),
        icon: <LinkCloud />,
        path: 'model',
        i18nKey: 'settings.model',
      },
      {
        label: t('settings.theme.title'),
        icon: <Theme />,
        path: 'theme',
        i18nKey: 'settings.theme.title',
      },
      {
        label: t('settings.system'),
        icon: <System />,
        path: 'system',
        i18nKey: 'settings.system',
      },
      {
        label: t('settings.about'),
        icon: <Info />,
        path: 'about',
        i18nKey: 'settings.about',
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
            className={classNames('px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden group shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px')}
            style={{
              backgroundColor: isSelected ? themeColors.surfaceSelected : 'transparent',
              color: getTextColor(item.i18nKey, 'textPrimary'),
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = themeColors.surfaceHover;
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
            onClick={() => {
              navigate(`/settings/${item.path}`);
            }}
          >
            {React.cloneElement(item.icon, {
              theme: 'outline',
              size: '20',
              className: 'mt-2px ml-2px mr-8px flex',
              fill: getIconColor(item.i18nKey, 'primary'),
            })}
            <FlexFullContainer className='h-24px'>
              <div className='text-nowrap overflow-hidden inline-block w-full text-14px lh-24px whitespace-nowrap' style={{ color: 'inherit' }}>
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
