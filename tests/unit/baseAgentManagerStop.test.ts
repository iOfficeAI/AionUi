/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests that BaseAgentManager.stop() clears the confirmations array.
 */

import { describe, it, expect, vi } from 'vitest';
import type { IAgentEventEmitter } from '../../src/process/task/IAgentEventEmitter';

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: { isPackaged: () => false, getAppPath: () => null },
    worker: {
      fork: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        postMessage: vi.fn(),
        kill: vi.fn(),
      })),
    },
  }),
}));
vi.mock('../../src/process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({})),
}));

function makeMockEmitter(): IAgentEventEmitter {
  return {
    emitConfirmationAdd: vi.fn(),
    emitConfirmationUpdate: vi.fn(),
    emitConfirmationRemove: vi.fn(),
    emitMessage: vi.fn(),
  };
}

import BaseAgentManager from '../../src/process/task/BaseAgentManager';

function makeAgent(type: any = 'gemini', data: any = {}) {
  const emitter = makeMockEmitter();
  class TestAgent extends BaseAgentManager<unknown> {
    constructor() {
      super(type, data, emitter);
    }
    public testAdd(conf: any) {
      this.addConfirmation(conf);
    }
    public mockPostMessage() {
      vi.spyOn(this as any, 'postMessagePromise').mockResolvedValue(undefined);
    }
  }
  const agent = new TestAgent();
  (agent as any).conversation_id = 'conv-test';
  return agent;
}

describe('BaseAgentManager.stop() clears confirmations', () => {
  it('should clear all pending confirmations when stop is called', async () => {
    const agent = makeAgent();
    agent.mockPostMessage();

    // Add some confirmations
    agent.testAdd({ id: 'c1', callId: 'k1', options: [] });
    agent.testAdd({ id: 'c2', callId: 'k2', options: [] });
    expect(agent.getConfirmations()).toHaveLength(2);

    await agent.stop();

    // Confirmations should be cleared
    expect(agent.getConfirmations()).toHaveLength(0);
  });

  it('should clear confirmations even if there are none', async () => {
    const agent = makeAgent();
    agent.mockPostMessage();

    expect(agent.getConfirmations()).toHaveLength(0);
    await agent.stop();
    expect(agent.getConfirmations()).toHaveLength(0);
  });
});
