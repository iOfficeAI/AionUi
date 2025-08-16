import { ConfigStorage } from '@/common/storage';
import { Select } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const handleLanguageChange = (value: string) => {
    ConfigStorage.set('language', value);
    i18n.changeLanguage(value);
  };

  return (
    <div className='flex items-center gap-8px'>
      <Select value={i18n.language} onChange={handleLanguageChange} style={{ width: 100 }} size='small'>
        <Select.Option value='zh-CN'>简体中文</Select.Option>
        <Select.Option value='zh-TW'>繁體中文</Select.Option>
        <Select.Option value='ja-JP'>日本語</Select.Option>
        <Select.Option value='en-US'>English</Select.Option>
      </Select>
    </div>
  );
};

export default LanguageSwitcher;
