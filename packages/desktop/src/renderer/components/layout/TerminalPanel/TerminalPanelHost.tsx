/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wires `<TerminalPanel>` into the layout via `react-resizable-panels`.
 *
 * Responsibilities:
 *   - Bridge `TerminalPanelContext.open` ⇄ Panel's imperative collapse state.
 *   - Persist user-driven resize back to `TerminalPanelContext.heightPct`.
 *   - On mobile, render the route content full-bleed and hide the terminal
 *     entirely (the panel does not apply to mobile form factors).
 *   - Terminal open/close is fully independent of layout mode.
 *   - Render a persistent 28px terminal blade at the bottom when the
 *     terminal is collapsed; full TerminalPanel when open.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { useTerminalPanel } from '@renderer/hooks/context/TerminalPanelContext';
import { useLayoutModeSafe } from '@renderer/hooks/context/LayoutModeContext';
import type { LayoutMode } from '@renderer/utils/layout/layoutModeStorage';
import TerminalPanel from '.';

type Props = {
  isMobile: boolean;
  children: React.ReactNode;
};

const MIN_TOP_PCT = 20;
const MIN_TERM_PCT = 10;

const clampTerminalHeightPct = (pct: number): number => {
  if (!Number.isFinite(pct)) return MIN_TERM_PCT;
  return Math.max(MIN_TERM_PCT, Math.min(100, pct));
};

const TerminalPanelHost: React.FC<Props> = ({ isMobile, children }) => {
  const { t } = useTranslation();
  const panel = useTerminalPanel();
  const layoutMode = useLayoutModeSafe();
  const handleRef = useRef<ImperativePanelHandle>(null);
  const resizeRafRef = useRef<number | null>(null);
  const openRef = useRef(panel.open_);
  const closeRef = useRef(panel.close);
  const setHeightPctRef = useRef(panel.setHeightPct);
  useEffect(() => {
    openRef.current = panel.open_;
  }, [panel.open_]);
  useEffect(() => {
    closeRef.current = panel.close;
  }, [panel.close]);
  useEffect(() => {
    setHeightPctRef.current = panel.setHeightPct;
  }, [panel.setHeightPct]);

  const activeMode: LayoutMode | undefined = layoutMode?.mode;
  const storedPaneSizes = layoutMode?.paneSizes;

  const resolveTerminalHeightPct = useCallback(
    (_mode: LayoutMode | undefined, persistedHeightPct: number): number => {
      return clampTerminalHeightPct(persistedHeightPct);
    },
    []
  );

  const resizeOpenPanel = useCallback((target: number) => {
    const clamped = clampTerminalHeightPct(target);

    const applyResize = () => {
      const handle = handleRef.current;
      if (!handle) return;
      if (handle.isCollapsed()) {
        handle.expand();
      }
      handle.resize(clamped);
    };

    applyResize();
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current);
    }
    resizeRafRef.current = requestAnimationFrame(() => {
      applyResize();
      resizeRafRef.current = requestAnimationFrame(() => {
        applyResize();
        resizeRafRef.current = null;
      });
    });
  }, []);

  const applyTerminalHeight = useCallback(
    (target: number) => {
      const clamped = clampTerminalHeightPct(target);
      setHeightPctRef.current(clamped);
      resizeOpenPanel(clamped);
    },
    [resizeOpenPanel]
  );

  useEffect(() => {
    return () => {
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  // Drive panel collapse/expand from context state.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const collapsed = handle.isCollapsed();
    if (panel.open && collapsed) {
      handle.expand();
      resizeOpenPanel(resolveTerminalHeightPct(activeMode, panel.heightPct));
    } else if (!panel.open && !collapsed) {
      handle.collapse();
    }
  }, [activeMode, panel.heightPct, panel.open, resizeOpenPanel, resolveTerminalHeightPct]);

  // After mount, restore the persisted height when expanding for the first time.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    if (panel.open && !handle.isCollapsed()) {
      resizeOpenPanel(resolveTerminalHeightPct(activeMode, panel.heightPct));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.open]);

  const userCollapsedRef = useRef(false);

  const handleTerminalCollapse = useCallback(() => {
    userCollapsedRef.current = true;
    panel.close();
  }, [panel]);

  const handleTerminalExpand = useCallback(() => {
    userCollapsedRef.current = false;
    panel.open_();
  }, [panel]);

  const setPaneSizesForMode = layoutMode?.setPaneSizesForMode;
  const handleResize = useCallback(
    (size: number) => {
      if (size <= 0) return;
      const terminalSize = clampTerminalHeightPct(size);
      panel.setHeightPct(terminalSize);
      if (activeMode && setPaneSizesForMode) {
        setPaneSizesForMode(activeMode, [Math.max(MIN_TOP_PCT, 100 - terminalSize), terminalSize]);
      }
    },
    [activeMode, panel, setPaneSizesForMode]
  );

  // On mobile we don't expose the terminal at all.
  if (isMobile) {
    return <>{children}</>;
  }

  const openBottomPct = resolveTerminalHeightPct(activeMode, panel.heightPct);
  const topDefault = Math.max(MIN_TOP_PCT, 100 - openBottomPct);
  const bottomDefault = panel.open ? openBottomPct : MIN_TERM_PCT;

  return (
    <div className='relative flex flex-col flex-1 min-h-0'>
      <PanelGroup direction='vertical' className='flex-1 min-h-0'>
        <Panel defaultSize={topDefault} minSize={MIN_TOP_PCT} className='min-h-0'>
          <div className='size-full overflow-auto flex flex-col min-h-0'>{children}</div>
        </Panel>
        <PanelResizeHandle
          className='terminal-resize-handle relative h-0 shrink-0 cursor-row-resize'
          aria-label={t('terminal.layout.resizeHandle', { defaultValue: 'Resize terminal panel' })}
          aria-orientation='vertical'
        >
          <span className='terminal-resize-handle__line' aria-hidden='true' />
        </PanelResizeHandle>
        <Panel
          ref={handleRef}
          collapsible
          collapsedSize={MIN_TERM_PCT}
          defaultSize={bottomDefault}
          minSize={MIN_TERM_PCT}
          onCollapse={handleTerminalCollapse}
          onExpand={handleTerminalExpand}
          onResize={handleResize}
          className='min-h-0 relative'
        >
          <div className={classNames('flex flex-col size-full min-h-0', { hidden: !panel.open })}>
            <div className='flex-1 min-h-0'>
              <TerminalPanel />
            </div>
          </div>
          {!panel.open && (
            <button
              type='button'
              className='terminal-blade absolute inset-0 w-full h-full'
              onClick={() => panel.open_()}
              aria-label={t('terminal.expand', { defaultValue: 'Expand terminal' })}
              title={t('terminal.expand', { defaultValue: 'Expand terminal' })}
            >
              <span className='terminal-blade__label'>
                {t('terminal.bladeLabel', { defaultValue: 'Terminal' })}
              </span>
            </button>
          )}
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default TerminalPanelHost;
