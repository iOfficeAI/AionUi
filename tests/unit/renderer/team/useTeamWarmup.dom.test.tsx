/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureSessionMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      ensureSession: { invoke: (...args: unknown[]) => ensureSessionMock(...args) },
    },
  },
}));

import { useTeamWarmup } from '@/renderer/pages/team/hooks/useTeamWarmup';

describe('useTeamWarmup', () => {
  beforeEach(() => {
    ensureSessionMock.mockReset();
  });

  it('starts in warming and becomes ready when the team session resolves', async () => {
    ensureSessionMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    expect(result.current.phase).toBe('warming');
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(ensureSessionMock).toHaveBeenCalledWith({ team_id: 'team-1' });
  });

  it('goes to error when the team session fails to start', async () => {
    ensureSessionMock.mockRejectedValue(new Error('leader failed'));
    const { result } = renderHook(() => useTeamWarmup('team-1'));

    expect(result.current.phase).toBe('warming');
    await waitFor(() => expect(result.current.phase).toBe('error'));
  });

  it('is immediately ready with no team id', () => {
    const { result } = renderHook(() => useTeamWarmup(''));
    expect(result.current.phase).toBe('ready');
    expect(ensureSessionMock).not.toHaveBeenCalled();
  });
});
