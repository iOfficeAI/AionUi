/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from '@office-ai/platform';
import type { OpenDialogOptions } from 'electron';
import type { IModel, TChatConversation, TModelWithConversation } from './storage';

// 发送消息
const sendMessage = bridge.buildProvider<IBridgeResponse<{}>, ISendMessageParams>('chat.send.message');

//接受消息
const responseStream = bridge.buildEmitter<IResponseMessage>('chat.response.stream');

export const shell = {
  openFile: bridge.buildProvider<void, string>('open-file'), // 使用系统默认程序打开文件
  showItemInFolder: bridge.buildProvider<void, string>('show-item-in-folder'), // 打开文件夹
  openExternal: bridge.buildProvider<void, string>('open-external'), // 使用系统默认程序打开外部链接
};

//通用会话能力
export const conversation = {
  create: bridge.buildProvider<TChatConversation, ICreateConversationParams>('create-conversation'), // 创建对话
  get: bridge.buildProvider<TChatConversation, { id: string }>('get-conversation'), // 获取对话信息
  remove: bridge.buildProvider<boolean, { id: string }>('remove-conversation'), // 删除对话
  reset: bridge.buildProvider<void, IResetConversationParams>('reset-conversation'), // 重置对话
  stop: bridge.buildProvider<IBridgeResponse<{}>, { conversation_id: string }>('chat.stop.stream'), // 停止会话
};

// gemini对话相关接口
export const geminiConversation = {
  sendMessage: sendMessage,
  confirmMessage: bridge.buildProvider<IBridgeResponse, IConfirmGeminiMessageParams>('input.confirm.message'),
  responseStream: responseStream,
  getWorkspace: bridge.buildProvider<IDirOrFile[], { workspace: string }>('gemini.get-workspace'),
};

export const application = {
  restart: bridge.buildProvider<void, void>('restart-app'), // 重启应用
  openDevTools: bridge.buildProvider<void, void>('open-dev-tools'), // 打开开发者工具
  systemInfo: bridge.buildProvider<{ tempDir: string }, void>('system.info'), // 获取系统信息
};

export const dialog = {
  showOpen: bridge.buildProvider<string[] | undefined, { defaultPath?: string; properties?: OpenDialogOptions['properties'] } | undefined>('show-open'), // 打开文件/文件夹选择窗口
};
export const fs = {
  getFilesByDir: bridge.buildProvider<Array<IDirOrFile>, { dir: string }>('get-file-by-dir'), // 获取指定文件夹下所有文件夹和文件列表
};

export const googleAuth = {
  login: bridge.buildProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>('google.auth.login'),
  logout: bridge.buildProvider<void, {}>('google.auth.logout'),
  status: bridge.buildProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>('google.auth.status'),
};

export const mode = {
  fetchModelList: bridge.buildProvider<IBridgeResponse<{ mode: Array<string>; fix_base_url?: string }>, { base_url: string; api_key: string; try_fix?: boolean }>('mode.get-model-list'),
  saveModelConfig: bridge.buildProvider<IBridgeResponse, IModel[]>('mode.save-model-config'),
  getModelConfig: bridge.buildProvider<IModel[], void>('mode.get-model-config'),
};

interface ISendMessageParams {
  input: string;
  msg_id: string;
  conversation_id: string;
  files?: string[];
}

interface IConfirmGeminiMessageParams {
  confirmKey: string;
  msg_id: string;
  conversation_id: string;
  callId: string;
}

interface ICreateConversationParams {
  type: 'gemini';
  name?: string;
  model: TModelWithConversation;
  extra: { workspace?: string; defaultFiles?: string[] };
}
interface IResetConversationParams {
  id?: string;
  gemini?: {
    clearCachedCredentialFile?: boolean;
  };
}

// 获取文件夹或文件列表
export interface IDirOrFile {
  name: string;
  path: string;
  isDir: boolean;
  isFile: boolean;
  children?: Array<IDirOrFile>;
}

export interface IResponseMessage {
  type: string;
  data: any;
  msg_id: string;
  conversation_id: string;
}

interface IBridgeResponse<D = {}> {
  success: boolean;
  data?: D;
  msg?: string;
}
