import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import type { ExportTranscriptLabels } from '@/renderer/utils/chat/conversationExport';
import {
  buildConversationExportText,
  buildDefaultExportFileName,
  getDefaultExportFileNameSource,
  joinFilePath,
  normalizeExportFileName,
  resolveExportBaseDirectory,
} from '@/renderer/utils/chat/conversationExport';

const conversation = {
  id: 'conv-1',
  name: 'Feature Review',
  type: 'gemini',
} as TChatConversation;

const labels: ExportTranscriptLabels = {
  conversation: 'Conversation',
  conversationId: 'Conversation ID',
  exportedAt: 'Exported At',
  type: 'Type',
  noMessages: 'No messages',
  user: 'User',
  assistant: 'Assistant',
  system: 'System',
};

describe('conversationExport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T09:21:33.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a transcript with shareable text messages only', () => {
    const messages = [
      {
        id: '1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'Export this please' },
      },
      {
        id: '2',
        conversation_id: 'conv-1',
        type: 'tool_call',
        position: 'left',
        content: {
          callId: 'tool-1',
          name: 'search',
          args: {},
        },
      },
      {
        id: '3',
        conversation_id: 'conv-1',
        type: 'tips',
        position: 'center',
        content: {
          content: 'System note',
          type: 'warning',
        },
      },
    ] as TMessage[];

    const transcript = buildConversationExportText(conversation, messages, labels);

    expect(transcript).toContain('Conversation: Feature Review');
    expect(transcript).toContain('User:\nExport this please');
    expect(transcript).toContain('System:\nSystem note');
    expect(transcript).not.toContain('tool-1');
    expect(transcript).not.toContain('search');
  });

  it('creates a timestamped txt filename and normalizes invalid characters', () => {
    expect(buildDefaultExportFileName('ff4bfdf7-extra', 'Feature Review')).toBe(
      '2026-03-24-ff4bfdf7-feature-review.txt'
    );
    expect(normalizeExportFileName(' export:<draft> ')).toBe('export__draft_.txt');
    expect(normalizeExportFileName('already.txt')).toBe('already.txt');
  });

  it('prefers the earliest user text message as the default filename source', () => {
    const messages = [
      {
        id: '0',
        conversation_id: 'conv-1',
        type: 'tips',
        position: 'center',
        content: { content: 'system note', type: 'warning' },
      },
      {
        id: '1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'Okay currently the opening screen looks like this' },
      },
      {
        id: '2',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'later user message' },
      },
    ] as TMessage[];

    expect(getDefaultExportFileNameSource(conversation, messages)).toBe(
      'Okay currently the opening screen looks like this'
    );
    expect(buildDefaultExportFileName(conversation.id, getDefaultExportFileNameSource(conversation, messages))).toBe(
      '2026-03-24-conv-1-okay-currently-the-opening-screen-looks-like-thi.txt'
    );
  });

  it('uses localized fallback labels when no shareable messages exist', () => {
    const transcript = buildConversationExportText(conversation, [], labels);

    expect(transcript).toContain('No messages');
    expect(transcript).toContain('Conversation: Feature Review');
  });

  it('joins file paths and resolves export base directories safely', () => {
    expect(joinFilePath('/workspace', 'export.txt')).toBe('/workspace/export.txt');
    expect(joinFilePath('C:\\workspace', 'export.txt')).toBe('C:\\workspace\\export.txt');
    expect(resolveExportBaseDirectory('/workspace', '/Desktop')).toBe('/workspace');
    expect(resolveExportBaseDirectory('', '/Desktop')).toBe('/Desktop');
    expect(resolveExportBaseDirectory()).toBe('');
  });
});
