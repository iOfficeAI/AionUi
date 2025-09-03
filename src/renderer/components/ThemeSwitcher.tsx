import { useTheme } from '@/renderer/themes';
import { Select } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const ThemeSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const { mode, setMode } = useTheme();
  return (
    <div className='flex items-center gap-8px'>
      <Select value={mode} onChange={setMode} style={{ width: 100 }} size='small'>
        <Select.Option value='light'>{t('settings.lightMode')}</Select.Option>
        <Select.Option value='dark'>{t('settings.darkMode')}</Select.Option>
      </Select>
    </div>
  );
};

export default ThemeSwitcher;
