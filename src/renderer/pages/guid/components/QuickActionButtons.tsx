/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cliSession, webui } from '@/common/adapter/ipcBridge';
import type { CliSessionSummary } from '@/common/types/cliSessionTypes';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import { Button, Empty, Message, Modal, Spin } from '@arco-design/web-react';
import { Earth } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from '../index.module.css';

type QuickActionButtonsProps = {
  onOpenLink: (url: string) => void;
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
  onOpenLink,
  onOpenBugReport,
  inactiveBorderColor,
  activeShadow,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hoveredQuickAction, setHoveredQuickAction] = useState<'bugReport' | 'repo' | 'webui' | 'cliSession' | null>(
    null
  );
  const [webuiQuickStatus, setWebuiQuickStatus] = useState<WebuiQuickStatus>('checking');
  const [cliSessionVisible, setCliSessionVisible] = useState(false);
  const [cliSessionsLoading, setCliSessionsLoading] = useState(false);
  const [cliSessions, setCliSessions] = useState<CliSessionSummary[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);

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

  const loadCliSessions = useCallback(async () => {
    setCliSessionsLoading(true);
    try {
      const sessions = await cliSession.listRecent.invoke({ limit: 20 });
      setCliSessions(sessions);
    } catch (error) {
      console.error('Failed to load CLI sessions:', error);
      Message.error(t('guid.cliSessions.loadFailed', { defaultValue: 'Failed to load CLI sessions.' }));
    } finally {
      setCliSessionsLoading(false);
    }
  }, [t]);

  const handleOpenCliSessions = useCallback(() => {
    setCliSessionVisible(true);
    void loadCliSessions();
  }, [loadCliSessions]);

  const handleContinueCliSession = useCallback(
    async (session: CliSessionSummary) => {
      const sessionKey = `${session.backend}:${session.sessionId}`;
      setActiveSessionKey(sessionKey);

      try {
        if (session.conversationId) {
          setCliSessionVisible(false);
          await navigate(`/conversation/${session.conversationId}`);
          return;
        }

        const conversation = await cliSession.importConversation.invoke({
          backend: session.backend,
          sessionId: session.sessionId,
        });
        setCliSessionVisible(false);
        await navigate(`/conversation/${conversation.id}`);
      } catch (error) {
        console.error('Failed to continue CLI session:', error);
        Message.error(t('guid.cliSessions.importFailed', { defaultValue: 'Failed to continue the selected session.' }));
      } finally {
        setActiveSessionKey(null);
      }
    },
    [navigate, t]
  );

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
          className='group inline-flex items-center justify-center h-36px min-w-36px max-w-36px px-0 rd-999px bg-fill-0 cursor-pointer overflow-hidden whitespace-nowrap hover:max-w-220px hover:px-14px hover:justify-start hover:gap-8px transition-[max-width,padding,border-radius,box-shadow] duration-420 ease-in-out'
          style={quickActionStyle(hoveredQuickAction === 'cliSession')}
          onMouseEnter={() => setHoveredQuickAction('cliSession')}
          onMouseLeave={() => setHoveredQuickAction(null)}
          onClick={handleOpenCliSessions}
        >
          <svg
            className='flex-shrink-0 text-[var(--color-text-3)] group-hover:text-[#7C5CFC] transition-colors duration-300'
            width='20'
            height='20'
            viewBox='0 0 20 20'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
          >
            <path
              d='M10 5V10L13.3333 11.6667M18.3333 10C18.3333 14.6024 14.6024 18.3333 10 18.3333C5.39763 18.3333 1.66667 14.6024 1.66667 10C1.66667 5.39763 5.39763 1.66667 10 1.66667C14.6024 1.66667 18.3333 5.39763 18.3333 10Z'
              stroke='currentColor'
              strokeWidth='1.66667'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
          <span className='opacity-0 max-w-0 overflow-hidden text-14px text-[var(--color-text-2)] group-hover:opacity-100 group-hover:max-w-180px transition-all duration-360 ease-in-out'>
            {t('guid.cliSessions.quickAction', { defaultValue: 'Continue CLI Session' })}
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

      <Modal
        title={t('guid.cliSessions.title', { defaultValue: 'Continue CLI Sessions' })}
        visible={cliSessionVisible}
        onCancel={() => setCliSessionVisible(false)}
        footer={null}
      >
        <div className='mb-12px text-13px text-t-secondary'>
          {t('guid.cliSessions.description', {
            defaultValue: 'Import a recent Claude Code or Codex CLI session into AionUI and keep chatting here.',
          })}
        </div>

        {cliSessionsLoading ? (
          <div className='flex min-h-180px items-center justify-center'>
            <Spin />
          </div>
        ) : cliSessions.length === 0 ? (
          <Empty
            description={t('guid.cliSessions.empty', {
              defaultValue: 'No recent Claude Code or Codex sessions were found on this machine.',
            })}
          />
        ) : (
          <div className='flex max-h-420px flex-col gap-10px overflow-auto pr-4px'>
            {cliSessions.map((session) => {
              const logo = getAgentLogo(session.backend);
              const sessionKey = `${session.backend}:${session.sessionId}`;
              const actionLabel = session.conversationId
                ? t('guid.cliSessions.openConversation', { defaultValue: 'Open Conversation' })
                : t('guid.cliSessions.continueAction', { defaultValue: 'Continue Here' });

              return (
                <div
                  key={sessionKey}
                  className='flex items-start justify-between gap-12px rd-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-fill-1)] p-12px'
                >
                  <div className='min-w-0 flex-1'>
                    <div className='mb-6px flex items-center gap-8px'>
                      {logo ? <img src={logo} alt='' width={18} height={18} style={{ objectFit: 'contain' }} /> : null}
                      <span className='truncate text-14px font-medium text-t-primary'>{session.title}</span>
                      <span className='shrink-0 rd-999px bg-fill-2 px-8px py-2px text-11px text-t-secondary'>
                        {session.backend === 'claude' ? 'Claude Code' : 'Codex'}
                      </span>
                    </div>
                    {session.preview ? (
                      <div className='mb-6px text-12px text-t-secondary'>{session.preview}</div>
                    ) : null}
                    <div className='text-12px text-t-tertiary'>
                      <span>
                        {t('common.workspace')}:{' '}
                        {session.workspace || t('guid.cliSessions.workspaceUnknown', { defaultValue: 'Unknown' })}
                      </span>
                    </div>
                    <div className='mt-4px text-12px text-t-tertiary'>
                      <span>
                        {t('guid.cliSessions.lastActive', { defaultValue: 'Last Active' })}:{' '}
                        {new Date(session.updatedAt).toLocaleString()}
                      </span>
                    </div>
                    {!session.workspaceExists ? (
                      <div className='mt-4px text-12px text-[rgb(var(--danger-6))]'>
                        {t('guid.cliSessions.workspaceMissing', {
                          defaultValue:
                            'Original workspace is unavailable. The session may resume with limited context.',
                        })}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type='primary'
                    size='small'
                    loading={activeSessionKey === sessionKey}
                    onClick={() => {
                      void handleContinueCliSession(session);
                    }}
                  >
                    {actionLabel}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default QuickActionButtons;
