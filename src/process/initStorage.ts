/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync as _mkdirSync, existsSync } from 'fs';
import fs from 'fs/promises';
import { application } from '../common/ipcBridge';
import type { IChatConversationRefer, IConfigStorageRefer } from '../common/storage';
import { ChatMessageStorage, ChatStorage, ConfigStorage } from '../common/storage';
import { getTempPath } from './utils';

const STORAGE_PATH = {
  config: 'aionui-config.txt',
  chatMessage: 'aionui-chat-message.txt',
  chat: 'aionui-chat.txt',
};

const getHomePage = getTempPath;

const mkdirSync = (path: string) => {
  return _mkdirSync(path, { recursive: true });
};

if (!existsSync(getHomePage())) {
  mkdirSync(getHomePage());
}

const WriteFile = (fileName: string, data: string) => {
  return fs.writeFile(getHomePage() + '/' + fileName, data);
};

const ReadFile = (fileName: string) => {
  return fs.readFile(getHomePage() + '/' + fileName);
};

const FileBuilder = (fileName: string) => {
  return {
    write(data: string) {
      return WriteFile(fileName, data);
    },
    read() {
      return ReadFile(fileName).then((data) => {
        return data.toString();
      });
    },
  };
};

const JsonFileBuilder = <S extends Record<string, any>>(fileName: string) => {
  const stack: (() => Promise<any>)[] = [];
  let isRunning = false;
  const run = () => {
    if (isRunning || !stack.length) return;
    isRunning = true;
    stack
      .shift()?.()
      .finally(() => {
        isRunning = false;
        run();
      });
  };
  const pushStack = <R extends any>(fn: () => Promise<R>) => {
    return new Promise<R>((resolve, reject) => {
      stack.push(() => fn().then(resolve).catch(reject));
      run();
    });
  };
  const getFile = () => {
    return FileBuilder(fileName);
  };
  const encode = (data: any) => {
    return btoa(encodeURIComponent(data));
  };

  const decode = (base64: string) => {
    return decodeURIComponent(atob(base64));
  };

  const toJson = async (): Promise<S> => {
    try {
      const file = getFile();
      const result = await file.read();
      if (!result) return {} as S;
      return JSON.parse(decode(result)) as S;
    } catch (e) {
      return {} as S;
    }
  };

  const setJson = (data: any): Promise<any> => {
    try {
      const file = getFile();
      return file.write(encode(JSON.stringify(data)));
    } catch (e) {
      return Promise.reject(e);
    }
  };

  return {
    toJson,
    setJson,
    async set<K extends keyof S>(key: K, value: S[K]) {
      const data = await toJson();
      data[key] = value as any;
      return setJson(data);
    },
    async get<K extends keyof S>(key: K): Promise<S[K]> {
      const data = await toJson();
      return Promise.resolve(data[key]);
    },
    async remove<K extends keyof S>(key: K) {
      const data = await toJson();
      delete data[key];
      return setJson(data);
    },
    clear() {
      return setJson({});
    },
  };
};

const configFile = JsonFileBuilder<IConfigStorageRefer>(STORAGE_PATH.config);
const _chatMessageFile = JsonFileBuilder(STORAGE_PATH.chatMessage);
const chatFile = JsonFileBuilder<IChatConversationRefer>(STORAGE_PATH.chat);

const buildMessageListStorage = (conversation_id: string) => {
  const path = getHomePage() + '/aionui-chat-history/' + conversation_id + '.txt';
  if (!existsSync(path)) {
    mkdirSync(getHomePage() + '/aionui-chat-history/');
  }
  return JsonFileBuilder('aionui-chat-history/' + conversation_id + '.txt');
};

const conversationHistoryProxy = (options: typeof _chatMessageFile) => {
  return {
    ...options,
    async set(key: string, data: any) {
      const conversation_id = key;
      const storage = buildMessageListStorage(conversation_id);
      return storage.setJson(data);
    },
    async get(key: string): Promise<any[]> {
      const conversation_id = key;
      const storage = buildMessageListStorage(conversation_id);
      const data = await storage.toJson();
      if (Array.isArray(data)) return data;
      return [];
    },
  };
};

const chatMessageFile = conversationHistoryProxy(_chatMessageFile);

const initStorage = () => {
  ConfigStorage.interceptor(configFile);
  ChatStorage.interceptor(chatFile);
  ChatMessageStorage.interceptor(chatMessageFile);
  application.systemInfo.provider(async () => {
    return {
      tempDir: getHomePage(),
    };
  });
};

export const ProcessConfig = configFile;

export const ProcessChat = chatFile;

export const ProcessChatMessage = chatMessageFile;

export default initStorage;
