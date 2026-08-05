/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

import { OPEN_MIGRATION_DIALOG_EVENT } from '@/renderer/components/settings/UpdateMigrationDialog';

// Persistent titlebar capsule shown only in the discontinued build. After the
// migration invite dialog auto-opens once and the user dismisses it, this
// capsule stays as the always-visible re-entry point: clicking it re-opens the
// invite letter ("A letter to our users"). Rendered next to the bug-report
// button in the titlebar toolbar; uses the theme's warning color so it reads
// as a notice rather than an error.
const MigrationInviteCapsule: React.FC = () => {
  const { t } = useTranslation();
  const label = t('update.migration.capsule');

  const openInvite = () => {
    window.dispatchEvent(new CustomEvent(OPEN_MIGRATION_DIALOG_EVENT));
  };

  return (
    <button
      type='button'
      className='app-titlebar__migration-capsule'
      onClick={openInvite}
      aria-label={label}
      title={label}
    >
      <span className='app-titlebar__migration-capsule-dot' aria-hidden='true' />
      {label}
    </button>
  );
};

export default MigrationInviteCapsule;
