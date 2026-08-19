/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getKbChatChatStreamUrl, getKbChatDefaultQueryParams } from '@/common/config/kbChat.config';

describe('kbChat.config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.KB_CHAT_MODEL_CODE;
    delete process.env.KB_CHAT_SEARCH_TYPE;
    delete process.env.KB_CHAT_ENABLE_RERANK;
    delete process.env.KB_CHAT_MIN_RELEVANCE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('getKbChatChatStreamUrl returns the expected path appended to AIPAAS_BASE_URL', () => {
    const url = getKbChatChatStreamUrl();
    expect(url).toMatch(/\/project\/aiknowledge\/aiknowledgebasechat\/chatStream$/);
  });

  it('getKbChatDefaultQueryParams returns the production defaults when no env vars are set', () => {
    expect(getKbChatDefaultQueryParams()).toEqual({
      modelCode: 'qwen-max',
      searchType: '1',
      enableRerank: '0',
      minRelevance: '0.5',
    });
  });

  it('honours individual env-var overrides without affecting the others', () => {
    process.env.KB_CHAT_MODEL_CODE = 'gpt-4';
    process.env.KB_CHAT_MIN_RELEVANCE = '0.8';
    expect(getKbChatDefaultQueryParams()).toEqual({
      modelCode: 'gpt-4',
      searchType: '1',
      enableRerank: '0',
      minRelevance: '0.8',
    });
  });
});