import { describe, it, expect, vi } from 'vitest';

const mockFcp = {
  on: vi.fn().mockReturnThis(),
  postMessage: vi.fn(),
  kill: vi.fn(),
};

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: { isPackaged: () => false, getAppPath: () => null },
    worker: {
      fork: vi.fn(() => mockFcp),
    },
  }),
}));
vi.mock('../../src/process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({})),
}));

import { ForkTask } from '../../src/process/worker/fork/ForkTask';

describe('ForkTask.postMessagePromise when fcp is undefined', () => {
  it('rejects with a promise instead of throwing synchronously', async () => {
    const task = new ForkTask('test-path', {}, true);
    // Simulate child process exit by clearing fcp
    (task as any).fcp = undefined;

    await expect((task as any).postMessagePromise('stop.stream', {})).rejects.toThrow('fork task not enabled');
  });

  it('postMessage still throws synchronously when fcp is undefined', () => {
    const task = new ForkTask('test-path', {}, true);
    (task as any).fcp = undefined;

    expect(() => task.postMessage('test', {})).toThrow('fork task not enabled');
  });

  it('postMessage works when fcp is available', () => {
    const task = new ForkTask('test-path', {}, true);

    task.postMessage('test', { foo: 'bar' });
    expect(mockFcp.postMessage).toHaveBeenCalledWith({ type: 'test', data: { foo: 'bar' } });
  });
});
