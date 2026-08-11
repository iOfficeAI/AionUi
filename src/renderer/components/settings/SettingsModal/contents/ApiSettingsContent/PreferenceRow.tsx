/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

type PreferenceRowProps = {
  label: string;
  description?: React.ReactNode;
  children: React.ReactNode;
};

const PreferenceRow: React.FC<PreferenceRowProps> = ({ label, description, children }) => (
  <div className='flex items-center justify-between gap-12px py-12px'>
    <div className='min-w-0 flex-1'>
      <div className='text-14px text-t-primary'>{label}</div>
      {description ? <div className='mt-2px text-12px text-t-tertiary'>{description}</div> : null}
    </div>
    <div className='flex shrink-0 items-center'>{children}</div>
  </div>
);

export default PreferenceRow;
