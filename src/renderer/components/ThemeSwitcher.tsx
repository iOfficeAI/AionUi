import { useThemeContext } from '@/renderer/context/ThemeContext';
import { Select } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

export const ThemeSwitcher = () => {
  const { theme, setTheme } = useThemeContext();
  const { t } = useTranslation();

  return (
    <div className='flex items-center gap-8px'>
      {/* Light/Dark mode selector 明暗模式选择器 */}
      <Select value={theme} onChange={setTheme} style={{ width: 100 }} size='small'>
        <Select.Option value='light'>{t('settings.lightMode')}</Select.Option>
        <Select.Option value='dark'>{t('settings.darkMode')}</Select.Option>
      </Select>
    </div>
  );
};
