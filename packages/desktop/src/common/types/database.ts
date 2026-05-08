import type { TMessage } from '../chat/chatLib';
import type { TChatConversation } from '../config/storage';

export interface IMessageSearchItem {
  conversation: TChatConversation;
  message_id: string;
  message_type: TMessage['type'];
  message_created_at: number;
  preview_text: string;
}

export interface IMessageSearchResponse {
  items: IMessageSearchItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}
