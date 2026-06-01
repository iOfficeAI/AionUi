/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/**
 * Preference row.
 *
 * Phase 2 — Settings Polish standardized this component as the single source
 * of truth for settings-row rhythm. Desktop renders label + control on a
 * single line with a fixed 240px label column; mobile stacks label above
 * control, full-width. The fix lives in this file so every consumer
 * (PetSettings, the legacy SettingsModal content components, channel config
 * forms) picks it up automatically.
 */
const PreferenceRow: React.FC<{
  label: string;
  children: React.ReactNode;
  description?: string;
}> = ({ label, children, description }) => (
  <div className='flex flex-col md:flex-row md:items-center gap-8px md:gap-12px py-8px md:py-12px'>
    <div className='md:w-240px md:shrink-0'>
      <div className='text-14px text-t-primary'>{label}</div>
      {description && <div className='text-12px text-t-tertiary mt-2px'>{description}</div>}
    </div>
    <div className='flex md:justify-end md:flex-1 w-full md:w-auto'>{children}</div>
  </div>
);

export default PreferenceRow;
