/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Dein Team" page — the mounted route for the curated EVE workforce.
 *
 * This page wrapper hosts {@link DeinTeamPanel} (the curated A-roster surface
 * with the rhythm-correct controls and the non-empty-floor guard). It closes the
 * alpha.9 OI#1: the panel was built but never mounted into a real route/tab.
 *
 * The page is intentionally thin — all roster data, control logic and the floor
 * guard live in the panel + the pure cores. This only supplies the page chrome
 * and the i18n'd header.
 */

import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import DeinTeamPanel from '@renderer/components/team/DeinTeamPanel';

const DeinTeamPage: React.FC = () => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;

  return (
    <div className='size-full overflow-y-auto bg-bg-1'>
      <div className={classNames('mx-auto flex max-w-960px flex-col gap-18px px-24px py-28px', isMobile && 'px-16px')}>
        <header className='min-w-0'>
          <h1 className='m-0 text-28px font-700 leading-34px text-t-primary'>{t('deinTeam.title')}</h1>
          <p className='m-0 mt-8px max-w-820px text-14px leading-22px text-t-secondary'>{t('deinTeam.subtitle')}</p>
        </header>
        <section className='rounded-16px border border-solid border-[var(--color-border-2)] bg-bg-2 px-18px py-16px'>
          <DeinTeamPanel />
        </section>
      </div>
    </div>
  );
};

export default DeinTeamPage;
