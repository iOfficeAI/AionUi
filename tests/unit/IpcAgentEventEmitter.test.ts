import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  message: vi.fn(),
}));

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp') } }));
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      confirmation: {
        add: { emit: mocks.add },
        update: { emit: mocks.update },
        remove: { emit: mocks.remove },
      },
      responseStream: { emit: mocks.message },
    },
  },
}));

import { IpcAgentEventEmitter } from '../../src/process/task/IpcAgentEventEmitter';

describe('IpcAgentEventEmitter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emitConfirmationAdd calls ipcBridge with conversationId merged', () => {
    const emitter = new IpcAgentEventEmitter();
    const data = { id: 'conf1', callId: 'call1', options: [] } as any;
    emitter.emitConfirmationAdd('conv1', data);
    expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'conv1', id: 'conf1' }));
  });

  it('emitConfirmationUpdate calls ipcBridge with conversationId merged', () => {
    const emitter = new IpcAgentEventEmitter();
    const data = { id: 'conf1', callId: 'call1', options: [] } as any;
    emitter.emitConfirmationUpdate('conv1', data);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'conv1', id: 'conf1' }));
  });

  it('emitConfirmationRemove passes id and conversationId', () => {
    const emitter = new IpcAgentEventEmitter();
    emitter.emitConfirmationRemove('conv1', 'conf1');
    expect(mocks.remove).toHaveBeenCalledWith({ conversation_id: 'conv1', id: 'conf1' });
  });

  it('emitMessage calls ipcBridge.conversation.message.emit', () => {
    const emitter = new IpcAgentEventEmitter();
    emitter.emitMessage('conv1', { type: 'text', data: { content: 'hi', msg_id: 'm1' } });
    expect(mocks.message).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'conv1', type: 'text' }));
  });
});
