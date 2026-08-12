/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Notes } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const EmptyState: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className='flex h-full w-full flex-col items-center justify-center gap-12px text-t-secondary'>
      <Notes size={48} theme='outline' />
      <div className='text-16px font-600 text-t-primary'>
        {t('settings.notesNoSelection', { defaultValue: 'Select a note to start editing' })}
      </div>
      <div className='text-12px'>
        {t('settings.notesNoSelectionHint', { defaultValue: 'Choose a note from the sidebar, or create a new one.' })}
      </div>
    </div>
  );
};

export default EmptyState;
