import { describe, expect, it, vi } from 'vitest';
import { probeCodexModelInfo } from '@/process/agent/codex/appserver/CodexModelProbe';

describe('probeCodexModelInfo', () => {
  it('loads all account-scoped models without creating a thread', async () => {
    const client = {
      start: vi.fn(async () => {}),
      request: vi.fn(async () => ({
        data: [
          { id: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true },
          { id: 'gpt-5.6-terra', displayName: 'GPT-5.6-Terra' },
          { id: 'gpt-5.6-luna', displayName: 'GPT-5.6-Luna' },
        ],
      })),
      dispose: vi.fn(async () => {}),
    };

    const result = await probeCodexModelInfo({ command: '/usr/local/bin/codex', cwd: '/tmp' }, () => client as never);

    expect(result.currentModelId).toBe('gpt-5.6-sol');
    expect(result.availableModels).toEqual(
      expect.arrayContaining([
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
        { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna' },
      ])
    );
    expect(client.request).toHaveBeenCalledWith('model/list', {});
    expect(client.start).toHaveBeenCalledOnce();
    expect(client.dispose).toHaveBeenCalledOnce();
  });

  it('disposes the temporary app-server when model loading fails', async () => {
    const client = {
      start: vi.fn(async () => {}),
      request: vi.fn(async () => {
        throw new Error('model list failed');
      }),
      dispose: vi.fn(async () => {}),
    };

    await expect(probeCodexModelInfo({ command: 'codex', cwd: '/tmp' }, () => client as never)).rejects.toThrow(
      'model list failed'
    );
    expect(client.dispose).toHaveBeenCalledOnce();
  });
});
