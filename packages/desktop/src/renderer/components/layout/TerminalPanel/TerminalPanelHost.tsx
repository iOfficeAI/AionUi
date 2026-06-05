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
 *   - Consume the active layout mode from `LayoutModeContext` and reflect
 *     it in the visible split ratio / panel visibility so the mode switch
 *     is observable end-to-end.
 *   - Provide a Close button that synchronises the layout mode back to
 *     'default' when the user explicitly dismisses the terminal in
 *     split-pane mode.
 *   - Render a collapsed terminal rail (40 px clickable strip) when the
 *     user collapses the terminal while in split-pane mode.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { CloseSmall } from '@icon-park/react';

import { useTerminalPanel } from '@renderer/hooks/context/TerminalPanelContext';
import { useLayoutModeSafe } from '@renderer/hooks/context/LayoutModeContext';
import type { LayoutMode } from '@renderer/utils/layout/layoutModeStorage';
import {
  getTerminalHeightPctForMode,
  modeForcesTerminalOpen,
  modeHidesTerminal,
} from '@renderer/utils/layout/layoutModeStorage';
import TerminalPanel from '.';

type Props = {
  isMobile: boolean;
  children: React.ReactNode;
};

const MIN_TOP_PCT = 20;
const MIN_TERM_PCT = 10;
const COLLAPSED_PCT = 0;
const RAIL_HEIGHT_PX = 40;

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
  const modeRefreshCount = layoutMode?.modeRefreshCount ?? 0;

  const resolveTerminalHeightPct = useCallback(
    (mode: LayoutMode | undefined, persistedHeightPct: number): number => {
      if (mode && modeForcesTerminalOpen(mode)) {
        return clampTerminalHeightPct(getTerminalHeightPctForMode(mode, storedPaneSizes ?? {}));
      }
      return clampTerminalHeightPct(persistedHeightPct);
    },
    [storedPaneSizes]
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

  // React to layout-mode transitions and pane-size changes.
  // Uses a prev-mode ref to distinguish true mode switches from
  // pane-size-update re-renders, and a userCollapsedRef to prevent
  // stale pane-size writes from re-opening the terminal after the user
  // has manually collapsed it.
  const prevActiveModeRef = useRef<LayoutMode | undefined>(activeMode);
  const userCollapsedRef = useRef(false);

  useEffect(() => {
    if (!activeMode) return;

    const modeChanged = prevActiveModeRef.current !== activeMode;
    prevActiveModeRef.current = activeMode;

    if (modeChanged || (modeRefreshCount > 0 && !modeChanged)) {
      userCollapsedRef.current = false;
    }

    if (modeForcesTerminalOpen(activeMode)) {
      if (modeChanged || !userCollapsedRef.current) {
        openRef.current();
        applyTerminalHeight(getTerminalHeightPctForMode(activeMode, storedPaneSizes ?? {}));
      }
    } else if (modeHidesTerminal(activeMode)) {
      if (modeChanged) {
        closeRef.current();
      }
    }
  }, [activeMode, storedPaneSizes, modeRefreshCount, applyTerminalHeight]);

  // Terminal rail: when the user collapses the panel while in split-pane
  // mode, render a clickable 40 px strip at the bottom so the terminal
  // can be re-expanded without switching modes.
  const [terminalRailOpen, setTerminalRailOpen] = useState(false);

  const handleTerminalCollapse = useCallback(() => {
    userCollapsedRef.current = true;
    panel.close();
    if (activeMode === 'split-pane') {
      setTerminalRailOpen(true);
    }
  }, [activeMode, panel]);

  const handleTerminalExpand = useCallback(() => {
    userCollapsedRef.current = false;
    setTerminalRailOpen(false);
    panel.open_();
  }, [panel]);

  const handleRailClick = useCallback(() => {
    handleTerminalExpand();
  }, [handleTerminalExpand]);

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
  const bottomDefault = panel.open ? openBottomPct : COLLAPSED_PCT;

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
          collapsedSize={COLLAPSED_PCT}
          defaultSize={bottomDefault}
          minSize={MIN_TERM_PCT}
          onCollapse={handleTerminalCollapse}
          onExpand={handleTerminalExpand}
          onResize={handleResize}
          className='min-h-0'
        >
          <div className='flex flex-col size-full min-h-0'>
            <div className='flex-1 min-h-0'>
              <TerminalPanel />
            </div>
          </div>
        </Panel>
      </PanelGroup>
      {terminalRailOpen && activeMode === 'split-pane' && (
        <button
          type='button'
          className='absolute bottom-0 left-0 right-0 flex items-center justify-center gap-6px cursor-pointer hover:bg-[var(--bg-3)] transition-colors border-t border-t-light bg-bg-2'
          style={{ height: `${RAIL_HEIGHT_PX}px` }}
          onClick={handleRailClick}
          aria-label={t('terminal.railExpand', { defaultValue: 'Expand terminal panel' })}
        >
          <CloseSmall size={14} className='rotate-180' />
          <span className='text-xs text-t-secondary'>
            {t('terminal.railExpand', { defaultValue: 'Expand terminal panel' })}
          </span>
        </button>
      )}
    </div>
  );
};

export default TerminalPanelHost;
