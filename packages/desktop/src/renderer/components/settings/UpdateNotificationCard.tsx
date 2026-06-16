/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import MarkdownView from '@/renderer/components/Markdown';
import { Button, Progress } from '@arco-design/web-react';
import { CheckOne, CloseOne, Download, Install, Minus, Refresh } from '@icon-park/react';
import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatUpdateSize, useUpdateNotificationController } from './useUpdateNotificationController';

const renderNotificationLayer = (node: React.ReactElement) => {
  if (typeof document === 'undefined' || !document.body) return node;
  return createPortal(node, document.body);
};

const UpdateNotificationCard: React.FC = () => {
  const { t } = useTranslation();
  const { state, versionLabel, actions } = useUpdateNotificationController();

  if (!state.visible) return null;

  if (state.presentation === 'mini') {
    const miniPercent = state.status === 'downloaded' ? 100 : state.progress.percent;
    const miniColor =
      state.status === 'downloaded'
        ? 'rgb(var(--success-6))'
        : state.status === 'error'
          ? 'rgb(var(--danger-6))'
          : 'rgb(var(--primary-6))';
    const miniContent =
      state.status === 'downloaded' ? (
        <span className='text-30px leading-none text-[rgb(var(--success-6))]'>✓</span>
      ) : state.status === 'error' ? (
        <span className='text-30px leading-none text-[rgb(var(--danger-6))]'>×</span>
      ) : (
        <span className='text-13px leading-none text-t-primary font-600'>{miniPercent}%</span>
      );

    return renderNotificationLayer(
      <button
        type='button'
        data-testid='update-notification-mini-progress'
        data-mini-status={state.status}
        data-ring-stroke-width='8'
        aria-label={t('update.restoreUpdateNotification')}
        className='fixed right-24px bottom-24px z-1000 w-52px h-52px rd-full bg-1 shadow-lg flex items-center justify-center cursor-pointer'
        onClick={actions.restore}
      >
        <Progress
          type='circle'
          percent={miniPercent}
          size='small'
          width={46}
          strokeWidth={8}
          color={miniColor}
          showText={false}
        />
        <span className='absolute inset-0 flex items-center justify-center pointer-events-none'>{miniContent}</span>
      </button>
    );
  }

  const renderProgress = (fixedPercent?: number) => {
    const percent = fixedPercent ?? state.progress.percent;
    return (
      <div className='py-8px'>
        <div className='mb-10px'>
          <Progress
            percent={percent}
            showText={false}
            strokeWidth={6}
            color={fixedPercent === 100 ? 'rgb(var(--success-6))' : undefined}
          />
        </div>
        <div className='flex justify-between gap-12px text-12px text-t-tertiary'>
          <span>{percent}%</span>
          <span>
            {formatUpdateSize(state.progress.transferred)} / {formatUpdateSize(state.progress.total)}
          </span>
          <span className='text-[rgb(var(--primary-6))] font-500'>{state.progress.speed}</span>
        </div>
      </div>
    );
  };

  const renderBody = () => {
    switch (state.status) {
      case 'checking':
        return <div className='py-16px text-13px text-t-secondary'>{t('update.checking')}</div>;
      case 'upToDate':
        return (
          <div className='py-16px flex items-center gap-10px text-13px text-t-secondary'>
            <CheckOne theme='filled' size='18' fill='rgb(var(--success-6))' />
            <span>{t('update.upToDateTitle')}</span>
          </div>
        );
      case 'available':
        return (
          <div className='min-h-0'>
            <div className='text-13px text-t-tertiary mb-10px'>
              {state.currentVersion} → <span className='text-t-primary font-600'>{versionLabel}</span>
            </div>
            <div className='max-h-180px overflow-y-auto text-13px text-t-secondary leading-relaxed custom-scrollbar'>
              {state.releaseNotesStatus === 'loading' ? (
                <span>{t('update.releaseNotesLoading')}</span>
              ) : state.releaseNotesStatus === 'failed' ? (
                <div className='flex items-center gap-6px'>
                  <span>{t('update.releaseNotesFailed')}</span>
                  {state.releasePageUrl && (
                    <button
                      type='button'
                      className='text-[rgb(var(--primary-6))] underline underline-offset-2'
                      onClick={actions.openReleasePage}
                    >
                      {t('update.viewRelease')}
                    </button>
                  )}
                </div>
              ) : state.updateInfo?.body || state.autoUpdateInfo?.releaseNotes ? (
                <MarkdownView allowHtml>
                  {state.updateInfo?.body || state.autoUpdateInfo?.releaseNotes || ''}
                </MarkdownView>
              ) : (
                <span>{t('update.releaseNotesLoading')}</span>
              )}
            </div>
          </div>
        );
      case 'downloading':
        return renderProgress();
      case 'downloaded':
        return renderProgress(100);
      case 'success':
        return <div className='py-16px text-13px text-t-secondary break-all'>{state.downloadPath}</div>;
      case 'error':
        return <div className='py-16px text-13px text-[rgb(var(--danger-6))]'>{state.errorMsg}</div>;
      case 'idle':
        return null;
    }
  };

  const renderActions = () => {
    if (state.status === 'downloaded') {
      return (
        <>
          <Button size='small' onClick={() => actions.dismiss('later')}>
            {t('update.later')}
          </Button>
          <Button type='primary' size='small' onClick={actions.quitAndInstall} icon={<Install size='14' />}>
            {t('update.installNow')}
          </Button>
        </>
      );
    }
    if (state.status === 'success') {
      return (
        <>
          <Button size='small' onClick={() => actions.dismiss('later')}>
            {t('update.later')}
          </Button>
          <Button type='primary' size='small' onClick={actions.openFile} icon={<Install size='14' />}>
            {t('update.installNow')}
          </Button>
        </>
      );
    }
    if (state.status === 'error') {
      return (
        <>
          <Button size='small' onClick={() => void actions.checkForUpdates()} icon={<Refresh size='14' />}>
            {t('common.retry')}
          </Button>
          {state.releasePageUrl && (
            <Button type='primary' size='small' onClick={actions.openReleasePage}>
              {t('update.goToRelease')}
            </Button>
          )}
        </>
      );
    }
    if (state.status === 'available') {
      return (
        <>
          <Button size='small' onClick={() => actions.dismiss('later')}>
            {t('update.later')}
          </Button>
          <Button type='primary' size='small' onClick={actions.startDownload} icon={<Download size='14' />}>
            {t('update.downloadAndInstall')}
          </Button>
        </>
      );
    }
    if (state.status === 'downloading') {
      return (
        <>
          <Button size='small' onClick={actions.cancelDownload}>
            {t('update.cancel')}
          </Button>
          <Button type='primary' size='small' onClick={actions.minimize} icon={<Minus size='14' />}>
            {t('update.minimize')}
          </Button>
        </>
      );
    }
    return (
      <Button size='small' onClick={() => actions.dismiss('later')}>
        {t('update.later')}
      </Button>
    );
  };

  return renderNotificationLayer(
    <section
      data-testid='update-notification-card'
      className='fixed right-24px bottom-24px z-1000 w-420px max-w-[calc(100vw-32px)] bg-1 border border-border-2 rd-8px shadow-lg overflow-hidden'
    >
      <div className='flex items-center justify-between gap-12px px-16px py-12px border-b border-border-2'>
        <div className='flex items-center gap-10px min-w-0'>
          <Download size='18' fill='rgb(var(--primary-6))' />
          <div className='text-14px text-t-primary font-600 truncate'>{t('update.modalTitle')}</div>
        </div>
        {state.status === 'error' && (
          <Button
            type='text'
            size='mini'
            icon={<CloseOne size='14' />}
            onClick={() => actions.dismiss('close')}
            aria-label={t('common.close')}
          />
        )}
      </div>
      <div className='px-16px py-12px'>{renderBody()}</div>
      <div className='flex justify-end gap-8px px-16px py-12px border-t border-border-2'>{renderActions()}</div>
    </section>
  );
};

export default UpdateNotificationCard;
