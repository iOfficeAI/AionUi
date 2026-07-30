/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';
import {
  acceptTeammateMessageId,
  normalizeTeammateMessage,
  useTeammateBackflow,
} from '@/renderer/pages/conversation/hooks/useTeammateBackflow';

const mergeLiveMessageMock = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMergeLiveMessage: () => mergeLiveMessageMock,
}));

const makeTeammateMessage = (overrides: Partial<TMessage> = {}): TMessage =>
  ({
    type: 'text',
    msg_id: 'msg-1',
    conversation_id: 'conv-1',
    content: 'hello',
    created_at: 1700000000000,
    ...overrides,
  }) as TMessage;

const makeEvent = (data: TMessage): IResponseMessage =>
  ({ type: 'teammate_message', data }) as unknown as IResponseMessage;

describe('acceptTeammateMessageId', () => {
  it('accepts a new id once and rejects duplicates', () => {
    const seen = new Set<string>();
    expect(acceptTeammateMessageId(seen, 'msg-1')).toBe(true);
    expect(acceptTeammateMessageId(seen, 'msg-1')).toBe(false);
    expect(acceptTeammateMessageId(seen, 'msg-2')).toBe(true);
  });

  it('always accepts messages without an id', () => {
    const seen = new Set<string>();
    expect(acceptTeammateMessageId(seen, undefined)).toBe(true);
    expect(acceptTeammateMessageId(seen, undefined)).toBe(true);
  });

  it('keeps dedup state isolated per set instance', () => {
    const seenA = new Set<string>();
    const seenB = new Set<string>();
    expect(acceptTeammateMessageId(seenA, 'msg-1')).toBe(true);
    expect(acceptTeammateMessageId(seenB, 'msg-1')).toBe(true);
    expect(acceptTeammateMessageId(seenA, 'msg-1')).toBe(false);
  });
});

describe('normalizeTeammateMessage', () => {
  it('normalizes plain string text content into rich content', () => {
    const result = normalizeTeammateMessage(makeTeammateMessage({ content: 'hello' }));
    expect(result.type).toBe('text');
    expect((result.content as { content: string }).content).toBe('hello');
  });

  it('parses JSON string text content', () => {
    const result = normalizeTeammateMessage(makeTeammateMessage({ content: '{"content":"rich"}' }));
    expect((result.content as { content: string }).content).toBe('rich');
  });

  it('passes non-text messages through untouched', () => {
    const toolMsg = makeTeammateMessage({ type: 'tool_call', content: { call_id: 'c1' } }) as TMessage;
    expect(normalizeTeammateMessage(toolMsg)).toBe(toolMsg);
  });
});

describe('useTeammateBackflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges teammate messages for the bound conversation', () => {
    const { result } = renderHook(() => useTeammateBackflow('conv-1'));
    result.current(makeEvent(makeTeammateMessage()));
    expect(mergeLiveMessageMock).toHaveBeenCalledTimes(1);
    const merged = mergeLiveMessageMock.mock.calls[0][0] as TMessage;
    expect(merged.msg_id).toBe('msg-1');
    expect((merged.content as { content: string }).content).toBe('hello');
  });

  it('ignores teammate messages for other conversations', () => {
    const { result } = renderHook(() => useTeammateBackflow('conv-1'));
    result.current(makeEvent(makeTeammateMessage({ conversation_id: 'conv-other' })));
    expect(mergeLiveMessageMock).not.toHaveBeenCalled();
  });

  it('dedups repeated msg_id and still forwards id-less messages', () => {
    const { result } = renderHook(() => useTeammateBackflow('conv-1'));
    result.current(makeEvent(makeTeammateMessage()));
    result.current(makeEvent(makeTeammateMessage()));
    result.current(makeEvent(makeTeammateMessage({ msg_id: undefined })));
    expect(mergeLiveMessageMock).toHaveBeenCalledTimes(2);
  });
});
