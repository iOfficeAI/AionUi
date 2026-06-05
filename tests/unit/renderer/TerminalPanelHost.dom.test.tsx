/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImperativePanelHandle } from 'react-resizable-panels';

import TerminalPanelHost from '@/renderer/components/layout/TerminalPanel/TerminalPanelHost';
import type { LayoutMode } from '@/renderer/utils/layout/layoutModeStorage';

const mockResize = vi.fn();
const mockExpand = vi.fn();
const mockCollapse = vi.fn();
const mockIsCollapsed = vi.fn(() => false);
vi.mock('react-resizable-panels', () => {
  const Panel = React.forwardRef<
    ImperativePanelHandle,
    {
      defaultSize?: number;
      children?: React.ReactNode;
      onCollapse?: () => void;
      onExpand?: () => void;
      onResize?: (size: number) => void;
    }
  >(({ defaultSize, children, onCollapse, onExpand, onResize }, ref) => {
    const isBottomPanel = onCollapse !== undefined;
    if (isBottomPanel) {
      React.useImperativeHandle(ref, () => ({
        resize: mockResize,
        expand: mockExpand,
        collapse: mockCollapse,
        isCollapsed: mockIsCollapsed,
      }));
    }
    const testId = isBottomPanel ? 'bottom-panel' : 'top-panel';
    return (
      <div data-testid={testId} data-default-size={defaultSize}>
        {isBottomPanel ? (
          <>
            <button type='button' data-testid='trigger-collapse' onClick={() => onCollapse?.()}>
              collapse
            </button>
            <button type='button' data-testid='trigger-expand' onClick={() => onExpand?.()}>
              expand
            </button>
            <button type='button' data-testid='trigger-resize' onClick={() => onResize?.(42)}>
              resize
            </button>
          </>
        ) : null}
        {children}
      </div>
    );
  });
  const PanelGroup = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const PanelResizeHandle = (props: { 'aria-label'?: string }) => (
    <div data-testid='resize-handle' aria-label={props['aria-label']} />
  );
  return { Panel, PanelGroup, PanelResizeHandle };
});

vi.mock('@icon-park/react', () => ({
  CloseSmall: () => <span data-testid='icon-close' />,
}));

vi.mock('@/renderer/components/layout/TerminalPanel', () => ({
  default: () => <div data-testid='terminal-panel-content'>terminal</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

const mockSetHeightPct = vi.fn();
const mockOpen = vi.fn();
const mockClose = vi.fn();
const mockSetMode = vi.fn();
const mockSetPaneSizesForMode = vi.fn();

let mockPanelState = {
  open: true,
  heightPct: 35,
  toggle: vi.fn(),
  open_: mockOpen,
  close: mockClose,
  setHeightPct: mockSetHeightPct,
};

let mockLayoutModeState: {
  mode: LayoutMode;
  paneSizes: Partial<Record<LayoutMode, number[]>>;
  modeRefreshCount: number;
  setMode: typeof mockSetMode;
  setPaneSizesForMode: typeof mockSetPaneSizesForMode;
} = {
  mode: 'default',
  paneSizes: {},
  modeRefreshCount: 0,
  setMode: mockSetMode,
  setPaneSizesForMode: mockSetPaneSizesForMode,
};

vi.mock('@renderer/hooks/context/TerminalPanelContext', () => ({
  useTerminalPanel: () => mockPanelState,
}));

vi.mock('@renderer/hooks/context/LayoutModeContext', () => ({
  useLayoutModeSafe: () => mockLayoutModeState,
}));

const renderHost = (overrides?: {
  open?: boolean;
  heightPct?: number;
  mode?: LayoutMode;
  paneSizes?: Partial<Record<LayoutMode, number[]>>;
}) => {
  mockPanelState = {
    ...mockPanelState,
    open: overrides?.open ?? true,
    heightPct: overrides?.heightPct ?? 35,
  };
  mockLayoutModeState = {
    ...mockLayoutModeState,
    mode: overrides?.mode ?? 'default',
    paneSizes: overrides?.paneSizes ?? {},
    modeRefreshCount: 0,
  };
  return render(
    <TerminalPanelHost isMobile={false}>
      <div data-testid='main-content'>content</div>
    </TerminalPanelHost>
  );
};

describe('TerminalPanelHost — terminal sizing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCollapsed.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses persisted panel.heightPct in default mode when terminal is open', () => {
    renderHost({ heightPct: 42, mode: 'default' });
    const panel = screen.getByTestId('bottom-panel');
    expect(panel.getAttribute('data-default-size')).toBe('42');
  });

  it('resizes to persisted height when opening from a collapsed panel', () => {
    mockIsCollapsed.mockReturnValue(true);
    renderHost({ open: true, heightPct: 42, mode: 'default' });
    expect(mockExpand).toHaveBeenCalled();
    expect(mockResize).toHaveBeenCalledWith(42);
  });

  it('uses layout-mode pane ratio in split-pane mode', () => {
    renderHost({
      heightPct: 35,
      mode: 'split-pane',
      paneSizes: { 'split-pane': [40, 60] },
    });
    const panel = screen.getByTestId('bottom-panel');
    expect(panel.getAttribute('data-default-size')).toBe('60');
  });

  it('clamps zero/corrupt pane sizes to minimum terminal percentage', () => {
    renderHost({
      mode: 'split-pane',
      paneSizes: { 'split-pane': [100, 0] },
    });
    const panel = screen.getByTestId('bottom-panel');
    expect(panel.getAttribute('data-default-size')).toBe('10');
  });

  it('calls context setter and imperative resize when split-pane mode forces terminal open', () => {
    const { rerender } = renderHost({ open: false, mode: 'default' });
    mockLayoutModeState = {
      ...mockLayoutModeState,
      mode: 'split-pane',
      paneSizes: { 'split-pane': [40, 55] },
      modeRefreshCount: 0,
    };
    rerender(
      <TerminalPanelHost isMobile={false}>
        <div data-testid='main-content'>content</div>
      </TerminalPanelHost>
    );
    expect(mockOpen).toHaveBeenCalled();
    expect(mockSetHeightPct).toHaveBeenCalledWith(55);
    expect(mockResize).toHaveBeenCalledWith(55);
  });

  it('renders resize handle when terminal is open', () => {
    renderHost({ open: true });
    expect(screen.getByTestId('resize-handle')).toBeInTheDocument();
  });

  it('persists drag resize into terminal height and active layout pane sizes', () => {
    renderHost({ mode: 'split-pane', paneSizes: { 'split-pane': [50, 50] } });
    fireEvent.click(screen.getByTestId('trigger-resize'));
    expect(mockSetHeightPct).toHaveBeenCalledWith(42);
    expect(mockSetPaneSizesForMode).toHaveBeenCalledWith('split-pane', [58, 42]);
  });

  it('shows terminal rail after collapse in split-pane mode', () => {
    renderHost({ mode: 'split-pane', paneSizes: { 'split-pane': [50, 50] } });
    fireEvent.click(screen.getByTestId('trigger-collapse'));
    expect(screen.getByLabelText('Expand terminal panel')).toBeInTheDocument();
  });
});
