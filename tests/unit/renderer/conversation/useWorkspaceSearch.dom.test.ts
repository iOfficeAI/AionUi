/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceSearch } from '@/renderer/pages/conversation/Workspace/hooks/useWorkspaceSearch';

describe('useWorkspaceSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('opens the search input and focuses it when the toolbar action is triggered', () => {
    const { result } = renderHook(() =>
      useWorkspaceSearch({
        workspace: 'E:/code/demo',
        loadWorkspace: vi.fn().mockResolvedValue([{ children: [{ relativePath: 'a.txt' }] }]),
      })
    );
    const focus = vi.fn();

    act(() => {
      result.current.searchInputRef.current = { focus } as RefInputType;
      result.current.toggleSearch();
    });

    expect(result.current.showSearch).toBe(true);

    act(() => {
      vi.runAllTimers();
    });

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('hides the search input when toggled again with an empty query', () => {
    const { result } = renderHook(() =>
      useWorkspaceSearch({
        workspace: 'E:/code/demo',
        loadWorkspace: vi.fn().mockResolvedValue([]),
      })
    );

    act(() => {
      result.current.toggleSearch();
    });

    expect(result.current.showSearch).toBe(true);

    act(() => {
      result.current.toggleSearch();
    });

    expect(result.current.showSearch).toBe(false);
  });
});
