import { useThemeContext } from '@/renderer/context/ThemeContext';
import AionSelect from '@/renderer/components/base/AionSelect';
import React from 'react';
import { useTranslation } from 'react-i18next';

const ThemeSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const { theme, setTheme } = useThemeContext();
  // colorScheme 接口已保留，等待设计师提供配色方案后可快速添加

  return (
    <div className='flex items-center gap-8px'>
      {/* Light/Dark mode selector 明暗模式选择器 */}
      <AionSelect className='w-160px' value={theme} onChange={setTheme} size='small'>
        <AionSelect.Option value='light'>{t('settings.lightMode')}</AionSelect.Option>
        <AionSelect.Option value='dark'>{t('settings.darkMode')}</AionSelect.Option>
      </AionSelect>
    </div>
  );
};

export default ThemeSwitcher;
