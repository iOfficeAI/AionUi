/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { storage } from '@office-ai/platform';

/**
 * @description 聊天相关的存储
 */
export const ChatStorage = storage.buildStorage<IChatConversationRefer>('agent.chat');

// 聊天消息存储
export const ChatMessageStorage = storage.buildStorage('agent.chat.message');

// 系统配置存储
export const ConfigStorage = storage.buildStorage<IConfigStorageRefer>('agent.config');

export interface IConfigStorageRefer {
  'gemini.config': {
    authType: string;
    proxy: string;
    GOOGLE_GEMINI_BASE_URL?: string;
  };
  'model.config': IModel[];
  language: string;
}

interface IChatConversation<T, Extra> {
  createTime: number;
  modifyTime: number;
  name: string;
  desc?: string;
  id: string;
  type: T;
  extra: Extra;
  model: TModelWithConversation;
  status?: 'pending' | 'running' | 'finished' | undefined;
}

export type TChatConversation = IChatConversation<
  'gemini',
  {
    workspace: string;
    customWorkspace?: boolean; // true 用户指定工作目录 false 系统默认工作目录
  }
>;

export type IChatConversationRefer = {
  'chat.history': TChatConversation[];
};

export interface IModel {
  id: string;
  platform: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string[];
}

export type TModelWithConversation = Omit<IModel, 'model'> & { useModel: string };
