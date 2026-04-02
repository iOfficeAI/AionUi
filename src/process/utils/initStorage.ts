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
import { ASSISTANT_PRESETS } from '@/common/config/presets/assistantPresets';
import type {
  IChatConversationRefer,
  IConfigStorageRefer,
  IEnvStorageRefer,
  IMcpServer,
  TChatConversation,
  TProviderWithModel,
} from '@/common/config/storage';
import { ChatMessageStorage, ChatStorage, ConfigStorage, EnvStorage } from '@/common/config/storage';
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
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { migrateFromElectronConfig, importConfigFromFile } from './configMigration';
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
 * 初始化内置助手的规则和技能文件到用户目录
 * Initialize builtin assistant rule and skill files to user directory
 */
const initBuiltinAssistantRules = async (): Promise<void> => {
  const assistantsDir = getAssistantsDir();

  // In development, use project root. In production, use app.getAppPath().
  // viteStaticCopy maps src/process/resources/* to root-level dirs in the asar.
  // 开发模式下使用项目根目录，生产模式下 viteStaticCopy 将资源映射到 asar 根级目录。
  const resolveBuiltinDir = (dirPath: string): string => {
    const platform = getPlatformServices().paths;
    const appPath = platform.getAppPath()!;
    let candidates: string[];
    if (platform.isPackaged()) {
      // In production, viteStaticCopy maps src/process/resources/* to root-level dirs in the asar.
      // skills/ and assistant/ are read from asar at startup and copied to user config dirs.
      const RESOURCES_PREFIX = 'src/process/resources/';
      const prodPath = dirPath.startsWith(RESOURCES_PREFIX) ? dirPath.slice(RESOURCES_PREFIX.length) : dirPath;
      candidates = [path.join(appPath, prodPath)];
    } else {
      // In dev, viteStaticCopy doesn't run; resolve source paths directly.
      // appPath is the project root, so a single join is sufficient.
      candidates = [path.join(appPath, dirPath)];
    }

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    console.warn(`[AionUi] Could not find builtin ${dirPath} directory, tried:`, candidates);
    return candidates[0];
  };

  const presetsNeedDefaultRulesDir = ASSISTANT_PRESETS.some(
    (preset) => !preset.resourceDir && Object.keys(preset.ruleFiles).length > 0
  );
  const rulesDir = presetsNeedDefaultRulesDir ? resolveBuiltinDir('rules') : '';
  // resolveBuiltinDir("src/process/resources/skills") works for packaged Electron
  // (viteStaticCopy outputs to skills/ which matches after stripping the prefix),
  // but in standalone server mode the actual path differs.
  let builtinSkillsDir = resolveBuiltinDir('src/process/resources/skills');
  if (!existsSync(builtinSkillsDir)) {
    const skillsFallbacks = [
      // Standalone production: bundled alongside server binary by build-server.mjs
      path.join(__dirname, 'skills'),
      path.join(__dirname, '..', 'skills'),
      path.join(process.cwd(), 'dist-server', 'skills'),
    ];
    const found = skillsFallbacks.find((d) => existsSync(d));
    if (found) builtinSkillsDir = found;
  }
  const builtinSkillsCopyDir = getBuiltinSkillsCopyDir();
  const userSkillsDir = getSkillsDir();

  // Sync builtin skills to a dedicated directory (config/builtin-skills/).
  // This directory is fully managed by the app: overwrite existing, remove stale.
  // User-custom skills live in config/skills/ and are never touched.
  if (existsSync(builtinSkillsDir)) {
    try {
      if (!existsSync(builtinSkillsCopyDir)) {
        mkdirSync(builtinSkillsCopyDir);
      }
      await copyDirectoryRecursively(builtinSkillsDir, builtinSkillsCopyDir, {
        overwrite: true,
      });
      // Remove stale: entries in dest that no longer exist in source
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

  // Ensure user skills directory exists
  if (!existsSync(userSkillsDir)) {
    mkdirSync(userSkillsDir);
  }

  // Ensure cron skills directory exists (per-job SKILL.md files)
  const cronSkillsDir = getCronSkillsDir();
  if (!existsSync(cronSkillsDir)) {
    mkdirSync(cronSkillsDir);
  }

  // 确保助手目录存在 / Ensure assistants directory exists
  if (!existsSync(assistantsDir)) {
    mkdirSync(assistantsDir);
  }

  for (const preset of ASSISTANT_PRESETS) {
    const assistantId = `builtin-${preset.id}`;

    // 如果设置了 resourceDir，使用该目录；否则使用默认的 rules/ 目录
    // If resourceDir is set, use that directory; otherwise use default rules/ directory
    const presetRulesDir = preset.resourceDir ? resolveBuiltinDir(preset.resourceDir) : rulesDir;
    const presetSkillsDir = preset.resourceDir ? resolveBuiltinDir(preset.resourceDir) : builtinSkillsDir;

    // 复制规则文件 / Copy rule files
    const hasRuleFiles = Object.keys(preset.ruleFiles).length > 0;
    if (hasRuleFiles) {
      for (const [locale, ruleFile] of Object.entries(preset.ruleFiles)) {
        try {
          const sourceRulesPath = path.join(presetRulesDir, ruleFile);
          // 目标文件名格式：{assistantId}.{locale}.md
          // Target file name format: {assistantId}.{locale}.md
          const targetFileName = `${assistantId}.${locale}.md`;
          const targetPath = path.join(assistantsDir, targetFileName);

          // 检查源文件是否存在 / Check if source file exists
          if (!existsSync(sourceRulesPath)) {
            console.warn(`[AionUi] Source rule file not found: ${sourceRulesPath}`);
            continue;
          }

          // 内置助手规则文件始终强制覆盖，确保用户获得最新版本
          // Always overwrite builtin assistant rule files to ensure users get the latest version
          let content = await fs.readFile(sourceRulesPath, 'utf-8');
          // 替换相对路径为绝对路径，确保 AI 能找到正确的脚本位置
          // Replace relative paths with absolute paths so AI can find scripts correctly
          content = content.replace(/skills\//g, userSkillsDir + '/');
          await fs.writeFile(targetPath, content, 'utf-8');
        } catch (error) {
          // 忽略缺失的语言文件 / Ignore missing locale files
          console.warn(`[AionUi] Failed to copy rule file ${ruleFile}:`, error);
        }
      }
    } else {
      // 如果助手没有 ruleFiles 配置，删除旧的 rules 缓存文件
      // If assistant has no ruleFiles config, delete old rules cache files
      const rulesFilePattern = new RegExp(`^${assistantId}\\..*\\.md$`);
      try {
        const files = readdirSync(assistantsDir);
        for (const file of files) {
          if (rulesFilePattern.test(file)) {
            const filePath = path.join(assistantsDir, file);
            await fs.unlink(filePath);
          }
        }
      } catch (error) {
        // 忽略删除失败 / Ignore deletion failure
      }
    }

    // 复制技能文件 / Copy skill files (if preset has skills)
    if (preset.skillFiles) {
      for (const [locale, skillFile] of Object.entries(preset.skillFiles)) {
        try {
          const sourceSkillsPath = path.join(presetSkillsDir, skillFile);
          // 目标文件名格式：{assistantId}-skills.{locale}.md
          // Target file name format: {assistantId}-skills.{locale}.md
          const targetFileName = `${assistantId}-skills.${locale}.md`;
          const targetPath = path.join(assistantsDir, targetFileName);

          // 检查源文件是否存在 / Check if source file exists
          if (!existsSync(sourceSkillsPath)) {
            console.warn(`[AionUi] Source skill file not found: ${sourceSkillsPath}`);
            continue;
          }

          // 内置助手技能文件始终强制覆盖，确保用户获得最新版本
          // Always overwrite builtin assistant skill files to ensure users get the latest version
          let content = await fs.readFile(sourceSkillsPath, 'utf-8');
          // 替换相对路径为绝对路径，确保 AI 能找到正确的脚本位置
          // Replace relative paths with absolute paths so AI can find scripts correctly
          content = content.replace(/skills\//g, userSkillsDir + '/');
          await fs.writeFile(targetPath, content, 'utf-8');
        } catch (error) {
          // 忽略缺失的技能文件 / Ignore missing skill files
          console.warn(`[AionUi] Failed to copy skill file ${skillFile}:`, error);
        }
      }
    } else {
      // 如果助手没有 skillFiles 配置，删除旧的 skills 缓存文件
      // If assistant has no skillFiles config, delete old skills cache files
      // 这样可以确保迁移到 SkillManager 后不会读取到旧的 presetSkills
      // This ensures old presetSkills won't be read after migrating to SkillManager
      const skillsFilePattern = new RegExp(`^${assistantId}-skills\\..*\\.md$`);
      try {
        const files = readdirSync(assistantsDir);
        for (const file of files) {
          if (skillsFilePattern.test(file)) {
            const filePath = path.join(assistantsDir, file);
            await fs.unlink(filePath);
          }
        }
      } catch (error) {
        // 忽略删除失败 / Ignore deletion failure
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
    // 从预设配置中读取默认启用的技能列表（不包含 cron，因为它是内置 skill，自动注入）
    // Read default enabled skills from preset config (excluding cron, which is builtin and auto-injected)
    const defaultEnabledSkills = preset.defaultEnabledSkills;
    const enabledByDefault =
      preset.id === 'word-creator' ||
      preset.id === 'ppt-creator' ||
      preset.id === 'excel-creator' ||
      preset.id === 'academic-paper' ||
      preset.id === 'morph-ppt' ||
      preset.id === 'cowork' ||
      preset.id === 'openclaw-setup' ||
      preset.id === 'star-office-helper' ||
      preset.id === 'story-roleplay' ||
      preset.id === 'moltbook' ||
      preset.id === 'beautiful-mermaid';

    assistants.push({
      id: `builtin-${preset.id}`,
      name: preset.nameI18n['en-US'],
      nameI18n: preset.nameI18n,
      description: preset.descriptionI18n['en-US'],
      descriptionI18n: preset.descriptionI18n,
      avatar: preset.avatar,
      // context 不再存储在配置中，而是从文件读取
      // context is no longer stored in config, read from files instead
      // Cowork 默认启用 / Cowork enabled by default
      enabled: enabledByDefault,
      isPreset: true,
      isBuiltin: true,
      presetAgentType: preset.presetAgentType || 'gemini',
      // Cowork 默认启用所有内置技能 / Cowork enables all builtin skills by default
      enabledSkills: defaultEnabledSkills,
      // 复制快捷提示词 / Copy quick prompts
      promptsI18n: preset.promptsI18n,
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
  ChatStorage.interceptor(chatFile);
  ChatMessageStorage.interceptor(chatMessageFile);
  EnvStorage.interceptor(envFile);
  mark('3. storage interceptors');

  // Config migration only makes sense in standalone server mode (not inside Electron itself)
  if (!hasElectronAppPath()) {
    // Migrate config from Electron desktop app (once, after storage is ready)
    await migrateFromElectronConfig(configFile as unknown as Parameters<typeof migrateFromElectronConfig>[0]);

    // Manual import from specified path (if env var present)
    const importFrom = process.env.IMPORT_CONFIG_FROM;
    if (importFrom) {
      const overwrite = process.env.IMPORT_CONFIG_OVERWRITE === 'true';
      await importConfigFromFile(
        importFrom,
        overwrite,
        configFile as unknown as Parameters<typeof importConfigFromFile>[2]
      );
    }
  }

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

  // 4.1 Ensure built-in MCP servers exist and are up-to-date
  await ensureBuiltinMcpServers();
  mark('4. MCP config');

  // 5. 初始化内置助手（Assistants）
  try {
    // 5.1 初始化内置助手的规则文件到用户目录
    // Initialize builtin assistant rule files to user directory
    await initBuiltinAssistantRules();
    mark('5.1 initBuiltinAssistantRules');

    // 5.2 初始化助手配置（只包含元数据，不包含 context）
    // Initialize assistant config (metadata only, no context)
    const existingAgents = (await configFile.get('acp.customAgents').catch((): undefined => undefined)) || [];
    const builtinAssistants = getBuiltinAssistants();

    // 5.2.1 检查是否需要迁移：修复老版本中所有助手都默认启用的问题
    // Check if migration needed: fix old version where all assistants were enabled by default
    const ASSISTANT_ENABLED_MIGRATION_KEY = 'migration.assistantEnabledFixed';
    const migrationDone = await configFile.get(ASSISTANT_ENABLED_MIGRATION_KEY).catch(() => false);
    const needsMigration = !migrationDone && existingAgents.length > 0;

    // 5.2.2 检查是否需要迁移：为内置助手添加默认启用的技能
    // Check if migration needed: add default enabled skills for builtin assistants
    const BUILTIN_SKILLS_MIGRATION_KEY = 'migration.builtinDefaultSkillsAdded_v2';
    const builtinSkillsMigrationDone = await configFile.get(BUILTIN_SKILLS_MIGRATION_KEY).catch(() => false);
    const needsBuiltinSkillsMigration = !builtinSkillsMigrationDone;

    // 5.2.3 检查是否需要迁移：为内置助手添加 promptsI18n
    // Check if migration needed: add promptsI18n for builtin assistants
    const PROMPTS_I18N_MIGRATION_KEY = 'migration.promptsI18nAdded';
    const promptsI18nMigrationDone = await configFile.get(PROMPTS_I18N_MIGRATION_KEY).catch(() => false);
    const needsPromptsI18nMigration = !promptsI18nMigrationDone;

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
        // 注意：enabled 和 presetAgentType 字段由用户控制，不参与 shouldUpdate 判断
        // Note: enabled and presetAgentType are user-controlled, not included in shouldUpdate check
        // 检查 promptsI18n 是否需要更新（如果不存在或已更改，或需要迁移）
        // Check if promptsI18n needs update (if missing, changed, or migration needed)
        const promptsI18nMissing = !existing.promptsI18n && builtin.promptsI18n;
        const promptsI18nChanged =
          existing.promptsI18n &&
          builtin.promptsI18n &&
          JSON.stringify(existing.promptsI18n) !== JSON.stringify(builtin.promptsI18n);
        const needsPromptsI18nUpdate = needsPromptsI18nMigration || promptsI18nMissing || promptsI18nChanged;
        const nameI18nMissing = !existing.nameI18n && !!builtin.nameI18n;
        const nameI18nChanged =
          existing.nameI18n &&
          builtin.nameI18n &&
          JSON.stringify(existing.nameI18n) !== JSON.stringify(builtin.nameI18n);
        const descriptionI18nMissing = !existing.descriptionI18n && !!builtin.descriptionI18n;
        const descriptionI18nChanged =
          existing.descriptionI18n &&
          builtin.descriptionI18n &&
          JSON.stringify(existing.descriptionI18n) !== JSON.stringify(builtin.descriptionI18n);
        const shouldUpdate =
          existing.name !== builtin.name ||
          existing.description !== builtin.description ||
          existing.avatar !== builtin.avatar ||
          existing.isPreset !== builtin.isPreset ||
          existing.isBuiltin !== builtin.isBuiltin ||
          nameI18nMissing ||
          !!nameI18nChanged ||
          descriptionI18nMissing ||
          !!descriptionI18nChanged ||
          needsPromptsI18nUpdate;
        // 当 enabled 是 undefined 或需要迁移时，设置默认值（Cowork 启用，其他禁用）
        // When enabled is undefined or migration needed, set default value (Cowork enabled, others disabled)
        const needsEnabledFix = existing.enabled === undefined || needsMigration;
        // 迁移时强制使用默认值，否则保留用户设置
        // Force default value during migration, otherwise preserve user setting
        const resolvedEnabled = needsEnabledFix ? builtin.enabled : existing.enabled;
        // presetAgentType 由用户控制，未设置时使用内置默认值
        // presetAgentType is user-controlled, use builtin default if not set
        const resolvedPresetAgentType = existing.presetAgentType ?? builtin.presetAgentType;

        // 为有 defaultEnabledSkills 配置的内置助手添加默认技能（仅在迁移时且用户未设置 enabledSkills 时）
        // Add default enabled skills for builtin assistants with defaultEnabledSkills (only during migration and if user hasn't set enabledSkills)
        let resolvedEnabledSkills = existing.enabledSkills;
        const needsSkillsMigration =
          needsBuiltinSkillsMigration &&
          builtin.enabledSkills &&
          (!existing.enabledSkills || existing.enabledSkills.length === 0);
        if (needsSkillsMigration) {
          resolvedEnabledSkills = builtin.enabledSkills;
        }

        if (
          shouldUpdate ||
          needsEnabledFix ||
          (needsSkillsMigration && resolvedEnabledSkills !== existing.enabledSkills) ||
          needsPromptsI18nUpdate
        ) {
          // 保留用户已设置的 enabled 和 presetAgentType / Preserve user-set enabled and presetAgentType
          updatedAgents[index] = {
            ...existing,
            ...builtin,
            enabled: resolvedEnabled,
            presetAgentType: resolvedPresetAgentType,
            enabledSkills: resolvedEnabledSkills,
            // 确保 promptsI18n 被更新 / Ensure promptsI18n is updated
            promptsI18n: builtin.promptsI18n,
          };
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

    // 标记迁移完成 / Mark migration as done
    if (needsMigration) {
      await configFile.set(ASSISTANT_ENABLED_MIGRATION_KEY, true);
    }
    if (needsBuiltinSkillsMigration) {
      await configFile.set(BUILTIN_SKILLS_MIGRATION_KEY, true);
    }
    if (needsPromptsI18nMigration) {
      await configFile.set(PROMPTS_I18N_MIGRATION_KEY, true);
    }
    mark('5.2 assistant config + migrations');
  } catch (error) {
    console.error('[AionUi] Failed to initialize builtin assistants:', error);
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
