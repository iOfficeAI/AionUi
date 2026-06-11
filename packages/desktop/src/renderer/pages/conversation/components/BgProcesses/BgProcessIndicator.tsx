/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BgProcessIndicator — compact pill shown in the remote OpenCode
 * conversation header when at least one background process is running.
 *
 * Renders nothing when there are zero running processes (so the header
 * layout doesn't shift). Clicking the pill invokes `onOpen` so the parent
 * can mount the BgProcessPanel.
 */

import type { BgProcessUiInfo } from '@/common/types/agent/bgProcessTypes';
import React from 'react';
import { useTranslation } from 'react-i18next';

type BgProcessIndicatorProps = {
  running: BgProcessUiInfo[];
  onOpen: () => void;
  /**
   * Render a tiny spinning dot. Defaults to true. Tests / stories can
   * pass `false` to assert on the static layout only.
   */
  pulse?: boolean;
  dataTestId?: string;
};

const PulseDot: React.FC = () => (
  <span
    aria-hidden='true'
    className='inline-block rd-full bg-success shrink-0'
    style={{
      width: 8,
      height: 8,
      animation: 'status-pill-breathe 1.6s ease-in-out infinite',
      boxShadow: '0 0 4px color-mix(in srgb, var(--success) 50%, transparent)',
    }}
  />
);

/**
 * Format a count using the i18n pseudo-plural pattern the project uses
 * elsewhere (two keys: `one` and `other`).
 */
const useBgProcessLabel = (count: number): string => {
  const { t } = useTranslation();
  if (count === 1) return t('agent.bgProcess.indicator.one', { defaultValue: '1 background process' });
  return t('agent.bgProcess.indicator.other', { count, defaultValue: '{{count}} background processes' });
};

const BgProcessIndicator: React.FC<BgProcessIndicatorProps> = ({ running, onOpen, pulse = true, dataTestId }) => {
  const label = useBgProcessLabel(running.length);

  // No running processes → render nothing. Returning null instead of an
  // empty pill keeps the header layout stable and prevents any
  // pointer-event / click target from blocking the badges to the right.
  if (running.length === 0) return null;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
    onOpen();
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <button
      type='button'
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-testid={dataTestId ?? 'bg-process-indicator'}
      aria-label={label}
      className='flex items-center gap-6px px-8px py-2px rd-12px bg-1 border border-b-light text-t-primary text-12px cursor-pointer hover:bg-2 focus:outline-none shrink-0'
      style={{ background: 'color-mix(in srgb, var(--success) 8%, var(--bg-1))' }}
    >
      {pulse ? <PulseDot /> : null}
      <span className='font-medium whitespace-nowrap'>{label}</span>
    </button>
  );
};

export default BgProcessIndicator;
