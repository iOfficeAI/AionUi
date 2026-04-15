import { beforeEach, describe, expect, it, vi } from 'vitest';

const childHandlers = vi.hoisted(() => new Map<string, (...args: any[]) => void>());
const mockChild = vi.hoisted(() => ({
  on: vi.fn((event: string, handler: (...args: any[]) => void) => {
    childHandlers.set(event, handler);
    return mockChild;
  }),
  kill: vi.fn(),
  postMessage: vi.fn(),
}));
const mockFork = vi.hoisted(() => vi.fn(() => mockChild));

vi.mock('@/renderer/utils/common', () => ({ uuid: vi.fn(() => 'pipe-id') }));
vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: {
      isPackaged: () => false,
      getAppPath: () => null,
    },
    worker: {
      fork: mockFork,
    },
  }),
}));
vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: () => ({ PATH: '/usr/bin' }),
}));

import { ForkTask } from '@process/worker/fork/ForkTask';

describe('ForkTask unexpected exit handling', () => {
  beforeEach(() => {
    childHandlers.clear();
    mockFork.mockClear();
    mockChild.on.mockClear();
    mockChild.kill.mockClear();
    mockChild.postMessage.mockClear();
  });

  it('emits exit when the worker process dies unexpectedly', () => {
    const task = new ForkTask('/fake-worker.js', { foo: 'bar' });
    const onExit = vi.fn();
    task.on('exit', onExit);

    childHandlers.get('exit')?.(1, null);

    expect(onExit.mock.calls[0]?.[0]).toEqual({ code: 1, signal: null });
  });

  it('does not emit exit after a controlled kill', () => {
    const task = new ForkTask('/fake-worker.js', { foo: 'bar' });
    const onExit = vi.fn();
    task.on('exit', onExit);

    task.kill();
    childHandlers.get('exit')?.(null, 'SIGTERM');

    expect(mockChild.kill).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
  });
});
