import { describe, it, expect, vi } from 'vitest';
import type { IAgentEventEmitter } from '../../src/process/task/IAgentEventEmitter';
import type { IAgentManager } from '../../src/process/task/IAgentManager';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
  utilityProcess: { fork: vi.fn(() => ({ on: vi.fn(), postMessage: vi.fn(), kill: vi.fn() })) },
}));
vi.mock('../../src/process/utils/shellEnv', () => ({ getEnhancedEnv: vi.fn(() => ({})) }));

function makeMockEmitter(): IAgentEventEmitter {
  return {
    emitConfirmationAdd: vi.fn(),
    emitConfirmationUpdate: vi.fn(),
    emitConfirmationRemove: vi.fn(),
    emitMessage: vi.fn(),
  };
}

import BaseAgentManager from '../../src/process/task/BaseAgentManager';

describe('BaseAgentManager with injected emitter', () => {
  it('addConfirmation calls emitter.emitConfirmationAdd', () => {
    const emitter = makeMockEmitter();
    class TestAgent extends BaseAgentManager<unknown> {
      constructor() {
        super('gemini', {}, emitter);
      }
      public testAdd(data: any) {
        this.addConfirmation(data);
      }
    }
    const agent = new TestAgent();
    (agent as any).conversation_id = 'c1';
    const confirmation = { id: 'conf1', callId: 'call1', options: [] };
    agent.testAdd(confirmation);
    expect(emitter.emitConfirmationAdd).toHaveBeenCalledWith('c1', confirmation);
  });

  it('addConfirmation calls emitter.emitConfirmationUpdate when confirmation already exists', () => {
    const emitter = makeMockEmitter();
    class TestAgent extends BaseAgentManager<unknown> {
      constructor() {
        super('gemini', {}, emitter);
      }
      public testAdd(data: any) {
        this.addConfirmation(data);
      }
    }
    const agent = new TestAgent();
    (agent as any).conversation_id = 'c1';
    const confirmation = { id: 'conf1', callId: 'call1', options: [] };
    agent.testAdd(confirmation);
    agent.testAdd(confirmation);
    expect(emitter.emitConfirmationUpdate).toHaveBeenCalledWith('c1', confirmation);
  });

  it('confirm calls emitter.emitConfirmationRemove', () => {
    const emitter = makeMockEmitter();
    class TestAgent extends BaseAgentManager<unknown> {
      constructor() {
        super('gemini', {}, emitter);
      }
      public testAdd(data: any) {
        this.addConfirmation(data);
      }
    }
    const agent = new TestAgent();
    (agent as any).conversation_id = 'c1';
    const confirmation = { id: 'conf1', callId: 'call1', options: [] };
    agent.testAdd(confirmation);
    agent.confirm('', 'call1', 'proceed');
    expect(emitter.emitConfirmationRemove).toHaveBeenCalledWith('c1', 'conf1');
  });

  it('satisfies IAgentManager interface', () => {
    const emitter = makeMockEmitter();
    class TestAgent extends BaseAgentManager<unknown> {
      constructor() {
        super('gemini', {}, emitter);
      }
    }
    const agent: IAgentManager = new TestAgent();
    expect(agent.type).toBe('gemini');
  });
});
