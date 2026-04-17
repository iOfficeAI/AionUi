import { describe, it, expect, vi } from 'vitest';
import type { IAgentEventEmitter } from '../../src/process/task/IAgentEventEmitter';
import type { IAgentManager } from '../../src/process/task/IAgentManager';

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

/** Minimal concrete subclass exposing protected helpers for testing */
function makeAgent(type: any = 'gemini', data: any = {}, emitter?: IAgentEventEmitter) {
  const e = emitter ?? makeMockEmitter();
  class TestAgent extends BaseAgentManager<unknown> {
    constructor() {
      super(type, data, e);
    }
    public testAdd(conf: any) {
      this.addConfirmation(conf);
    }
    public mockPostMessage() {
      vi.spyOn(this as any, 'postMessagePromise').mockResolvedValue(undefined);
    }
  }
  const agent = new TestAgent();
  (agent as any).conversation_id = 'conv-' + type;
  return { agent, emitter: e };
}

describe('BaseAgentManager with injected emitter', () => {
  // --- addConfirmation ---

  it('addConfirmation calls emitter.emitConfirmationAdd', () => {
    const { agent, emitter } = makeAgent('gemini');
    const confirmation = { id: 'conf1', callId: 'call1', options: [] };
    agent.testAdd(confirmation);
    expect(emitter.emitConfirmationAdd).toHaveBeenCalledWith('conv-gemini', confirmation);
  });

  it('addConfirmation calls emitter.emitConfirmationUpdate when confirmation already exists', () => {
    const { agent, emitter } = makeAgent('acp');
    const confirmation = { id: 'conf1', callId: 'call1', options: [] };
    agent.testAdd(confirmation);
    agent.testAdd(confirmation);
    expect(emitter.emitConfirmationUpdate).toHaveBeenCalledWith('conv-acp', confirmation);
  });

  it('addConfirmation works for nanobot agent type', () => {
    const { agent, emitter } = makeAgent('nanobot');
    agent.testAdd({ id: 'conf2', callId: 'call2', options: [] });
    expect(emitter.emitConfirmationAdd).toHaveBeenCalledOnce();
  });

  it('addConfirmation works for openclaw-gateway agent type', () => {
    const { agent, emitter } = makeAgent('openclaw-gateway');
    agent.testAdd({ id: 'conf3', callId: 'call3', options: [] });
    expect(emitter.emitConfirmationAdd).toHaveBeenCalledOnce();
  });

  // --- yoloMode ---

  it('constructor sets yoloMode=true when data contains yoloMode', () => {
    const { agent } = makeAgent('acp', { yoloMode: true });
    expect((agent as any).yoloMode).toBe(true);
  });

  it('constructor leaves yoloMode=false when data has no yoloMode', () => {
    const { agent } = makeAgent('gemini', {});
    expect((agent as any).yoloMode).toBe(false);
  });

  it('addConfirmation auto-confirms in yoloMode (calls confirm after delay)', async () => {
    const { agent } = makeAgent('acp', { yoloMode: true });
    agent.mockPostMessage();
    const confirmSpy = vi.spyOn(agent, 'confirm');
    agent.testAdd({
      id: 'conf1',
      callId: 'call1',
      options: [{ value: 'proceed' }],
    });
    // Confirmation should NOT be added to the list
    expect(agent.getConfirmations()).toHaveLength(0);
    // After the 50 ms delay, confirm should be called
    await new Promise((r) => setTimeout(r, 80));
    expect(confirmSpy).toHaveBeenCalledWith('conf1', 'call1', 'proceed');
  });

  it('addConfirmation does NOT auto-confirm in yoloMode when options is empty', () => {
    const { agent, emitter } = makeAgent('gemini', { yoloMode: true });
    agent.testAdd({ id: 'conf1', callId: 'call1', options: [] });
    // Empty options → falls through to normal add
    expect(emitter.emitConfirmationAdd).toHaveBeenCalledOnce();
  });

  // --- confirm ---

  it('confirm calls emitter.emitConfirmationRemove', () => {
    const { agent, emitter } = makeAgent('openclaw-gateway');
    const confirmation = { id: 'conf1', callId: 'call1', options: [] };
    agent.testAdd(confirmation);
    agent.confirm('', 'call1', 'proceed');
    expect(emitter.emitConfirmationRemove).toHaveBeenCalledWith('conv-openclaw-gateway', 'conf1');
  });

  it('confirm with unknown callId does not call emitConfirmationRemove', () => {
    const { agent, emitter } = makeAgent('gemini');
    agent.testAdd({ id: 'conf1', callId: 'call1', options: [] });
    agent.confirm('', 'unknown-call', 'proceed');
    expect(emitter.emitConfirmationRemove).not.toHaveBeenCalled();
  });

  // --- getConfirmations ---

  it('getConfirmations returns current list', () => {
    const { agent } = makeAgent('acp');
    expect(agent.getConfirmations()).toHaveLength(0);
    agent.testAdd({ id: 'c1', callId: 'k1', options: [] });
    agent.testAdd({ id: 'c2', callId: 'k2', options: [] });
    expect(agent.getConfirmations()).toHaveLength(2);
  });

  // --- stop / sendMessage / ensureYoloMode ---

  it('stop() calls postMessagePromise with stop.stream', async () => {
    const { agent } = makeAgent('gemini');
    const spy = vi.spyOn(agent as any, 'postMessagePromise').mockResolvedValue(undefined);
    await agent.stop();
    expect(spy).toHaveBeenCalledWith('stop.stream', {});
  });

  it('stop() works for acp agent type', async () => {
    const { agent } = makeAgent('acp');
    const spy = vi.spyOn(agent as any, 'postMessagePromise').mockResolvedValue(undefined);
    await agent.stop();
    expect(spy).toHaveBeenCalledWith('stop.stream', {});
  });

  it('stop() resolves when worker process has already exited', async () => {
    const { agent } = makeAgent('gemini');
    vi.spyOn(agent as any, 'postMessagePromise').mockRejectedValue(new Error('fork task not enabled'));
    await expect(agent.stop()).resolves.toBeUndefined();
  });

  it('sendMessage() calls postMessagePromise with send.message', async () => {
    const { agent } = makeAgent('acp');
    const spy = vi.spyOn(agent as any, 'postMessagePromise').mockResolvedValue(undefined);
    await agent.sendMessage({ content: 'hello', msg_id: 'm1' });
    expect(spy).toHaveBeenCalledWith('send.message', {
      content: 'hello',
      msg_id: 'm1',
    });
  });

  it('sendMessage() works for nanobot agent type', async () => {
    const { agent } = makeAgent('nanobot');
    const spy = vi.spyOn(agent as any, 'postMessagePromise').mockResolvedValue(undefined);
    await agent.sendMessage({ content: 'hi' });
    expect(spy).toHaveBeenCalledWith('send.message', { content: 'hi' });
  });

  it('ensureYoloMode() returns false by default', async () => {
    const { agent } = makeAgent('gemini');
    expect(await agent.ensureYoloMode()).toBe(false);
  });

  // --- start ---

  it('start() without data calls super.start()', async () => {
    const { agent } = makeAgent('gemini');
    const spy = vi.spyOn(agent as any, 'postMessagePromise').mockResolvedValue(undefined);
    await agent.start();
    expect(spy).toHaveBeenCalledWith('start', expect.anything());
  });

  it('start() with data merges data before calling super.start()', async () => {
    const { agent } = makeAgent('gemini', { initial: true });
    const spy = vi.spyOn(agent as any, 'postMessagePromise').mockResolvedValue(undefined);
    await (agent as any).start({ extra: 42 });
    expect((agent as any).data.data).toEqual({ extra: 42 });
    expect(spy).toHaveBeenCalled();
  });

  // --- IAgentManager interface ---

  it('satisfies IAgentManager interface for gemini', () => {
    const { agent } = makeAgent('gemini');
    const typed: IAgentManager = agent;
    expect(typed.type).toBe('gemini');
  });

  it('satisfies IAgentManager interface for acp', () => {
    const { agent } = makeAgent('acp');
    expect(agent.type).toBe('acp');
  });
});
