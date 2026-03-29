import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TMessage } from '@/common/chat/chatLib';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import {
  appendWorkspaceFilesToZip,
  buildConversationMarkdown,
  buildTopicFolderName,
  getBackendKeyFromConversation,
  normalizeZipPath,
  withTimeout,
} from '@/renderer/pages/conversation/GroupedHistory/utils/exportHelpers';

describe('exportHelpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes zip paths and appends nested workspace files', () => {
    const files: Array<{ name: string; sourcePath?: string }> = [];
    const tree: IDirOrFile = {
      name: 'workspace',
      fullPath: '/workspace',
      relativePath: '',
      isDir: true,
      isFile: false,
      children: [
        {
          name: 'src',
          fullPath: '/workspace/src',
          relativePath: 'src',
          isDir: true,
          isFile: false,
          children: [
            {
              name: 'index.ts',
              fullPath: '/workspace/src/index.ts',
              relativePath: 'src\\index.ts',
              isDir: false,
              isFile: true,
            },
          ],
        },
      ],
    };

    expect(normalizeZipPath('\\src\\index.ts')).toBe('src/index.ts');

    appendWorkspaceFilesToZip(files, tree, 'topic');

    expect(files).toEqual([
      {
        name: 'topic/workspace/src/index.ts',
        sourcePath: '/workspace/src/index.ts',
      },
    ]);
  });

  it('builds topic folder names and resolves backend keys by conversation type', () => {
    expect(
      buildTopicFolderName({
        id: 'conv-1',
        name: 'Export / Topic',
      } as TChatConversation)
    ).toBe('Export _ Topic__conv-1');

    expect(
      getBackendKeyFromConversation({
        id: 'conv-1',
        type: 'acp',
        extra: { backend: 'claude' },
      } as TChatConversation)
    ).toBe('claude');

    expect(
      getBackendKeyFromConversation({
        id: 'conv-2',
        type: 'openclaw-gateway',
        extra: {},
      } as TChatConversation)
    ).toBe('openclaw-gateway');

    expect(
      getBackendKeyFromConversation({
        id: 'conv-3',
        type: 'gemini',
      } as TChatConversation)
    ).toBe('gemini');
  });

  it('builds markdown with user, assistant, and system role headings', () => {
    const conversation = {
      id: 'conv-1',
      name: 'Feature Review',
      type: 'gemini',
    } as TChatConversation;
    const messages = [
      {
        id: '1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'User export request' },
      },
      {
        id: '2',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'Assistant response' },
      },
      {
        id: '3',
        conversation_id: 'conv-1',
        type: 'tips',
        position: 'center',
        content: { content: 'System note', type: 'info' },
      },
    ] as TMessage[];

    const markdown = buildConversationMarkdown(conversation, messages);

    expect(markdown).toContain('### 1. User (text)');
    expect(markdown).toContain('### 2. Assistant (text)');
    expect(markdown).toContain('### 3. System (tips)');
    expect(markdown).toContain('System note');
  });

  it('resolves and rejects withTimeout correctly', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'fast')).resolves.toBe('ok');

    const slow = withTimeout(
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('late'), 100);
      }),
      10,
      'slow'
    );
    const rejection = expect(slow).rejects.toThrow('slow timeout');

    await vi.advanceTimersByTimeAsync(10);
    await rejection;
  });
});
