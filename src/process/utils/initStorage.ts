/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync as _mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { getPlatformServices } from '@/common/platform';
import { application } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';
import type {
  IChatConversationRefer,
  IConfigStorageRefer,
  IEnvStorageRefer,
  IMcpServer,
  TChatConversation,
  TProviderWithModel,
} from '@/common/config/storage';
import { ConfigStorage, EnvStorage } from '@/common/config/storage';
import {
  copyDirectoryRecursively,
  ensureDirectory,
  getConfigPath,
  getDataPath,
  getTempPath,
  hasElectronAppPath,
  verifyDirectoryFiles,
} from './utils';
import { getDatabase } from '../services/database/export';
import {
  BUILTIN_IMAGE_GEN_ID,
  BUILTIN_IMAGE_GEN_LEGACY_NAMES,
  BUILTIN_IMAGE_GEN_NAME,
} from '../resources/builtinMcp/constants';
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
  skills: 'skills',
  builtinSkills: 'builtin-skills',
  cronSkills: 'cron-skills',
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

const WriteFile = async (filePath: string, data: string) => {
  // Ensure parent directory exists to prevent ENOENT on first write
  const dir = nodePath.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  return fs.writeFile(filePath, data);
};

/**
 * In-memory JSON store backed by a file on disk.
 *
 * Data is loaded once (synchronously on first access) and kept in memory.
 * - `get` / `getSync` read from the in-memory cache (microseconds).
 * - `set` / `remove` / `clear` update the cache first, then persist to disk.
 * - Disk writes are serialized via a simple promise chain to prevent corruption.
 *
 * The on-disk format stays base64(encodeURIComponent(JSON)) for backward compat.
 */
const JsonFileBuilder = <S extends object = Record<string, unknown>>(filePath: string) => {
  // -- encoding helpers (unchanged, keeps backward compat) --
  const encode = (data: unknown) => btoa(encodeURIComponent(String(data)));
  const decode = (base64: string) => decodeURIComponent(atob(base64));

  // -- in-memory cache --
  let cache: S | null = null;

  const loadSync = (): S => {
    try {
      const raw = readFileSync(filePath).toString();
      if (!raw || raw.trim() === '') return {} as S;
      const decoded = decode(raw);
      if (!decoded || decoded.trim() === '') return {} as S;
      const parsed = JSON.parse(decoded) as S;
      if (filePath.includes('chat.txt') && Object.keys(parsed).length === 0) {
        console.warn(`[Storage] Chat history file appears to be empty: ${filePath}`);
      }
      return parsed;
    } catch {
      return {} as S;
    }
  };

  const ensureLoaded = (): S => {
    if (cache === null) {
      cache = loadSync();
    }
    return cache;
  };

  // -- serialized disk persistence --
  let writeChain: Promise<unknown> = Promise.resolve();

  const persist = (): Promise<S> => {
    const data = cache ?? ({} as S);
    const encoded = encode(JSON.stringify(data));
    // Write once, branch the promise: writeChain stays resolved (so one
    // failure doesn't block subsequent writes), callers get the real error.
    const writeOp = writeChain.then(() => WriteFile(filePath, encoded));
    writeChain = writeOp.catch(() => {});
    return writeOp.then(
      () => data,
      (err) => {
        console.error(`[Storage] Failed to persist ${filePath}:`, err);
        throw err;
      }
    );
  };

  // -- public API (same shape as before) --
  const toJson = async (): Promise<S> => ensureLoaded();

  const setJson = async (data: S): Promise<S> => {
    cache = data;
    return persist();
  };

  const toJsonSync = (): S => ensureLoaded();

  return {
    toJson,
    setJson,
    toJsonSync,
    async set<K extends keyof S>(key: K, value: Awaited<S>[K]): Promise<Awaited<S>[K]> {
      const data = ensureLoaded();
      data[key] = value;
      await persist();
      return value;
    },
    async get<K extends keyof S>(key: K): Promise<Awaited<S>[K]> {
      return ensureLoaded()[key] as Awaited<S>[K];
    },
    async remove<K extends keyof S>(key: K) {
      const data = ensureLoaded();
      delete data[key];
      return persist();
    },
    clear() {
      cache = {} as S;
      return persist();
    },
    getSync<K extends keyof S>(key: K): S[K] {
      return ensureLoaded()[key];
    },
    update<K extends keyof S>(key: K, updateFn: (value: S[K], data: S) => Promise<S[K]>) {
      const data = ensureLoaded();
      return updateFn(data[key], data).then((value) => {
        data[key] = value;
        return persist();
      });
    },
    backup(fullName: string) {
      const dir = nodePath.dirname(fullName);
      if (!existsSync(dir)) {
        mkdirSync(dir);
      }
      // Backup: copy the file then remove original
      const doCopy = () => fs.copyFile(filePath, fullName).then(() => fs.rm(filePath, { recursive: true }));
      const backupOp = writeChain.then(doCopy);
      writeChain = backupOp.catch(() => {});
      return backupOp.then(
        () => {},
        (err) => {
          console.error(`[Storage] Backup failed:`, err);
          throw err;
        }
      );
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
const isGeminiConversation = (
  conversation: TChatConversation
): conversation is Extract<TChatConversation, { type: 'gemini' }> => {
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
  async set<K extends keyof IChatConversationRefer>(
    key: K,
    value: IChatConversationRefer[K]
  ): Promise<IChatConversationRefer[K]> {
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
      return storage.backup(
        path.join(dir, 'aionui-chat-history', 'backup', conversation_id + '_' + Date.now() + '.txt')
      );
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
 * 获取技能脚本目录路径
 * Get skills scripts directory path
 */
const getSkillsDir = () => {
  return path.join(cacheDir, STORAGE_PATH.skills);
};

/**
 * Get the directory where bundled skills are copied to (config/builtin-skills/).
 * This directory is fully managed by the app — synced on every startup.
 */
const getBuiltinSkillsCopyDir = () => {
  return path.join(cacheDir, STORAGE_PATH.builtinSkills);
};

/**
 * Get the auto-enabled builtin skills directory (_builtin subdirectory).
 * Skills in this directory are automatically injected for ALL agents and scenarios.
 */
const getAutoSkillsDir = () => {
  return path.join(getBuiltinSkillsCopyDir(), '_builtin');
};

/**
 * Get the directory for per-cron-job SKILL.md files.
 * Each cron job gets its own subdirectory: {cronSkillsDir}/{jobId}/SKILL.md
 */
const getCronSkillsDir = () => {
  return path.join(cacheDir, STORAGE_PATH.cronSkills);
};

/**
 * Ensure user-facing config directories exist. Built-in assistant rules and
 * skill files are now owned by the backend (see
 * `crates/aionui-app/assets/builtin-assistants/` and the
 * `assistant-rule/skill` dispatch routes), so they are no longer synced from
 * the renderer's frozen ASSISTANT_PRESETS catalog. User-authored rule md files
 * continue to live under `{cacheDir}/assistants/` until the one-shot backend
 * migration in T3b hands them over.
 */
const ensureAssistantDirs = async (): Promise<void> => {
  const assistantsDir = getAssistantsDir();
  const builtinSkillsCopyDir = getBuiltinSkillsCopyDir();
  const userSkillsDir = getSkillsDir();

  const resolveBuiltinDir = (dirPath: string): string => {
    const platform = getPlatformServices().paths;
    const appPath = platform.getAppPath()!;
    let candidates: string[];
    if (platform.isPackaged()) {
      const RESOURCES_PREFIX = 'src/process/resources/';
      const prodPath = dirPath.startsWith(RESOURCES_PREFIX) ? dirPath.slice(RESOURCES_PREFIX.length) : dirPath;
      candidates = [path.join(appPath, prodPath)];
    } else {
      candidates = [path.join(appPath, dirPath)];
    }
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    console.warn(`[AionUi] Could not find builtin ${dirPath} directory, tried:`, candidates);
    return candidates[0];
  };

  const builtinSkillsDir = resolveBuiltinDir('src/process/resources/skills');

  // Sync builtin skills to a dedicated directory (config/builtin-skills/).
  // This directory is fully managed by the app: overwrite existing, remove stale.
  // User-custom skills live in config/skills/ and are never touched.
  if (existsSync(builtinSkillsDir)) {
    try {
      if (!existsSync(builtinSkillsCopyDir)) {
        mkdirSync(builtinSkillsCopyDir);
      }
      await copyDirectoryRecursively(builtinSkillsDir, builtinSkillsCopyDir, { overwrite: true });
      const srcNames = new Set(
        readdirSync(builtinSkillsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      );
      for (const entry of readdirSync(builtinSkillsCopyDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!srcNames.has(entry.name)) {
          await fs.rm(path.join(builtinSkillsCopyDir, entry.name), { recursive: true, force: true });
        }
      }
    } catch (error) {
      console.warn(`[AionUi] Failed to sync builtin skills directory:`, error);
    }
  }

  if (!existsSync(userSkillsDir)) mkdirSync(userSkillsDir);

  const cronSkillsDir = getCronSkillsDir();
  if (!existsSync(cronSkillsDir)) mkdirSync(cronSkillsDir);

  if (!existsSync(assistantsDir)) mkdirSync(assistantsDir);
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

const getBuiltinMcpBaseDir = (): string => {
  const mainModuleDir =
    typeof require !== 'undefined' && require.main?.filename ? path.dirname(require.main.filename) : __dirname;
  const baseDir = path.basename(mainModuleDir) === 'chunks' ? path.dirname(mainModuleDir) : mainModuleDir;
  // In packaged mode the main bundle lives inside app.asar, but external node
  // processes cannot read files from ASAR archives. Redirect to the unpacked copy.
  if (getPlatformServices().paths.isPackaged()) {
    return baseDir.replace('app.asar', 'app.asar.unpacked');
  }
  return baseDir;
};

/**
 * Resolve the path to a built-in MCP server entry script.
 * In development the file lives next to the main process bundle (out/main/);
 * in production it's inside the packaged app.
 */
const getBuiltinMcpScriptPath = (scriptName: string): string => {
  // initStorage may itself be code-split into out/main/chunks/.
  // Built-in MCP entry files are emitted next to the main entry in out/main/.
  return path.resolve(getBuiltinMcpBaseDir(), `${scriptName}.js`);
};

/**
 * Ensure built-in MCP servers exist in mcp.config.
 * - Creates missing entries with enabled: false
 * - Updates command path if app location changed
 * - Migrates old tools.imageGenerationModel.switch to MCP server enabled state
 */
const ensureBuiltinMcpServers = async (): Promise<void> => {
  try {
    const mcpServers: IMcpServer[] = (await configFile.get('mcp.config').catch((): IMcpServer[] => [])) || [];
    const now = Date.now();
    let changed = false;

    const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-image-gen');

    // Check if built-in image gen server already exists
    const existingIdx = mcpServers.findIndex((s) => s.builtin === true && s.id === BUILTIN_IMAGE_GEN_ID);

    // Migrate old switch setting
    let shouldEnable = false;
    const oldConfig = await configFile.get('tools.imageGenerationModel').catch((): undefined => undefined);
    if (oldConfig && oldConfig.switch === true) {
      shouldEnable = true;
    }

    // Build env vars from existing image generation model config
    const buildEnvFromConfig = (cfg: typeof oldConfig): Record<string, string> => {
      if (!cfg) return {};
      const env: Record<string, string> = {};
      if (cfg.platform) env.AIONUI_IMG_PLATFORM = cfg.platform;
      if (cfg.baseUrl) env.AIONUI_IMG_BASE_URL = cfg.baseUrl;
      if (cfg.apiKey) env.AIONUI_IMG_API_KEY = cfg.apiKey;
      if (cfg.useModel) env.AIONUI_IMG_MODEL = cfg.useModel;
      return env;
    };

    const buildOriginalJson = (scriptPathValue: string, env: Record<string, string>) =>
      JSON.stringify(
        {
          [BUILTIN_IMAGE_GEN_NAME]: {
            command: 'node',
            args: [scriptPathValue],
            env,
          },
        },
        null,
        2
      );

    if (existingIdx >= 0) {
      // Update command path in case app location changed
      const existing = mcpServers[existingIdx];
      const needsNameMigration =
        existing.name !== BUILTIN_IMAGE_GEN_NAME &&
        BUILTIN_IMAGE_GEN_LEGACY_NAMES.includes(existing.name as (typeof BUILTIN_IMAGE_GEN_LEGACY_NAMES)[number]);

      const needsPathUpdate =
        existing.transport.type === 'stdio' &&
        existing.transport.command === 'node' &&
        ((existing.transport.args || [])[0] !== scriptPath || needsNameMigration);

      const needsMigration = shouldEnable && !existing.enabled;

      if (needsNameMigration || needsPathUpdate || needsMigration) {
        let updatedTransport: IMcpServer['transport'] = existing.transport;

        if (existing.transport.type === 'stdio') {
          const mergedEnv = needsMigration
            ? { ...existing.transport.env, ...buildEnvFromConfig(oldConfig) }
            : existing.transport.env;
          updatedTransport = {
            ...existing.transport,
            ...(needsPathUpdate && { args: [scriptPath] }),
            ...(needsMigration && { env: mergedEnv }),
          };
        }

        const newOriginalJson =
          needsPathUpdate && updatedTransport.type === 'stdio'
            ? buildOriginalJson(scriptPath, updatedTransport.env ?? {})
            : existing.originalJson;

        mcpServers[existingIdx] = {
          ...existing,
          name: needsNameMigration ? BUILTIN_IMAGE_GEN_NAME : existing.name,
          transport: updatedTransport,
          originalJson: newOriginalJson,
          enabled: needsMigration ? true : existing.enabled,
          updatedAt: now,
        };
        changed = true;
      }
    } else {
      // Create new built-in image gen server
      const env = buildEnvFromConfig(oldConfig);
      const newServer: IMcpServer = {
        id: BUILTIN_IMAGE_GEN_ID,
        name: BUILTIN_IMAGE_GEN_NAME,
        description: 'Built-in image generation tool powered by AI models. Configure the model in Settings > Tools.',
        enabled: shouldEnable,
        builtin: true,
        transport: {
          type: 'stdio',
          command: 'node',
          args: [scriptPath],
          env,
        },
        createdAt: now,
        updatedAt: now,
        originalJson: buildOriginalJson(scriptPath, env),
      };
      mcpServers.push(newServer);
      changed = true;
    }

    if (changed) {
      await configFile.set('mcp.config', mcpServers);
      console.log('[AionUi] Built-in MCP servers ensured');
    }

    // Clear old switch flag after migration
    if (shouldEnable && oldConfig) {
      const { switch: _switch, ...rest } = oldConfig;
      await configFile.set('tools.imageGenerationModel', rest as typeof oldConfig);
    }
  } catch (error) {
    console.error('[AionUi] Failed to ensure built-in MCP servers:', error);
  }
};

/**
 * 启动时清理异常遗留的健康检测临时会话
 * Cleanup orphaned health-check temporary conversations on startup
 */
const cleanupOrphanedHealthCheckConversations = async () => {
  try {
    const db = await getDatabase();
    const pageSize = 1000;
    const idsToDelete: string[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const result = db.getUserConversations(undefined, page, pageSize);
      result.data.forEach((conversation) => {
        const extra = conversation.extra as { isHealthCheck?: boolean } | undefined;
        if (extra?.isHealthCheck === true) {
          idsToDelete.push(conversation.id);
        }
      });
      hasMore = result.hasMore;
      page += 1;
    }

    let deletedCount = 0;
    idsToDelete.forEach((id) => {
      const deleted = db.deleteConversation(id);
      if (deleted.success && deleted.data) {
        deletedCount += 1;
      }
    });

    if (deletedCount > 0) {
      console.log(`[AionUi] Cleaned up ${deletedCount} orphaned health-check conversation(s) on startup`);
    }
  } catch (error) {
    console.warn('[AionUi] Failed to cleanup orphaned health-check conversations:', error);
  }
};

const initStorage = async () => {
  const t0 = performance.now();
  const mark = (label: string) => console.log(`[AionUi:init] ${label} +${Math.round(performance.now() - t0)}ms`);
  mark('start');

  // 1. 先执行数据迁移（在任何目录创建之前）
  await migrateLegacyData();
  mark('1. migrateLegacyData');

  // 2. 创建必要的目录（迁移后再创建，确保迁移能正常进行）
  // Use ensureDirectory to handle cases where a regular file blocks the path (#841)
  ensureDirectory(getHomePage());
  ensureDirectory(getDataPath());

  // 3. 初始化存储系统
  ConfigStorage.interceptor(configFile);
  EnvStorage.interceptor(envFile);
  mark('3. storage interceptors');

  // 4. 初始化 MCP 配置（为所有用户提供默认配置）
  try {
    const existingMcpConfig = await configFile.get('mcp.config').catch((): undefined => undefined);

    // 仅当配置不存在或为空时，写入默认值（适用于新用户和老用户）
    if (!existingMcpConfig || !Array.isArray(existingMcpConfig) || existingMcpConfig.length === 0) {
      const defaultServers = getDefaultMcpServers();
      await configFile.set('mcp.config', defaultServers);
    }
  } catch (error) {
    console.error('[AionUi] Failed to initialize default MCP servers:', error);
  }
  mark('4.1 MCP defaults');

  // 4.2 Ensure built-in MCP servers exist and are up-to-date
  await ensureBuiltinMcpServers();
  mark('4.2 builtinMcpServers');

  // 5. Ensure assistant-related directories exist. Built-in assistant records
  //    now live in the backend SQLite catalog (see aionui-assistant crate) and
  //    are no longer seeded into ConfigStorage. User-authored rule md files
  //    continue to live under `{cacheDir}/assistants/` until the one-shot
  //    migration (T3b) imports them into the backend.
  try {
    await ensureAssistantDirs();
    mark('5. ensureAssistantDirs');
  } catch (error) {
    console.error('[AionUi] Failed to ensure assistant dirs:', error);
  }

  // 6. 初始化数据库（better-sqlite3）
  try {
    await getDatabase();
    await cleanupOrphanedHealthCheckConversations();
  } catch (error) {
    console.error('[InitStorage] Database initialization failed, falling back to file-based storage:', error);
  }
  mark('6. database');

  if (hasElectronAppPath()) {
    application.systemInfo.provider(() => {
      return Promise.resolve(getSystemDir());
    });
  }
  mark('done');
};

export const ProcessConfig = configFile;

export const ProcessChat = chatFile;

export const ProcessChatMessage = chatMessageFile;

export const ProcessEnv = envFile;

export const getSystemDir = () => {
  // electron-log writes to the platform-standard logs directory
  const logDir = getPlatformServices().paths.getLogsDir();

  return {
    cacheDir: cacheDir,
    // getDataPath() returns CLI-safe path (symlink on macOS) to avoid spaces
    // getDataPath() 返回 CLI 安全路径（macOS 上的符号链接）以避免空格问题
    workDir: dirConfig?.workDir || getDataPath(),
    logDir,
    platform: process.platform as PlatformType,
    arch: process.arch as ArchitectureType,
  };
};

/**
 * 获取助手规则目录路径（供其他模块使用）
 * Get assistant rules directory path (for use by other modules)
 */
export {
  getAssistantsDir,
  getSkillsDir,
  getBuiltinSkillsCopyDir,
  getAutoSkillsDir,
  getCronSkillsDir,
  BUILTIN_IMAGE_GEN_ID,
  getBuiltinMcpScriptPath,
};

/**
 * Skills 内容缓存，避免重复从文件系统读取
 * Skills content cache to avoid repeated file system reads
 */
const skillsContentCache = new Map<string, string>();

/**
 * 加载指定 skills 的内容（带缓存）
 * Load content of specified skills (with caching)
 * @param enabledSkills - skill 名称列表 / list of skill names
 * @returns 合并后的 skills 内容 / merged skills content
 */
export const loadSkillsContent = async (enabledSkills: string[]): Promise<string> => {
  if (!enabledSkills || enabledSkills.length === 0) {
    return '';
  }

  // 使用排序后的 skill 名称作为缓存 key，确保相同组合命中缓存
  // Use sorted skill names as cache key to ensure same combinations hit cache
  const cacheKey = [...enabledSkills].toSorted().join(',');
  const cached = skillsContentCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const skillsDir = getSkillsDir();
  const builtinSkillsDir = getAutoSkillsDir();
  const skillContents: string[] = [];

  for (const skillName of enabledSkills) {
    // 1. Auto-enabled builtin: builtin-skills/_builtin/{skillName}/SKILL.md
    const builtinSkillFile = path.join(builtinSkillsDir, skillName, 'SKILL.md');
    // 2. Bundled skill: builtin-skills/{skillName}/SKILL.md
    const bundledSkillFile = path.join(getBuiltinSkillsCopyDir(), skillName, 'SKILL.md');
    // 3. User custom: skills/{skillName}/SKILL.md
    const skillDirFile = path.join(skillsDir, skillName, 'SKILL.md');
    // 向后兼容：扁平结构 {skillName}.md
    // Backward compatible: flat structure {skillName}.md
    const skillFlatFile = path.join(skillsDir, `${skillName}.md`);

    try {
      let content: string | null = null;

      if (existsSync(builtinSkillFile)) {
        content = await fs.readFile(builtinSkillFile, 'utf-8');
      } else if (existsSync(bundledSkillFile)) {
        content = await fs.readFile(bundledSkillFile, 'utf-8');
      } else if (existsSync(skillDirFile)) {
        content = await fs.readFile(skillDirFile, 'utf-8');
      } else if (existsSync(skillFlatFile)) {
        content = await fs.readFile(skillFlatFile, 'utf-8');
      }

      if (content && content.trim()) {
        skillContents.push(`## Skill: ${skillName}\n${content}`);
      }
    } catch (error) {
      console.warn(`[AionUi] Failed to load skill ${skillName}:`, error);
    }
  }

  const result = skillContents.length === 0 ? '' : `[Available Skills]\n${skillContents.join('\n\n')}`;

  // 缓存结果 / Cache result
  skillsContentCache.set(cacheKey, result);

  return result;
};

/**
 * 清除 skills 缓存（在 skills 文件更新后调用）
 * Clear skills cache (call after skills files are updated)
 */
export const clearSkillsCache = (): void => {
  skillsContentCache.clear();
};

export default initStorage;
