/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { Button } from '@arco-design/web-react';
import { Loading } from '@icon-park/react';
import React from 'react';
import MarqueePillLabel from './MarqueePillLabel';

type RuntimeSelectorPillProps = Omit<
  React.ComponentPropsWithoutRef<typeof Button>,
  'children' | 'loading' | 'className' | 'disabled' | 'onClick' | 'shape' | 'size' | 'style'
> & {
  testId?: string;
  className: string;
  label?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
};

export const RuntimeSelectorLoadingIndicator: React.FC = () => (
  <span data-testid='runtime-selector-loading-indicator' className='shrink-0 inline-flex items-center'>
    <Loading theme='outline' size={12} fill={iconColors.secondary} className='animate-spin' />
  </span>
);

const RuntimeSelectorPill = React.forwardRef<React.ElementRef<typeof Button>, RuntimeSelectorPillProps>(
  (
    { testId, className, label, leading, trailing, loading = false, disabled = false, onClick, style, ...buttonProps },
    ref
  ) => (
    <Button
      {...buttonProps}
      ref={ref}
      data-testid={testId}
      className={className}
      shape='round'
      size='small'
      disabled={disabled}
      onClick={onClick}
      style={style}
    >
      <span className='flex items-center gap-6px min-w-0 leading-none'>
        {leading}
        {label && <MarqueePillLabel>{label}</MarqueePillLabel>}
        {loading ? <RuntimeSelectorLoadingIndicator /> : trailing}
      </span>
    </Button>
  )
);

RuntimeSelectorPill.displayName = 'RuntimeSelectorPill';

export default RuntimeSelectorPill;
