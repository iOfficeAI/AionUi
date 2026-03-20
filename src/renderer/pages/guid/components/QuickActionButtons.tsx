/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { webui } from '@/common/adapter/ipcBridge';
import { Earth } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from '../index.module.css';

type QuickActionButtonsProps = {
  onOpenLink: (url: string) => void;
  inactiveBorderColor: string;
  activeShadow: string;
};

type WebuiQuickStatus = 'checking' | 'running' | 'stopped' | 'error';

const WEBUI_STATUS_CACHE_TTL_MS = 3000;
let webuiStatusCache: {
  quickStatus: WebuiQuickStatus;
  at: number;
} | null = null;

const QuickActionButtons: React.FC<QuickActionButtonsProps> = ({ onOpenLink, inactiveBorderColor, activeShadow }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hoveredQuickAction, setHoveredQuickAction] = useState<'feedback' | 'repo' | 'webui' | null>(null);
  const [webuiQuickStatus, setWebuiQuickStatus] = useState<WebuiQuickStatus>('checking');

  useEffect(() => {
    let alive = true;
    const loadStatus = async () => {
      const now = Date.now();
      if (webuiStatusCache && now - webuiStatusCache.at < WEBUI_STATUS_CACHE_TTL_MS) {
        setWebuiQuickStatus(webuiStatusCache.quickStatus);
        return;
      }

      try {
        const result = await webui.getStatus.invoke();
        if (!alive) return;
        if (result?.success && result.data) {
          const quickStatus: WebuiQuickStatus = result.data.running ? 'running' : 'stopped';
          setWebuiQuickStatus(quickStatus);
          webuiStatusCache = { quickStatus, at: Date.now() };
          return;
        }
        setWebuiQuickStatus('error');
        webuiStatusCache = { quickStatus: 'error', at: Date.now() };
      } catch {
        if (!alive) return;
        setWebuiQuickStatus('error');
        webuiStatusCache = { quickStatus: 'error', at: Date.now() };
      }
    };

    void loadStatus();

    const unsubscribe = webui.statusChanged.on((payload) => {
      const nextQuickStatus: WebuiQuickStatus = payload.running ? 'running' : 'stopped';
      setWebuiQuickStatus(nextQuickStatus);
      webuiStatusCache = { quickStatus: nextQuickStatus, at: Date.now() };
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const quickActionStyle = useCallback(
    (isActive: boolean) => ({
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: inactiveBorderColor,
      boxShadow: isActive ? activeShadow : 'none',
    }),
    [activeShadow, inactiveBorderColor]
  );

  const handleOpenWebUI = useCallback(() => {
    void navigate('/settings/webui');
  }, [navigate]);

  const webuiStatusLabel =
    webuiQuickStatus === 'running'
      ? t('settings.webui.running', { defaultValue: 'Running' })
      : webuiQuickStatus === 'checking'
        ? t('settings.webui.starting', { defaultValue: 'Checking' })
        : webuiQuickStatus === 'error'
          ? t('settings.webui.operationFailed', { defaultValue: 'Unavailable' })
          : t('settings.webui.enable', { defaultValue: 'Start' });
  const webuiIconColor =
    webuiQuickStatus === 'running'
      ? 'rgb(var(--success-6))'
      : webuiQuickStatus === 'checking'
        ? 'rgb(var(--primary-6))'
        : webuiQuickStatus === 'error'
          ? 'var(--color-text-3)'
          : 'var(--color-text-4)';

  return (
    <div
      className={`absolute left-50% -translate-x-1/2 flex flex-col justify-center items-center ${styles.guidQuickActions}`}
    >
      <div className='flex justify-center items-center gap-24px'>
        <div
          className='group inline-flex items-center justify-center h-36px min-w-36px max-w-36px px-0 rd-999px bg-fill-0 cursor-pointer overflow-hidden whitespace-nowrap hover:max-w-170px hover:px-14px hover:justify-start hover:gap-8px transition-[max-width,padding,border-radius,box-shadow] duration-420 ease-in-out'
          style={quickActionStyle(hoveredQuickAction === 'feedback')}
          onMouseEnter={() => setHoveredQuickAction('feedback')}
          onMouseLeave={() => setHoveredQuickAction(null)}
          onClick={() => onOpenLink('https://x.com/AionUi')}
        >
          <svg
            className='flex-shrink-0 text-[var(--color-text-3)] group-hover:text-[#2C7FFF] transition-colors duration-300'
            width='20'
            height='20'
            viewBox='0 0 20 20'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
          >
            <path
              d='M6.58335 16.6674C8.17384 17.4832 10.0034 17.7042 11.7424 17.2905C13.4814 16.8768 15.0155 15.8555 16.0681 14.4108C17.1208 12.9661 17.6229 11.1929 17.4838 9.41082C17.3448 7.6287 16.5738 5.95483 15.3099 4.69085C14.0459 3.42687 12.372 2.6559 10.5899 2.51687C8.80776 2.37784 7.03458 2.8799 5.58987 3.93256C4.14516 4.98523 3.12393 6.51928 2.71021 8.25828C2.29648 9.99729 2.51747 11.8269 3.33335 13.4174L1.66669 18.334L6.58335 16.6674Z'
              stroke='currentColor'
              strokeWidth='1.66667'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
          <span className='opacity-0 max-w-0 overflow-hidden text-14px text-[var(--color-text-2)] group-hover:opacity-100 group-hover:max-w-128px transition-all duration-360 ease-in-out'>
            {t('conversation.welcome.quickActionFeedback')}
          </span>
        </div>
        <div
          className='group inline-flex items-center justify-center h-36px min-w-36px max-w-36px px-0 rd-999px bg-fill-0 cursor-pointer overflow-hidden whitespace-nowrap hover:max-w-150px hover:px-14px hover:justify-start hover:gap-8px transition-[max-width,padding,border-radius,box-shadow] duration-420 ease-in-out'
          style={quickActionStyle(hoveredQuickAction === 'repo')}
          onMouseEnter={() => setHoveredQuickAction('repo')}
          onMouseLeave={() => setHoveredQuickAction(null)}
          onClick={() => onOpenLink('https://github.com/iOfficeAI/AionUi')}
        >
          <svg
            className='flex-shrink-0 text-[var(--color-text-3)] group-hover:text-[#FE9900] transition-colors duration-300'
            width='20'
            height='20'
            viewBox='0 0 20 20'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
          >
            <path
              d='M9.60416 1.91176C9.64068 1.83798 9.6971 1.77587 9.76704 1.73245C9.83698 1.68903 9.91767 1.66602 9.99999 1.66602C10.0823 1.66602 10.163 1.68903 10.233 1.73245C10.3029 1.77587 10.3593 1.83798 10.3958 1.91176L12.3208 5.81093C12.4476 6.06757 12.6348 6.2896 12.8663 6.45797C13.0979 6.62634 13.3668 6.73602 13.65 6.77759L17.955 7.40759C18.0366 7.41941 18.1132 7.45382 18.1762 7.50693C18.2393 7.56003 18.2862 7.62972 18.3117 7.7081C18.3372 7.78648 18.3402 7.87043 18.3205 7.95046C18.3007 8.03048 18.259 8.10339 18.2 8.16093L15.0867 11.1926C14.8813 11.3927 14.7277 11.6397 14.639 11.9123C14.5503 12.1849 14.5292 12.475 14.5775 12.7576L15.3125 17.0409C15.3269 17.1225 15.3181 17.2064 15.2871 17.2832C15.2561 17.3599 15.2041 17.4264 15.1371 17.4751C15.0701 17.5237 14.9908 17.5526 14.9082 17.5583C14.8256 17.5641 14.7431 17.5465 14.67 17.5076L10.8217 15.4843C10.5681 15.3511 10.286 15.2816 9.99958 15.2816C9.71318 15.2816 9.43106 15.3511 9.17749 15.4843L5.32999 17.5076C5.25694 17.5463 5.17449 17.5637 5.09204 17.5578C5.00958 17.5519 4.93043 17.5231 4.86357 17.4744C4.79672 17.4258 4.74485 17.3594 4.71387 17.2828C4.68289 17.2061 4.67404 17.1223 4.68833 17.0409L5.42249 12.7584C5.47099 12.4757 5.44998 12.1854 5.36128 11.9126C5.27257 11.6398 5.11883 11.3927 4.91333 11.1926L1.79999 8.16176C1.74049 8.10429 1.69832 8.03126 1.6783 7.95099C1.65827 7.87072 1.66119 7.78644 1.68673 7.70775C1.71226 7.62906 1.75938 7.55913 1.82272 7.50591C1.88607 7.4527 1.96308 7.41834 2.04499 7.40676L6.34916 6.77759C6.63271 6.73634 6.90199 6.62681 7.13381 6.45842C7.36564 6.29002 7.55308 6.06782 7.67999 5.81093L9.60416 1.91176Z'
              stroke='currentColor'
              strokeWidth='1.66667'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
          <span className='opacity-0 max-w-0 overflow-hidden text-14px text-[var(--color-text-2)] group-hover:opacity-100 group-hover:max-w-120px transition-all duration-360 ease-in-out'>
            {t('conversation.welcome.quickActionStar')}
          </span>
        </div>
        <div
          className='group inline-flex items-center justify-center h-36px min-w-36px max-w-36px px-0 rd-999px bg-fill-0 cursor-pointer overflow-hidden whitespace-nowrap hover:max-w-200px hover:px-14px hover:justify-start hover:gap-8px transition-[max-width,padding,border-radius,box-shadow] duration-420 ease-in-out'
          style={quickActionStyle(hoveredQuickAction === 'webui')}
          onMouseEnter={() => setHoveredQuickAction('webui')}
          onMouseLeave={() => setHoveredQuickAction(null)}
          onClick={handleOpenWebUI}
        >
          <div className='relative w-20px h-20px flex-shrink-0 leading-none'>
            <div className='absolute inset-0 flex items-center justify-center'>
              <Earth
                theme='outline'
                size={20}
                fill='currentColor'
                className='block transition-colors duration-360'
                style={{ color: webuiIconColor }}
              />
            </div>
          </div>
          <span className='opacity-0 max-w-0 overflow-hidden text-14px text-[var(--color-text-2)] group-hover:opacity-100 group-hover:max-w-160px transition-all duration-360 ease-in-out'>
            {t('settings.webui', { defaultValue: 'WebUI' })} · {webuiStatusLabel}
          </span>
        </div>
      </div>
    </div>
  );
};

export default QuickActionButtons;
