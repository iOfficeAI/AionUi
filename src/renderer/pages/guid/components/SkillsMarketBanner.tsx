/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { openExternalUrl } from '@/renderer/utils/platform';
import { Message, Switch } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const SKILLS_MARKET_DETAILS_ZH = 'https://github.com/iOfficeAI/AionUi/discussions/1326';
const SKILLS_MARKET_DETAILS_EN = 'https://github.com/iOfficeAI/AionUi/discussions/1325';

const SkillsMarketBanner: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    void ConfigStorage.get('skillsMarket.enabled').then((val) => {
      setEnabled(!!val);
      setInitialized(true);
    });
  }, []);

  const handleToggle = useCallback(
    async (checked: boolean) => {
      if (loading) return;
      setLoading(true);
      try {
        const result = checked
          ? await ipcBridge.fs.enableSkillsMarket.invoke()
          : await ipcBridge.fs.disableSkillsMarket.invoke();

        if (result?.success) {
          setEnabled(checked);
          await ConfigStorage.set('skillsMarket.enabled', checked);
        } else {
          Message.error(result?.msg || 'Operation failed');
        }
      } catch (error) {
        console.error('Failed to toggle Skills Market:', error);
        Message.error('Operation failed');
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  const handleOpenDetails = useCallback(async () => {
    try {
      const url = i18n.language.startsWith('zh') ? SKILLS_MARKET_DETAILS_ZH : SKILLS_MARKET_DETAILS_EN;
      await openExternalUrl(url);
    } catch (error) {
      console.error('Failed to open Skills Market URL:', error);
    }
  }, [i18n.language]);

  if (!initialized) return null;

  return (
    <div className='absolute top-12px right-12px z-10'>
      <div
        className={`flex items-center gap-12px rd-10px bg-fill-0 border border-solid border-[var(--color-border-2)] px-16px py-10px transition-all duration-300 ${enabled ? 'max-w-500px' : 'max-w-280px'}`}
      >
        <div className='flex-1 min-w-0'>
          <div className='text-14px font-medium text-[var(--color-text-1)] whitespace-nowrap'>
            {t('conversation.welcome.skillsMarket')}
          </div>
          {!enabled && (
            <div className='text-12px text-[var(--color-text-3)] mt-2px leading-tight'>
              {t('conversation.welcome.skillsMarketDesc')}{' '}
              <span className='text-[rgb(var(--primary-6))] cursor-pointer hover:underline' onClick={handleOpenDetails}>
                {t('conversation.welcome.skillsMarketDetails')}
              </span>
            </div>
          )}
        </div>
        <Switch size='small' checked={enabled} loading={loading} onChange={handleToggle} />
      </div>
    </div>
  );
};

export default SkillsMarketBanner;
