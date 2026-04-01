import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdWorkers: MockWorkerProcess[] = [];
const forkMock = vi.fn(() => {
  const worker = new MockWorkerProcess();
  createdWorkers.push(worker);
  return worker;
});

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: {
      isPackaged: () => false,
      getAppPath: () => null,
    },
    worker: {
      fork: forkMock,
    },
  }),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: () => ({ PATH: '/usr/bin' }),
}));

import { ForkTask } from '@/process/worker/fork/ForkTask';

class MockWorkerProcess {
  killed = false;
  messages: Array<Record<string, unknown>> = [];
  private handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  postMessage(message: unknown): void {
    const payload = message as Record<string, unknown>;
    this.messages.push(payload);
    if (this.killed) {
      return;
    }

    const pipeId = typeof payload.pipeId === 'string' ? payload.pipeId : undefined;
    if (!pipeId) {
      return;
    }

    queueMicrotask(() => {
      this.emit('message', {
        type: `${pipeId}.callback`,
        data: {
          state: 'fulfilled',
          data: payload.type,
        },
      });
    });
  }

  on(event: string, handler: (...args: unknown[]) => void): this {
    const current = this.handlers.get(event) ?? [];
    current.push(handler);
    this.handlers.set(event, current);
    return this;
  }

  kill(): void {
    this.killed = true;
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

describe('ForkTask restart behavior', () => {
  beforeEach(() => {
    createdWorkers.length = 0;
    forkMock.mockClear();
  });

  it('recreates the worker process when start is called after kill', async () => {
    const task = new ForkTask('/tmp/mock-worker.js', { greeting: 'hello' });

    await expect(task.start()).resolves.toBe('start');
    expect(forkMock).toHaveBeenCalledTimes(1);
    expect(createdWorkers).toHaveLength(1);

    const firstWorker = createdWorkers[0];
    task.kill();
    expect(firstWorker.killed).toBe(true);

    await expect(task.start()).resolves.toBe('start');
    expect(forkMock).toHaveBeenCalledTimes(2);
    expect(createdWorkers).toHaveLength(2);
    expect(createdWorkers[1]).not.toBe(firstWorker);
    expect(createdWorkers[1].messages[0]?.type).toBe('start');
  });
});
