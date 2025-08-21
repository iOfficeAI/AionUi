/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync as _mkdirSync, existsSync, readFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { application } from '../common/ipcBridge';
import type { IChatConversationRefer, IConfigStorageRefer, IEnvStorageRefer } from '../common/storage';
import { ChatMessageStorage, ChatStorage, ConfigStorage, EnvStorage } from '../common/storage';
import { getDataPath } from './utils';

const STORAGE_PATH = {
  config: 'aionui-config.txt',
  chatMessage: 'aionui-chat-message.txt',
  chat: 'aionui-chat.txt',
  env: '.aionui-env',
};

const getHomePage = getDataPath;

const mkdirSync = (path: string) => {
  return _mkdirSync(path, { recursive: true });
};

if (!existsSync(getHomePage())) {
  mkdirSync(getHomePage());
}
if (!existsSync(path.join(getHomePage(), 'workspace'))) {
  mkdirSync(path.join(getHomePage(), 'workspace'));
}

const WriteFile = (path: string, data: string) => {
  return fs.writeFile(path, data);
};

const ReadFile = (path: string) => {
  return fs.readFile(path);
};

const FileBuilder = (file: string) => {
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
  return {
    write(data: string) {
      return pushStack(() => WriteFile(file, data));
    },
    read() {
      return pushStack(() =>
        ReadFile(file).then((data) => {
          return data.toString();
        })
      );
    },
  };
};

const JsonFileBuilder = <S extends Record<string, any>>(path: string) => {
  const file = FileBuilder(path);
  const encode = (data: any) => {
    return btoa(encodeURIComponent(data));
  };

  const decode = (base64: string) => {
    return decodeURIComponent(atob(base64));
  };

  const toJson = async (): Promise<S> => {
    try {
      const result = await file.read();
      if (!result) return {} as S;
      return JSON.parse(decode(result)) as S;
    } catch (e) {
      return {} as S;
    }
  };

  const setJson = (data: any): Promise<any> => {
    try {
      return file.write(encode(JSON.stringify(data)));
    } catch (e) {
      return Promise.reject(e);
    }
  };

  const toJsonSync = (): S => {
    try {
      return JSON.parse(decode(readFileSync(path).toString())) as S;
    } catch (e) {
      return {} as S;
    }
  };

  return {
    toJson,
    setJson,
    toJsonSync,
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
    getSync<K extends keyof S>(key: K): S[K] {
      const data = toJsonSync();
      return data[key];
    },
  };
};

const envFile = JsonFileBuilder<IEnvStorageRefer>(path.join(getHomePage(), STORAGE_PATH.env));

const dirConfig = envFile.getSync('aionui.dir');

const cacheDir = dirConfig?.cacheDir || getHomePage();

const configFile = JsonFileBuilder<IConfigStorageRefer>(path.join(cacheDir, STORAGE_PATH.config));
const _chatMessageFile = JsonFileBuilder(path.join(cacheDir, STORAGE_PATH.chatMessage));
const chatFile = JsonFileBuilder<IChatConversationRefer>(path.join(cacheDir, STORAGE_PATH.chat));

const buildMessageListStorage = (conversation_id: string, dir: string) => {
  const fullName = path.join(dir, 'aionui-chat-history', conversation_id + '.txt');
  if (!existsSync(fullName)) {
    mkdirSync(path.join(dir, 'aionui-chat-history'));
  }
  return JsonFileBuilder(path.join(dir, 'aionui-chat-history', conversation_id + '.txt'));
};

const conversationHistoryProxy = (options: typeof _chatMessageFile, dir: string) => {
  return {
    ...options,
    async set(key: string, data: any) {
      const conversation_id = key;
      const storage = buildMessageListStorage(conversation_id, dir);
      return storage.setJson(data);
    },
    async get(key: string): Promise<any[]> {
      const conversation_id = key;
      const storage = buildMessageListStorage(conversation_id, dir);
      const data = await storage.toJson();
      if (Array.isArray(data)) return data;
      return [];
    },
  };
};

const chatMessageFile = conversationHistoryProxy(_chatMessageFile, cacheDir);

const initStorage = () => {
  ConfigStorage.interceptor(configFile);
  ChatStorage.interceptor(chatFile);
  ChatMessageStorage.interceptor(chatMessageFile);
  EnvStorage.interceptor(envFile);
  application.systemInfo.provider(async () => {
    return {
      cacheDir: cacheDir,
      workDir: getSystemDir().workDir,
    };
  });
};

export const ProcessConfig = configFile;

export const ProcessChat = chatFile;

export const ProcessChatMessage = chatMessageFile;

export const ProcessEnv = envFile;

export const getSystemDir = () => {
  return {
    cacheDir: cacheDir,
    workDir: dirConfig?.workDir || path.join(getDataPath(), 'workspace'),
  };
};

export default initStorage;
