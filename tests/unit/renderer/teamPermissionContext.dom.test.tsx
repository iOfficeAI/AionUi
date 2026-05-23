/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const { ensureSessionInvoke, setSessionModeInvoke } = vi.hoisted(() => ({
  ensureSessionInvoke: vi.fn(() => Promise.resolve()),
  setSessionModeInvoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      ensureSession: {
        invoke: ensureSessionInvoke,
      },
      setSessionMode: {
        invoke: setSessionModeInvoke,
      },
    },
  },
}));

import { TeamPermissionProvider, useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';

const WarmupProbe: React.FC = () => {
  const teamPermission = useTeamPermission();

  useEffect(() => {
    if (!teamPermission) return;
    void Promise.all([teamPermission.warmupSession(), teamPermission.warmupSession()]);
  }, [teamPermission]);

  return null;
};

describe('TeamPermissionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses the same ensureSession request for repeated warmup calls', async () => {
    render(
      <TeamPermissionProvider
        team_id='team-1'
        isLeaderAgent
        leaderConversationId='conv-1'
        allConversationIds={['conv-1']}
      >
        <WarmupProbe />
      </TeamPermissionProvider>
    );

    await waitFor(() => {
      expect(ensureSessionInvoke).toHaveBeenCalledTimes(1);
      expect(ensureSessionInvoke).toHaveBeenCalledWith({ team_id: 'team-1' });
    });
  });

  it('warms the session automatically on provider mount', async () => {
    render(
      <TeamPermissionProvider
        team_id='team-auto'
        isLeaderAgent
        leaderConversationId='conv-auto'
        allConversationIds={['conv-auto']}
      >
        <div />
      </TeamPermissionProvider>
    );

    await waitFor(() => {
      expect(ensureSessionInvoke).toHaveBeenCalledWith({ team_id: 'team-auto' });
    });
  });

  it('retries warmup after a failed ensureSession call', async () => {
    ensureSessionInvoke.mockRejectedValueOnce(new Error('boot failed')).mockResolvedValueOnce(undefined);

    let latest: ReturnType<typeof useTeamPermission> = null;
    const Probe: React.FC = () => {
      latest = useTeamPermission();
      return null;
    };

    render(
      <TeamPermissionProvider
        team_id='team-1'
        isLeaderAgent
        leaderConversationId='conv-1'
        allConversationIds={['conv-1']}
      >
        <Probe />
      </TeamPermissionProvider>
    );

    await waitFor(() => {
      expect(latest).not.toBeNull();
    });

    await latest!.warmupSession();
    await latest!.warmupSession();

    expect(ensureSessionInvoke).toHaveBeenCalledTimes(2);
  });
});
