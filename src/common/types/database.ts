import type { TMessage } from '../chat/chatLib';
import type { TChatConversation } from '../config/storage';

export interface IMessageSearchItem {
  conversation: TChatConversation;
  messageId: string;
  messageType: TMessage['type'];
  messageCreatedAt: number;
  previewText: string;
}

export interface IMessageSearchResponse {
  items: IMessageSearchItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export type ConversationManagementCategory = TChatConversation['type'] | 'all';

export interface IManagedConversationSearchParams {
  category?: ConversationManagementCategory;
  workspaceKeyword?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface IManagedConversationSearchResponse {
  items: TChatConversation[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
