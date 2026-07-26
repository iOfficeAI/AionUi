/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const configGet = vi.fn();
const copyText = vi.fn<(text: string) => Promise<void>>();

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: (key: string) => configGet(key) as unknown,
  },
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: (text: string) => copyText(text),
}));

const { backupPromptToClipboard, shouldBackupPrompt } = await import('@/renderer/utils/chat/promptClipboard');

describe('shouldBackupPrompt', () => {
  it('backs up a real prompt only when the preference is enabled', () => {
    expect(shouldBackupPrompt(true, 'Write a haiku')).toBe(true);
    expect(shouldBackupPrompt(false, 'Write a haiku')).toBe(false);
    expect(shouldBackupPrompt(undefined, 'Write a haiku')).toBe(false);
  });

  it('never clobbers the clipboard for a blank draft', () => {
    // An attachment-only send has no composed text worth preserving, and
    // overwriting the clipboard with '' would destroy the user's own copy.
    expect(shouldBackupPrompt(true, '')).toBe(false);
    expect(shouldBackupPrompt(true, '   \n\t ')).toBe(false);
  });
});

describe('backupPromptToClipboard', () => {
  beforeEach(() => {
    configGet.mockReset();
    copyText.mockReset();
    copyText.mockResolvedValue(undefined);
  });

  it('copies the prompt verbatim when enabled', () => {
    configGet.mockReturnValue(true);

    backupPromptToClipboard('  Refactor the parser  ');

    expect(configGet).toHaveBeenCalledWith('input.copyPromptOnSend');
    // Whitespace is only trimmed to decide *whether* to copy — what lands on
    // the clipboard must be exactly what the user typed.
    expect(copyText).toHaveBeenCalledWith('  Refactor the parser  ');
  });

  it('stays out of the way when the preference is off', () => {
    configGet.mockReturnValue(false);

    backupPromptToClipboard('Refactor the parser');

    expect(copyText).not.toHaveBeenCalled();
  });

  it('swallows clipboard failures so sending is never blocked', async () => {
    configGet.mockReturnValue(true);
    copyText.mockRejectedValue(new Error('clipboard permission denied'));

    expect(() => backupPromptToClipboard('Refactor the parser')).not.toThrow();
    // Flush the rejected promise: an unhandled rejection here would fail the run.
    await Promise.resolve();
  });
});
