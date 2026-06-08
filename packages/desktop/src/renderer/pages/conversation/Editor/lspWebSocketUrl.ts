/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBaseUrl } from '@/common/adapter/httpBridge';

/** Build the per-session LSP transport WebSocket URL (CSRF-exempt on backend). */
export const buildLspSessionWebSocketUrl = (sessionId: string): string => {
  const base = getBaseUrl();
  if (!base) {
    const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/lsp/ws/${encodeURIComponent(sessionId)}`;
  }
  const wsBase = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${wsBase}/api/lsp/ws/${encodeURIComponent(sessionId)}`;
};
