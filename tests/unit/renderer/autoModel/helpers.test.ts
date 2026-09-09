/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import { conversationHasUserTurns } from '@/renderer/utils/autoModel/conversationTurns';
import { chatFileRefsRequireVision } from '@/renderer/utils/autoModel/vision';
import { projectFileRef, uploadFileRef } from '@/common/types/chatFile';

describe('conversationHasUserTurns', () => {
  it('returns false for empty history', () => {
    expect(conversationHasUserTurns([])).toBe(false);
  });

  it('detects prior user text turns', () => {
    const messages = [
      { type: 'text', position: 'right' },
      { type: 'text', position: 'left' },
    ] as TMessage[];
    expect(conversationHasUserTurns(messages)).toBe(true);
  });

  it('ignores assistant-only history', () => {
    const messages = [{ type: 'text', position: 'left' }] as TMessage[];
    expect(conversationHasUserTurns(messages)).toBe(false);
  });
});

describe('chatFileRefsRequireVision', () => {
  it('returns true when any attachment is an image', () => {
    expect(chatFileRefsRequireVision([projectFileRef('pe-1', 'shots/ui.png')])).toBe(true);
    expect(chatFileRefsRequireVision([uploadFileRef('/tmp/readme.md')])).toBe(false);
  });
});
