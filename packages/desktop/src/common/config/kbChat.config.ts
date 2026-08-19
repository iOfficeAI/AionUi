/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { AIPAAS_BASE_URL } from '@/renderer/api';

/**
 * KB chat SSE configuration.
 *
 * Real backend endpoint:
 *   ${AIPAAS_BASE_URL}/project/aiknowledge/aiknowledgebasechat/chatStream
 *   ?knowledgeBaseId=<kbId>&userMessage=<question>&threadId=<threadId>
 *   &modelCode=qwen-max&searchType=1&enableRerank=0&minRelevance=0.5
 *
 * Defaults for the four static params can be overridden via environment
 * variables (KB_CHAT_MODEL_CODE, KB_CHAT_SEARCH_TYPE, KB_CHAT_ENABLE_RERANK,
 * KB_CHAT_MIN_RELEVANCE). Useful for local mock servers.
 */

export const getKbChatChatStreamUrl = (): string =>
  `${AIPAAS_BASE_URL}/project/aiknowledge/aiknowledgebasechat/chatStream`;

export type KbChatDefaultQueryParams = {
  modelCode: string;
  searchType: string;
  enableRerank: string;
  minRelevance: string;
};

export const getKbChatDefaultQueryParams = (): KbChatDefaultQueryParams => ({
  modelCode: process.env.KB_CHAT_MODEL_CODE ?? 'qwen-max',
  searchType: process.env.KB_CHAT_SEARCH_TYPE ?? '1',
  enableRerank: process.env.KB_CHAT_ENABLE_RERANK ?? '0',
  minRelevance: process.env.KB_CHAT_MIN_RELEVANCE ?? '0.5',
});

export const KB_CHAT_FIRST_BYTE_TIMEOUT_MS = 30_000;
export const KB_CHAT_TOTAL_TIMEOUT_MS = 5 * 60_000;
