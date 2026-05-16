/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '../chat/chatLib';
import type { TChatConversation } from '../config/storage';
import type { IMessageSearchItem } from '../types/team/database';
import type { PaginatedResult } from './ipcBridge';
import { fromApiConversation } from './apiModelMapper';

export interface ApiMessageSearchItem {
  message_id: string;
  message_type: string;
  message_created_at: number;
  preview_text: string;
  conversation: {
    id: string;
    name: string;
    type: string;
    model?: { provider_id: string; model: string; use_model?: string } | null;
    status: string;
    source?: string | null;
    pinned: boolean;
    pinned_at?: number | null;
    channel_chat_id?: string | null;
    created_at: number;
    modified_at: number;
    extra: Record<string, unknown>;
  };
}

export function fromApiSearchResult(
  result: PaginatedResult<ApiMessageSearchItem>
): PaginatedResult<IMessageSearchItem> {
  return {
    ...result,
    items: result.items.map(fromApiSearchItem),
  };
}

function fromApiSearchItem(item: ApiMessageSearchItem): IMessageSearchItem {
  return {
    conversation: fromApiConversation({
      ...item.conversation,
      model: item.conversation.model ?? undefined,
    }) as unknown as TChatConversation,
    message_id: item.message_id,
    message_type: item.message_type as TMessage['type'],
    message_created_at: item.message_created_at,
    preview_text: item.preview_text,
  };
}
