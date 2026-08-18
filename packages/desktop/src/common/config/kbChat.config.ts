/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * KB chat SSE configuration.
 *
 * KB_CHAT_SSE_URL — external streaming endpoint. Override via env var
 *   KB_CHAT_SSE_URL when running locally against a mock SSE server.
 *
 * The URL is read on every call so that tests can change the env var
 * between requests without re-importing this module.
 */
export const getKbChatSseUrl = (): string => process.env.KB_CHAT_SSE_URL ?? 'https://example.com/api/kb-chat/stream';

export const KB_CHAT_FIRST_BYTE_TIMEOUT_MS = 30_000;
export const KB_CHAT_TOTAL_TIMEOUT_MS = 5 * 60_000;