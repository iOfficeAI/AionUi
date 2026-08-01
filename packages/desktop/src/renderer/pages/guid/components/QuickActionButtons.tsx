/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { webui } from '@/common/adapter/ipcBridge';
import { FEEDBACK_REPORTING_ENABLED } from '@/common/types/feedbackDiagnostics';
import { Earth } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from '../index.module.css';

type QuickActionButtonsProps = {
  onOpenBugReport: () => void;
  inactiveBorderColor: string;
  activeShadow: string;
};

type WebuiQuickStatus = 'checking' | 'running' | 'stopped' | 'error';

const WEBUI_STATUS_CACHE_TTL_MS = 3000;
let webuiStatusCache: {
  quickStatus: WebuiQuickStatus;
  at: number;
} | null = null;

const QuickActionButtons: React.FC<QuickActionButtonsProps> = ({
  onOpenBugReport,
  inactiveBorderColor,
  activeShadow,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hoveredQuickAction, setHoveredQuickAction] = useState<'bugReport' | 'webui' | null>(null);
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
        if (result) {
          const quickStatus: WebuiQuickStatus = result.running ? 'running' : 'stopped';
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
        {FEEDBACK_REPORTING_ENABLED && (
          <div
            className='group inline-flex items-center justify-center h-36px min-w-36px max-w-36px px-0 rd-999px bg-fill-0 cursor-pointer overflow-hidden whitespace-nowrap hover:max-w-170px hover:px-14px hover:justify-start hover:gap-8px transition-[max-width,padding,border-radius,box-shadow] duration-420 ease-in-out'
            style={quickActionStyle(hoveredQuickAction === 'bugReport')}
            onMouseEnter={() => setHoveredQuickAction('bugReport')}
            onMouseLeave={() => setHoveredQuickAction(null)}
            onClick={onOpenBugReport}
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
        )}
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
