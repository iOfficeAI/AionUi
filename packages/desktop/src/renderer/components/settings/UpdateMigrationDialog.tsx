/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@renderer/components/base/AionModal';
import { openExternalUrl } from '@/renderer/utils/platform';
import { Button } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Global event that opens the migration invite letter. Manual "check for
// updates" entry points dispatch it in the discontinued build instead of
// running any version detection.
export const OPEN_MIGRATION_DIALOG_EVENT = 'aionui-open-migration-dialog';

// Official website users are guided to for the AionUi Pro download. Kept as a
// module constant (not i18n) — it is a URL, not translatable copy.
const AIONUI_WEBSITE_URL = 'https://www.aionui.com/';

// localStorage flag remembering that the migration invite already auto-opened
// once on this machine. First launch of the discontinued build pops the card
// automatically; after the user closes it, later launches stay silent and the
// titlebar capsule becomes the re-entry point.
const MIGRATION_INVITE_SHOWN_KEY = 'aionui.migration-invite-shown';

const wasInviteAutoShown = (): boolean => {
  try {
    return window.localStorage.getItem(MIGRATION_INVITE_SHOWN_KEY) === '1';
  } catch {
    // localStorage unavailable (privacy mode / quota) — treat as already shown
    // so we never spam the dialog on every launch.
    return true;
  }
};

const markInviteAutoShown = (): void => {
  try {
    window.localStorage.setItem(MIGRATION_INVITE_SHOWN_KEY, '1');
  } catch {
    // ignore — worst case the invite auto-opens again next launch.
  }
};

// Serif stack for the letterhead title and signature — one serif accent is
// enough to read as stationery; body copy stays sans-serif for readability.
const LETTER_SERIF: React.CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', 'Songti SC', 'Noto Serif CJK SC', SimSun, serif",
};

// The invite is a letter from the team: greeting, body sections with bold
// lead-ins, promise/choice lists, closing and signature. All copy lives under
// `update.migration.letter.*`.
const UpdateMigrationDialog: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  // Whether the letter body still has content below the fold. Drives the
  // bottom fade + arrow hint so users notice the letter scrolls.
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOpen = () => setVisible(true);
    window.addEventListener(OPEN_MIGRATION_DIALOG_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_MIGRATION_DIALOG_EVENT, handleOpen);
  }, []);

  // Auto-open once on the first launch of the discontinued build. The flag is
  // written at show time so subsequent launches never auto-open again.
  useEffect(() => {
    if (wasInviteAutoShown()) return;
    markInviteAutoShown();
    setVisible(true);
  }, []);

  const updateScrollHint = () => {
    const el = scrollRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  };

  // On every open: reset scroll to the top (a reopened letter should start
  // from the beginning, not where the user left off) and re-measure the
  // scroll hint once the modal has mounted its content (it renders lazily).
  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      updateScrollHint();
    }, 50);
    return () => window.clearTimeout(id);
  }, [visible]);

  const close = () => setVisible(false);

  const gotoWebsite = () => {
    void openExternalUrl(AIONUI_WEBSITE_URL).catch((error) => {
      console.error('Failed to open AionUi Pro website:', error);
    });
    close();
  };

  return (
    <AionModal
      variant='standard'
      visible={visible}
      onCancel={close}
      maskClosable
      style={{ width: 640 }}
      header={{ showClose: true }}
      footer={
        <div className='flex items-center justify-center pb-12px'>
          <Button type='primary' size='large' className='!rounded-8px !px-40px' onClick={gotoWebsite}>
            {t('update.migration.letter.downloadNew')}
          </Button>
        </div>
      }
    >
      <div className='relative'>
        <div
          ref={scrollRef}
          onScroll={updateScrollHint}
          className='px-48px pt-8px pb-16px text-14px text-t-primary leading-[1.8] max-h-[62vh] overflow-y-auto'
        >
          {/* Letterhead: centered serif title over a short rule, reading as stationery */}
          <div className='text-center mb-28px'>
            <h2 className='text-20px font-600 m-0 mb-12px' style={LETTER_SERIF}>
              {t('update.migration.letter.title')}
            </h2>
            <div className='w-48px h-2px mx-auto rounded-full bg-t-primary opacity-20' />
          </div>
          <p className='mb-20px'>{t('update.migration.letter.greeting')}</p>
          <p className='mb-20px'>
            {t('update.migration.letter.introPrefix')}
            <strong>{t('update.migration.letter.introBold')}</strong>
            {t('update.migration.letter.introSuffix')}
          </p>
          <p className='mb-8px'>
            <strong>{t('update.migration.letter.whyTitle')}</strong> {t('update.migration.letter.whyLead')}
          </p>
          <ul className='mb-8px ps-20px list-disc'>
            <li className='mb-4px'>{t('update.migration.letter.whyReason1')}</li>
            <li className='mb-4px'>{t('update.migration.letter.whyReason2')}</li>
            <li>{t('update.migration.letter.whyReason3')}</li>
          </ul>
          <p className='mb-20px'>
            {t('update.migration.letter.whyOutroPrefix')}
            <strong>{t('update.migration.letter.whyOutroBold')}</strong>
            {t('update.migration.letter.whyOutroSuffix')}
          </p>
          <p className='mb-8px'>
            <strong>{t('update.migration.letter.promisesTitle')}</strong>
          </p>
          <ul className='mb-20px ps-20px list-disc'>
            <li className='mb-4px'>
              <strong>{t('update.migration.letter.promise1Bold')}</strong>
              {t('update.migration.letter.promise1Rest')}
            </li>
            <li className='mb-4px'>{t('update.migration.letter.promise2')}</li>
            <li className='mb-4px'>{t('update.migration.letter.promise3')}</li>
            <li>{t('update.migration.letter.promise4')}</li>
          </ul>
          <p className='mb-8px'>
            <strong>{t('update.migration.letter.choicesTitle')}</strong>
          </p>
          <ul className='mb-20px ps-20px list-disc'>
            <li className='mb-4px'>
              <strong>{t('update.migration.letter.choice1Bold')}</strong>
              {t('update.migration.letter.choice1Rest')}
            </li>
            <li>{t('update.migration.letter.choice2')}</li>
          </ul>
          <p className='mb-20px'>{t('update.migration.letter.noRush')}</p>
          <p className='mb-24px'>{t('update.migration.letter.closing')}</p>
          {/* Signature block: right-aligned above a hairline, like a hand-signed letter */}
          <div className='flex justify-end'>
            <div className='text-end pt-12px border-t border-[var(--border-base)] min-w-160px'>
              <span className='text-15px' style={LETTER_SERIF}>
                {t('update.migration.letter.signature')}
              </span>
            </div>
          </div>
        </div>
        {/* Scroll hint: bottom fade + bouncing chevron while content remains below
            the fold, so users notice the letter scrolls even without hovering the
            scrollbar. Disappears once they reach the end. */}
        {hasMoreBelow && (
          <div className='absolute bottom-0 start-0 end-0 h-56px pointer-events-none flex items-end justify-center bg-gradient-to-t from-[var(--dialog-fill-0)] to-transparent'>
            <Down theme='outline' size={18} fill='currentColor' className='text-t-secondary animate-bounce mb-4px' />
          </div>
        )}
      </div>
    </AionModal>
  );
};

export default UpdateMigrationDialog;
