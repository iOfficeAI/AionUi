/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync as _mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { application } from '../common/ipcBridge';
import type { IChatConversationRefer, IConfigStorageRefer, IEnvStorageRefer } from '../common/storage';
import { ChatMessageStorage, ChatStorage, ConfigStorage, EnvStorage } from '../common/storage';
import { copyDirectoryRecursively, getConfigPath, getDataPath, getTempPath, verifyDirectoryFiles } from './utils';

const nodePath = path;

const STORAGE_PATH = {
  config: 'aionui-config.txt',
  chatMessage: 'aionui-chat-message.txt',
  chat: 'aionui-chat.txt',
  env: '.aionui-env',
};

const getHomePage = getConfigPath;

const mkdirSync = (path: string) => {
  return _mkdirSync(path, { recursive: true });
};

/**
 * 迁移老版本数据从temp目录到userData/config目录
 */
const migrateLegacyData = async () => {
  const oldDir = getTempPath(); // 老的temp目录
  const newDir = getConfigPath(); // 新的userData/config目录

  try {
    // 检查新目录是否为空（不存在或者存在但无内容）
    const isNewDirEmpty =
      !existsSync(newDir) ||
      (() => {
        try {
          return existsSync(newDir) && readdirSync(newDir).length === 0;
        } catch (error) {
          console.warn('[AionUi] Warning: Could not read new directory during migration check:', error);
          return false; // 假设非空以避免迁移覆盖
        }
      })();

    // 检查迁移条件：老目录存在且新目录为空
    if (existsSync(oldDir) && isNewDirEmpty) {
      // 创建目标目录
      mkdirSync(newDir);

      // 复制所有文件和文件夹
      await copyDirectoryRecursively(oldDir, newDir);

      // 验证迁移是否成功
      const isVerified = await verifyDirectoryFiles(oldDir, newDir);
      if (isVerified) {
        // 确保不会删除相同的目录
        if (path.resolve(oldDir) !== path.resolve(newDir)) {
          try {
            await fs.rm(oldDir, { recursive: true });
          } catch (cleanupError) {
            console.warn('[AionUi] 原目录清理失败，请手动删除:', oldDir, cleanupError);
          }
        }
      }

      return true;
    }
  } catch (error) {
    console.error('[AionUi] 数据迁移失败:', error);
  }

  return false;
};

const WriteFile = (path: string, data: string) => {
  return fs.writeFile(path, data);
};

const ReadFile = (path: string) => {
  return fs.readFile(path);
};

const RmFile = (path: string) => {
  return fs.rm(path, { recursive: true });
};

const CopyFile = (src: string, dest: string) => {
  return fs.copyFile(src, dest);
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
    copy(dist: string) {
      return pushStack(() => CopyFile(file, dist));
    },
    rm() {
      return pushStack(() => RmFile(file));
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

      // 验证文件内容不为空且不是损坏的base64
      if (result.trim() === '') {
        console.warn(`[Storage] Empty file detected: ${path}`);
        return {} as S;
      }

      const decoded = decode(result);
      if (!decoded || decoded.trim() === '') {
        console.warn(`[Storage] Empty or corrupted content after decode: ${path}`);
        return {} as S;
      }

      const parsed = JSON.parse(decoded) as S;

      // 额外验证：如果是聊天历史文件且解析结果为空对象，警告用户
      if (path.includes('chat.txt') && Object.keys(parsed).length === 0) {
        console.warn(`[Storage] Chat history file appears to be empty: ${path}`);
      }

      return parsed;
    } catch (e) {
      console.error(`[Storage] Error reading/parsing file ${path}:`, e);
      return {} as S;
    }
  };

  const setJson = async (data: any): Promise<any> => {
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
    backup(fullName: string) {
      const dir = nodePath.dirname(fullName);
      if (!existsSync(dir)) {
        mkdirSync(dir);
      }
      return file.copy(fullName).then(() => file.rm());
    },
  };
};

const envFile = JsonFileBuilder<IEnvStorageRefer>(path.join(getHomePage(), STORAGE_PATH.env));

const dirConfig = envFile.getSync('aionui.dir');

const cacheDir = dirConfig?.cacheDir || getHomePage();

const configFile = JsonFileBuilder<IConfigStorageRefer>(path.join(cacheDir, STORAGE_PATH.config));
const _chatMessageFile = JsonFileBuilder(path.join(cacheDir, STORAGE_PATH.chatMessage));
const _chatFile = JsonFileBuilder<IChatConversationRefer>(path.join(cacheDir, STORAGE_PATH.chat));

// 创建带字段迁移的聊天历史代理
const chatFile = {
  ..._chatFile,
  async get<K extends keyof IChatConversationRefer>(key: K): Promise<IChatConversationRefer[K]> {
    const data = await _chatFile.get(key);

    // 特别处理 chat.history 的字段迁移
    if (key === 'chat.history' && Array.isArray(data)) {
      return data.map((conversation: any) => {
        // 迁移 model 字段：selectedModel -> useModel
        if (conversation.model && 'selectedModel' in conversation.model && !('useModel' in conversation.model)) {
          conversation.model = {
            ...conversation.model,
            useModel: conversation.model.selectedModel,
          };
          delete conversation.model.selectedModel;
        }
        return conversation;
      }) as IChatConversationRefer[K];
    }

    return data;
  },
  async set<K extends keyof IChatConversationRefer>(key: K, value: IChatConversationRefer[K]) {
    return _chatFile.set(key, value);
  },
};

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
    backup(conversation_id: string) {
      const storage = buildMessageListStorage(conversation_id, dir);
      return storage.backup(path.join(dir, 'aionui-chat-history', 'backup', conversation_id + '_' + Date.now() + '.txt'));
    },
  };
};

const chatMessageFile = conversationHistoryProxy(_chatMessageFile, cacheDir);

// 重建聊天历史索引的函数
const rebuildChatHistoryIndex = async () => {
  try {
    const chatHistoryDir = path.join(cacheDir, 'aionui-chat-history');
    if (!existsSync(chatHistoryDir)) {
      console.log('[Storage] No chat history directory found, skipping rebuild');
      return;
    }

    // 读取所有对话文件
    const files = readdirSync(chatHistoryDir).filter((f) => f.endsWith('.txt') && !f.startsWith('backup'));
    console.log(`[Storage] Found ${files.length} conversation files`);

    // 读取当前索引
    const currentHistory = (await _chatFile.get('chat.history')) || [];
    console.log(`[Storage] Current index has ${currentHistory.length} entries`);

    // 如果数量相当，不需要重建
    if (Math.abs(files.length - currentHistory.length) <= 1) {
      console.log('[Storage] Chat history index appears to be up to date');
      return;
    }

    console.log('[Storage] Rebuilding chat history index...');
    const rebuiltHistory: any[] = [];

    for (const file of files) {
      try {
        const conversationId = path.basename(file, '.txt');
        const filePath = path.join(chatHistoryDir, file);
        const stats = await fs.stat(filePath);

        // 尝试从文件中读取对话信息
        const storage = buildMessageListStorage(conversationId, cacheDir);
        const messages = await storage.toJson();

        if (Array.isArray(messages) && messages.length > 0) {
          // 从第一条消息推断对话信息
          const firstMessage = messages[0];
          const lastMessage = messages[messages.length - 1];
          const conversationType = firstMessage?.conversation_id?.includes('acp') ? 'acp' : 'gemini';

          // 尝试从消息中提取真实的时间戳
          let createTime = stats.birthtimeMs || stats.ctimeMs;
          let modifyTime = stats.mtimeMs;

          // 如果消息有时间戳，优先使用消息时间戳
          if (firstMessage?.createTime) {
            createTime = firstMessage.createTime;
          } else if (firstMessage?.createdAt) {
            createTime = firstMessage.createdAt;
          } else {
            // 对于没有时间戳的旧消息，尝试从用户消息或文件时间推测
            const userMessage = messages.find((msg) => msg.position === 'right' && (msg.createdAt || msg.createTime));
            if (userMessage?.createdAt) {
              createTime = userMessage.createdAt;
            } else if (userMessage?.createTime) {
              createTime = userMessage.createTime;
            } else {
              // 最后的回退：使用文件系统时间，但调整为更合理的历史时间
              // 如果文件很新但内容看起来是历史对话，向前推移时间
              const fileAge = Date.now() - (stats.birthtimeMs || stats.ctimeMs);
              if (fileAge < 7 * 24 * 60 * 60 * 1000) {
                // 文件创建不到7天
                // 根据文件名字符分布推测创建时间（简单的散列）
                const hashValue = conversationId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const dayOffset = (hashValue % 30) + 1; // 1-30天前
                createTime = Date.now() - dayOffset * 24 * 60 * 60 * 1000;
              } else {
                createTime = stats.birthtimeMs || stats.ctimeMs;
              }
            }
          }

          if (lastMessage?.createTime) {
            modifyTime = Math.max(modifyTime, lastMessage.createTime);
          } else if (lastMessage?.createdAt) {
            modifyTime = Math.max(modifyTime, lastMessage.createdAt);
          }

          // 提取对话名称，优先使用用户的第一条消息
          let conversationName = 'Untitled';
          const userMessage = messages.find((msg) => msg.position === 'right' || msg.type === 'text');
          if (userMessage?.content?.content) {
            conversationName = userMessage.content.content.substring(0, 50).replace(/\n/g, ' ').trim();
          } else if (firstMessage?.content?.content) {
            conversationName = firstMessage.content.content.substring(0, 50).replace(/\n/g, ' ').trim();
          }

          const conversation = {
            id: conversationId,
            name: conversationName,
            type: conversationType,
            createTime,
            modifyTime,
            model: {
              id: `${conversationType}-model`,
              platform: conversationType,
              name: conversationType.toUpperCase(),
              baseUrl: '',
              apiKey: '',
              useModel: conversationType === 'acp' ? 'claude' : 'gemini-1.5-pro',
            },
            extra: {
              workspace: conversationType === 'acp' ? process.cwd() : '',
              backend: conversationType === 'acp' ? 'claude' : undefined,
            },
            status: 'finished' as const,
          };

          rebuiltHistory.push(conversation);
        }
      } catch (fileError) {
        console.warn(`[Storage] Error processing file ${file}:`, fileError);
      }
    }

    // 按修改时间排序
    rebuiltHistory.sort((a, b) => b.modifyTime - a.modifyTime);

    console.log(`[Storage] Rebuilt index with ${rebuiltHistory.length} conversations`);

    // 保存重建的索引
    await _chatFile.set('chat.history', rebuiltHistory);
  } catch (error) {
    console.error('[Storage] Error rebuilding chat history index:', error);
  }
};
const initStorage = async () => {
  // 1. 先执行数据迁移（在任何目录创建之前）
  await migrateLegacyData();

  // 2. 创建必要的目录（迁移后再创建，确保迁移能正常进行）
  if (!existsSync(getHomePage())) {
    mkdirSync(getHomePage());
  }
  if (!existsSync(getDataPath())) {
    mkdirSync(getDataPath());
  }

  // 3. 初始化存储系统
  ConfigStorage.interceptor(configFile);
  ChatStorage.interceptor(chatFile);
  ChatMessageStorage.interceptor(chatMessageFile);
  EnvStorage.interceptor(envFile);

  // 4. 检查并重建聊天历史索引（如果需要）
  await rebuildChatHistoryIndex();
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
    workDir: dirConfig?.workDir || getDataPath(),
  };
};

export default initStorage;
