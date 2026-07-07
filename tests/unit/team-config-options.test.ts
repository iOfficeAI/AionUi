import { describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { createTeamConfigOptionsLoader } from '@/renderer/pages/team/hooks/teamConfigOptions';

describe('createTeamConfigOptionsLoader', () => {
  const configOptionsResponse = {
    config_options: [
      {
        id: 'model',
        category: 'model',
        type: 'select',
        current_value: 'gpt-5.5',
        options: [{ value: 'gpt-5.5', label: 'GPT 5.5' }],
      },
    ],
  };

  it('loads a conversation config snapshot without warming the whole team', async () => {
    const calls: string[] = [];
    const warmupSession = vi.fn(() => {
      calls.push('warmup');
      return Promise.resolve();
    });
    const getConfigOptions = vi.fn(async (team_id: string, conversation_id: string) => {
      calls.push(`get:${team_id}:${conversation_id}`);
      return configOptionsResponse;
    });
    const loader = createTeamConfigOptionsLoader({
      team_id: 'team-1',
      warmupSession,
      getConfigOptions,
    });

    const result = await loader('conversation-1');

    expect(calls).toEqual(['get:team-1:conversation-1']);
    expect(warmupSession).not.toHaveBeenCalled();
    expect(result?.[0]?.current_value).toBe('gpt-5.5');
  });

  it('can await warmup explicitly when callers need the whole team ready', async () => {
    const calls: string[] = [];
    const warmupSession = vi.fn(async () => {
      calls.push('warmup');
    });
    const getConfigOptions = vi.fn(async (team_id: string, conversation_id: string) => {
      calls.push(`get:${team_id}:${conversation_id}`);
      return configOptionsResponse;
    });
    const loader = createTeamConfigOptionsLoader({
      team_id: 'team-1',
      warmupSession,
      getConfigOptions,
    });

    await loader.warmup();
    const result = await loader.load('conversation-1');

    expect(calls).toEqual(['warmup', 'get:team-1:conversation-1']);
    expect(result?.[0]?.current_value).toBe('gpt-5.5');
  });

  it('surfaces team runtime-not-ready without retrying config loads', async () => {
    vi.useFakeTimers();
    try {
      const runtimeNotReady = new BackendHttpError({
        method: 'GET',
        path: '/api/teams/team-1/conversations/conversation-1/config-options',
        status: 409,
        body: {
          success: false,
          error: 'Team agent runtime is not ready for conversation: conversation-1',
          code: 'TEAM_RUNTIME_NOT_READY',
          details: { conversation_id: 'conversation-1' },
        },
      });
      const warmupSession = vi.fn(async () => {});
      const getConfigOptions = vi.fn().mockRejectedValue(runtimeNotReady);
      const loader = createTeamConfigOptionsLoader({
        team_id: 'team-1',
        warmupSession,
        getConfigOptions,
      });

      const resultPromise = loader.load('conversation-1');
      const expectation = expect(resultPromise).rejects.toBe(runtimeNotReady);

      await vi.advanceTimersByTimeAsync(31_000);

      await expectation;
      expect(getConfigOptions).toHaveBeenCalledTimes(1);
      expect(warmupSession).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry ordinary config load failures', async () => {
    const error = new BackendHttpError({
      method: 'GET',
      path: '/api/teams/team-1/conversations/conversation-1/config-options',
      status: 400,
      body: {
        success: false,
        error: 'bad request',
        code: 'BAD_REQUEST',
      },
    });
    const getConfigOptions = vi.fn().mockRejectedValue(error);
    const loader = createTeamConfigOptionsLoader({
      team_id: 'team-1',
      warmupSession: vi.fn(async () => {}),
      getConfigOptions,
    });

    await expect(loader.load('conversation-1')).rejects.toBe(error);
    expect(getConfigOptions).toHaveBeenCalledTimes(1);
  });
});
