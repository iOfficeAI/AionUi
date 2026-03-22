/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigateFunction } from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { useConversationShortcuts } from '../../../src/renderer/hooks/ui/useConversationShortcuts';
import { useVisibleConversationIds } from '../../../src/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds';

vi.mock('../../../src/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds', () => ({
  useVisibleConversationIds: vi.fn(),
}));

const mockedUseVisibleConversationIds = vi.mocked(useVisibleConversationIds);

const createCancelableKeydown = (init: KeyboardEventInit): KeyboardEvent => {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
};

const createWrapper = (initialEntry: string): React.FC<React.PropsWithChildren> => {
  return ({ children }) => <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
};

describe('useConversationShortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedUseVisibleConversationIds.mockReset();
  });

  it('navigates to the next visible conversation on Ctrl+Tab', () => {
    mockedUseVisibleConversationIds.mockReturnValue(['1', '2', '3']);
    const navigate = vi.fn() as unknown as NavigateFunction;
    renderHook(() => useConversationShortcuts({ navigate }), {
      wrapper: createWrapper('/conversation/3'),
    });

    const event = createCancelableKeydown({ key: 'Tab', ctrlKey: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/conversation/1');
  });

  it('navigates to the previous visible conversation on Ctrl+Shift+Tab', () => {
    mockedUseVisibleConversationIds.mockReturnValue(['1', '2', '3']);
    const navigate = vi.fn() as unknown as NavigateFunction;
    renderHook(() => useConversationShortcuts({ navigate }), {
      wrapper: createWrapper('/conversation/1'),
    });

    const event = createCancelableKeydown({ key: 'Tab', ctrlKey: true, shiftKey: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/conversation/3');
  });

  it('opens the guid page on Cmd/Ctrl+T and prevents the browser default', () => {
    mockedUseVisibleConversationIds.mockReturnValue(['1', '2', '3']);
    const navigate = vi.fn() as unknown as NavigateFunction;
    renderHook(() => useConversationShortcuts({ navigate }), {
      wrapper: createWrapper('/conversation/2'),
    });

    const ctrlEvent = createCancelableKeydown({ key: 't', ctrlKey: true });
    act(() => {
      window.dispatchEvent(ctrlEvent);
    });

    expect(ctrlEvent.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/guid');

    const metaEvent = createCancelableKeydown({ key: 't', metaKey: true });
    act(() => {
      window.dispatchEvent(metaEvent);
    });

    expect(metaEvent.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('does not navigate on Ctrl+Tab when the current conversation is not in the visible list', () => {
    mockedUseVisibleConversationIds.mockReturnValue(['1', '2', '3']);
    const navigate = vi.fn() as unknown as NavigateFunction;
    renderHook(() => useConversationShortcuts({ navigate }), {
      wrapper: createWrapper('/conversation/9'),
    });

    const event = createCancelableKeydown({ key: 'Tab', ctrlKey: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate on Ctrl+Tab when fewer than two visible conversations exist', () => {
    mockedUseVisibleConversationIds.mockReturnValue(['1']);
    const navigate = vi.fn() as unknown as NavigateFunction;
    renderHook(() => useConversationShortcuts({ navigate }), {
      wrapper: createWrapper('/conversation/1'),
    });

    const event = createCancelableKeydown({ key: 'Tab', ctrlKey: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
