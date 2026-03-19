import type { TMessage } from '../chatLib';
import type { TChatConversation } from '../storage';

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
