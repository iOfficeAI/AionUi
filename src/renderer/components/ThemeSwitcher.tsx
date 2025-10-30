import { useThemeContext } from '@/renderer/context/ThemeContext';
import { Select } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const ThemeSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const { theme, setTheme } = useThemeContext();
  // colorScheme 接口已保留，等待设计师提供配色方案后可快速添加

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

export default ThemeSwitcher;
