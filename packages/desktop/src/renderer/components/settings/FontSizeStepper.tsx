/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@arco-design/web-react';

type FontSizeStepperProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  resetLabel: string;
  onChange: (next: number) => void;
};

/** Integer-px font size stepper: − [value] + ↺ */
const FontSizeStepper: React.FC<FontSizeStepperProps> = ({
  value,
  min,
  max,
  step,
  defaultValue,
  resetLabel,
  onChange,
}) => {
  const { t } = useTranslation();
  // Defensive bound only; the parent already clamps via clampFontSize before persisting.
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className='flex items-center gap-10px ml-auto'>
      <Button
        size='mini'
        type='secondary'
        shape='circle'
        aria-label={t('settings.fontSizeDecrease')}
        className='w-28px h-28px !min-w-28px flex items-center justify-center p-0'
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
      >
        -
      </Button>
      <span className='text-13px text-t-primary text-center min-w-32px' style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      <Button
        size='mini'
        type='secondary'
        shape='circle'
        aria-label={t('settings.fontSizeIncrease')}
        className='w-28px h-28px !min-w-28px flex items-center justify-center p-0'
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
      >
        +
      </Button>
      <Button
        size='small'
        type='text'
        className='px-4px h-28px'
        onClick={() => onChange(defaultValue)}
        disabled={value === defaultValue}
      >
        {resetLabel}
      </Button>
    </div>
  );
};

export default FontSizeStepper;
