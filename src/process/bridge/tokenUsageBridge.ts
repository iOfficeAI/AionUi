/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { getDatabase } from '@process/services/database';

export function initTokenUsageBridge(): void {
  ipcBridge.tokenUsage.queryByConversation.provider(async (params) => {
    const { conversationId } = params ?? {};
    if (!conversationId) {
      return { totalTokens: 0, totalCost: 0, currency: 'USD', eventCount: 0 };
    }
    try {
      const db = await getDatabase();
      return db.queryTokenUsageByConversation(conversationId);
    } catch {
      return { totalTokens: 0, totalCost: 0, currency: 'USD', eventCount: 0 };
    }
  });

  ipcBridge.tokenUsage.querySummary.provider(async (params) => {
    const { from = 0, to = Date.now() } = params ?? {};
    try {
      const db = await getDatabase();
      return db.queryTokenUsageSummary(from, to);
    } catch {
      return { totalTokens: 0, totalCost: 0, currency: 'USD', conversationCount: 0 };
    }
  });
}
