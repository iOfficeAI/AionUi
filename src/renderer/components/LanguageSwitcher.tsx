import { ConfigStorage } from '@/common/storage';
import AionSelect from '@/renderer/components/base/AionSelect';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();
  const selectRef = useRef<any>(null);

  const handleLanguageChange = useCallback(
    (value: string) => {
      // 切换前先 blur 触发元素，避免弹层和语言切换竞争布局
      // Blur before switching to avoid dropdown and language change fighting for layout
      selectRef.current?.blur?.();

      ConfigStorage.set('language', value).catch((error) => {
        console.error('Failed to save language preference:', error);
      });

      const applyLanguage = () => {
        i18n.changeLanguage(value).catch((error) => {
          console.error('Failed to change language:', error);
        });
      };

      if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
        // 延迟到下一帧执行，确保 DOM 动画已完成 / defer to next frame so DOM animations finish
        window.requestAnimationFrame(() => window.requestAnimationFrame(applyLanguage));
      } else {
        setTimeout(applyLanguage, 0);
      }
    },
    [i18n]
  );

  return (
    <div className='flex items-center gap-8px'>
      <AionSelect ref={selectRef} className='w-160px' value={i18n.language} onChange={handleLanguageChange}>
        <AionSelect.Option value='zh-CN'>简体中文</AionSelect.Option>
        <AionSelect.Option value='zh-TW'>繁體中文</AionSelect.Option>
        <AionSelect.Option value='ja-JP'>日本語</AionSelect.Option>
        <AionSelect.Option value='ko-KR'>한국어</AionSelect.Option>
        <AionSelect.Option value='en-US'>English</AionSelect.Option>
      </AionSelect>
    </div>
  );
};

export default LanguageSwitcher;
