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
  type TMessage,
  type IMessageSkillSuggest,
  type IMessageCronTrigger,
  type IMessageText,
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

// ---------------------------------------------------------------------------
// transformMessage - skill_suggest
// ---------------------------------------------------------------------------

describe('transformMessage - skill_suggest', () => {
  it('transforms skill_suggest message correctly', () => {
    const input: IResponseMessage = {
      type: 'skill_suggest',
      conversation_id: 'conv-123',
      msg_id: 'msg-456',
      data: {
        cronJobId: 'cron-001',
        name: 'test-skill',
        description: 'A test skill',
        skillContent: '---\nname: test-skill\n---\n\n# Test Skill',
      },
    };

    const result = transformMessage(input) as IMessageSkillSuggest;

    expect(result).toBeDefined();
    expect(result.type).toBe('skill_suggest');
    expect(result.conversation_id).toBe('conv-123');
    expect(result.msg_id).toBe('msg-456');
    expect(result.position).toBe('center');
    expect(result.content.cronJobId).toBe('cron-001');
    expect(result.content.name).toBe('test-skill');
    expect(result.content.description).toBe('A test skill');
    expect(result.content.skillContent).toBe('---\nname: test-skill\n---\n\n# Test Skill');
    expect(result.id).toBeDefined(); // uuid generated
  });
});

// ---------------------------------------------------------------------------
// transformMessage - cron_trigger
// ---------------------------------------------------------------------------

describe('transformMessage - cron_trigger', () => {
  it('transforms cron_trigger message correctly', () => {
    const triggeredAt = Date.now();
    const input: IResponseMessage = {
      type: 'cron_trigger',
      conversation_id: 'conv-789',
      msg_id: 'msg-012',
      data: {
        cronJobId: 'cron-002',
        cronJobName: 'Daily Report',
        triggeredAt,
      },
    };

    const result = transformMessage(input) as IMessageCronTrigger;

    expect(result).toBeDefined();
    expect(result.type).toBe('cron_trigger');
    expect(result.conversation_id).toBe('conv-789');
    expect(result.msg_id).toBe('msg-012');
    expect(result.position).toBe('center');
    expect(result.content.cronJobId).toBe('cron-002');
    expect(result.content.cronJobName).toBe('Daily Report');
    expect(result.content.triggeredAt).toBe(triggeredAt);
    expect(result.id).toBeDefined(); // uuid generated
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
      cronJobName: 'Backup Job',
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
      cronJobName: 'User Cron',
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
  it('composing text messages overwrites content object (cronMeta lost if not in new message)', () => {
    // Note: composeMessage uses Object.assign({}, last, message)
    // which means the new message's content object completely replaces the old one
    const triggeredAt = Date.now();
    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cronJobId: 'cron-005',
      cronJobName: 'Compose Test',
      triggeredAt,
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
    // cronMeta is lost because the new message's content object replaces the old one
    // after concatenating the content strings
    expect(textResult.content.cronMeta).toBeUndefined();
  });

  it('preserves cronMeta when both messages have it during composition', () => {
    const triggeredAt = Date.now();
    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cronJobId: 'cron-005',
      cronJobName: 'Compose Test',
      triggeredAt,
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
    // cronMeta is preserved because the new message also has it
    expect(textResult.content.cronMeta).toEqual(cronMeta);
  });

  it('adds new text message with cronMeta when msg_id differs', () => {
    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cronJobId: 'cron-006',
      cronJobName: 'New Message',
      triggeredAt: Date.now(),
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
      cronJobId: 'cron-007',
      cronJobName: 'First Message',
      triggeredAt: Date.now(),
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

// ---------------------------------------------------------------------------
// composeMessage - skill_suggest and cron_trigger
// ---------------------------------------------------------------------------

describe('composeMessage - skill_suggest', () => {
  it('adds skill_suggest message to list', () => {
    const skillSuggestMsg: IMessageSkillSuggest = {
      id: 'msg-skill',
      type: 'skill_suggest',
      conversation_id: 'conv-skill',
      msg_id: 'msg-skill-1',
      position: 'center',
      content: {
        cronJobId: 'cron-008',
        name: 'suggested-skill',
        description: 'A suggested skill',
        skillContent: '# Skill content',
      },
    };

    const messageHandler = vi.fn();
    const result = composeMessage(skillSuggestMsg, [], messageHandler);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(skillSuggestMsg);
    expect(messageHandler).toHaveBeenCalledWith('insert', skillSuggestMsg);
  });
});

describe('composeMessage - cron_trigger', () => {
  it('adds cron_trigger message to list', () => {
    const cronTriggerMsg: IMessageCronTrigger = {
      id: 'msg-trigger',
      type: 'cron_trigger',
      conversation_id: 'conv-trigger',
      msg_id: 'msg-trigger-1',
      position: 'center',
      content: {
        cronJobId: 'cron-009',
        cronJobName: 'Trigger Job',
        triggeredAt: Date.now(),
      },
    };

    const messageHandler = vi.fn();
    const result = composeMessage(cronTriggerMsg, [], messageHandler);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(cronTriggerMsg);
    expect(messageHandler).toHaveBeenCalledWith('insert', cronTriggerMsg);
  });
});
