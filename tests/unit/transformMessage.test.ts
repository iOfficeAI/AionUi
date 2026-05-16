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

  it('returns undefined for transient message types', () => {
    for (const type of [
      'start',
      'finish',
      'thought',
      'info',
      'system',
      'acp_model_info',
      'request_trace',
      'slash_commands_updated',
    ]) {
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

  it('does not warn for slash command refresh events', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = transformMessage(makeMessage('slash_commands_updated', { commands: [] }));

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
