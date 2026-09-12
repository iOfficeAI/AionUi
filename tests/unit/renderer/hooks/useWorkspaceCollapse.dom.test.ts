/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceCollapse } from '@/renderer/pages/conversation/hooks/useWorkspaceCollapse';
import { dispatchWorkspaceEnsureOpenEvent } from '@/renderer/utils/workspace/workspaceEvents';

describe('useWorkspaceCollapse', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts collapsed by default on desktop', () => {
    const { result } = renderHook(() =>
      useWorkspaceCollapse({
        workspaceEnabled: true,
        isMobile: false,
        conversation_id: 'conv-1',
        preferenceKey: 'conv-1',
      })
    );

    expect(result.current.rightSiderCollapsed).toBe(true);
  });

  it('expands sidebar when WORKSPACE_ENSURE_OPEN_EVENT is dispatched', () => {
    const { result } = renderHook(() =>
      useWorkspaceCollapse({
        workspaceEnabled: true,
        isMobile: false,
        conversation_id: 'conv-1',
        preferenceKey: 'conv-1',
      })
    );

    expect(result.current.rightSiderCollapsed).toBe(true);

    act(() => {
      dispatchWorkspaceEnsureOpenEvent();
    });

    expect(result.current.rightSiderCollapsed).toBe(false);
    expect(localStorage.getItem('workspace-preference-conv-1')).toBe('expanded');
  });

  it('ignores ensure open event when workspace is disabled', () => {
    const { result } = renderHook(() =>
      useWorkspaceCollapse({
        workspaceEnabled: false,
        isMobile: false,
        conversation_id: 'conv-1',
        preferenceKey: 'conv-1',
      })
    );

    act(() => {
      dispatchWorkspaceEnsureOpenEvent();
    });

    expect(result.current.rightSiderCollapsed).toBe(true);
  });
});
