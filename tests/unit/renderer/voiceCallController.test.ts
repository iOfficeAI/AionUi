/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseMessage, ISendMessageResult } from '@/common/adapter/ipcBridge';
import type { VoiceCallCancelRequest, VoiceCallSendRequest } from '@/renderer/utils/emitter';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  offStream: vi.fn(),
  readCallStreamChunk: vi.fn(),
  streamListener: null as ((message: IResponseMessage) => void) | null,
  stopRead: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: vi.fn((listener: (message: IResponseMessage) => void) => {
          mocks.streamListener = listener;
          return mocks.offStream;
        }),
      },
    },
  },
}));

vi.mock('@/common/utils', () => ({
  uuid: () => 'call-session',
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: mocks.emit,
  },
}));

vi.mock('@/renderer/services/speech/voiceRead', () => ({
  voiceReadController: {
    getSnapshot: () => ({ status: 'idle' }),
    init: vi.fn(),
    onStreamError: vi.fn(),
    onStreamFinish: vi.fn(),
    readCallStreamChunk: mocks.readCallStreamChunk,
    setAutoEnabled: vi.fn(),
    stop: mocks.stopRead,
    subscribe: vi.fn(() => vi.fn()),
  },
}));

import { voiceCallController } from '@/renderer/services/speech/voiceCall/VoiceCallController';

const acceptedResult: ISendMessageResult = {
  msg_id: 'user-message',
  turn_id: 'turn-current',
  runtime: {
    state: 'running',
    turn_id: 'turn-current',
    updated_at: 1,
  },
};

describe('VoiceCallController', () => {
  beforeEach(() => {
    voiceCallController.stop();
    mocks.emit.mockClear();
    mocks.offStream.mockClear();
    mocks.readCallStreamChunk.mockClear();
    mocks.stopRead.mockClear();
    mocks.streamListener = null;
  });

  afterEach(() => {
    voiceCallController.stop();
  });

  it('drops a late stream from a different turn and reads the accepted turn', () => {
    voiceCallController.start('conversation-1');
    voiceCallController.submitTranscript('你好');

    const sendRequest = mocks.emit.mock.calls.find(
      ([event]) => event === 'voiceCall.send'
    )?.[1] as VoiceCallSendRequest;
    sendRequest.onAccepted(acceptedResult);

    mocks.streamListener?.({
      type: 'content',
      data: '旧回复',
      msg_id: 'assistant-old',
      turn_id: 'turn-old',
      conversation_id: 'conversation-1',
    });
    expect(mocks.readCallStreamChunk).not.toHaveBeenCalled();

    mocks.streamListener?.({
      type: 'content',
      data: '新回复',
      msg_id: 'assistant-current',
      turn_id: 'turn-current',
      conversation_id: 'conversation-1',
    });
    expect(mocks.readCallStreamChunk).toHaveBeenCalledWith('conversation-1', 'assistant-current', '新回复');
  });

  it('invalidates the old generation before barge-in cancellation completes', () => {
    voiceCallController.start('conversation-1');
    voiceCallController.submitTranscript('第一轮');
    const sendRequest = mocks.emit.mock.calls.find(
      ([event]) => event === 'voiceCall.send'
    )?.[1] as VoiceCallSendRequest;
    sendRequest.onAccepted(acceptedResult);

    voiceCallController.interrupt();
    const cancelRequest = mocks.emit.mock.calls.find(
      ([event]) => event === 'voiceCall.cancel'
    )?.[1] as VoiceCallCancelRequest;
    sendRequest.onError(new Error('late failure'));

    expect(voiceCallController.getSnapshot().status).toBe('starting');
    expect(voiceCallController.getSnapshot().error).toBeNull();
    cancelRequest.onStopped();
    expect(voiceCallController.getSnapshot().status).toBe('listening');
  });
});
