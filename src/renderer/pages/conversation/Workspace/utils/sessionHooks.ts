/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';

type ConversationLike = Pick<TChatConversation, 'type' | 'extra'>;

const getConversationBackend = (conversation: ConversationLike): string | undefined => {
  const extra = conversation.extra;
  if (!extra || typeof extra !== 'object' || !('backend' in extra)) {
    return undefined;
  }

  const backend = extra.backend;
  return typeof backend === 'string' && backend.trim() ? backend : undefined;
};

export const getConversationEnabledHooks = (conversation: ConversationLike): string[] => {
  const enabledHooks = conversation.extra?.enabledHooks;
  if (!Array.isArray(enabledHooks)) return [];

  return enabledHooks
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
};

export const resolveConversationHookBackend = (conversation: ConversationLike): string => {
  switch (conversation.type) {
    case 'acp':
      return getConversationBackend(conversation) || 'acp';
    case 'openclaw-gateway':
      return getConversationBackend(conversation) || 'openclaw-gateway';
    default:
      return conversation.type;
  }
};
