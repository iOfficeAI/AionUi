/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import MarkdownView from '@/renderer/components/Markdown';
import { Button, Modal, Progress } from '@arco-design/web-react';
import { CheckOne, Close, Download } from '@icon-park/react';
import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatUpdateSize, useUpdateNotificationController } from './useUpdateNotificationController';

// Shared action-button style across every notification state: rounded corners, no leading icon.
const ACTION_BTN_CLASS = '!rounded-8px';

const renderNotificationLayer = (node: React.ReactElement) => {
  if (typeof document === 'undefined' || !document.body) return node;
  return createPortal(node, document.body);
};

const UpdateNotificationCard: React.FC = () => {
  const { t } = useTranslation();
  const { state, versionLabel, actions } = useUpdateNotificationController();
  const [releaseLogVisible, setReleaseLogVisible] = React.useState(false);

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
          <div className='flex items-center gap-10px text-13px text-t-secondary'>
            <span>
              {state.currentVersion} → {versionLabel}
            </span>
            <button
              type='button'
              className='bg-transparent border-none p-0 cursor-pointer text-inherit underline underline-offset-2'
              onClick={() => setReleaseLogVisible(true)}
            >
              {t('update.releaseLog')}
            </button>
          </div>
        );
      case 'downloading':
        return renderProgress();
      case 'downloaded':
        return (
          <div className='flex items-start gap-10px text-13px text-t-secondary leading-relaxed'>
            <CheckOne theme='filled' size='18' fill='rgb(var(--success-6))' className='mt-2px shrink-0' />
            <span>{t('update.downloadCompleteTitle')}</span>
          </div>
        );
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
          <Button size='small' className={ACTION_BTN_CLASS} onClick={() => actions.dismiss('later')}>
            {t('update.later')}
          </Button>
          <Button type='primary' size='small' className={ACTION_BTN_CLASS} onClick={actions.quitAndInstall}>
            {t('update.restartNow')}
          </Button>
        </>
      );
    }
    if (state.status === 'success') {
      return (
        <>
          <Button size='small' className={ACTION_BTN_CLASS} onClick={() => actions.dismiss('later')}>
            {t('update.later')}
          </Button>
          <Button type='primary' size='small' className={ACTION_BTN_CLASS} onClick={actions.openFile}>
            {t('update.installNow')}
          </Button>
        </>
      );
    }
    if (state.status === 'error') {
      return (
        <>
          <Button size='small' className={ACTION_BTN_CLASS} onClick={() => void actions.checkForUpdates()}>
            {t('common.retry')}
          </Button>
          {state.releasePageUrl && (
            <Button type='primary' size='small' className={ACTION_BTN_CLASS} onClick={actions.openReleasePage}>
              {t('update.goToRelease')}
            </Button>
          )}
        </>
      );
    }
    if (state.status === 'available') {
      return (
        <>
          <Button size='small' className={ACTION_BTN_CLASS} onClick={() => actions.dismiss('later')}>
            {t('update.later')}
          </Button>
          <Button type='primary' size='small' className={ACTION_BTN_CLASS} onClick={actions.startDownload}>
            {t('update.downloadButton')}
          </Button>
        </>
      );
    }
    return (
      <Button size='small' className={ACTION_BTN_CLASS} onClick={() => actions.dismiss('later')}>
        {t('update.later')}
      </Button>
    );
  };

  const releaseNotes = state.updateInfo?.body || state.autoUpdateInfo?.releaseNotes || '';

  return renderNotificationLayer(
    <>
      <section
        data-testid='update-notification-card'
        className='fixed right-24px bottom-24px z-1000 w-max min-w-300px max-w-[calc(100vw-32px)] bg-1 border border-border-2 rd-8px shadow-[0_2px_16px_rgba(0,0,0,0.12)] overflow-hidden'
      >
        <div className='flex items-center gap-10px px-16px pt-12px pb-6px min-w-0'>
          <Download size='18' fill='rgb(var(--primary-6))' />
          <div className='text-14px text-t-primary font-600 truncate flex-1'>{t('update.modalTitle')}</div>
          {state.status === 'downloading' && (
            <button
              type='button'
              className='flex items-center justify-center bg-transparent border-none p-0 cursor-pointer text-t-tertiary hover:text-t-primary transition-colors'
              onClick={actions.cancelDownload}
              aria-label={t('update.cancel')}
            >
              <Close size='16' />
            </button>
          )}
        </div>
        {state.status === 'downloading' ? (
          <div className='px-16px pt-6px pb-12px'>{renderBody()}</div>
        ) : (
          <>
            <div className='px-16px py-6px'>{renderBody()}</div>
            <div className='flex justify-start gap-8px px-16px pt-6px pb-12px'>{renderActions()}</div>
          </>
        )}
      </section>
      <Modal
        title={t('update.releaseLog')}
        visible={releaseLogVisible}
        onCancel={() => setReleaseLogVisible(false)}
        footer={null}
        autoFocus={false}
        focusLock={false}
        unmountOnExit
      >
        <div
          data-testid='update-release-log'
          className='max-h-60vh overflow-y-auto text-13px text-t-secondary leading-relaxed custom-scrollbar'
        >
          {state.releaseNotesStatus === 'loading' ? (
            <span>{t('update.releaseNotesLoading')}</span>
          ) : state.releaseNotesStatus === 'failed' ? (
            <div className='flex items-center gap-6px'>
              <span>{t('update.releaseNotesFailed')}</span>
              {state.releasePageUrl && (
                <button
                  type='button'
                  className='bg-transparent border-none p-0 cursor-pointer text-[rgb(var(--primary-6))] underline underline-offset-2'
                  onClick={actions.openReleasePage}
                >
                  {t('update.viewRelease')}
                </button>
              )}
            </div>
          ) : releaseNotes ? (
            <MarkdownView allowHtml>{releaseNotes}</MarkdownView>
          ) : (
            <span>{t('update.releaseNotesLoading')}</span>
          )}
        </div>
      </Modal>
    </>
  );
};

export default UpdateNotificationCard;
