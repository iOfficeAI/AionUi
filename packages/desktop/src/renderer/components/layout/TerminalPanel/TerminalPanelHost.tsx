/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wires `<TerminalPanel>` into the layout via a native flex column.
 *
 * Responsibilities:
 *   - Bridge `TerminalPanelContext.open` ⇄ collapsed/expanded terminal area.
 *   - Persist user-driven resize back to `TerminalPanelContext.heightPct`.
 *   - On mobile, render the route content full-bleed and hide the terminal
 *     entirely (the panel does not apply to mobile form factors).
 *   - Terminal open/close is fully independent of layout mode.
 *   - Render a persistent 28px terminal blade at the bottom when the
 *     terminal is collapsed; full TerminalPanel when open.
 */

import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useTerminalPanel } from '@renderer/hooks/context/TerminalPanelContext';
import TerminalPanel from '.';

type Props = {
  isMobile: boolean;
  children: React.ReactNode;
};

const MIN_TOP_PCT = 20;
const MIN_TERM_PCT = 10;

const TerminalPanelHost: React.FC<Props> = ({ isMobile, children }) => {
  const { t } = useTranslation();
  const panel = useTerminalPanel();
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      const onMouseMove = (mouseEvent: MouseEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        if (rect.height <= 0) return;
        const pct = ((rect.bottom - mouseEvent.clientY) / rect.height) * 100;
        const clamped = Math.max(MIN_TERM_PCT, Math.min(100 - MIN_TOP_PCT, pct));
        panel.setHeightPct(clamped);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [panel.setHeightPct]
  );

  // On mobile we don't expose the terminal at all.
  if (isMobile) {
    return <>{children}</>;
  }

  return (
    <div ref={containerRef} className='relative flex flex-col flex-1 min-h-0'>
      <div className='flex-1 min-h-0 overflow-auto flex flex-col'>{children}</div>
      {panel.open && (
        <div
          className='terminal-resize-handle relative h-6px -my-3px z-10 shrink-0 cursor-row-resize flex items-center justify-center'
          onMouseDown={startDrag}
          aria-label={t('terminal.layout.resizeHandle', { defaultValue: 'Resize terminal panel' })}
          aria-orientation='vertical'
        >
          <span className='terminal-resize-handle__line w-full h-2px bg-[var(--color-border-2)]' aria-hidden='true' />
        </div>
      )}
      <div
        className='relative flex flex-col shrink-0 min-h-0 overflow-hidden bg-1'
        style={{ height: panel.open ? `${panel.heightPct}%` : '28px' }}
      >
        <TerminalPanel />
        {!panel.open && (
          <button
            type='button'
            className='terminal-blade absolute inset-0 w-full h-full z-20'
            onClick={() => panel.open_()}
            aria-label={t('terminal.expand', { defaultValue: 'Expand terminal' })}
            title={t('terminal.expand', { defaultValue: 'Expand terminal' })}
          >
            <span className='terminal-blade__label'>{t('terminal.bladeLabel', { defaultValue: 'Terminal' })}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default TerminalPanelHost;
