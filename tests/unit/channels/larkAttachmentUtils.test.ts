/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDeterministicAttachmentPath, buildLarkCodexPrompt, extractExplicitWorkspaceFilePaths, normalizeLarkMessage, resolveQuotedMessageId, type LarkConversationContext, type LarkFetchedMessage } from '@/channels/plugins/lark/LarkAttachmentUtils';

const tempDirs: string[] = [];

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-lark-utils-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('LarkAttachmentUtils', () => {
  it('normalizes post content with interleaved text and images in order', () => {
    const message: LarkFetchedMessage = {
      messageId: 'om_current',
      chatId: 'oc_chat',
      msgType: 'post',
      content: JSON.stringify({
        title: 'Build Log',
        content: [
          [
            { tag: 'text', text: 'First line: ' },
            { tag: 'a', text: 'docs', href: 'https://example.com/docs' },
            { tag: 'at', user_id: '@_user_1', user_name: 'Alice' },
          ],
          [{ tag: 'img', image_key: 'img_1' }],
          [{ tag: 'text', text: 'Second line' }],
          [{ tag: 'media', file_key: 'file_1', file_name: 'demo.mp4' }],
        ],
      }),
      mentions: [{ key: '@_user_1', name: 'Alice' }],
    };

    const normalized = normalizeLarkMessage(message);

    expect(normalized.segments).toEqual([
      { kind: 'text', text: 'Build Log' },
      { kind: 'text', text: 'First line: docs (https://example.com/docs)@Alice' },
      { kind: 'attachment', attachmentType: 'image', fileKey: 'img_1', fileName: undefined },
      { kind: 'text', text: 'Second line' },
      { kind: 'attachment', attachmentType: 'file', fileKey: 'file_1', fileName: 'demo.mp4' },
    ]);
  });

  it('prefers parent reply id and falls back to root id', () => {
    expect(resolveQuotedMessageId({ messageId: 'om_current', parentId: 'om_parent', rootId: 'om_root' })).toBe('om_parent');
    expect(resolveQuotedMessageId({ messageId: 'om_current', upperMessageId: 'om_upper' })).toBe('om_upper');
    expect(resolveQuotedMessageId({ messageId: 'om_current', rootId: 'om_root' })).toBe('om_root');
    expect(resolveQuotedMessageId({ messageId: 'om_current', rootId: 'om_current' })).toBeUndefined();
  });

  it('builds deterministic attachment paths under channel asset directory', () => {
    const workspace = createTempWorkspace();
    const attachmentPath = buildDeterministicAttachmentPath({
      workspace,
      chatId: 'oc_demo_chat',
      messageId: 'om_demo_message',
      index: 2,
      originalNameOrKey: 'report final.pdf',
      createTime: Date.UTC(2026, 2, 15),
      contentType: 'application/pdf',
    });

    expect(attachmentPath).toContain(path.join('.aionui', 'channel-assets', 'lark', 'oc_demo_chat', '2026-03-15'));
    expect(path.basename(attachmentPath)).toBe('om_demo_message__02__report final.pdf');
  });

  it('extracts explicit workspace file references from markdown, backticks, and plain paths', () => {
    const workspace = createTempWorkspace();
    const reportPath = path.join(workspace, 'reports', 'summary.md');
    const imagePath = path.join(workspace, 'images', 'chart.png');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.mkdirSync(path.dirname(imagePath), { recursive: true });
    fs.writeFileSync(reportPath, '# summary');
    fs.writeFileSync(imagePath, 'png');

    const text = ['Please send `reports/summary.md` to the user.', `Image preview: ![chart](images/chart.png)`, `Absolute fallback: ${imagePath}`, `Ignore this external URL: https://example.com/ignore.png`].join('\n');

    const results = extractExplicitWorkspaceFilePaths(text, workspace);
    expect(results).toEqual([imagePath, reportPath]);
  });

  it('rejects references that resolve outside the workspace', () => {
    const workspace = createTempWorkspace();
    const safeFile = path.join(workspace, 'notes.txt');
    fs.writeFileSync(safeFile, 'safe');

    const text = ['`notes.txt`', '`..\\outside.txt`'].join('\n');
    const results = extractExplicitWorkspaceFilePaths(text, workspace);

    expect(results).toEqual([safeFile]);
  });

  it('builds a structured codex prompt with quoted and current sections', () => {
    const context: LarkConversationContext = {
      quoted: {
        messageId: 'om_quoted',
        chatId: 'oc_chat',
        msgType: 'text',
        segments: [
          { kind: 'text', text: 'Previous question' },
          { kind: 'attachment', attachmentType: 'file', fileKey: 'file_1', localPath: 'C:\\workspace\\quoted.txt' },
        ],
        attachmentPaths: ['C:\\workspace\\quoted.txt'],
      },
      current: {
        messageId: 'om_current',
        chatId: 'oc_chat',
        msgType: 'text',
        segments: [
          { kind: 'text', text: 'Please review this' },
          { kind: 'attachment', attachmentType: 'image', fileKey: 'img_1', localPath: 'C:\\workspace\\image.png' },
        ],
        attachmentPaths: ['C:\\workspace\\image.png'],
      },
    };

    const prompt = buildLarkCodexPrompt(context);
    expect(prompt).toContain('Quoted message:');
    expect(prompt).toContain('1. text: Previous question');
    expect(prompt).toContain('2. attachment: C:\\workspace\\quoted.txt');
    expect(prompt).toContain('Current message:');
    expect(prompt).toContain('2. attachment: C:\\workspace\\image.png');
  });
});
