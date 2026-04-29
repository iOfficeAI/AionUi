/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { IResponseMessage } from '../../src/common/adapter/ipcBridge';
import {
  transformMessage,
  composeMessage,
  joinPath,
  type IMessageText,
  type IMessageTips,
  type CronMessageMeta,
} from '../../src/common/chat/chatLib';

// ---------------------------------------------------------------------------
// joinPath
// ---------------------------------------------------------------------------

describe('joinPath', () => {
  it('joins base path and relative path with forward slash', () => {
    expect(joinPath('/base/path', 'relative/file.txt')).toBe('/base/path/relative/file.txt');
  });

  it('normalizes Windows backslashes to forward slashes', () => {
    expect(joinPath('C:\\Users\\test', 'documents\\file.txt')).toBe('C:/Users/test/documents/file.txt');
  });

  it('removes trailing slashes from base path', () => {
    expect(joinPath('/base/path/', 'file.txt')).toBe('/base/path/file.txt');
    expect(joinPath('/base/path///', 'file.txt')).toBe('/base/path/file.txt');
  });

  it('handles relative path with ./ prefix', () => {
    expect(joinPath('/base', './relative/file.txt')).toBe('/base/relative/file.txt');
  });

  it('handles relative path with ../ by removing segments from relative path only', () => {
    // Note: joinPath processes .. within the relative path segments only,
    // it does not traverse up the base path directories
    expect(joinPath('/base/sub/deep', '../file.txt')).toBe('/base/sub/deep/file.txt');
    expect(joinPath('/base/sub/deep', 'subdir/../file.txt')).toBe('/base/sub/deep/file.txt');
  });

  it('handles multiple consecutive slashes in result', () => {
    expect(joinPath('/base//path', '//relative//file.txt')).toBe('/base/path/relative/file.txt');
  });

  it('handles empty relative path segments', () => {
    expect(joinPath('/base', '/relative//file.txt')).toBe('/base/relative/file.txt');
  });

  it('handles relative path with only ./ and ../', () => {
    // ./ is ignored, ../ at the beginning has no segments to pop
    expect(joinPath('/base/sub', './')).toBe('/base/sub/');
    expect(joinPath('/base/sub', '../')).toBe('/base/sub/');
  });

  it('does not go above base path with too many ../', () => {
    // After exhausting parent directories, further ../ are ignored
    expect(joinPath('/base', '../../../../file.txt')).toBe('/base/file.txt');
  });
});

describe('transformMessage - artifacts', () => {
  it('ignores skill_suggest events because they are rendered as conversation artifacts', () => {
    const input: IResponseMessage = {
      type: 'skill_suggest',
      conversation_id: 'conv-123',
      msg_id: 'msg-456',
      data: {
        cron_job_id: 'cron-001',
        name: 'test-skill',
        description: 'A test skill',
        skill_content: '---\nname: test-skill\n---\n\n# Test Skill',
      },
    };

    expect(transformMessage(input)).toBeUndefined();
  });

  it('ignores cron_trigger events because they are rendered as conversation artifacts', () => {
    const input: IResponseMessage = {
      type: 'cron_trigger',
      conversation_id: 'conv-789',
      msg_id: 'msg-012',
      data: {
        cronJobId: 'cron-002',
        cron_job_name: 'Daily Report',
        triggeredAt: Date.now(),
      },
    };

    expect(transformMessage(input)).toBeUndefined();
  });
});

describe('transformMessage - tips', () => {
  it('transforms tips message correctly', () => {
    const input: IResponseMessage = {
      type: 'tips',
      conversation_id: 'conv-tip',
      msg_id: 'msg-tip',
      data: {
        content: 'Missed while asleep',
        type: 'warning',
      },
    };

    const result = transformMessage(input) as IMessageTips;

    expect(result).toBeDefined();
    expect(result.type).toBe('tips');
    expect(result.position).toBe('center');
    expect(result.content).toEqual({
      content: 'Missed while asleep',
      type: 'warning',
    });
  });
});

// ---------------------------------------------------------------------------
// transformMessage - content with cronMeta
// ---------------------------------------------------------------------------

describe('transformMessage - content with cronMeta', () => {
  it('transforms content message with cronMeta correctly', () => {
    const triggeredAt = Date.now();
    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cronJobId: 'cron-003',
      cron_job_name: 'Backup Job',
      triggeredAt,
    };

    const input: IResponseMessage = {
      type: 'content',
      conversation_id: 'conv-abc',
      msg_id: 'msg-def',
      data: {
        content: 'This message was triggered by a cron job',
        cronMeta,
      },
    };

    const result = transformMessage(input) as IMessageText;

    expect(result).toBeDefined();
    expect(result.type).toBe('text');
    expect(result.position).toBe('left');
    expect(result.content.content).toBe('This message was triggered by a cron job');
    expect(result.content.cronMeta).toEqual(cronMeta);
  });

  it('transforms content message without cronMeta (plain string)', () => {
    const input: IResponseMessage = {
      type: 'content',
      conversation_id: 'conv-ghi',
      msg_id: 'msg-jkl',
      data: 'Plain text content',
    };

    const result = transformMessage(input) as IMessageText;

    expect(result).toBeDefined();
    expect(result.type).toBe('text');
    expect(result.content.content).toBe('Plain text content');
    expect(result.content.cronMeta).toBeUndefined();
  });

  it('transforms user_content message with cronMeta correctly', () => {
    const triggeredAt = Date.now();
    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cronJobId: 'cron-004',
      cron_job_name: 'User Cron',
      triggeredAt,
    };

    const input: IResponseMessage = {
      type: 'user_content',
      conversation_id: 'conv-mno',
      msg_id: 'msg-pqr',
      data: {
        content: 'User message with cron metadata',
        cronMeta,
      },
    };

    const result = transformMessage(input) as IMessageText;

    expect(result).toBeDefined();
    expect(result.type).toBe('text');
    expect(result.position).toBe('right');
    expect(result.content.content).toBe('User message with cron metadata');
    expect(result.content.cronMeta).toEqual(cronMeta);
  });
});

// ---------------------------------------------------------------------------
// transformMessage - hidden field preservation
// ---------------------------------------------------------------------------

describe('transformMessage - hidden field', () => {
  it('preserves hidden field from content message', () => {
    const input: IResponseMessage = {
      type: 'content',
      conversation_id: 'conv-xyz',
      msg_id: 'msg-xyz',
      data: 'Hidden message',
      hidden: true,
    };

    const result = transformMessage(input) as IMessageText;

    expect(result).toBeDefined();
    expect(result.hidden).toBe(true);
  });

  it('preserves hidden field from user_content message', () => {
    const input: IResponseMessage = {
      type: 'user_content',
      conversation_id: 'conv-uvw',
      msg_id: 'msg-uvw',
      data: 'Hidden user message',
      hidden: true,
    };

    const result = transformMessage(input) as IMessageText;

    expect(result).toBeDefined();
    expect(result.hidden).toBe(true);
  });

  it('does not add hidden field when not present', () => {
    const input: IResponseMessage = {
      type: 'content',
      conversation_id: 'conv-123',
      msg_id: 'msg-123',
      data: 'Visible message',
    };

    const result = transformMessage(input) as IMessageText;

    expect(result).toBeDefined();
    expect(result.hidden).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// composeMessage - cronMeta preservation
// ---------------------------------------------------------------------------

describe('composeMessage - cronMeta preservation', () => {
  it('preserves existing cronMeta when appending more text for the same msg_id', () => {
    const triggeredAt = Date.now();
    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cron_job_id: 'cron-005',
      cron_job_name: 'Compose Test',
      triggered_at: triggeredAt,
    };

    const existingMessage: IMessageText = {
      id: 'msg-001',
      type: 'text',
      conversation_id: 'conv-compose',
      msg_id: 'msg-compose',
      content: {
        content: 'First part',
        cronMeta,
      },
    };

    const newMessage: IMessageText = {
      id: 'msg-002',
      type: 'text',
      conversation_id: 'conv-compose',
      msg_id: 'msg-compose',
      content: {
        content: ' second part',
      },
    };

    const result = composeMessage(newMessage, [existingMessage]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    const textResult = result[0] as IMessageText;
    expect(textResult.content.content).toBe('First part second part');
    expect(textResult.content.cronMeta).toEqual(cronMeta);
  });

  it('preserves cronMeta when both messages have it during composition', () => {
    const triggeredAt = Date.now();
    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cron_job_id: 'cron-005',
      cron_job_name: 'Compose Test',
      triggered_at: triggeredAt,
    };

    const existingMessage: IMessageText = {
      id: 'msg-001',
      type: 'text',
      conversation_id: 'conv-compose',
      msg_id: 'msg-compose',
      content: {
        content: 'First part',
        cronMeta,
      },
    };

    const newMessage: IMessageText = {
      id: 'msg-002',
      type: 'text',
      conversation_id: 'conv-compose',
      msg_id: 'msg-compose',
      content: {
        content: ' second part',
        cronMeta, // New message also includes cronMeta
      },
    };

    const result = composeMessage(newMessage, [existingMessage]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    const textResult = result[0] as IMessageText;
    expect(textResult.content.content).toBe('First part second part');
    expect(textResult.content.cronMeta).toEqual(cronMeta);
  });

  it('replaces accumulated text when the incoming message explicitly requests replacement', () => {
    const existingMessage: IMessageText = {
      id: 'msg-001',
      type: 'text',
      conversation_id: 'conv-compose',
      msg_id: 'msg-compose',
      content: {
        content: 'Dirty [CRON_CREATE] block',
      },
    };

    const newMessage: IMessageText = {
      id: 'msg-002',
      type: 'text',
      conversation_id: 'conv-compose',
      msg_id: 'msg-compose',
      content: {
        content: 'Clean final text',
        replace: true,
      },
    };

    const result = composeMessage(newMessage, [existingMessage]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    const textResult = result[0] as IMessageText;
    expect(textResult.content.content).toBe('Clean final text');
    expect(textResult.content.replace).toBe(true);
  });

  it('clears the replace marker when later chunks resume default append behavior', () => {
    const existingMessage: IMessageText = {
      id: 'msg-001',
      type: 'text',
      conversation_id: 'conv-compose',
      msg_id: 'msg-compose',
      content: {
        content: 'Clean final text',
        replace: true,
      },
    };

    const newMessage: IMessageText = {
      id: 'msg-002',
      type: 'text',
      conversation_id: 'conv-compose',
      msg_id: 'msg-compose',
      content: {
        content: ' + follow-up',
      },
    };

    const result = composeMessage(newMessage, [existingMessage]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    const textResult = result[0] as IMessageText;
    expect(textResult.content.content).toBe('Clean final text + follow-up');
    expect(textResult.content.replace).toBeUndefined();
  });

  it('adds new text message with cronMeta when msg_id differs', () => {
    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cron_job_id: 'cron-006',
      cron_job_name: 'New Message',
      triggered_at: Date.now(),
    };

    const existingMessage: IMessageText = {
      id: 'msg-001',
      type: 'text',
      conversation_id: 'conv-new',
      msg_id: 'msg-old',
      content: {
        content: 'Old message',
      },
    };

    const newMessage: IMessageText = {
      id: 'msg-002',
      type: 'text',
      conversation_id: 'conv-new',
      msg_id: 'msg-new',
      content: {
        content: 'New message',
        cronMeta,
      },
    };

    const messageHandler = vi.fn();
    const result = composeMessage(newMessage, [existingMessage], messageHandler);

    expect(result).toHaveLength(2);
    expect(result[1].type).toBe('text');
    const newTextResult = result[1] as IMessageText;
    expect(newTextResult.content.content).toBe('New message');
    expect(newTextResult.content.cronMeta).toEqual(cronMeta);
    expect(messageHandler).toHaveBeenCalledWith('insert', expect.objectContaining({ type: 'text' }));
  });

  it('inserts first message with cronMeta into empty list', () => {
    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cron_job_id: 'cron-007',
      cron_job_name: 'First Message',
      triggered_at: Date.now(),
    };

    const message: IMessageText = {
      id: 'msg-001',
      type: 'text',
      conversation_id: 'conv-first',
      msg_id: 'msg-first',
      content: {
        content: 'First message',
        cronMeta,
      },
    };

    const messageHandler = vi.fn();
    const result = composeMessage(message, undefined, messageHandler);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    const textResult = result[0] as IMessageText;
    expect(textResult.content.cronMeta).toEqual(cronMeta);
    expect(messageHandler).toHaveBeenCalledWith('insert', message);
  });
});

describe('composeMessage - ignores undefined artifact transforms', () => {
  it('keeps the list unchanged when transformMessage returns undefined for artifact events', () => {
    const messageHandler = vi.fn();
    const result = composeMessage(undefined, [], messageHandler);

    expect(result).toEqual([]);
    expect(messageHandler).not.toHaveBeenCalled();
  });
});
