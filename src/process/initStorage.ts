/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync as _mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { application } from '../common/ipcBridge';
import type { TMessage } from '@/common/chatLib';
import { ASSISTANT_PRESETS } from '@/common/presets/assistantPresets';
import type { IChatConversationRefer, IConfigStorageRefer, IEnvStorageRefer, IMcpServer, TChatConversation, TProviderWithModel } from '../common/storage';
import { ChatMessageStorage, ChatStorage, ConfigStorage, EnvStorage } from '../common/storage';
import { copyDirectoryRecursively, getCliSafePath, getConfigPath, getDataPath, getTempPath, verifyDirectoryFiles } from './utils';
import { getDatabase } from './database/export';
import type { AcpBackendConfig } from '@/types/acpTypes';
// Platform and architecture types (moved from deleted updateConfig)
type PlatformType = 'win32' | 'darwin' | 'linux';
type ArchitectureType = 'x64' | 'arm64' | 'ia32' | 'arm';

const nodePath = path;

const STORAGE_PATH = {
  config: 'aionui-config.txt',
  chatMessage: 'aionui-chat-message.txt',
  chat: 'aionui-chat.txt',
  env: '.aionui-env',
  assistants: 'assistants',
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
  const stack: (() => Promise<unknown>)[] = [];
  let isRunning = false;
  const run = () => {
    if (isRunning || !stack.length) return;
    isRunning = true;
    void stack
      .shift()?.()
      .finally(() => {
        isRunning = false;
        run();
      });
  };
  const pushStack = <R>(fn: () => Promise<R>) => {
    return new Promise<R>((resolve, reject) => {
      stack.push(() => fn().then(resolve).catch(reject));
      run();
    });
  };
  return {
    path: file,
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

const JsonFileBuilder = <S extends object = Record<string, unknown>>(path: string) => {
  const file = FileBuilder(path);
  const encode = (data: unknown) => {
    return btoa(encodeURIComponent(String(data)));
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
      // console.error(`[Storage] Error reading/parsing file ${path}:`, e);
      return {} as S;
    }
  };

  const setJson = async (data: S): Promise<S> => {
    try {
      await file.write(encode(JSON.stringify(data)));
      return data;
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
    async set<K extends keyof S>(key: K, value: Awaited<S>[K]): Promise<Awaited<S>[K]> {
      const data = await toJson();
      data[key] = value;
      await setJson(data);
      return value;
    },
    async get<K extends keyof S>(key: K): Promise<Awaited<S>[K]> {
      const data = await toJson();
      return data[key] as Awaited<S>[K];
    },
    async remove<K extends keyof S>(key: K) {
      const data = await toJson();
      delete data[key];
      return setJson(data);
    },
    clear() {
      return setJson({} as S);
    },
    getSync<K extends keyof S>(key: K): S[K] {
      const data = toJsonSync();
      return data[key];
    },
    update<K extends keyof S>(key: K, updateFn: (value: S[K], data: S) => Promise<S[K]>) {
      return toJson().then((data) => {
        return updateFn(data[key], data).then((value) => {
          data[key] = value;
          return setJson(data);
        });
      });
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
type ConversationHistoryData = Record<string, TMessage[]>;

const _chatMessageFile = JsonFileBuilder<ConversationHistoryData>(path.join(cacheDir, STORAGE_PATH.chatMessage));
const _chatFile = JsonFileBuilder<IChatConversationRefer>(path.join(cacheDir, STORAGE_PATH.chat));

// 创建带字段迁移的聊天历史代理
const isGeminiConversation = (conversation: TChatConversation): conversation is Extract<TChatConversation, { type: 'gemini' }> => {
  return conversation.type === 'gemini';
};

const chatFile = {
  ..._chatFile,
  async get<K extends keyof IChatConversationRefer>(key: K): Promise<IChatConversationRefer[K]> {
    const data = await _chatFile.get(key);

    // 特别处理 chat.history 的字段迁移
    if (key === 'chat.history' && Array.isArray(data)) {
      const history = data as IChatConversationRefer['chat.history'];
      return history.map((conversation: TChatConversation) => {
        // 只有 Gemini 会话带有 model 字段，需要将旧格式 selectedModel 迁移为 useModel
        if (isGeminiConversation(conversation) && conversation.model) {
          // 使用 Record 类型处理旧格式迁移
          const modelRecord = conversation.model as unknown as Record<string, unknown>;
          if ('selectedModel' in modelRecord && !('useModel' in modelRecord)) {
            modelRecord['useModel'] = modelRecord['selectedModel'];
            delete modelRecord['selectedModel'];
            conversation.model = modelRecord as TProviderWithModel;
          }
        }
        return conversation;
      }) as IChatConversationRefer[K];
    }

    return data;
  },
  async set<K extends keyof IChatConversationRefer>(key: K, value: IChatConversationRefer[K]): Promise<IChatConversationRefer[K]> {
    return await _chatFile.set(key, value);
  },
};

const buildMessageListStorage = (conversation_id: string, dir: string) => {
  const fullName = path.join(dir, 'aionui-chat-history', conversation_id + '.txt');
  if (!existsSync(fullName)) {
    mkdirSync(path.join(dir, 'aionui-chat-history'));
  }
  return JsonFileBuilder<TMessage[]>(path.join(dir, 'aionui-chat-history', conversation_id + '.txt'));
};

const conversationHistoryProxy = (options: typeof _chatMessageFile, dir: string) => {
  return {
    ...options,
    async set(key: string, data: TMessage[]) {
      const conversation_id = key;
      const storage = buildMessageListStorage(conversation_id, dir);
      return await storage.setJson(data);
    },
    async get(key: string): Promise<TMessage[]> {
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

/**
 * 获取助手规则目录路径
 * Get assistant rules directory path
 */
const getAssistantsDir = () => {
  return path.join(cacheDir, STORAGE_PATH.assistants);
};

/**
 * 初始化内置助手的规则文件到用户目录
 * Initialize builtin assistant rule files to user directory
 */
const initBuiltinAssistantRules = async (): Promise<void> => {
  const assistantsDir = getAssistantsDir();

  // 开发模式下使用项目根目录，生产模式使用 app.getAppPath()
  // In development, use project root. In production, use app.getAppPath()
  let rulesDir: string;
  if (app.isPackaged) {
    rulesDir = path.join(app.getAppPath(), 'rules');
  } else {
    rulesDir = path.join(app.getAppPath(), '..', '..', 'rules');
  }

  console.log(`[AionUi] initBuiltinAssistantRules: rulesDir=${rulesDir}, assistantsDir=${assistantsDir}`);

  // 确保助手目录存在 / Ensure assistants directory exists
  if (!existsSync(assistantsDir)) {
    mkdirSync(assistantsDir);
    console.log(`[AionUi] Created assistants directory: ${assistantsDir}`);
  }

  for (const preset of ASSISTANT_PRESETS) {
    const assistantId = `builtin-${preset.id}`;

    for (const [locale, ruleFile] of Object.entries(preset.ruleFiles)) {
      try {
        const sourceRulesPath = path.join(rulesDir, ruleFile);
        // 目标文件名格式：{assistantId}.{locale}.md
        // Target file name format: {assistantId}.{locale}.md
        const targetFileName = `${assistantId}.${locale}.md`;
        const targetPath = path.join(assistantsDir, targetFileName);

        // 检查源文件是否存在 / Check if source file exists
        if (!existsSync(sourceRulesPath)) {
          console.warn(`[AionUi] Source rule file not found: ${sourceRulesPath}`);
          continue;
        }

        // 只在目标文件不存在时才创建，不覆盖用户的修改
        // Only create if target file doesn't exist, don't overwrite user modifications
        const targetExists = existsSync(targetPath);

        if (!targetExists) {
          const content = await fs.readFile(sourceRulesPath, 'utf-8');
          await fs.writeFile(targetPath, content, 'utf-8');
          console.log(`[AionUi] Created builtin rule: ${targetFileName}`);
        }
      } catch (error) {
        // 忽略缺失的语言文件 / Ignore missing locale files
        console.warn(`[AionUi] Failed to copy rule file ${ruleFile}:`, error);
      }
    }
  }
};

/**
 * 获取内置助手配置（不包含 context，context 从文件读取）
 * Get built-in assistant configurations (without context, context is read from files)
 */
const getBuiltinAssistants = (): AcpBackendConfig[] => {
  const assistants: AcpBackendConfig[] = [];

  for (const preset of ASSISTANT_PRESETS) {
    assistants.push({
      id: `builtin-${preset.id}`,
      name: preset.nameI18n['en-US'],
      nameI18n: preset.nameI18n,
      description: preset.descriptionI18n['en-US'],
      descriptionI18n: preset.descriptionI18n,
      avatar: preset.avatar,
      // context 不再存储在配置中，而是从文件读取
      // context is no longer stored in config, read from files instead
      enabled: true,
      isPreset: true,
      isBuiltin: true,
      presetAgentType: preset.presetAgentType || 'gemini',
    });
  }

  return assistants;
};

/**
 * 创建默认的 MCP 服务器配置
 */
const getDefaultMcpServers = (): IMcpServer[] => {
  const now = Date.now();
  const defaultConfig = {
    mcpServers: {
      'chrome-devtools': {
        command: 'npx',
        args: ['-y', 'chrome-devtools-mcp@latest'],
      },
    },
  };

  return Object.entries(defaultConfig.mcpServers).map(([name, config], index) => ({
    id: `mcp_default_${now}_${index}`,
    name,
    description: `Default MCP server: ${name}`,
    enabled: false, // 默认不启用，让用户手动开启
    transport: {
      type: 'stdio' as const,
      command: config.command,
      args: config.args,
    },
    createdAt: now,
    updatedAt: now,
    originalJson: JSON.stringify({ [name]: config }, null, 2),
  }));
};

const initStorage = async () => {
  console.log('[AionUi] Starting storage initialization...');

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

  // 4. 初始化 MCP 配置（为所有用户提供默认配置）
  try {
    const existingMcpConfig = await configFile.get('mcp.config').catch((): undefined => undefined);

    // 仅当配置不存在或为空时，写入默认值（适用于新用户和老用户）
    if (!existingMcpConfig || !Array.isArray(existingMcpConfig) || existingMcpConfig.length === 0) {
      const defaultServers = getDefaultMcpServers();
      await configFile.set('mcp.config', defaultServers);
      console.log('[AionUi] Default MCP servers initialized');
    }
  } catch (error) {
    console.error('[AionUi] Failed to initialize default MCP servers:', error);
  }
  // 5. 初始化内置助手（Assistants）
  try {
    // 5.1 初始化内置助手的规则文件到用户目录
    // Initialize builtin assistant rule files to user directory
    await initBuiltinAssistantRules();

    // 5.2 初始化助手配置（只包含元数据，不包含 context）
    // Initialize assistant config (metadata only, no context)
    const existingAgents = (await configFile.get('acp.customAgents').catch((): undefined => undefined)) || [];
    const builtinAssistants = getBuiltinAssistants();

    // 更新或添加内置助手配置
    // Update or add built-in assistant configurations
    const updatedAgents = [...existingAgents];
    let hasChanges = false;

    for (const builtin of builtinAssistants) {
      const index = updatedAgents.findIndex((a: AcpBackendConfig) => a.id === builtin.id);
      if (index >= 0) {
        // 更新现有内置助手配置
        // Update existing built-in assistant config
        const existing = updatedAgents[index];
        // 只有当关键字段不同时才更新，避免不必要的写入
        // Update only if key fields are different to avoid unnecessary writes
        if (existing.name !== builtin.name || existing.description !== builtin.description || existing.avatar !== builtin.avatar || existing.presetAgentType !== builtin.presetAgentType || existing.isPreset !== builtin.isPreset || existing.isBuiltin !== builtin.isBuiltin) {
          updatedAgents[index] = { ...existing, ...builtin };
          hasChanges = true;
        }
      } else {
        // 添加新的内置助手
        // Add new built-in assistant
        updatedAgents.unshift(builtin);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await configFile.set('acp.customAgents', updatedAgents);
    }
  } catch (error) {
    console.error('[AionUi] Failed to initialize builtin assistants:', error);
  }

  // 6. 初始化数据库（better-sqlite3）
  try {
    getDatabase();
  } catch (error) {
    console.error('[InitStorage] Database initialization failed, falling back to file-based storage:', error);
  }

  application.systemInfo.provider(() => {
    return Promise.resolve(getSystemDir());
  });
};

export const ProcessConfig = configFile;

export const ProcessChat = chatFile;

export const ProcessChatMessage = chatMessageFile;

export const ProcessEnv = envFile;

export const getSystemDir = () => {
  return {
    cacheDir: cacheDir,
    // Use CLI-safe path (symlink on macOS) for all agents to avoid spaces in paths
    // 所有 agent 使用 CLI 安全路径（macOS 上的符号链接）以避免路径中空格导致的问题
    workDir: dirConfig?.workDir || getCliSafePath(),
    platform: process.platform as PlatformType,
    arch: process.arch as ArchitectureType,
  };
};

/**
 * 获取助手规则目录路径（供其他模块使用）
 * Get assistant rules directory path (for use by other modules)
 */
export { getAssistantsDir };

export default initStorage;
