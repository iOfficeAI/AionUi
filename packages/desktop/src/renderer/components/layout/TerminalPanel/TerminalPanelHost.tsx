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
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { useTerminalPanel } from '@renderer/hooks/context/TerminalPanelContext';
import TerminalPanel from '.';

type Props = {
  isMobile: boolean;
  children: React.ReactNode;
};

const MIN_TOP_PCT = 20;
const MIN_TERM_PCT = 10;
const COLLAPSED_PCT = 0;

const TerminalPanelHost: React.FC<Props> = ({ isMobile, children }) => {
  const panel = useTerminalPanel();
  const handleRef = useRef<ImperativePanelHandle>(null);

  // Drive panel collapse/expand from context state.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const collapsed = handle.isCollapsed();
    if (panel.open && collapsed) {
      handle.expand();
    } else if (!panel.open && !collapsed) {
      handle.collapse();
    }
  }, [panel.open]);

  // After mount, restore the persisted height when expanding for the first time.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    if (panel.open && !handle.isCollapsed()) {
      handle.resize(panel.heightPct);
    }
    // Run only on initial open; subsequent user resizes are captured via onResize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.open]);

  const handleResize = useCallback(
    (size: number) => {
      // Ignore the noise resize-to-zero that fires on collapse.
      if (size > 0) panel.setHeightPct(size);
    },
    [panel]
  );

  // On mobile we don't expose the terminal at all.
  if (isMobile) {
    return <>{children}</>;
  }

  return (
    <PanelGroup direction='vertical' className='flex-1 min-h-0'>
      <Panel defaultSize={70} minSize={MIN_TOP_PCT} className='min-h-0'>
        <div className='size-full overflow-auto flex flex-col min-h-0'>{children}</div>
      </Panel>
      <PanelResizeHandle
        className='h-4px shrink-0 bg-transparent hover:bg-[var(--color-border-2)] active:bg-[var(--color-border-2)] transition-colors cursor-row-resize'
        aria-label='Resize terminal panel'
      />
      <Panel
        ref={handleRef}
        collapsible
        collapsedSize={COLLAPSED_PCT}
        defaultSize={panel.open ? panel.heightPct : COLLAPSED_PCT}
        minSize={MIN_TERM_PCT}
        onCollapse={() => panel.close()}
        onExpand={() => panel.open_()}
        onResize={handleResize}
        className='min-h-0'
      >
        <TerminalPanel />
      </Panel>
    </PanelGroup>
  );
};

export default TerminalPanelHost;
