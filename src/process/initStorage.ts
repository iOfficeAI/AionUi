/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync as _mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { application } from '../common/ipcBridge';
import type { IChatConversationRefer, IConfigStorageRefer, IEnvStorageRefer, TChatConversation } from '../common/storage';
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
// 根据特定conversation ID恢复单个对话
export const recoverConversationById = async (conversationId: string): Promise<TChatConversation | null> => {
  const cacheDir = getSystemDir().cacheDir;
  try {
    // 直接根据ID构建文件路径
    const filePath = path.join(cacheDir, 'aionui-chat-history', `${conversationId}.txt`);
    if (!existsSync(filePath)) {
      return null;
    }

    const storage = buildMessageListStorage(conversationId, cacheDir);
    const messages = await storage.toJson();

    if (!Array.isArray(messages) || messages.length === 0) {
      return null;
    }

    // 获取文件统计信息用于时间戳
    const stats = await fs.stat(filePath);

    return buildConversationFromMessages(messages, conversationId, stats);
  } catch (error) {
    console.warn(`[Storage] Error recovering conversation ${conversationId}:`, error);
    return null;
  }
};

// 从消息数组构建对话对象
const buildConversationFromMessages = (messages: any[], conversationId: string, stats: any): TChatConversation => {
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];

  // 检测对话类型：查找ACP相关的消息类型
  const acpStatusMessage = messages.find((msg) => msg.type === 'acp_status');
  const hasAcpMessages = messages.some((msg) => msg.type === 'acp_status' || msg.type === 'acp_permission' || (msg.type === 'error' && msg.data?.role === 'system'));

  // 根据实际消息内容确定类型
  const conversationType = hasAcpMessages ? 'acp' : 'gemini';

  // 从ACP状态消息中提取真实的backend，没有就返回null
  let acpBackend: string | undefined;
  if (conversationType === 'acp' && acpStatusMessage?.content?.backend) {
    acpBackend = acpStatusMessage.content.backend;
  }

  // 从消息中提取workspace信息
  let workspace: string | undefined;
  if (conversationType === 'acp') {
    // ACP对话可能有workspace
    const acpPermissionMessage = messages.find((msg) => msg.type === 'acp_permission');
    if (acpPermissionMessage?.content?.workspace) {
      workspace = acpPermissionMessage.content.workspace;
    } else if (acpStatusMessage?.content?.workspace) {
      workspace = acpStatusMessage.content.workspace;
    }
  } else {
    // Gemini对话应该有workspace
    const firstUserMessage = messages.find((msg) => msg.position === 'right');
    if (firstUserMessage?.data?.workspace) {
      workspace = firstUserMessage.data.workspace;
    }
  }

  // 尝试从消息中提取真实的时间戳
  let createTime = stats.birthtimeMs || stats.ctimeMs;
  let modifyTime = stats.mtimeMs;

  if (firstMessage?.createTime) {
    createTime = firstMessage.createTime;
  } else if (firstMessage?.createdAt) {
    createTime = firstMessage.createdAt;
  }

  if (lastMessage?.createTime) {
    modifyTime = Math.max(modifyTime, lastMessage.createTime);
  } else if (lastMessage?.createdAt) {
    modifyTime = Math.max(modifyTime, lastMessage.createdAt);
  }

  // 提取对话名称，严格优先使用用户的第一条消息
  let conversationName = 'Untitled';
  const userMessage = messages.find((msg) => msg.position === 'right');
  if (userMessage?.content?.content) {
    conversationName = userMessage.content.content.substring(0, 50).replace(/\n/g, ' ').trim();
  }

  if (conversationType === 'acp') {
    // 对于ACP，backend是必需的
    if (!acpBackend) {
      console.warn(`[Storage] ACP conversation ${conversationId} missing backend information`);
      return null as any; // 无法恢复没有backend的ACP对话
    }

    return {
      id: conversationId,
      name: conversationName,
      type: 'acp' as const,
      createTime,
      modifyTime,
      model: {
        id: `acp-model`,
        platform: 'acp' as const,
        name: 'ACP',
        baseUrl: '',
        apiKey: '',
        useModel: acpBackend, // 使用实际的backend
      },
      extra: {
        workspace: workspace || '', // 使用实际的workspace
        backend: acpBackend as any,
      },
      status: 'finished' as const,
    };
  } else {
    return {
      id: conversationId,
      name: conversationName,
      type: 'gemini' as const,
      createTime,
      modifyTime,
      model: {
        id: `gemini-model`,
        platform: 'gemini' as const,
        name: 'GEMINI',
        baseUrl: '',
        apiKey: '',
        useModel: 'gemini-1.5-pro', // Gemini的model是固定的
      },
      extra: {
        workspace: workspace || '', // 使用实际的workspace
      },
      status: 'finished' as const,
    };
  }
};

const rebuildChatHistoryIndex = async () => {
  try {
    const chatHistoryDir = path.join(cacheDir, 'aionui-chat-history');
    if (!existsSync(chatHistoryDir)) {
      return;
    }

    // 读取所有对话文件
    const files = readdirSync(chatHistoryDir).filter((f) => f.endsWith('.txt') && !f.startsWith('backup'));

    // 读取当前索引
    const currentHistory = (await _chatFile.get('chat.history')) || [];

    // 如果数量相当，不需要重建
    if (Math.abs(files.length - currentHistory.length) <= 1) {
      return;
    }

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
          // 使用通用的构建函数
          const conversation = buildConversationFromMessages(messages, conversationId, stats);
          if (conversation) {
            rebuiltHistory.push(conversation);
          }
        }
      } catch (fileError) {
        console.warn(`[Storage] Error processing file ${file}:`, fileError);
      }
    }

    // 按修改时间排序
    rebuiltHistory.sort((a, b) => b.modifyTime - a.modifyTime);

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
