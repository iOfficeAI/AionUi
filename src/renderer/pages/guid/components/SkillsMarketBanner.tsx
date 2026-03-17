/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import { Message, Switch, Tooltip } from '@arco-design/web-react';
import { Puzzle } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const SKILLS_MARKET_DETAILS_ZH = 'https://github.com/iOfficeAI/AionUi/discussions/1326';
const SKILLS_MARKET_DETAILS_EN = 'https://github.com/iOfficeAI/AionUi/discussions/1325';

const SkillsMarketBanner: React.FC = () => {
  const { t, i18n } = useTranslation();
  const layout = useLayoutContext();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [isMobileClient, setIsMobileClient] = useState(() => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator?.userAgent ?? '';
    const hasCoarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|MiuiBrowser|UCBrowser/i.test(ua) || hasCoarsePointer;
  });
  const isWebuiMobile = !isElectronDesktop() && (Boolean(layout?.isMobile) || isNarrowViewport || isMobileClient);
  const compactMode = enabled || isWebuiMobile;

  useEffect(() => {
    void ConfigStorage.get('skillsMarket.enabled')
      .then((val) => {
        setEnabled(!!val);
      })
      .catch((error) => {
        console.warn('Failed to read skills market setting, fallback to disabled:', error);
        setEnabled(false);
      })
      .finally(() => {
        setInitialized(true);
      });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      setIsNarrowViewport(window.innerWidth < 768);
      const ua = window.navigator?.userAgent ?? '';
      const hasCoarsePointer =
        typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      setIsMobileClient(
        /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|MiuiBrowser|UCBrowser/i.test(ua) || hasCoarsePointer
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
    <div className='absolute right-12px z-10' style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))' }}>
      <div
        className={`flex items-center border border-solid border-[var(--color-border-2)] bg-fill-0 transition-all duration-300 ${
          compactMode
            ? 'h-34px gap-8px rd-999px px-8px pr-10px py-0 w-fit max-w-[min(52vw,240px)]'
            : 'gap-12px rd-10px px-16px py-10px max-w-280px'
        }`}
      >
        {compactMode ? (
          <Tooltip content={t('conversation.welcome.skillsMarket')} position='bottom'>
            <div className='inline-flex items-center gap-6px min-w-0 flex-1 cursor-default'>
              {isWebuiMobile && enabled ? (
                <Puzzle theme='outline' size='14' strokeWidth={3} className='text-t-secondary flex shrink-0' />
              ) : (
                <>
                  <span className='inline-block w-5px h-5px rd-full bg-[rgb(var(--primary-6))] opacity-70 shrink-0'></span>
                  <span className='text-12px font-500 leading-none text-[var(--color-text-1)] truncate whitespace-nowrap'>
                    {t('conversation.welcome.skillsMarket')}
                  </span>
                </>
              )}
            </div>
          </Tooltip>
        ) : (
          <div className='flex-1 min-w-0'>
            <div className='text-14px font-medium text-[var(--color-text-1)] whitespace-nowrap'>
              {t('conversation.welcome.skillsMarket')}
            </div>
            <div className='text-12px text-[var(--color-text-3)] mt-2px leading-tight'>
              {t('conversation.welcome.skillsMarketDesc')}{' '}
              <span className='text-[rgb(var(--primary-6))] cursor-pointer hover:underline' onClick={handleOpenDetails}>
                {t('conversation.welcome.skillsMarketDetails')}
              </span>
            </div>
          </div>
        )}
        <Switch className='shrink-0' size='small' checked={enabled} loading={loading} onChange={handleToggle} />
      </div>
    </div>
  );
};

export default SkillsMarketBanner;
