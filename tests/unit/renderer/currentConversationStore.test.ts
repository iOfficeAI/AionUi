/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  getCurrentConversation,
  resetCurrentConversationForTest,
  setCurrentConversation,
} from '@/renderer/pages/conversation/explorer/currentConversationStore';

afterEach(() => resetCurrentConversationForTest());

describe('currentConversationStore', () => {
  it('stores the active conversation id', () => {
    setCurrentConversation('conv-1');
    expect(getCurrentConversation()).toBe('conv-1');
  });

  it('clears to null for a falsy id', () => {
    setCurrentConversation('conv-1');
    setCurrentConversation(null);
    expect(getCurrentConversation()).toBeNull();
    setCurrentConversation('conv-1');
    setCurrentConversation('');
    expect(getCurrentConversation()).toBeNull();
  });

  it('replaces the target when switching conversations', () => {
    setCurrentConversation('conv-1');
    setCurrentConversation('conv-2');
    expect(getCurrentConversation()).toBe('conv-2');
  });

  it('resets to null via the test hook', () => {
    setCurrentConversation('conv-1');
    resetCurrentConversationForTest();
    expect(getCurrentConversation()).toBeNull();
  });
});
