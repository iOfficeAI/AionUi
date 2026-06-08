/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * DOM render tests for `CommandCenterEditorHost`.
 *
 * The component is a shell-level host for the lazy-loaded editor surface
 * behind `React.lazy` + `Suspense`. These tests focus on the host's own
 * contract — gating by layout mode, the editor-pane chrome (dock-side
 * classes / flex order / resize-handle edge), and that toggling the dock
 * side does NOT remount the heavy editor surface.
 *
 * All heavy/contextual dependencies are mocked at the module boundary so the
 * host can render in jsdom without spinning up Monaco, the IPC bridge, the
 * router, or SWR. The real `editorDock` store is used (driven via
 * `persistEditorDock` / `localStorage`) so the toggle path is exercised
 * end-to-end.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks -----------------------------------------------------------------
// All hoisted vi.mock calls resolve their factories against the
// `@/...`-aliased paths below.

// Mount counter exposed by the lazy-entry mock so the test can prove the
// editor surface did NOT remount across a dock toggle. The mock factory
// stashes a singleton counter on the module exports and exports a tiny
// shim component that increments it inside `useEffect` (so it counts
// real mounts, not render passes).
const mountCounter = { value: 0 };
const resetMountCounter = () => {
  mountCounter.value = 0;
};

vi.mock('@/renderer/pages/conversation/Editor/editorLazyEntry', () => {
  const EditorLazyEntryShim: React.FC<{ workspaceRoot?: string }> = () => {
    React.useEffect(() => {
      mountCounter.value += 1;
    }, []);
    return <div data-testid='editor-lazy' />;
  };
  return {
    __esModule: true,
    default: EditorLazyEntryShim,
  };
});

const useEditorContextMock = vi.fn();
vi.mock('@/renderer/pages/conversation/Editor', () => ({
  // Default: expanded editor (`isOpen && !isCollapsed`). Tests override
  // per-case via `useEditorContextMock.mockReturnValueOnce(...)`.
  useEditorContext: () => useEditorContextMock(),
}));

const useLayoutModeSafeMock = vi.fn();
vi.mock('@/renderer/hooks/context/LayoutModeContext', () => ({
  useLayoutModeSafe: () => useLayoutModeSafeMock(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'conv-1' }),
  };
});

vi.mock('swr', () => ({
  // Default: workspace root resolved via the conversation.extra.workspace
  // path. Tests don't need to vary this — they only care that the SWR call
  // resolves to a defined workspace so the lazy entry mounts.
  default: () => ({ data: { extra: { workspace: '/ws' } } }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: vi.fn() },
    },
  },
}));

// react-i18next passthrough so the host's `t(key, { defaultValue })` resolves
// to a readable string in assertions if any is ever needed.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

// --- Test setup ------------------------------------------------------------

import CommandCenterEditorHost from '@/renderer/components/layout/CommandCenterEditorHost';
import { persistEditorDock } from '@/renderer/utils/layout/editorDock';

const STORAGE_KEY = 'aionui.commandCenter.editorDock';

const defaultEditorContext = () => ({
  isOpen: true,
  isCollapsed: false,
  expandEditor: vi.fn(),
});

const renderHost = async () => {
  const result = render(<CommandCenterEditorHost />);
  // Resolve React.Suspense by waiting for the lazy entry to mount.
  await screen.findByTestId('editor-lazy');
  return result;
};

describe('CommandCenterEditorHost', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useEditorContextMock.mockReset();
    useEditorContextMock.mockImplementation(defaultEditorContext);
    useLayoutModeSafeMock.mockReset();
    useLayoutModeSafeMock.mockReturnValue({ mode: 'command-center' });
    resetMountCounter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders nothing when layout mode is "chat" (gating)', () => {
    useLayoutModeSafeMock.mockReturnValue({ mode: 'chat' });

    const { container } = render(<CommandCenterEditorHost />);

    // The host should produce no `.editor-pane` element in non-command-center
    // modes.
    expect(container.querySelector('.editor-pane')).toBeNull();
  });

  it('renders the editor pane with dock="start" chrome and a right-edge resize handle when storage is empty', async () => {
    // localStorage empty → DEFAULT_EDITOR_DOCK 'start'.
    const { container } = await renderHost();

    const pane = container.querySelector('.editor-pane');
    expect(pane).not.toBeNull();
    expect(pane).toHaveClass('editor-pane--dock-start');
    expect(pane).not.toHaveClass('editor-pane--dock-end');

    // flex order: 1 when docked start.
    const style = (pane as HTMLElement).style;
    expect(style.order).toBe('1');

    // Resize handle is the drag-grip rendered by `useResizableSplit`'s
    // `createDragHandle` — a div with class `cursor-col-resize right-0` on
    // the right edge of the editor pane (when docked start).
    const handle = pane!.querySelector('.cursor-col-resize.right-0');
    expect(handle).not.toBeNull();
    expect(pane!.querySelector('.cursor-col-resize.left-0')).toBeNull();
  });

  it('renders the editor pane with dock="end" chrome and a left-edge resize handle when storage holds "end"', async () => {
    // Pre-seed localStorage so the very first read returns 'end' and React
    // does not flash the default 'start' chrome before the useEffect
    // subscription fires.
    window.localStorage.setItem(STORAGE_KEY, 'end');

    const { container } = await renderHost();

    const pane = container.querySelector('.editor-pane');
    expect(pane).not.toBeNull();
    expect(pane).toHaveClass('editor-pane--dock-end');
    expect(pane).not.toHaveClass('editor-pane--dock-start');

    // flex order: 2 when docked end.
    const style = (pane as HTMLElement).style;
    expect(style.order).toBe('2');

    // Resize handle is on the LEFT edge when docked end.
    const leftHandle = pane!.querySelector('.cursor-col-resize.left-0');
    expect(leftHandle).not.toBeNull();
    expect(pane!.querySelector('.cursor-col-resize.right-0')).toBeNull();
  });

  it('does NOT remount the lazy editor surface when the dock side is toggled at runtime', async () => {
    const { container } = await renderHost();

    // Sanity: the editor surface mounted exactly once.
    expect(mountCounter.value).toBe(1);

    // Toggle the dock side from 'start' to 'end' via the real persist path.
    act(() => {
      persistEditorDock('end');
    });

    // Wait for the next render to flush. The component's flex-order and
    // dock-side class should swap, but the editor chunk must stay mounted.
    await waitFor(() => {
      const pane = container.querySelector('.editor-pane');
      expect(pane).toHaveClass('editor-pane--dock-end');
    });

    // Critical assertion: the editor surface did NOT remount.
    expect(mountCounter.value).toBe(1);

    // The chrome should have flipped: order=2, left-edge handle present.
    const pane = container.querySelector('.editor-pane') as HTMLElement;
    expect(pane.style.order).toBe('2');
    expect(pane.querySelector('.cursor-col-resize.left-0')).not.toBeNull();
    expect(pane.querySelector('.cursor-col-resize.right-0')).toBeNull();
  });
});
