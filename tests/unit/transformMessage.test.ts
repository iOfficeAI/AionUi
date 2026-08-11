/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { transformMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';

const makeMessage = (type: string, data: unknown = 'test'): IResponseMessage => ({
  type,
  msg_id: 'msg-1',
  conversation_id: 'conv-1',
  data,
});

describe('transformMessage', () => {
  it('transforms error messages into tips with error type', () => {
    const result = transformMessage(makeMessage('error', 'something went wrong'));
    expect(result).toBeDefined();
    expect(result!.type).toBe('tips');
    expect(result!.content).toEqual({ content: 'something went wrong', type: 'error' });
  });

  it('transforms content messages into text', () => {
    const result = transformMessage(makeMessage('content', 'hello'));
    expect(result).toBeDefined();
    expect(result!.type).toBe('text');
    expect(result!.position).toBe('left');
  });

  it('transforms user_content messages into right-aligned text', () => {
    const result = transformMessage(makeMessage('user_content', 'user msg'));
    expect(result).toBeDefined();
    expect(result!.type).toBe('text');
    expect(result!.position).toBe('right');
  });

  it('preserves user_content text exactly', () => {
    const content = '<think>\ninternal reasoning\n</think>\nvisible answer\n[SKILL_SUGGEST]raw[/SKILL_SUGGEST]';
    const result = transformMessage(makeMessage('user_content', content));

    expect(result).toMatchObject({
      type: 'text',
      position: 'right',
      content: { content },
    });
  });

  it('transforms Codex context events into center timeline messages', () => {
    const result = transformMessage(
      makeMessage('codex_context_event', {
        event: 'compaction_completed',
        status: 'completed',
        itemId: 'compact-1',
      })
    );

    expect(result).toMatchObject({
      type: 'codex_context_event',
      position: 'center',
      content: {
        event: 'compaction_completed',
        status: 'completed',
        itemId: 'compact-1',
      },
    });
  });

  it('transforms Codex agent events without using generic tool cards', () => {
    const result = transformMessage(
      makeMessage('codex_agent_event', {
        callId: 'spawn-1',
        action: 'spawnAgent',
        status: 'running',
        receiverThreadIds: ['thread-2'],
        agents: [{ threadId: 'thread-2', status: 'running' }],
      })
    );

    expect(result).toMatchObject({
      type: 'codex_agent_event',
      position: 'left',
      content: {
        callId: 'spawn-1',
        action: 'spawnAgent',
        receiverThreadIds: ['thread-2'],
      },
    });
  });

  it('transforms Codex agent transcripts into dedicated left-aligned messages', () => {
    const result = transformMessage(
      makeMessage('codex_agent_transcript', {
        callId: 'wait-1',
        threadId: 'thread-2',
        itemId: 'message-1',
        content: 'worker output',
      })
    );

    expect(result).toMatchObject({
      type: 'codex_agent_transcript',
      msg_id: 'msg-1',
      position: 'left',
      content: {
        callId: 'wait-1',
        threadId: 'thread-2',
        itemId: 'message-1',
        content: 'worker output',
      },
    });
  });

  it('returns undefined for transient message types', () => {
    for (const type of ['start', 'finish', 'thought', 'info', 'system', 'acp_model_info', 'request_trace']) {
      expect(transformMessage(makeMessage(type))).toBeUndefined();
    }
  });

  it('does not warn for info messages', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = transformMessage(makeMessage('info', 'retrying'));

    expect(result).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warns and returns undefined for unknown message types instead of throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = transformMessage(makeMessage('some_unknown_type'));
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unsupported message type 'some_unknown_type'"));
    warnSpy.mockRestore();
  });
});
