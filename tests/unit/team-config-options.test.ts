import { describe, expect, it, vi } from 'vitest';
import { createTeamConfigOptionsLoader } from '@/renderer/pages/team/hooks/teamConfigOptions';

describe('createTeamConfigOptionsLoader', () => {
  it('waits for team warmup before loading a conversation config snapshot', async () => {
    const calls: string[] = [];
    let resolveWarmup!: () => void;
    const warmupSession = vi.fn(() => {
      calls.push('warmup');
      return new Promise<void>((resolve) => {
        resolveWarmup = resolve;
      });
    });
    const getConfigOptions = vi.fn(async (team_id: string, conversation_id: string) => {
      calls.push(`get:${team_id}:${conversation_id}`);
      return {
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
    });
    const loader = createTeamConfigOptionsLoader({
      team_id: 'team-1',
      warmupSession,
      getConfigOptions,
    });

    const pending = loader('conversation-1');
    await Promise.resolve();

    expect(calls).toEqual(['warmup']);
    expect(getConfigOptions).not.toHaveBeenCalled();

    resolveWarmup();
    const result = await pending;

    expect(calls).toEqual(['warmup', 'get:team-1:conversation-1']);
    expect(result?.[0]?.current_value).toBe('gpt-5.5');
  });

  it('can await warmup explicitly when callers need the whole team ready', async () => {
    const calls: string[] = [];
    const warmupSession = vi.fn(async () => {
      calls.push('warmup');
    });
    const getConfigOptions = vi.fn(async (team_id: string, conversation_id: string) => {
      calls.push(`get:${team_id}:${conversation_id}`);
      return {
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
});
