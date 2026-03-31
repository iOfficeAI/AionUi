/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import { openExternalUrl } from '@/renderer/utils/platform';
import { Message, Switch, Tooltip } from '@arco-design/web-react';
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
    const timeout = setTimeout(() => {
      setInitialized(true);
    }, 2000);

    void ConfigStorage.get('skillsMarket.enabled')
      .then((val) => {
        setEnabled(!!val);
      })
      .catch((error) => {
        console.warn('Failed to read skills market setting, fallback to disabled:', error);
        setEnabled(false);
      })
      .finally(() => {
        clearTimeout(timeout);
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

  const [hovered, setHovered] = useState(false);

  if (!initialized) return null;

  return (
    <div
      className='absolute right-12px z-10'
      style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className='flex items-center border border-solid border-[var(--color-border-2)] bg-fill-0 transition-all duration-300 gap-8px rd-10px overflow-hidden'
        style={{
          padding: hovered ? '10px 16px' : '6px 10px',
          maxWidth: hovered ? '300px' : '220px',
        }}
      >
        <div className='flex-1 min-w-0'>
          <div className='text-13px font-medium text-[var(--color-text-1)] whitespace-nowrap'>
            {t('conversation.welcome.skillsMarket')}
          </div>
          {hovered && (
            <div className='text-12px text-[var(--color-text-3)] mt-2px leading-tight animate-fade-in'>
              {t('conversation.welcome.skillsMarketDesc')}{' '}
              <span
                className='text-brand hover:text-brand-hover font-semibold cursor-pointer hover:underline transition-colors'
                onClick={handleOpenDetails}
              >
                {t('conversation.welcome.skillsMarketDetails')}
              </span>
            </div>
          )}
        </div>
        <Switch className='shrink-0' size='small' checked={enabled} loading={loading} onChange={handleToggle} />
      </div>
    </div>
  );
};

export default SkillsMarketBanner;
